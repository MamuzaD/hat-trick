"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { RankedTeam } from "@/convex/teams";
import { cn } from "@/lib/utils";
import { useTrader } from "@/lib/useTrader";
import BetControl from "./BetControl";
import { formatOdds, type Row } from "./Leaderboard";

/**
 * The betting floor: your position, one tile per team with an order ticket,
 * and your settled bets. Lives in its own tab so the leaderboard stays calm.
 */
export default function Market({ rows }: { rows: Row[] }) {
  const trader = useTrader();
  const wallet = useQuery(api.bets.wallet, { traderId: trader.id });
  const pool = useQuery(api.bets.pool);
  const [open, setOpen] = useState<string | null>(null);

  const teams = rows.filter((r) => !r.analysing).map((r) => r.team);
  const byId = new Map<string, RankedTeam>(teams.map((t) => [t._id, t]));
  const coins = wallet?.coins ?? 100;
  const bets = wallet?.bets ?? [];
  const staked = bets.reduce((s, b) => s + b.amount, 0);
  const returned = bets.reduce((s, b) => s + b.payout, 0);
  const pnl = returned - staked;
  const totalPool = Object.values(pool ?? {}).reduce((s, n) => s + n, 0);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* Position */}
      <dl className="grid grid-cols-2 gap-px border-2 border-denim-700 bg-denim-700 md:grid-cols-4">
        <Stat label="balance" value={coins} unit="hc" tone="amber" />
        <Stat label="p&l" value={`${pnl > 0 ? "+" : pnl < 0 ? "−" : ""}${Math.abs(pnl)}`} unit="hc" tone={pnl < 0 ? "red" : pnl > 0 ? "amber" : "plain"} />
        <Stat label="bets settled" value={bets.length} unit="early" />
        <Stat label="market pool" value={totalPool} unit="hc" />
      </dl>

      {/* Contracts */}
      <div>
        <h3 className="mb-3 text-xs tracking-[0.2em] text-denim-500 uppercase md:text-sm">contracts · will they win the hat?</h3>
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {teams.map((team) => {
            const active = open === team._id;
            const negative = team.odds < 0;
            return (
              <li
                key={team._id}
                className={cn(
                  "relative flex flex-col gap-3 border-2 bg-denim-950/50 p-3 transition-colors md:p-4",
                  active ? "border-amber md:col-span-2 2xl:col-span-3" : team.isUs ? "border-amber/40" : "border-denim-700",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.7rem] tracking-[0.18em] text-denim-500 uppercase">
                      #{String(team.rank).padStart(2, "0")} {team.isUs && <span className="text-amber">· ★ favourite</span>}
                    </p>
                    <p className={cn("mt-1 line-clamp-2 text-lg leading-tight font-semibold break-words md:text-xl", team.isUs ? "text-thread" : "text-denim-200")}>
                      {team.name}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 font-pixel text-3xl leading-none tabular-nums md:text-4xl",
                      negative ? "text-red" : team.isUs ? "glow-amber text-amber" : "text-denim-200",
                    )}
                  >
                    {formatOdds(team.odds)}
                    <span className="text-[0.5em] text-denim-500">%</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-denim-400 md:text-sm">
                  <span>
                    pool <b className="font-medium text-denim-200">{pool?.[team._id] ?? 0}</b> hc
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(active ? null : team._id)}
                    aria-expanded={active}
                    className={cn(
                      "flex min-h-10 items-center gap-2 border-2 px-3 text-sm transition-colors",
                      active
                        ? "border-amber bg-amber/10 text-amber"
                        : "border-denim-500 text-thread hover:border-amber hover:text-amber",
                    )}
                  >
                    <span aria-hidden className="hat-coin" />
                    {active ? "[ close ]" : "[ bet ]"}
                  </button>
                </div>
                {active && <BetControl team={team} onClose={() => setOpen(null)} />}
              </li>
            );
          })}
        </ul>
      </div>

      {/* History */}
      <div>
        <h3 className="mb-3 text-xs tracking-[0.2em] text-denim-500 uppercase md:text-sm">your settled bets</h3>
        {bets.length === 0 ? (
          <p className="border-2 border-dashed border-denim-700 px-4 py-6 text-center text-sm text-denim-400">
            no positions. the market notes your caution and has priced it in.
          </p>
        ) : (
          <ol className="flex flex-col text-sm md:text-base">
            {bets.map((b) => {
              const won = b.outcome === "won";
              const delta = b.payout - b.amount;
              return (
                <li
                  key={b._id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-dashed border-denim-800 py-2"
                >
                  <span className={won ? "text-amber" : "text-red"}>{won ? "▲" : "▼"}</span>
                  <span className="min-w-0">
                    <span className="text-denim-200">{byId.get(b.teamId)?.name ?? "delisted team"}</span>
                    <span className="block truncate text-xs text-denim-500 md:text-sm">
                      staked {b.amount} hc · {b.note}
                    </span>
                  </span>
                  <span className={cn("font-pixel text-xl tabular-nums md:text-2xl", won ? "text-amber" : "text-red")}>
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(delta)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone = "plain",
}: {
  label: string;
  value: React.ReactNode;
  unit: string;
  tone?: "plain" | "amber" | "red";
}) {
  return (
    <div className="bg-panel px-3 py-3 md:px-4 md:py-4">
      <dt className="text-[0.7rem] tracking-[0.18em] text-denim-500 uppercase md:text-xs">{label}</dt>
      <dd
        className={cn(
          "mt-1 font-pixel text-3xl leading-none tabular-nums md:text-4xl",
          tone === "amber" && "glow-amber text-amber",
          tone === "red" && "text-red",
          tone === "plain" && "text-thread",
        )}
      >
        {value}
        <span className="ml-1.5 font-mono text-xs text-denim-500 md:text-sm">{unit}</span>
      </dd>
    </div>
  );
}
