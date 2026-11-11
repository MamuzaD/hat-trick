"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { apiAvailable, apiWhy } from "./lib/anthropic";
import { templatedWhy } from "./lib/heuristics";
import type { WhyPayload } from "./lib/prompts";

/**
 * "Why?" for one team. Answers land on the team document (why, whyCount,
 * whyEngine); the page watches that live, whichever engine answered.
 */
export const explain = action({
  args: { id: v.id("teams") },
  handler: async (ctx, { id }): Promise<{ queued: boolean }> => {
    const found = await ctx.runQuery(internal.teams.getRanked, { id });
    if (!found) return { queued: false };
    if (await ctx.runQuery(internal.jobs.pendingWhyFor, { teamId: id })) return { queued: true };
    const { team, total } = found;

    const payload: WhyPayload = {
      name: team.name,
      isUs: team.isUs,
      rank: team.rank,
      total,
      odds: team.odds,
      vibes: team.vibes,
      hatHeadFit: team.hatHeadFit,
      pizzaSlices: team.pizzaSlices,
      whyCount: team.whyCount,
      summary: team.summary,
      facts: team.facts,
    };
    const fallbackText = templatedWhy({ ...payload, teamId: team._id, facts: team.facts });

    if (await apiAvailable(ctx)) {
      const text = await apiWhy(ctx, payload);
      if (text) {
        await ctx.runMutation(internal.jobs.saveWhy, { teamId: id, text, engine: "claude (api)" });
        return { queued: false };
      }
    }

    if (await ctx.runQuery(internal.jobs.workerAlive, {})) {
      await ctx.runMutation(internal.jobs.create, {
        kind: "why",
        teamId: id,
        payload,
        fallback: { text: fallbackText },
      });
      return { queued: true };
    }

    await ctx.runMutation(internal.jobs.saveWhy, { teamId: id, text: fallbackText, engine: "heuristics" });
    return { queued: false };
  },
});
