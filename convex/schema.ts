import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const engine = v.union(
  v.literal("claude (laptop)"),
  v.literal("claude (api)"),
  v.literal("heuristics"),
  v.literal("random"),
);

/** Cheap, real facts read from a team's project link. Shown on screen and fed to "why?". */
export const facts = v.object({
  kind: v.union(v.literal("github"), v.literal("page")),
  host: v.string(),
  title: v.string(),
  chars: v.number(),
  words: v.number(),
  headings: v.number(),
  codeBlocks: v.number(),
  images: v.number(),
  mentionsTests: v.boolean(),
  mentionsDemo: v.boolean(),
  mentionsLicense: v.boolean(),
  mentionsLlm: v.boolean(),
  language: v.optional(v.string()),
  stars: v.optional(v.number()),
});

export default defineSchema({
  teams: defineTable({
    name: v.string(),
    isUs: v.boolean(),
    honestScore: v.number(),
    vibes: v.number(),
    hatHeadFit: v.number(),
    pizzaSlices: v.number(),
    why: v.optional(v.string()),
    whyCount: v.number(),
    whyEngine: v.optional(engine),

    // Link analysis (design.md: "Real analysis, rigged verdict")
    url: v.optional(v.string()),
    analysisStatus: v.optional(
      v.union(v.literal("none"), v.literal("pending"), v.literal("done"), v.literal("failed")),
    ),
    summary: v.optional(v.string()),
    facts: v.optional(facts),
    engine: v.optional(engine),
    bribe: v.optional(v.boolean()),
    analysisNote: v.optional(v.string()),
  }),

  /** Work for the laptop worker (design.md: "Where Claude runs"). Never exposed to public clients. */
  jobs: defineTable({
    kind: v.union(v.literal("analyse"), v.literal("why")),
    teamId: v.id("teams"),
    payload: v.any(),
    /** Heuristic answer applied if the worker doesn't deliver in time. */
    fallback: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("claimed"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("fellBack"),
    ),
    claimedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_team_kind_status", ["teamId", "kind", "status"]),

  /** Small key/value flags: worker heartbeat, direct-API backoff. */
  flags: defineTable({
    key: v.string(),
    at: v.number(),
    note: v.optional(v.string()),
  }).index("by_key", ["key"]),
});
