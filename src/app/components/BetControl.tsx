"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { RankedTeam } from "@/convex/teams";
import { useTrader } from "@/lib/useTrader";
import { cn } from "@/lib/utils";
import Typewriter from "./Typewriter";

type Receipt = {
  won: boolean;
  note: string;
  stake: number;
  payout: number;
  delta: number;
  coins: number;
};

/** What the market says it will pay. Indicative. */
function quote(team: RankedTeam, stake: number): number | null {
  if (team.isUs) return stake + Math.max(1, Math.ceil(stake * 0.003));
  if (team.odds <= 0) return null;
  return Math.round((stake * 100) / team.odds);
}

const frame =
  "relative w-full max-w-[34rem] border-2 bg-panel shadow-[inset_0_1px_0_rgb(169_188_208/0.08),0_18px_40px_-24px_rgb(0_0_0/0.8)]";
const tab =
  "absolute -top-[0.62em] left-3 max-w-[calc(100%-1.5rem)] truncate bg-panel px-2 text-xs leading-none md:text-sm";
const label = "text-[0.7rem] uppercase tracking-[0.18em] text-denim-500 md:text-xs";
const quiet =
  "min-h-[44px] border-2 border-transparent px-3 text-sm text-denim-400 transition-colors hover:text-thread focus-visible:border-denim-400 focus-visible:outline-none sm:min-h-[40px]";
const primary =
  "bet-primary min-h-[44px] flex-1 border-2 border-amber bg-amber px-4 text-sm font-semibold text-ink transition-[filter,transform] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thread active:translate-y-px disabled:cursor-not-allowed disabled:border-denim-700 disabled:bg-transparent disabled:font-normal disabled:text-denim-500 disabled:shadow-none sm:min-h-[40px] sm:flex-none sm:px-6 md:text-base";

/** label ····· value, like a till roll. */
function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className={label}>{k}</dt>
      <span aria-hidden className="flex-1 -translate-y-[0.2em] border-b-2 border-dotted border-denim-700" />
      <dd className="text-denim-200">{children}</dd>
    </div>
  );
}

function Hc({ n, className }: { n: React.ReactNode; className?: string }) {
  return (
    <span className="whitespace-nowrap">
      <b className={cn("font-pixel text-2xl leading-none font-normal", className)}>{n}</b>
      <span className="ml-1 text-xs text-denim-500">hc</span>
    </span>
  );
}

