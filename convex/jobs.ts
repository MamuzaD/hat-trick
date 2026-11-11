// Job queue for the laptop worker (design.md: "Where Claude runs").
//
// Public functions here all require WORKER_SECRET, so browsers can't read
// fetched page text, claim jobs, forge results or fake a heartbeat. Whatever
// the worker returns is clamped again here before it touches a team.

import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { sanitiseAnalysis, trimTo, type Analysis } from "./lib/heuristics";

/** If the worker hasn't delivered by then, the heuristic answer is applied. */
export const JOB_DEADLINE_MS = 10_000;
/** A heartbeat older than this means the laptop is gone. */
export const HEARTBEAT_STALE_MS = 15_000;

function requireSecret(secret: string) {
  const expected = process.env.WORKER_SECRET;
  if (!expected || expected.length < 16) throw new ConvexError("worker not configured");
  let diff = secret.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (secret.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new ConvexError("unauthorised");
}

async function getFlag(ctx: QueryCtx, key: string) {
  return await ctx.db
    .query("flags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

export async function setFlag(ctx: MutationCtx, key: string, at: number, note?: string) {
  const f = await getFlag(ctx, key);
  if (f) await ctx.db.patch(f._id, { at, note });
  else await ctx.db.insert("flags", { key, at, note });
}

// ── applying results (shared by worker completion, fallbacks and direct paths) ──

type Engine = NonNullable<Doc<"teams">["engine"]>;

export async function applyAnalysis(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  a: Analysis,
  engine: Engine,
  note?: string,
) {
  const team = await ctx.db.get(teamId);
  if (!team || team.analysisStatus === "done") return;
  await ctx.db.patch(teamId, {
    summary: a.summary,
    honestScore: a.honestScore,
    vibes: a.vibes,
    hatHeadFit: a.hatHeadFit,
    pizzaSlices: a.pizzaSlices,
    bribe: a.bribe,
    engine,
    analysisStatus: "done",
    analysisNote: note,
  });
}

export async function applyWhy(ctx: MutationCtx, teamId: Id<"teams">, text: string, engine: Engine) {
  const team = await ctx.db.get(teamId);
  if (!team) return;
  await ctx.db.patch(teamId, {
    why: trimTo(text, 600),
    whyCount: team.whyCount + 1,
    whyEngine: engine,
  });
}

async function applyFallback(ctx: MutationCtx, job: Doc<"jobs">) {
  if (job.kind === "analyse") {
    await applyAnalysis(ctx, job.teamId, job.fallback as Analysis, "heuristics", "laptop model didn't answer in time");
  } else {
    await applyWhy(ctx, job.teamId, String((job.fallback as { text: string }).text), "heuristics");
  }
}

// ── internal: used by the actions ──

export const workerAlive = internalQuery({
  args: {},
  handler: async (ctx) => {
    const hb = await getFlag(ctx, "worker");
    return !!hb && Date.now() - hb.at < HEARTBEAT_STALE_MS;
  },
});

export const pendingWhyFor = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    for (const status of ["pending", "claimed"] as const) {
      const j = await ctx.db
        .query("jobs")
        .withIndex("by_team_kind_status", (q) => q.eq("teamId", teamId).eq("kind", "why").eq("status", status))
        .first();
      if (j) return true;
    }
    return false;
  },
});

export const create = internalMutation({
  args: {
    kind: v.union(v.literal("analyse"), v.literal("why")),
    teamId: v.id("teams"),
    payload: v.any(),
    fallback: v.any(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("jobs", { ...args, status: "pending" });
    await ctx.scheduler.runAfter(JOB_DEADLINE_MS, internal.jobs.fallBackIfLate, { id });
    return id;
  },
});

export const fallBackIfLate = internalMutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || (job.status !== "pending" && job.status !== "claimed")) return;
    await ctx.db.patch(id, { status: "fellBack", finishedAt: Date.now() });
    await applyFallback(ctx, job);
  },
});

export const saveAnalysis = internalMutation({
  args: {
    teamId: v.id("teams"),
    analysis: v.any(),
    fallback: v.any(),
    engine: v.union(v.literal("claude (api)"), v.literal("heuristics")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { teamId, analysis, fallback, engine, note }) => {
    await applyAnalysis(ctx, teamId, sanitiseAnalysis(analysis, fallback), engine, note);
  },
});

export const saveWhy = internalMutation({
  args: {
    teamId: v.id("teams"),
    text: v.string(),
    engine: v.union(v.literal("claude (api)"), v.literal("heuristics")),
  },
  handler: async (ctx, { teamId, text, engine }) => {
    await applyWhy(ctx, teamId, text, engine);
  },
});

export const apiDownUntil = internalQuery({
  args: {},
  handler: async (ctx) => (await getFlag(ctx, "claude_api_down"))?.at ?? 0,
});

export const markApiDown = internalMutation({
  args: { until: v.number(), note: v.string() },
  handler: async (ctx, { until, note }) => setFlag(ctx, "claude_api_down", until, note),
});

// ── public, secret-gated: the worker's API ──

export const pending = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    requireSecret(secret);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(20);
    return jobs.map((j) => ({ _id: j._id, kind: j.kind, payload: j.payload, _creationTime: j._creationTime }));
  },
});

export const claim = mutation({
  args: { secret: v.string(), id: v.id("jobs") },
  handler: async (ctx, { secret, id }) => {
    requireSecret(secret);
    const job = await ctx.db.get(id);
    if (!job || job.status !== "pending") return null;
    await ctx.db.patch(id, { status: "claimed", claimedAt: Date.now() });
    return { _id: job._id, kind: job.kind, payload: job.payload };
  },
});

export const complete = mutation({
  args: { secret: v.string(), id: v.id("jobs"), result: v.any() },
  handler: async (ctx, { secret, id, result }) => {
    requireSecret(secret);
    const job = await ctx.db.get(id);
    // Late results for jobs that already fell back are discarded.
    if (!job || job.status !== "claimed") return { applied: false };
    if (job.kind === "analyse") {
      const a = sanitiseAnalysis((result ?? {}) as Partial<Analysis>, job.fallback as Analysis);
      await applyAnalysis(ctx, job.teamId, a, "claude (laptop)");
    } else {
      const text = typeof result?.text === "string" ? result.text.trim() : "";
      if (!text) {
        await ctx.db.patch(id, { status: "failed", finishedAt: Date.now(), error: "empty" });
        await applyFallback(ctx, job);
        return { applied: false };
      }
      await applyWhy(ctx, job.teamId, text, "claude (laptop)");
    }
    await ctx.db.patch(id, { status: "done", finishedAt: Date.now(), result });
    return { applied: true };
  },
});

export const fail = mutation({
  args: { secret: v.string(), id: v.id("jobs"), error: v.string() },
  handler: async (ctx, { secret, id, error }) => {
    requireSecret(secret);
    const job = await ctx.db.get(id);
    if (!job || (job.status !== "claimed" && job.status !== "pending")) return;
    await ctx.db.patch(id, { status: "failed", finishedAt: Date.now(), error: error.slice(0, 300) });
    await applyFallback(ctx, job);
  },
});

export const heartbeat = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    requireSecret(secret);
    await setFlag(ctx, "worker", Date.now());
  },
});

/** Public, harmless: lets the page say which engine is online. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const hb = await getFlag(ctx, "worker");
    return { workerSeenAt: hb?.at ?? null };
  },
});
