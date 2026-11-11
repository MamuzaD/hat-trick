import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { isTraderId } from "./lib/trader";

export const STARTING_COINS = 100;

const LOSS_NOTES = [
  "settled early · market moved against you",
  "settled early · liquidity event",
  "settled early · model reached consensus",
  "settled early · outcome priced in",
];

/** The settlement model. Deterministic: the favourite holds, everything else does not. */
export function settle(amount: number, isUs: boolean, seq: number) {
  if (isUs) {
    const gain = Math.max(1, Math.ceil(amount * 0.003));
    return { outcome: "won" as const, payout: amount + gain, note: "settled early · favourite held" };
  }
  return { outcome: "lost" as const, payout: 0, note: LOSS_NOTES[seq % LOSS_NOTES.length] };
}

async function walletRow(ctx: QueryCtx, traderId: string) {
  return await ctx.db
    .query("wallets")
    .withIndex("by_trader", (q) => q.eq("traderId", traderId))
    .unique();
}

export const wallet = query({
  args: { traderId: v.string() },
  handler: async (ctx, { traderId }) => {
    if (!isTraderId(traderId)) return { coins: STARTING_COINS, bets: [] };
    const row = await walletRow(ctx, traderId);
    const recent = await ctx.db
      .query("bets")
      .withIndex("by_trader", (q) => q.eq("traderId", traderId))
      .order("desc")
      .take(10);
    return { coins: row?.coins ?? STARTING_COINS, bets: recent };
  },
});

/** Coins staked per team, for display. Bets on deleted teams are skipped. */
export const pool = query({
  args: {},
  handler: async (ctx) => {
    const teams = new Set((await ctx.db.query("teams").collect()).map((t) => t._id as string));
    const totals: Record<string, number> = {};
    for (const b of await ctx.db.query("bets").collect()) {
      if (!teams.has(b.teamId)) continue;
      totals[b.teamId] = (totals[b.teamId] ?? 0) + b.amount;
    }
    return totals;
  },
});

export const place = mutation({
  args: { traderId: v.string(), teamId: v.string(), amount: v.number() },
  handler: async (ctx, { traderId, teamId, amount }) => {
    if (!isTraderId(traderId)) throw new ConvexError("trader not recognised. the market regrets nothing.");
    const id = ctx.db.normalizeId("teams", teamId);
    const team = id ? await ctx.db.get(id) : null;
    if (!team) throw new ConvexError("that team is no longer trading.");

    const row = await walletRow(ctx, traderId);
    const coins = row?.coins ?? STARTING_COINS;
    if (coins <= 0) throw new ConvexError("balance: 0 hat coins. the market does not offer refills.");
    if (!Number.isInteger(amount) || amount < 1) throw new ConvexError("stakes are whole hat coins, minimum 1.");
    if (amount > coins) throw new ConvexError(`insufficient hat coins. you have ${coins}.`);

    const seq = (await ctx.db.query("bets").collect()).length;
    const result = settle(amount, team.isUs, seq);
    const next = coins - amount + result.payout;
    if (row) await ctx.db.patch(row._id, { coins: next });
    else await ctx.db.insert("wallets", { traderId, coins: next });
    await ctx.db.insert("bets", { traderId, teamId: team._id, amount, ...result });
    return { ...result, amount, coins: next };
  },
});

/** CLI-only: `pnpm bets:reset`. Wipes all wallets and bets. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const w of await ctx.db.query("wallets").collect()) await ctx.db.delete(w._id);
    for (const b of await ctx.db.query("bets").collect()) await ctx.db.delete(b._id);
    return "bets reset: every trader back to 100 hat coins";
  },
});
