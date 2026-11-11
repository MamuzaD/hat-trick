// Direct Anthropic API path. Stays in the code so a funded key "just works";
// billing/auth failures are remembered for a while so the demo doesn't wait
// on a doomed request every time.

import Anthropic from "@anthropic-ai/sdk";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { ANALYSE_SCHEMA, ANALYSE_SYSTEM, analyseUserPrompt, WHY_SYSTEM, whyUserPrompt } from "./prompts";
import type { AnalysePayload, WhyPayload } from "./prompts";

export const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 8000;
const BACKOFF_MS = 5 * 60_000;

export async function apiAvailable(ctx: ActionCtx) {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  const until = await ctx.runQuery(internal.jobs.apiDownUntil, {});
  return Date.now() >= until;
}

/** Remember billing/auth errors so we skip straight to the laptop/heuristics. */
async function noteFailure(ctx: ActionCtx, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const permanent =
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    /credit balance|billing|quota/i.test(msg);
  console.error("Claude API call failed", msg);
  if (permanent) {
    await ctx.runMutation(internal.jobs.markApiDown, { until: Date.now() + BACKOFF_MS, note: msg.slice(0, 200) });
  }
}

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: TIMEOUT_MS });
}

export async function apiAnalyse(ctx: ActionCtx, p: AnalysePayload): Promise<Record<string, unknown> | null> {
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" },
      system: ANALYSE_SYSTEM,
      messages: [{ role: "user", content: analyseUserPrompt(p) }],
      output_config: { format: { type: "json_schema", schema: ANALYSE_SCHEMA } },
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    await noteFailure(ctx, err);
    return null;
  }
}

export async function apiWhy(ctx: ActionCtx, p: WhyPayload): Promise<string | null> {
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 200,
      thinking: { type: "disabled" },
      system: WHY_SYSTEM,
      messages: [{ role: "user", content: whyUserPrompt(p) }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    await noteFailure(ctx, err);
    return null;
  }
}
