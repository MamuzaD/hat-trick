"use node";

// Reads a team's project link for real, then hands the verdict to whichever
// engine is up: direct API, the laptop worker, or plain-code heuristics.
// The rank is still decided in teams.ts; nothing here can move "hat trick".

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { apiAnalyse, apiAvailable } from "./lib/anthropic";
import { fetchProject } from "./lib/fetchProject";
import { heuristicAnalysis, readFacts } from "./lib/heuristics";
import type { AnalysePayload } from "./lib/prompts";

export const run = internalAction({
  args: { id: v.id("teams") },
  handler: async (ctx, { id }) => {
    const team = await ctx.runQuery(internal.teams.get, { id });
    if (!team || team.analysisStatus !== "pending" || !team.url) return;

    const res = await fetchProject(team.url);
    if (!res.ok) {
      await ctx.runMutation(internal.teams.patchAnalysis, {
        id,
        analysisStatus: "failed",
        engine: "random",
        analysisNote: `fetch failed: ${res.reason} · random scores assigned`,
      });
      return;
    }

    const d = res.data;
    const facts = readFacts(
      d.text,
      { kind: d.kind, host: d.host, title: d.title, language: d.language, stars: d.stars },
      d.counts,
    );
    const heur = heuristicAnalysis(d.text, facts, d.description);
    await ctx.runMutation(internal.teams.patchAnalysis, { id, facts });

    const payload: AnalysePayload = { name: team.name, url: team.url, host: d.host, title: d.title, text: d.text };

    if (await apiAvailable(ctx)) {
      const out = await apiAnalyse(ctx, payload);
      if (out) {
        await ctx.runMutation(internal.jobs.saveAnalysis, { teamId: id, analysis: out, fallback: heur, engine: "claude (api)" });
        return;
      }
    }

    if (await ctx.runQuery(internal.jobs.workerAlive, {})) {
      await ctx.runMutation(internal.jobs.create, { kind: "analyse", teamId: id, payload, fallback: heur });
      return;
    }

    await ctx.runMutation(internal.jobs.saveAnalysis, {
      teamId: id,
      analysis: heur,
      fallback: heur,
      engine: "heuristics",
      note: "analysis skipped: model busy winning · heuristics used",
    });
  },
});
