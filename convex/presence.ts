import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isTraderId } from "./lib/trader";

/** A browser counts as here if it pinged within this window. Clients ping every PING_MS. */
export const PING_MS = 12_000;
export const ONLINE_WINDOW_MS = 30_000;
const FORGET_MS = 5 * 60_000;

/** Heartbeat from an open tab. Also forgets browsers that left a while ago. */
export const ping = mutation({
  args: { traderId: v.string() },
  handler: async (ctx, { traderId }) => {
    if (!isTraderId(traderId)) return;
    const now = Date.now();
    const mine = await ctx.db
      .query("presence")
      .withIndex("by_trader", (q) => q.eq("traderId", traderId))
      .first();
    if (mine) await ctx.db.patch(mine._id, { at: now });
    else await ctx.db.insert("presence", { traderId, at: now });
    for (const p of await ctx.db.query("presence").collect()) {
      if (now - p.at > FORGET_MS) await ctx.db.delete(p._id);
    }
  },
});

/**
 * Last-seen times only (no ids). The client counts the recent ones against
 * its own clock, so the number drops when someone leaves without the query
 * having to read the time.
 */
export const seen = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("presence").collect()).map((p) => p.at),
});
