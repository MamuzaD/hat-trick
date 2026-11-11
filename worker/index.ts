// Laptop worker: runs "analyse" and "why?" jobs through `claude -p` using the
// local Claude Code subscription (design.md: "Where Claude runs").
//
//   pnpm worker
//
// Safety: page text from strangers ends up in these prompts, so the CLI runs
// with no tools, no MCP servers, no user/project settings (so no hooks or
// plugins), no slash commands/skills, no session persistence, in a fresh empty
// temp dir, with a minimal environment that has no API key or secrets in it.
// The prompt goes in on stdin via spawn() with an args array: no shell.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  ANALYSE_SCHEMA,
  ANALYSE_SYSTEM,
  analyseUserPrompt,
  WHY_SYSTEM,
  whyUserPrompt,
  type AnalysePayload,
  type WhyPayload,
} from "../convex/lib/prompts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fine: env may come from the shell
}

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const SECRET = process.env.WORKER_SECRET;
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const MODEL = process.env.WORKER_MODEL || "haiku";
const RUN_TIMEOUT_MS = 20_000;
const CONCURRENCY = 2;
const HEARTBEAT_MS = 4_000;

if (!CONVEX_URL || !SECRET) {
  console.error("worker: NEXT_PUBLIC_CONVEX_URL and WORKER_SECRET must be set (see .env.local)");
  process.exit(1);
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Only what the CLI needs to find itself and its login. Nothing secret. */
function childEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TMPDIR", "TERM"];
  const env: Record<string, string> = {};
  for (const k of keep) {
    const val = process.env[k];
    if (val) env[k] = val;
  }
  env.NO_COLOR = "1";
  return env as NodeJS.ProcessEnv; // no ANTHROPIC_API_KEY, no WORKER_SECRET, no Convex/Vercel tokens
}

type ClaudeOut = { result?: string; structured_output?: unknown; is_error?: boolean };

function runClaude(system: string, prompt: string, schema?: object): Promise<ClaudeOut> {
  const cwd = mkdtempSync(join(tmpdir(), "hat-trick-job-"));
  const args = [
    "-p",
    "--model", MODEL,
    "--tools", "",
    "--strict-mcp-config",
    "--mcp-config", '{"mcpServers":{}}',
    "--setting-sources", "",
    "--safe-mode",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--permission-mode", "dontAsk",
    "--output-format", "json",
    "--system-prompt", system,
    ...(schema ? ["--json-schema", JSON.stringify(schema)] : []),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude -p timed out"));
    }, RUN_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      rmSync(cwd, { recursive: true, force: true });
      if (code !== 0) return reject(new Error(`claude -p exited ${code}: ${err.slice(0, 200)}`));
      try {
        resolve(JSON.parse(out) as ClaudeOut);
      } catch {
        reject(new Error("claude -p returned non-JSON"));
      }
    });
    child.stdin.end(prompt);
  });
}

const isNum = (x: unknown) => typeof x === "number" && Number.isFinite(x);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function validateAnalysis(x: unknown) {
  const o = (x ?? {}) as Record<string, unknown>;
  if (typeof o.summary !== "string" || !o.summary.trim()) throw new Error("bad summary");
  for (const k of ["honestScore", "vibes", "hatHeadFit", "pizzaSlices"]) if (!isNum(o[k])) throw new Error(`bad ${k}`);
  return {
    summary: o.summary.replace(/\s+/g, " ").trim().slice(0, 220),
    honestScore: Math.round(clamp(o.honestScore as number, 0, 100)),
    vibes: Math.round(clamp(o.vibes as number, 0, 10) * 10) / 10,
    hatHeadFit: Math.round(clamp(o.hatHeadFit as number, 0, 100)),
    pizzaSlices: Math.round(clamp(o.pizzaSlices as number, 0, 30)),
    bribe: o.bribe === true,
  };
}

async function handle(job: { _id: Id<"jobs">; kind: "analyse" | "why"; payload: unknown }) {
  if (job.kind === "analyse") {
    const p = job.payload as AnalysePayload;
    const out = await runClaude(ANALYSE_SYSTEM, analyseUserPrompt(p), ANALYSE_SCHEMA);
    if (out.is_error) throw new Error("claude reported an error");
    let data = out.structured_output;
    if (!data && out.result) data = JSON.parse(out.result);
    return validateAnalysis(data);
  }
  const p = job.payload as WhyPayload;
  const out = await runClaude(WHY_SYSTEM, whyUserPrompt(p));
  const text = (out.result ?? "").replace(/\s+/g, " ").trim();
  if (out.is_error || !text) throw new Error("empty answer");
  return { text: text.slice(0, 600) };
}

const client = new ConvexClient(CONVEX_URL);
const inFlight = new Set<string>();
let latest: { _id: Id<"jobs">; kind: "analyse" | "why"; payload: unknown }[] = [];

async function pump() {
  for (const job of latest) {
    if (inFlight.size >= CONCURRENCY) return;
    if (inFlight.has(job._id)) continue;
    inFlight.add(job._id);
    void (async () => {
      const started = Date.now();
      try {
        const claimed = await client.mutation(api.jobs.claim, { secret: SECRET!, id: job._id });
        if (!claimed) return;
        log(`claimed ${claimed.kind} ${claimed._id}`);
        const result = await handle(claimed);
        const r = await client.mutation(api.jobs.complete, { secret: SECRET!, id: claimed._id, result });
        log(`${r.applied ? "done" : "discarded (late)"} ${claimed.kind} in ${Date.now() - started}ms`);
      } catch (e) {
        log(`failed ${job.kind}: ${(e as Error).message}`);
        await client.mutation(api.jobs.fail, { secret: SECRET!, id: job._id, error: (e as Error).message }).catch(() => {});
      } finally {
        inFlight.delete(job._id);
        void pump();
      }
    })();
  }
}

client.onUpdate(
  api.jobs.pending,
  { secret: SECRET },
  (jobs) => {
    latest = jobs;
    void pump();
  },
  (err) => log("subscription error:", err.message),
);

const beat = () => client.mutation(api.jobs.heartbeat, { secret: SECRET! }).catch((e) => log("heartbeat failed:", e.message));
void beat();
const hb = setInterval(beat, HEARTBEAT_MS);
log(`worker up · ${new URL(CONVEX_URL).host} · model ${MODEL} · concurrency ${CONCURRENCY}`);

function shutdown() {
  clearInterval(hb);
  void client.close().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
