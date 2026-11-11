import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  }),
});
