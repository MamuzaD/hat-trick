"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RankedTeam } from "@/convex/teams";
import { OUR_ODDS } from "@/convex/config";
import Leaderboard, { type Row } from "./Leaderboard";
import Mascot, { type Mood } from "./Mascot";

/** A new team shows its honest score for this long before the model "recalibrates". */
const HONEST_MS = 2000;
/** How long the "recalibrating" status lingers after the slide. */
const RECAL_MS = 1600;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * When did this client first see each team? Teams present on first load get 0
 * (no honest phase). Teams that appear later, on any device, get Date.now().
 */
function useFirstSeen(teams: RankedTeam[] | undefined) {
  const [seen, setSeen] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!teams) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with an external live query
    setSeen((prev) => {
      const initial = prev === null;
      const next = { ...prev };
      let changed = initial;
      for (const t of teams) {
        if (!(t._id in next)) {
          next[t._id] = initial ? 0 : Date.now();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [teams]);
  return seen;
}

export default function HatTrick() {
  const teams = useQuery(api.teams.list);
  const seed = useMutation(api.teams.seed);
  const remove = useMutation(api.teams.remove);

  useEffect(() => {
    seed().catch(() => {});
  }, [seed]);

  const admin = useMemo(
    () => new URLSearchParams(window.location.search).get("admin") === "1",
    [],
  );
  const now = useNow(200);
  const firstSeen = useFirstSeen(teams);
  const [pendingWhy] = useState<Set<Id<"teams">>>(() => new Set());

  const ageOf = (id: string) => {
    const t = firstSeen?.[id];
    return t ? now - t : Infinity;
  };

  const rows: Row[] = (teams ?? [])
    .map((team) => {
      const honest = !team.isUs && ageOf(team._id) < HONEST_MS;
      return { team, honest, display: honest ? team.honestScore : team.odds };
    })
    .sort((a, b) => Number(b.team.isUs) - Number(a.team.isUs) || b.display - a.display);

  const ingesting = rows.find((r) => r.honest);
  const recalibrating = rows.some((r) => {
    const age = ageOf(r.team._id);
    return !r.team.isUs && age >= HONEST_MS && age < HONEST_MS + RECAL_MS;
  });

  const mood: Mood = ingesting ? "idle" : rows[0]?.team.isUs ? "smug" : "idle";

  const status = ingesting
    ? `Ingesting “${ingesting.team.name}”. Preliminary estimate: ${ingesting.team.honestScore}%.`
    : recalibrating
      ? "Recalibrating… correcting for optimism bias."
      : "Model stable. No anomalies detected.";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pt-6 pb-16 sm:px-8 md:gap-12 md:pt-10 lg:px-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="size-20 shrink-0 sm:size-24 md:size-36">
            <Mascot mood={mood} size={144} />
          </div>
          <div className="min-w-0">
            <h1 className="embroidered font-serif text-6xl leading-[0.85] sm:text-7xl md:text-8xl lg:text-9xl">
              hat trick
            </h1>
            <p className="mt-2 text-base text-denim-200 sm:text-lg md:text-2xl">
              Live odds of winning the <span className="font-serif text-[1.15em] italic text-thread">thinking</span> hat.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-denim-300 sm:text-sm md:text-right">
          <dt>model confidence</dt>
          <dd className="tabular-nums text-thread">{OUR_ODDS}%</dd>
          <dt>teams evaluated</dt>
          <dd className="tabular-nums text-thread">{teams?.length ?? "—"}</dd>
          <dt>p-value</dt>
          <dd className="tabular-nums text-thread">&lt; 0.001</dd>
        </dl>
      </header>

      <p
        aria-live="polite"
        className="flex items-center gap-3 border-y border-denim-700/70 py-3 font-mono text-sm text-denim-200 md:text-lg"
      >
        <span
          className={`inline-block size-2.5 shrink-0 rounded-full ${ingesting || recalibrating ? "shimmer bg-warn" : "bg-denim-300"}`}
        />
        {status}
      </p>

      <section aria-label="Leaderboard">
        {teams === undefined ? (
          <p className="shimmer font-mono text-denim-300">Loading priors…</p>
        ) : (
          <Leaderboard
            rows={rows}
            admin={admin}
            shimmer={false}
            pendingWhy={pendingWhy}
            onRemove={(id) => remove({ id })}
          />
        )}
      </section>

      <footer className="mt-4 border-t border-denim-700/70 pt-5 font-mono text-xs leading-relaxed text-denim-400 md:text-sm">
        <span className="text-denim-300">Methodology:</span> hierarchical Bayesian vibes model with
        hat-head fit covariates, bootstrapped over three pizza boxes (n&nbsp;=&nbsp;1 hat). Odds sum to
        100% and are not up for discussion.
      </footer>
    </main>
  );
}
