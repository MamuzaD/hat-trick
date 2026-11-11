"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RankedTeam } from "@/convex/teams";
import { OUR_ODDS } from "@/convex/config";
import { cn } from "@/lib/utils";
import Leaderboard, { type Row } from "./Leaderboard";
import Mascot, { type Mood } from "./Mascot";
import Panel from "./Panel";

/** A new team shows its honest score for this long before the model "recalibrates". */
const HONEST_MS = 2000;
/** How long the "recalibrating" status lingers after the slide. */
const RECAL_MS = 1600;

export type LogLine = { id: number; tag: "ok" | ".." | "err" | "!!"; text: string };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function useLog() {
  const [lines, setLines] = useState<LogLine[]>(() => [
    { id: 1, tag: "ok", text: "model loaded · priors: strong" },
    { id: 2, tag: "ok", text: "subscribed to live feed" },
  ]);
  const push = useCallback((tag: LogLine["tag"], text: string) => {
    setLines((l) => [...l.slice(-7), { id: (l.at(-1)?.id ?? 0) + 1, tag, text }]);
  }, []);
  return [lines, push] as const;
}

/**
 * When did this client first see each team? Teams present on first load get 0
 * (no honest phase). Teams that appear later, on any device, get Date.now().
 */
function useFirstSeen(teams: RankedTeam[] | undefined, onNew: (team: RankedTeam) => void) {
  const [seen, setSeen] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!teams) return;
    const initial = seen === null;
    const fresh = teams.filter((t) => !seen || !(t._id in seen));
    if (!initial && fresh.length === 0) return;
    const at = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with an external live query
    setSeen((prev) => ({
      ...prev,
      ...Object.fromEntries(fresh.map((t) => [t._id, initial ? 0 : at])),
    }));
    if (!initial) fresh.filter((t) => !t.isUs).forEach(onNew);
  }, [teams, seen, onNew]);
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
  const [log, pushLog] = useLog();

  const onNewTeam = useCallback(
    (t: RankedTeam) => {
      pushLog("..", `ingesting "${t.name}" · preliminary estimate ${t.honestScore}%`);
      setTimeout(() => pushLog("ok", `recalibrated · optimism bias corrected for "${t.name}"`), HONEST_MS);
    },
    [pushLog],
  );
  const firstSeen = useFirstSeen(teams, onNewTeam);
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

  const state = ingesting
    ? { busy: true, text: `ingesting "${ingesting.team.name}"…` }
    : recalibrating
      ? { busy: true, text: "recalibrating…" }
      : { busy: false, text: "model stable" };

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-4 pt-5 pb-12 sm:px-6 md:gap-10 md:pt-8 lg:px-10">
      <header className="flex items-center gap-4 sm:gap-6">
        <Mascot mood={mood} scale={3} className="size-[72px] shrink-0 md:hidden" />
        <Mascot mood={mood} scale={6} className="hidden size-[144px] shrink-0 md:block" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-denim-500 md:text-base">
            <span className="text-amber">$</span> hat-trick --predict --live
          </p>
          <h1 className="font-pixel text-5xl leading-none text-thread sm:text-6xl md:text-7xl lg:text-8xl">
            hat trick
          </h1>
          <p className="mt-1 text-sm text-denim-300 md:mt-2 md:text-lg">
            live odds of winning the <span className="text-thread">&ldquo;thinking&rdquo;</span> hat
          </p>
        </div>
      </header>

      <Panel
        title="leaderboard"
        glow
        status={
          <>
            <span className={cn("flex items-center gap-2", state.busy ? "text-amber" : "text-denim-300")}>
              <span className={cn("inline-block size-2", state.busy ? "pulse-soft bg-amber" : "bg-denim-400")} />
              {state.text}
            </span>
            <span className="ml-auto flex flex-wrap gap-x-3">
              <span>
                model confidence: <b className="font-medium text-thread">{OUR_ODDS}%</b>
              </span>
              <span className="text-denim-600">│</span>
              <span>
                teams: <b className="font-medium text-thread">{teams?.length ?? "–"}</b>
              </span>
              <span className="text-denim-600">│</span>
              <span>
                bias: <b className="font-medium text-thread">none found</b>
              </span>
            </span>
          </>
        }
      >
        {teams === undefined ? (
          <p className="pulse-soft py-8 text-denim-400">[..] loading priors</p>
        ) : (
          <Leaderboard
            rows={rows}
            admin={admin}
            busy={false}
            pendingWhy={pendingWhy}
            onRemove={(id) => remove({ id })}
          />
        )}
      </Panel>

      <Panel title="model log" bodyClassName="md:pt-6">
        <ol className="flex flex-col gap-1 text-sm md:text-base" aria-live="polite">
          {log.map((l) => (
            <li key={l.id} className="flex gap-3">
              <span
                className={cn(
                  "shrink-0",
                  l.tag === "ok" && "text-denim-400",
                  l.tag === ".." && "text-amber",
                  l.tag === "err" && "text-red",
                  l.tag === "!!" && "text-red",
                )}
              >
                [{l.tag}]
              </span>
              <span className="min-w-0 text-denim-200">{l.text}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <footer className="text-xs leading-relaxed text-denim-500 md:text-sm">
        <span className="text-denim-300"># methodology:</span> hierarchical bayesian vibes model w/ hat-head
        fit covariates, bootstrapped over three pizza boxes (n = 1 hat). odds sum to 100% and are not up for
        discussion.
      </footer>
    </main>
  );
}
