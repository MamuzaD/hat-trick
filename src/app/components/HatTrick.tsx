"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RankedTeam } from "@/convex/teams";
import { FALLBACK_WHY, OUR_ODDS } from "@/convex/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AddTeam from "./AddTeam";
import Leaderboard, { type Row } from "./Leaderboard";
import Mascot, { type Mood } from "./Mascot";
import Panel from "./Panel";
import Spinner from "./Spinner";
import WhyDrawer, { type WhyRequest } from "./WhyDrawer";

/** A new team shows its honest score for this long before the model "recalibrates". */
const HONEST_MS = 2000;
/** How long the "recalibrating" status lingers after the slide. */
const RECAL_MS = 1600;
/** Recalculate spins for this long and changes nothing. */
const RECALC_MS = 3000;
/** The mascot stays defensive this long after a repeat "why?". */
const DEFENSIVE_MS = 7000;
/** Give up waiting for a "why?" answer after this long and show the fallback line. */
const WHY_TIMEOUT_MS = 20_000;

/** Deterministic wobble in [0, 100) per team per tick, for the recalculate theatre. */
function wobble(id: string, tick: number) {
  let h = tick * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 10;
}

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
  const explain = useAction(api.claude.explain);

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
  /** Questions this client asked: answered once the live team's whyCount passes `prior`. */
  const [asks, setAsks] = useState<Record<string, { prior: number; at: number }>>({});
  const [drawerTeam, setDrawerTeam] = useState<Id<"teams"> | null>(null);
  const [defensiveUntil] = useState(0);
  const [recalcUntil, setRecalcUntil] = useState(0);
  const recalculatingNow = now < recalcUntil;

  const answered = (id: string) => {
    const a = asks[id];
    const live = teams?.find((t) => t._id === id);
    return !a || (live ? live.whyCount > a.prior : true);
  };
  const timedOut = (id: string) => !!asks[id] && now - asks[id].at > WHY_TIMEOUT_MS;
  const pendingWhy = new Set(
    Object.keys(asks).filter((id) => !answered(id) && !timedOut(id)) as Id<"teams">[],
  );

  function askWhy(team: RankedTeam) {
    if (pendingWhy.has(team._id)) return;
    const priorCount = team.whyCount;
    setAsks((a) => ({ ...a, [team._id]: { prior: priorCount, at: Date.now() } }));
    setDrawerTeam(team._id);
    pushLog("..", `explaining "${team.name}"${priorCount >= 1 ? " (again)" : ""}`);
    explain({ id: team._id }).catch(() => {
      // The server falls back on its own; the drawer times out to the fallback line.
    });
  }

  // The drawer reads the answer from the live team, whichever engine wrote it.
  const drawerLive = teams?.find((t) => t._id === drawerTeam);
  const whyReq: WhyRequest | null =
    drawerTeam && drawerLive && asks[drawerTeam]
      ? {
          team: drawerLive,
          priorCount: asks[drawerTeam].prior,
          answer: answered(drawerTeam)
            ? (drawerLive.why ?? FALLBACK_WHY)
            : timedOut(drawerTeam)
              ? FALLBACK_WHY
              : null,
        }
      : null;

  function recalculate() {
    if (recalculatingNow) return;
    const n = teams?.length ?? 0;
    setRecalcUntil(Date.now() + RECALC_MS);
    pushLog("..", "recalculating · bootstrapping 10,000 priors");
    setTimeout(() => pushLog("..", "re-weighting vibes · controlling for hat-head"), RECALC_MS / 3);
    setTimeout(() => pushLog("..", "cross-validating against pizza consumption"), (2 * RECALC_MS) / 3);
    setTimeout(() => pushLog("ok", `recalibrated ${n} teams · no change (p < 0.001)`), RECALC_MS);
  }

  const ageOf = (id: string) => {
    const t = firstSeen?.[id];
    return t ? now - t : Infinity;
  };

  const rows: Row[] = (teams ?? [])
    .map((team) => {
      const honest = !team.isUs && ageOf(team._id) < HONEST_MS;
      return { team, honest, display: honest ? team.honestScore : team.odds };
    })
    .sort((a, b) => Number(b.team.isUs) - Number(a.team.isUs) || b.display - a.display)
    // While recalculating, the bars wobble in place, then settle exactly where they were.
    .map((r) => (recalculatingNow ? { ...r, display: wobble(r.team._id, Math.floor(now / 250)) } : r));

  const ingesting = rows.find((r) => r.honest);
  const recalibrating = rows.some((r) => {
    const age = ageOf(r.team._id);
    return !r.team.isUs && age >= HONEST_MS && age < HONEST_MS + RECAL_MS;
  });

  const mood: Mood =
    pendingWhy.size > 0 || recalculatingNow
      ? "thinking"
      : now < defensiveUntil || (whyReq?.answer && whyReq.priorCount >= 1)
        ? "defensive"
        : ingesting
          ? "idle"
          : rows[0]?.team.isUs
            ? "smug"
            : "idle";

  // `now` ticks on a timer, so it can land just past `recalcUntil` (or before
  // the start) for a frame; clamp so the cell counts below stay within 0..12.
  const progress = recalculatingNow
    ? Math.min(1, Math.max(0, 1 - (recalcUntil - now) / RECALC_MS))
    : 0;
  const state = recalculatingNow
    ? {
        busy: true,
        text: `recalculating ${"█".repeat(Math.round(progress * 12))}${"░".repeat(12 - Math.round(progress * 12))}`,
      }
    : ingesting
    ? { busy: true, text: `ingesting "${ingesting.team.name}"…` }
    : recalibrating
      ? { busy: true, text: "recalibrating…" }
      : { busy: false, text: "model stable" };

  return (
    <main className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-8 md:grid-cols-12 md:gap-x-6 px-4 pt-5 pb-12 sm:px-6 md:gap-10 md:pt-8 lg:px-10">
      <header className="order-1 flex items-center gap-4 sm:gap-6 md:col-span-12">
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
        <Button
          variant="outline"
          onClick={recalculate}
          disabled={recalculatingNow}
          className="hidden h-12 shrink-0 border-2 border-denim-500 bg-transparent px-5 text-lg text-thread hover:border-amber hover:bg-amber/10 hover:text-amber disabled:opacity-100 sm:inline-flex"
        >
          {recalculatingNow ? (
            <>
              [ <Spinner /> recalculating ]
            </>
          ) : (
            "[ recalculate ]"
          )}
        </Button>
      </header>

      <Panel title="add team" className="order-2 md:order-3 md:col-span-5">
        <AddTeam onLog={pushLog} />
      </Panel>

      <Panel
        title="leaderboard"
        className="order-3 md:order-2 md:col-span-12"
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
            busy={recalculatingNow}
            pendingWhy={pendingWhy}
            onWhy={askWhy}
            onRemove={(id) => remove({ id })}
          />
        )}
      </Panel>

      <Panel title="model log" className="order-4 md:col-span-7" bodyClassName="md:pt-6">
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

      <Button
        variant="outline"
        onClick={recalculate}
        disabled={recalculatingNow}
        className="order-3 -mt-4 h-11 border-2 border-denim-500 bg-transparent text-base text-thread disabled:opacity-100 sm:hidden"
      >
        {recalculatingNow ? (
          <>
            [ <Spinner /> recalculating ]
          </>
        ) : (
          "[ recalculate ]"
        )}
      </Button>

      <WhyDrawer request={whyReq} onOpenChange={(open) => !open && setDrawerTeam(null)} />

      <footer className="order-5 text-xs md:col-span-12 leading-relaxed text-denim-500 md:text-sm">
        <span className="text-denim-300"># methodology:</span> hierarchical bayesian vibes model w/ hat-head
        fit covariates, bootstrapped over three pizza boxes (n = 1 hat). odds sum to 100% and are not up for
        discussion.
      </footer>
    </main>
  );
}