export default function BetControl({ team, onClose }: { team: RankedTeam; onClose: () => void }) {
  const trader = useTrader();
  const wallet = useQuery(api.bets.wallet, { traderId: trader.id });
  const place = useMutation(api.bets.place);
  const coins = wallet?.coins ?? 0;
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const presets: [string, number][] = [
    ["10", 10],
    ["25", 25],
    ["50", 50],
    ["all in", coins],
  ];
  const picked = presets.find(([l]) => l === pick)?.[1] ?? 0;
  const amount = picked >= 1 && picked <= coins ? picked : 0;
  const broke = wallet !== undefined && coins <= 0;
  const quoted = amount ? quote(team, amount) : null;

  async function confirm() {
    if (!amount) return;
    setBusy(true);
    setError(null);
    try {
      const r = await place({ traderId: trader.id, teamId: team._id, amount });
      setReceipt({
        won: r.outcome === "won",
        note: r.note,
        stake: r.amount,
        payout: r.payout,
        delta: r.payout - r.amount,
        coins: r.coins,
      });
      setPick(null);
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : "the market is unavailable. try again.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    const tone = receipt.won ? "text-amber" : "text-red";
    return (
      <div className="rise mt-2 mb-3 w-full max-w-[34rem]">
        <section
          aria-label={`receipt for ${team.name}`}
          aria-live="polite"
          className={cn(frame, "border-b-0", receipt.won ? "border-amber/60" : "border-red/60")}
        >
          <h3 className={cn(tab, tone)}>receipt · {team.name}</h3>
          <div className="flex flex-col gap-3 px-3 pt-5 pb-3 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className={cn("flex items-baseline gap-2", tone)}>
                <span className="text-lg leading-none md:text-xl">{receipt.won ? "▲" : "▼"}</span>
                <span
                  className={cn(
                    "font-pixel text-5xl leading-[0.85] md:text-6xl",
                    receipt.won ? "glow-amber" : "glow-red",
                  )}
                >
                  {receipt.delta >= 0 ? "+" : "−"}
                  {Math.abs(receipt.delta)}
                </span>
                <span className="text-xs text-denim-400 md:text-sm">hat coins</span>
              </div>
              <span
                aria-hidden
                className={cn(
                  "-rotate-6 border-2 border-double px-2 py-1 text-xs tracking-[0.25em] uppercase opacity-90 md:text-sm",
                  receipt.won ? "border-amber" : "border-red",
                  tone,
                )}
              >
                {receipt.won ? "paid" : "void"}
              </span>
            </div>

            <div aria-hidden className={cn("stitch w-full opacity-60", receipt.won ? "text-amber" : "text-red")} />

            <dl className="flex flex-col gap-1.5 text-sm">
              <Line k="outcome">
                <span className={tone}>{receipt.won ? "won" : "lost"}</span>
              </Line>
              <Line k="stake">
                <Hc n={receipt.stake} />
              </Line>
              <Line k="payout">
                <Hc n={receipt.payout} className={receipt.won ? "text-amber" : "text-denim-400"} />
              </Line>
              <Line k="new balance">
                <Hc n={receipt.coins} className="text-thread" />
              </Line>
            </dl>

            <p className={cn("min-h-[1.5em] text-sm leading-relaxed", tone)}>
              <span className="text-denim-500">↳ market: </span>
              <Typewriter key={receipt.note} text={receipt.note} animate />
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={receipt.coins <= 0}
                onClick={() => setReceipt(null)}
                className="min-h-[44px] flex-1 border-2 border-denim-600 px-4 text-sm text-denim-200 transition-colors hover:border-amber hover:text-amber focus-visible:border-thread focus-visible:outline-none disabled:cursor-not-allowed disabled:border-denim-700 disabled:text-denim-500 sm:min-h-[40px] sm:flex-none"
              >
                {receipt.coins <= 0 ? "[ no funds ]" : "[ bet again ]"}
              </button>
              <button type="button" onClick={onClose} className={quiet}>
                [ close ]
              </button>
              <span className="text-center text-[0.7rem] text-denim-500 sm:ml-auto sm:text-right">
                all settlements final
              </span>
            </div>
          </div>
        </section>
        <div aria-hidden className={cn("receipt-tear", receipt.won ? "text-amber/60" : "text-red/60")} />
      </div>
    );
  }

  return (
    <section aria-label={`order ticket for ${team.name}`} className={cn(frame, "corners mt-2 mb-3 border-denim-600")}>
      <h3 className={cn(tab, "text-denim-300")}>
        order ticket · <span className="text-thread">{team.name}</span>
      </h3>
      <div className="flex flex-col gap-3 px-3 pt-5 pb-3 sm:px-4">
        <dl className="text-sm">
          <Line k="balance">
            <Hc n={wallet ? coins : "–"} className={broke ? "text-red" : "text-thread"} />
          </Line>
        </dl>

        <div role="group" aria-label="stake" className="grid grid-cols-4 gap-[3px]">
          {presets.map(([l, n]) => {
            const on = pick === l && amount > 0;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                disabled={busy || n < 1 || n > coins}
                onClick={() => {
                  setPick(l);
                  setError(null);
                }}
                className={cn(
                  "min-h-[44px] border-2 font-pixel text-2xl leading-none transition-colors focus-visible:border-thread focus-visible:outline-none disabled:cursor-not-allowed disabled:border-denim-800 disabled:bg-transparent disabled:text-denim-700 sm:min-h-[40px]",
                  on
                    ? "border-amber bg-amber text-ink shadow-[0_0_18px_-4px_rgb(255_196_107/0.7)]"
                    : "border-denim-700 bg-denim-900/70 text-denim-200 hover:border-amber hover:text-amber",
                )}
              >
                {l}
              </button>
            );
          })}
        </div>

        <div aria-hidden className="stitch w-full text-denim-600" />

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div>
            <div className={label}>stake</div>
            <div className="mt-1 whitespace-nowrap">
              <span className={cn("font-pixel text-4xl leading-[0.85]", amount ? "text-thread" : "text-denim-600")}>
                {amount || "––"}
              </span>
              <span className="ml-1 text-xs text-denim-500">hc</span>
            </div>
          </div>
          <span aria-hidden className={cn("pb-1 font-pixel text-2xl", amount ? "text-amber" : "text-denim-700")}>
            &gt;&gt;
          </span>
          <div className="text-right">
            <div className={label}>quoted return</div>
            <div className="mt-1 whitespace-nowrap">
              <span
                className={cn(
                  "font-pixel text-4xl leading-[0.85]",
                  quoted !== null ? "glow-amber text-amber" : "text-denim-600",
                )}
              >
                {quoted !== null ? quoted.toLocaleString("en-US") : amount ? "n/a" : "––"}
              </span>
              <span className="ml-1 text-xs text-denim-500">hc</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" disabled={busy || !amount} onClick={confirm} className={primary}>
            {busy ? "[ settling… ]" : broke ? "[ no funds ]" : "[ place bet ]"}
          </button>
          <button type="button" onClick={onClose} className={quiet}>
            [ cancel ]
          </button>
          <span className="text-center text-[0.7rem] text-denim-500 sm:ml-auto sm:text-right">
            quotes are indicative
          </span>
        </div>

        {(error || broke) && (
          <p role="alert" className="text-sm leading-relaxed text-red">
            <span className="text-red/60">↳ market: </span>
            {error ?? "balance 0. the market does not offer refills."}
          </p>
        )}
      </div>
    </section>
  );
}
