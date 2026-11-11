"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RankedTeam } from "@/convex/teams";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Typewriter from "./Typewriter";

export type Row = {
  team: RankedTeam;
  /** What the bar shows right now: honestScore during the honest phase, rigged odds after. */
  display: number;
  honest: boolean;
  /** Link still being fetched/analysed: no score to show yet. */
  analysing: boolean;
};

const CELL = 12; // keep in sync with .cells --cell in globals.css
const spring = { type: "spring", stiffness: 140, damping: 22, mass: 1 } as const;

export function formatOdds(n: number) {
  const digits = Math.abs(n) < 1 && n !== 0 ? 2 : 1;
  const s = Math.abs(n).toFixed(digits);
  return n < 0 ? `−${s}` : s;
}

type Props = {
  rows: Row[];
  busy: boolean;
  pendingWhy: Set<Id<"teams">>;
  onWhy?: (team: RankedTeam) => void;
};

export default function Leaderboard({ rows, busy, pendingWhy, onWhy }: Props) {
  return (
    <div>
      <div
        aria-hidden
        className="row-grid mb-3 border-b border-dashed border-denim-700 pb-2 text-xs uppercase tracking-[0.2em] text-denim-500 md:text-sm"
      >
        <span style={{ gridArea: "rank" }}>#</span>
        <span style={{ gridArea: "name" }}>team</span>
        <span style={{ gridArea: "bar" }} className="hidden min-[900px]:block">
          p(hat)
        </span>
        <span style={{ gridArea: "pct" }} className="text-right">
          odds
        </span>
      </div>
      <ol className="flex flex-col gap-2 md:gap-3">
        <AnimatePresence initial={false}>
          {rows.map((row, i) => (
            <TeamRow
              key={row.team._id}
              row={row}
              rank={i + 1}
              busy={busy}
              pending={pendingWhy.has(row.team._id)}
              onWhy={onWhy}
            />
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function TeamRow({
  row,
  rank,
  busy,
  pending,
  onWhy,
}: {
  row: Row;
  rank: number;
  busy: boolean;
  pending: boolean;
  onWhy?: (team: RankedTeam) => void;
}) {
  const { team, display, honest, analysing } = row;
  const host = team.url ? new URL(team.url).hostname.replace(/^www\./, "") : null;
  const linkLabel = team.url ? `${host}${new URL(team.url).pathname.replace(/\/$/, "")}` : null;
  const negative = display < 0;
  const [trackRef, trackWidth] = useWidth<HTMLDivElement>();
  // Only type out justifications that arrive after this row mounted.
  const [initialWhy] = useState(team.why);
  const [initialSummary] = useState(team.summary);

  // Snap the fill to whole cells.
  const cells = Math.max(1, Math.floor(trackWidth / CELL));
  const clamped = Math.max(0, Math.min(100, display));
  const filled = analysing ? 0 : clamped > 0 ? Math.min(cells, Math.max(1, Math.round((cells * clamped) / 100))) : 0;
  const fillPx = filled * CELL;

  const accent = team.isUs ? "text-amber" : negative ? "text-red" : honest ? "text-thread" : "text-denim-300";

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={spring}
      className={cn(
        "row-grid relative -mx-2 px-2 py-3 md:-mx-3 md:px-3 md:py-4",
        team.isUs &&
          "bg-amber/[0.06] shadow-[inset_3px_0_0_var(--amber),0_0_40px_-12px_rgb(255_196_107/0.35)]",
        honest && "bg-thread/[0.04] shadow-[inset_3px_0_0_var(--thread)]",
      )}
    >
      <span
        style={{ gridArea: "rank" }}
        className={cn("font-pixel text-2xl leading-none md:text-4xl", team.isUs ? "text-amber" : "text-denim-500")}
      >
        {String(rank).padStart(2, "0")}
      </span>

      <div style={{ gridArea: "name" }} className="min-w-0">
        <div
          className={cn(
            "line-clamp-2 break-words text-lg font-semibold leading-tight sm:text-xl md:text-2xl lg:text-3xl",
            team.isUs ? "text-thread" : "text-denim-200",
          )}
          title={team.name}
        >
          {team.name}
        </div>
        {(team.isUs || honest || analysing) && (
          <div className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] md:text-xs">
            {team.isUs && <span className="text-amber">★ model favourite</span>}
            {analysing && <span className="pulse-soft text-amber">● analysing {host}…</span>}
            {honest && !analysing && <span className="pulse-soft text-thread">● honest score · unadjusted</span>}
          </div>
        )}
      </div>

      <div style={{ gridArea: "bar" }} className="relative">
        <div
          ref={trackRef}
          className={cn("cells relative h-7 w-full sm:h-8 md:h-10 lg:h-12", (busy || analysing) && "pulse-soft")}
        >
          <div className="absolute inset-0 bg-denim-800/80" />
          <motion.div
            className={cn("absolute inset-y-0 left-0 bg-current", accent)}
            initial={false}
            animate={{ width: fillPx }}
            transition={spring}
          />
        </div>
        {negative && (
          <span className="absolute inset-y-0 left-0 w-[3px] bg-red" aria-hidden title="below zero" />
        )}
      </div>

      <span
        style={{ gridArea: "pct" }}
        className={cn(
          "min-w-[4.2ch] text-right font-pixel text-3xl leading-none tabular-nums sm:text-4xl md:text-5xl lg:text-6xl",
          negative ? "text-red" : team.isUs ? "text-amber" : honest ? "text-thread" : "text-denim-200",
        )}
      >
        {analysing ? "··.·" : formatOdds(display)}
        <span className="text-[0.5em] text-denim-500">%</span>
      </span>

      <div
        style={{ gridArea: "meta" }}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-denim-400 md:text-sm"
      >
        <span>
          vibes <b className="font-medium text-denim-200">{team.vibes}</b>/10
        </span>
        <span>
          hat-head fit <b className="font-medium text-denim-200">{team.hatHeadFit}%</b>
        </span>
        <span>
          pizza <b className="font-medium text-denim-200">{team.pizzaSlices}</b> sl.
        </span>
        {linkLabel && (
          <a
            href={team.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="max-w-[28ch] truncate text-denim-400 underline decoration-denim-600 underline-offset-4 hover:text-thread"
          >
            @{linkLabel}
          </a>
        )}
        {team.engine && !team.isUs && !analysing && (
          <span className="text-denim-500">engine: {team.engine}</span>
        )}
        <span className="flex gap-2 sm:ml-auto">
          {onWhy && !analysing && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onWhy(team)}
              className="h-7 border-denim-600 bg-transparent px-2 text-xs text-denim-200 hover:border-thread hover:bg-denim-800 hover:text-thread md:h-8 md:text-sm"
            >
              {pending ? "[ … ]" : team.whyCount >= 1 ? "[ why?! ]" : "[ why? ]"}
            </Button>
          )}
        </span>
      </div>

      {(team.summary || team.why || team.analysisNote) && (
        <div style={{ gridArea: "why" }} className="flex max-w-5xl flex-col gap-1 text-sm leading-relaxed md:text-base">
          {team.summary && (
            <p className="text-denim-200">
              <span className="text-denim-500">↳ read: </span>
              <Typewriter key={team.summary} text={team.summary} animate={team.summary !== initialSummary} />
            </p>
          )}
          {team.analysisStatus === "failed" && team.analysisNote && (
            <p className="text-denim-500">↳ {team.analysisNote}</p>
          )}
          {team.why && (
            <p className="text-denim-300">
              <span className="text-denim-500">↳ model: </span>
              <Typewriter key={team.why} text={team.why} animate={team.why !== initialWhy} />
            </p>
          )}
        </div>
      )}
    </motion.li>
  );
}
