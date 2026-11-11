export const MAX_URL_LENGTH = 300;

/**
 * Is this hostname plausibly a public internet host? Refuses localhost, raw
 * IPs, single-label names and private suffixes. Best effort from the URL
 * alone; DNS can still point anywhere, which is why we only ever GET text.
 */
export function isPublicHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".")) return false;
  if (h.startsWith("[") || h.includes(":")) return false; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false; // IPv4 literal
  if (/^0x[0-9a-f]+$/i.test(h) || /^\d+$/.test(h)) return false; // integer IPs
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa)$/.test(h))
    return false;
  return true;
}

/** Normalises a user-typed link. Returns null for empty, an error string if invalid. */
export function checkUrl(raw: string): { url: string | null } | { error: string } {
  const s = raw.trim();
  if (!s) return { url: null };
  if (s.length > MAX_URL_LENGTH) return { error: `Link is too long (max ${MAX_URL_LENGTH} characters).` };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return { error: "That link doesn't parse." };
  }
  if (u.protocol !== "https:") return { error: "Links must be https." };
  if (u.username || u.password) return { error: "Links can't contain credentials." };
  if (u.port && u.port !== "443") return { error: "Links can't use a custom port." };
  if (!isPublicHost(u.hostname)) return { error: "The model only reads public websites." };
  u.hash = "";
  return { url: u.toString() };
}

export function parseGithub(url: string): { owner: string; repo: string } | null {
  const u = new URL(url);
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
  const [owner, repo] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo: repo.replace(/\.git$/, "") };
}
