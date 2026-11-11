// Fetches a team's project link and reduces it to plain text. Runs inside a
// Convex action, never on the laptop. HTTPS only, public hosts only, 8s budget,
// bounded reads, text capped before it goes anywhere near a model.

import { isPublicHost, parseGithub } from "./url";

export const MAX_TEXT = 8000;
const MAX_BYTES = 600_000;
const TIMEOUT_MS = 8000;
const UA = "hat-trick-hackathon-bot/1.0 (+reads one public page per team)";

export type Fetched = {
  kind: "github" | "page";
  host: string;
  title: string;
  text: string;
  description?: string;
  language?: string;
  stars?: number;
  /** For pages: counts taken from the HTML before it was flattened. */
  counts?: { headings: number; codeBlocks: number; images: number };
};

export type FetchResult = { ok: true; data: Fetched } | { ok: false; reason: string };

class FetchFail extends Error {}

async function readCapped(res: Response, maxBytes = MAX_BYTES): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.length - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** GET with manual redirects: every hop must stay https + public. */
async function safeGet(url: string, signal: AbortSignal, accept: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" || !isPublicHost(u.hostname)) throw new FetchFail("redirected somewhere private");
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { "user-agent": UA, accept },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) throw new FetchFail(`redirect without location (${res.status})`);
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new FetchFail("too many redirects");
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d) % 0x110000));

/** Very small HTML-to-text: title, meta description, headings, body text. */
export function htmlToText(html: string) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const description = decodeEntities(
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
      "",
  ).trim();
  const counts = {
    headings: (html.match(/<h[1-6]\b/gi) ?? []).length,
    codeBlocks: (html.match(/<pre\b/gi) ?? []).length,
    images: (html.match(/<img\b/gi) ?? []).length,
  };
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(h[1-6])[^>]*>/gi, "\n\n# ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|header|footer|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, description, counts, text };
}

async function fetchGithub(owner: string, repo: string, signal: AbortSignal): Promise<Fetched> {
  // Metadata is optional: the unauthenticated API is rate-limited per (shared) IP.
  const metaP = fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
    headers: { "user-agent": UA, accept: "application/vnd.github+json" },
  })
    .then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>) : null))
    .catch(() => null);

  let readme = "";
  for (const name of ["README.md", "readme.md", "Readme.md", "README.markdown", "README.rst", "README.txt", "README"]) {
    const res = await safeGet(
      `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${name}`,
      signal,
      "text/plain, text/markdown, */*",
    ).catch(() => null);
    if (res?.ok) {
      readme = await readCapped(res);
      break;
    }
    await res?.body?.cancel().catch(() => {});
  }
  const meta = await metaP;
  if (!readme && !meta) throw new FetchFail("repo not found or private");

  const description = typeof meta?.description === "string" ? meta.description : undefined;
  return {
    kind: "github",
    host: "github.com",
    title: typeof meta?.name === "string" ? meta.name : repo,
    text: (readme || description || "").slice(0, MAX_TEXT),
    description,
    language: typeof meta?.language === "string" ? meta.language : undefined,
    stars: typeof meta?.stargazers_count === "number" ? meta.stargazers_count : undefined,
  };
}

async function fetchPage(url: string, signal: AbortSignal): Promise<Fetched> {
  const res = await safeGet(url, signal, "text/html, text/plain;q=0.9, */*;q=0.1");
  if (!res.ok) throw new FetchFail(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
    await res.body?.cancel().catch(() => {});
    throw new FetchFail(`not text (${type.split(";")[0] || "unknown type"})`);
  }
  const raw = await readCapped(res);
  const host = new URL(res.url || url).hostname;
  if (/text\/plain/i.test(type)) {
    return { kind: "page", host, title: host, text: raw.slice(0, MAX_TEXT) };
  }
  const { title, description, counts, text } = htmlToText(raw);
  const head = [title && `# ${title}`, description].filter(Boolean).join("\n");
  return {
    kind: "page",
    host,
    title: title || host,
    text: `${head}\n${text}`.trim().slice(0, MAX_TEXT),
    description: description || undefined,
    counts,
  };
}

export async function fetchProject(url: string): Promise<FetchResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const gh = parseGithub(url);
    const data = gh ? await fetchGithub(gh.owner, gh.repo, ctl.signal) : await fetchPage(url, ctl.signal);
    if (data.text.trim().length < 20) return { ok: false, reason: "page had no readable text" };
    return { ok: true, data };
  } catch (err) {
    if (ctl.signal.aborted) return { ok: false, reason: "timed out after 8s" };
    if (err instanceof FetchFail) return { ok: false, reason: err.message };
    return { ok: false, reason: "could not reach the site" };
  } finally {
    clearTimeout(timer);
  }
}
