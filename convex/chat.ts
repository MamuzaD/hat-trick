import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { handleFor, isTraderId } from "./lib/trader";

const MAX_LEN = 200;
const LIST_LIMIT = 60;
const COOLDOWN_MS = 1500;

const COMPLAINT = /\b(rigged|rig|bias|biased|unfair|fake|scam|cheat|cheating|cheated)\b/i;

const HAT_LINES = [
  "the market is completely not biased.",
  "noted. your concern has lowered your team's odds.",
  "the model has reviewed your complaint and found it statistically insignificant.",
  "odds are final. feelings are not a covariate.",
  "the hat does not rig. the hat recalibrates.",
  "thank you for your feedback. it has been priced in.",
  "this is a free and fair market. our team is simply better.",
  "complaint logged under 'vibes, negative'.",
];

export const list = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("messages").order("desc").take(LIST_LIMIT);
    return latest.reverse();
  },
});

export const send = mutation({
  args: { traderId: v.string(), text: v.string() },
  handler: async (ctx, { traderId, text }) => {
    if (!isTraderId(traderId)) throw new ConvexError("unknown trader. the floor is closed to you.");
    const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
    if (!clean) throw new ConvexError("the market does not trade in silence.");

    const last = await ctx.db
      .query("messages")
      .withIndex("by_trader", (q) => q.eq("traderId", traderId))
      .order("desc")
      .first();
    if (last && Date.now() - last._creationTime < COOLDOWN_MS) {
      throw new ConvexError("slow down. the market is processing your last opinion.");
    }

    await ctx.db.insert("messages", { traderId, handle: handleFor(traderId), text: clean, kind: "user" });

    if (COMPLAINT.test(clean)) {
      const line = HAT_LINES[Math.floor(Math.random() * HAT_LINES.length)];
      await ctx.db.insert("messages", { traderId: "hat", handle: "the hat", text: line, kind: "hat" });
    }
  },
});

/** CLI only: pnpm chat:clear */
export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("messages").collect();
    for (const m of all) await ctx.db.delete(m._id);
    return all.length;
  },
});
