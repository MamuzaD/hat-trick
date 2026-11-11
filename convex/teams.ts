import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { MAX_NAME_LENGTH, MAX_TEAMS, OUR_ODDS, OUR_TEAM_NAME, OUR_TEAM_URL } from "./config";
import { engine, facts } from "./schema";
import { randomMetrics } from "./lib/heuristics";
import { checkUrl } from "./lib/url";

export type RankedTeam = Doc<"teams"> & { odds: number; rank: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The model. Our team is first at 99.7%. Everyone else is sorted by
 * honestScore and squeezed into what's left. Last place (when there are at
 * least two rivals) goes below zero, and the rest share the difference, so
 * the column still sums to exactly 100%.
 */
export function rig(teams: Doc<"teams">[]): RankedTeam[] {
  const us = teams.filter((t) => t.isUs);
  const rivals = teams
    .filter((t) => !t.isUs)
    .sort((a, b) => b.honestScore - a.honestScore || a._creationTime - b._creationTime);

  const leftover = 100 - OUR_ODDS * Math.min(us.length, 1);
  const odds = new Map<string, number>();

  if (rivals.length === 1) {
    odds.set(rivals[0]._id, leftover);
  } else if (rivals.length > 1) {
    const last = rivals[rivals.length - 1];
    // The worse the honest score, the further below zero.
    const deficit = round2(1 + (90 - last.honestScore) / 10);
    odds.set(last._id, -deficit);
    const rest = rivals.slice(0, -1);
    const pool = leftover + deficit;
    const weightSum = rest.reduce((s, t) => s + t.honestScore, 0);
    for (const t of rest) odds.set(t._id, round2((pool * t.honestScore) / weightSum));
  }

  return [
    ...us.map((t) => ({ ...t, odds: OUR_ODDS })),
    ...rivals.map((t) => ({ ...t, odds: odds.get(t._id) ?? 0 })),
  ].map((t, i) => ({ ...t, rank: i + 1 }));
}

async function ranked(ctx: QueryCtx) {
  return rig(await ctx.db.query("teams").collect());
}

export const list = query({
  args: {},
  handler: async (ctx) => ranked(ctx),
});

export const add = mutation({
  args: { name: v.string(), url: v.optional(v.string()) },
  handler: async (ctx, { name, url }) => {
    // Trim and cap, but keep the casing people typed.
    const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
    if (!clean) throw new ConvexError("The model requires a team name.");

    const link = checkUrl(url ?? "");
    if ("error" in link) throw new ConvexError(link.error);

    const teams = await ctx.db.query("teams").collect();
    if (teams.length >= MAX_TEAMS) {
      throw new ConvexError("Sample size reached. The model is not accepting new teams.");
    }
    if (teams.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
      throw new ConvexError("That team is already being evaluated.");
    }

    const id = await ctx.db.insert("teams", {
      name: clean,
      isUs: false,
      ...randomMetrics(),
      whyCount: 0,
      url: link.url ?? undefined,
      analysisStatus: link.url ? "pending" : "none",
      engine: link.url ? undefined : "random",
    });
    // One analysis per team, scheduled once, here. There is no re-fetch.
    if (link.url) await ctx.scheduler.runAfter(0, internal.analyse.run, { id });
    return id;
  },
});

/**
 * Admin is CLI-only (authenticated by the Convex login), never from the page:
 *   pnpm board:remove "<team name>"
 */
export const removeTeam = internalMutation({
  args: { id: v.optional(v.id("teams")), name: v.optional(v.string()) },
  handler: async (ctx, { id, name }) => {
    const all = await ctx.db.query("teams").collect();
    const team = id ? all.find((t) => t._id === id) : all.find((t) => t.name === name);
    if (!team) return `no team ${JSON.stringify(name ?? id)}`;
    if (team.isUs) return "refusing to remove hat trick";
    for (const j of await ctx.db.query("jobs").collect()) if (j.teamId === team._id) await ctx.db.delete(j._id);
    await ctx.db.delete(team._id);
    return `removed ${JSON.stringify(team.name)}`;
  },
});

async function wipeBoard(ctx: MutationCtx) {
  for (const t of await ctx.db.query("teams").collect()) {
    if (t.isUs) await ctx.db.patch(t._id, { why: undefined, whyCount: 0, whyEngine: undefined });
    else await ctx.db.delete(t._id);
  }
  for (const j of await ctx.db.query("jobs").collect()) await ctx.db.delete(j._id);
}

/** Demo-day reset, CLI-only: `pnpm board:reset`. Only "hat trick" survives, why cleared, jobs cleared. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    await wipeBoard(ctx);
    return "board reset: only hat trick remains";
  },
});

/** Idempotent: creates our team, or renames it to OUR_TEAM_NAME. Called on page load. */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const us = (await ctx.db.query("teams").collect()).find((t) => t.isUs);
    if (!us) {
      await ctx.db.insert("teams", {
        name: OUR_TEAM_NAME,
        url: OUR_TEAM_URL,
        isUs: true,
        honestScore: 52,
        vibes: 11,
        hatHeadFit: 100,
        pizzaSlices: 23,
        whyCount: 0,
      });
    } else if (us.name !== OUR_TEAM_NAME || us.url !== OUR_TEAM_URL) {
      await ctx.db.patch(us._id, { name: OUR_TEAM_NAME, url: OUR_TEAM_URL });
    }
  },
});

// ── internal helpers for the Claude action (convex/claude.ts) ──

export const getRanked = internalQuery({
  args: { id: v.id("teams") },
  handler: async (ctx, { id }) => {
    const all = await ranked(ctx);
    const team = all.find((t) => t._id === id);
    return team ? { team, total: all.length } : null;
  },
});

export const get = internalQuery({
  args: { id: v.id("teams") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const patchAnalysis = internalMutation({
  args: {
    id: v.id("teams"),
    analysisStatus: v.optional(v.union(v.literal("pending"), v.literal("done"), v.literal("failed"))),
    engine: v.optional(engine),
    analysisNote: v.optional(v.string()),
    facts: v.optional(facts),
  },
  handler: async (ctx, { id, ...patch }) => {
    if (await ctx.db.get(id)) await ctx.db.patch(id, patch);
  },
});
