"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RankedTeam } from "@/convex/teams";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Row = {
  team: RankedTeam;
  /** What the bar shows right now: honestScore during the honest phase, rigged odds after. */
  display: number;
  honest: boolean;
};

const spring = { type: "spring", stiffness: 140, damping: 22, mass: 1 } as const;

export function formatOdds(n: number) {
  const digits = Math.abs(n) < 1 && n !== 0 ? 2 : 1;
  const s = Math.abs(n).toFixed(digits);
  return n < 0 ? `−${s}` : s;
}

type Props = {
  rows: Row[];
  admin: boolean;
  shimmer: boolean;
  pendingWhy: Set<Id<"teams">>;
  onWhy?: (team: RankedTeam) => void;
  onRemove?: (id: Id<"teams">) => void;
};

export default function Leaderboard({ rows, admin, shimmer, pendingWhy, onWhy, onRemove }: Props) {
  return (
    <ol className="flex flex-col gap-6 md:gap-8">
      <AnimatePresence initial={false}>
        {rows.map((row, i) => (
          <TeamRow
            key={row.team._id}
            row={row}
            rank={i + 1}
            admin={admin}
            shimmer={shimmer}
            pending={pendingWhy.has(row.team._id)}
            onWhy={onWhy}
            onRemove={onRemove}
          />
        ))}
      </AnimatePresence>
    </ol>
  );
}

function TeamRow({
  row,
  rank,
  admin,
  shimmer,
  pending,
  onWhy,
  onRemove,
}: {
  row: Row;
  rank: number;
  admin: boolean;
  shimmer: boolean;
  pending: boolean;
  onWhy?: (team: RankedTeam) => void;
  onRemove?: (id: Id<"teams">) => void;
}) {
  const { team, display, honest } = row;
  const negative = display < 0;
  const width = `${Math.max(0, Math.min(100, display))}%`;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={spring}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 sm:gap-x-5 md:gap-x-8"
    >
      {/* Rank */}
      <span
        className={cn(
          "font-serif leading-none tabular-nums pt-1 w-[1.4ch] text-right",
          "text-4xl md:text-6xl",
          team.isUs ? "embroidered" : "text-denim-400",
        )}
      >
        {rank}
      </span>

      {/* Name, bar, metrics */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3
            className={cn(
              "truncate font-medium leading-tight",
              "text-xl sm:text-2xl md:text-3xl lg:text-4xl",
              team.isUs && "embroidered",
            )}
          >
            {team.name}
          </h3>
          {team.isUs && (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-denim-300 md:text-xs">
              model favourite
            </span>
          )}
          {honest && (
            <span className="shimmer font-mono text-[0.7rem] uppercase tracking-[0.18em] text-denim-200 md:text-xs">
              preliminary · unadjusted
            </span>
          )}
        </div>

        <div
          className={cn(
            "relative mt-2 h-9 overflow-hidden rounded-full bg-denim-950/70 ring-1 ring-inset ring-denim-700 sm:h-11 md:mt-3 md:h-14 lg:h-16",
            shimmer && "shimmer",
          )}
        >
          <motion.div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              team.isUs
                ? "bg-thread text-denim-500/70"
                : honest
                  ? "bg-denim-200"
                  : "bg-gradient-to-r from-denim-600 to-denim-400",
            )}
            style={{ minWidth: display > 0 ? 8 : 0 }}
            initial={false}
            animate={{ width }}
            transition={spring}
          >
            {team.isUs && (
              <span className="stitch-x absolute inset-x-4 top-1/2 h-[2px] -translate-y-1/2 opacity-70" />
            )}
          </motion.div>
          {negative && (
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-1.5 rounded-full bg-warn"
              title="Below zero"
            />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-denim-300 md:text-sm">
          <span>vibes {team.vibes}/10</span>
          <span>hat-head fit {team.hatHeadFit}%</span>
          <span>
            {team.pizzaSlices} {team.pizzaSlices === 1 ? "slice" : "slices"} consumed
          </span>
          {onWhy && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onWhy(team)}
              className="h-7 rounded-full px-3 font-mono text-xs uppercase tracking-[0.14em] md:h-8 md:text-sm"
            >
              {pending ? "thinking…" : team.whyCount >= 1 ? "why?!" : "why?"}
            </Button>
          )}
          {admin && !team.isUs && onRemove && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onRemove(team._id)}
              className="h-7 rounded-full px-3 font-mono text-xs uppercase tracking-[0.14em]"
            >
              remove
            </Button>
          )}
        </div>

        {team.why && (
          <p className="mt-2 max-w-4xl font-serif text-lg italic leading-snug text-denim-200 md:text-2xl">
            &ldquo;{team.why}&rdquo;
          </p>
        )}
      </div>

      {/* Odds */}
      <span
        className={cn(
          "pt-0.5 text-right font-medium leading-none tabular-nums",
          "text-3xl sm:text-4xl md:text-6xl lg:text-7xl",
          "min-w-[4.2ch]",
          negative ? "text-warn" : team.isUs ? "embroidered" : "text-denim-200",
        )}
      >
        {formatOdds(display)}
        <span className="ml-0.5 text-[0.55em] text-denim-400">%</span>
      </span>
    </motion.li>
  );
}
