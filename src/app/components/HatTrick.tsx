"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RankedTeam } from "@/convex/teams";
import { FALLBACK_WHY, OUR_ODDS } from "@/convex/config";
import { cn } from "@/lib/utils";
import ControlBar from "./ControlBar";
import Leaderboard, { type Row } from "./Leaderboard";
import Mascot, { type Mood } from "./Mascot";
import Panel from "./Panel";
import WhyDrawer, { type WhyRequest } from "./WhyDrawer";

/** A team shows its honest score for this long before the model "recalibrates". */
const HONEST_MS = 2000;
/** How long the "recalibrating" status lingers after the slide. */
const RECAL_MS = 1600;
/** Recalculate spins for this long and changes nothing. */
const RECALC_MS = 3000;
/** The mascot stays defensive this long after a repeat "why?" lands. */
const DEFENSIVE_MS = 7000;
/** Give up waiting for a "why?" answer after this long and show the fallback line. */
const WHY_TIMEOUT_MS = 20_000;
const HEARTBEAT_STALE_MS = 15_000;

/** Deterministic wobble in [0, 100) per team per tick, for the recalculate theatre. */
function wobble(id: string, tick: number) {
  let h = tick * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 10;
}

export type LogTag = "ok" | ".." | "err" | "!!" | "warn";
export type LogLine = { id: number; tag: LogTag; text: string };

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
  const push = useCallback((tag: LogTag, text: string) => {
    setLines((l) => [...l.slice(-9), { id: (l.at(-1)?.id ?? 0) + 1, tag, text }]);
  }, []);
  return [lines, push] as const;
}

const kChars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const hostOf = (url?: string) => (url ? new URL(url).hostname.replace(/^www\./, "") : "");

type Track = { status: RankedTeam["analysisStatus"]; whyCount: number; revealAt: number };

/**
 * Watches the live team list and turns changes into timing + log lines, so
 * every device (projector included) narrates the same events.
 * revealAt: when the honest score became visible (0 = before this page loaded,
 * -1 = still analysing).
 */
function useTracker(teams: RankedTeam[] | undefined, log: (tag: LogTag, text: string) => void) {
  const [track, setTrack] = useState<Record<string, Track> | null>(null);
  const [defensiveAt, setDefensiveAt] = useState(0);

  // Syncing local timing/log state with an external live query.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!teams) return;
    const initial = track === null;
    const next: Record<string, Track> = { ...track };
    let changed = initial;
    const at = Date.now();

    for (const t of teams) {
      const prev = track?.[t._id];
      const pending = t.analysisStatus === "pending";
      if (!prev) {
        next[t._id] = { status: t.analysisStatus, whyCount: t.whyCount, revealAt: pending ? -1 : initial ? 0 : at };
        changed = true;
        if (!initial && !t.isUs) {
          if (pending) log("..", `fetching ${hostOf(t.url)} for "${t.name}"`);
          else log("..", `no link · "${t.name}" scored on vibes alone (random) · ${t.honestScore}%`);
        }
        continue;
      }
      if (prev.status === "pending" && !pending) {
        next[t._id] = { ...prev, status: t.analysisStatus, revealAt: at };
        changed = true;
        const f = t.facts;
        if (t.analysisStatus === "done") {
          if (f) {
            log(
              "ok",
              `read ${kChars(f.chars)} chars · ${f.headings} headings · ${f.codeBlocks} code blocks · tests ${f.mentionsTests ? "yes" : "none"}${f.stars !== undefined ? ` · ★${f.stars}` : ""}`,
            );
          }
          log("ok", `scored "${t.name}" ${t.honestScore}/100 · engine: ${t.engine ?? "heuristics"}`);
          if (t.analysisNote) log("..", t.analysisNote);
          if (t.bribe) log("warn", "attempted bribe detected · ignored");
        } else {
          log("err", `${t.analysisNote ?? "analysis failed"}`);
        }
      }
      if (t.whyCount > (next[t._id]?.whyCount ?? 0)) {
        next[t._id] = { ...next[t._id], whyCount: t.whyCount };
        changed = true;
        if (t.whyCount >= 2) {
          setDefensiveAt(at);
          log("!!", `"${t.name}" questioned ${t.whyCount}x · model is offended · engine: ${t.whyEngine ?? "?"}`);
        } else {
          log("ok", `justified "${t.name}" · engine: ${t.whyEngine ?? "?"}`);
        }
      }
    }
    if (changed) setTrack(next);
  }, [teams, track, log]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { track, defensiveAt };
}

export default function HatTrick() {
  const teams = useQuery(api.teams.list);
  const engineStatus = useQuery(api.jobs.status);
  const seed = useMutation(api.teams.seed);
  const explain = useAction(api.claude.explain);

  useEffect(() => {
    seed().catch(() => {});
  }, [seed]);

  const now = useNow(200);
  const [log, pushLog] = useLog();
  const { track, defensiveAt } = useTracker(teams, pushLog);
  const [barHeight, setBarHeight] = useState(140);

  // ── why? ──
  /** Questions this client asked: answered once the live team's whyCount passes `prior`. */
  const [asks, setAsks] = useState<Record<string, { prior: number; at: number }>>({});
  const [drawerTeam, setDrawerTeam] = useState<Id<"teams"> | null>(null);

  const answered = (id: string) => {
    const a = asks[id];
    const live = teams?.find((t) => t._id === id);
    return !a || (live ? live.whyCount > a.prior : true);
  };
  const timedOut = (id: string) => !!asks[id] && now - asks[id].at > WHY_TIMEOUT_MS;
  const pendingWhy = new Set(Object.keys(asks).filter((id) => !answered(id) && !timedOut(id)) as Id<"teams">[]);

  function askWhy(team: RankedTeam) {
    if (pendingWhy.has(team._id)) return;
    setAsks((a) => ({ ...a, [team._id]: { prior: team.whyCount, at: Date.now() } }));
    setDrawerTeam(team._id);
    pushLog("..", `explaining "${team.name}"${team.whyCount >= 1 ? " (again)" : ""}`);
    explain({ id: team._id }).catch(() => {
      // The server falls back on its own; the drawer times out to the fallback line.
    });
  }

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

  // ── recalculate ──
  const [recalcUntil, setRecalcUntil] = useState(0);
  const recalculatingNow = now < recalcUntil;

  function recalculate() {
    if (recalculatingNow) return;
    const n = teams?.length ?? 0;
    setRecalcUntil(Date.now() + RECALC_MS);
    pushLog("..", "recalculating · bootstrapping 10,000 priors");
    setTimeout(() => pushLog("..", "re-weighting vibes · controlling for hat-head"), RECALC_MS / 3);
    setTimeout(() => pushLog("..", "cross-validating against pizza consumption"), (2 * RECALC_MS) / 3);
    setTimeout(() => pushLog("ok", `recalibrated ${n} teams · no change (p < 0.001)`), RECALC_MS);
  }

  // ── rows ──
  const revealAge = (id: string) => {
    const r = track?.[id]?.revealAt;
    if (r === undefined || r === 0) return Infinity;
    if (r < 0) return -1;
    return now - r;
  };

  const rows: Row[] = (teams ?? [])
    .map((team) => {
      const age = revealAge(team._id);
      const analysing = team.analysisStatus === "pending" || age < 0;
      const honest = !team.isUs && !analysing && age < HONEST_MS;
      return { team, honest, analysing, display: honest ? team.honestScore : analysing ? 0 : team.odds };
    })
    .sort(
      (a, b) =>
        Number(b.team.isUs) - Number(a.team.isUs) ||
        Number(a.analysing) - Number(b.analysing) ||
        b.display - a.display,
    )
    // While recalculating, the bars wobble in place, then settle exactly where they were.
    .map((r) =>
      recalculatingNow && !r.analysing ? { ...r, display: wobble(r.team._id, Math.floor(now / 250)) } : r,
    );

  const analysing = rows.find((r) => r.analysing);
  const ingesting = rows.find((r) => r.honest);
  const recalibrating = rows.some((r) => {
    const age = revealAge(r.team._id);
    return !r.team.isUs && age >= HONEST_MS && age < HONEST_MS + RECAL_MS;
  });

  const mood: Mood =
    pendingWhy.size > 0 || recalculatingNow || analysing
      ? "thinking"
      : now - defensiveAt < DEFENSIVE_MS
        ? "defensive"
        : ingesting
          ? "idle"
          : rows[0]?.team.isUs
            ? "smug"
            : "idle";

  // `now` ticks on a timer, so it can land just past `recalcUntil` (or before
  // the start) for a frame; clamp so the cell counts below stay within 0..12.
  const progress = recalculatingNow ? Math.min(1, Math.max(0, 1 - (recalcUntil - now) / RECALC_MS)) : 0;
  const filledCells = Math.round(progress * 12);
  const state = recalculatingNow
    ? { busy: true, text: `recalculating ${"█".repeat(filledCells)}${"░".repeat(12 - filledCells)}` }
    : analysing
      ? { busy: true, text: `analysing ${hostOf(analysing.team.url)}…` }
      : ingesting
        ? { busy: true, text: `honest score for "${ingesting.team.name}"…` }
        : recalibrating
          ? { busy: true, text: "recalibrating…" }
          : { busy: false, text: "model stable" };

  const workerOnline = !!engineStatus?.workerSeenAt && now - engineStatus.workerSeenAt < HEARTBEAT_STALE_MS;
  const engine = workerOnline ? "claude (laptop)" : "heuristics";

  return (
    <>
      <main
        className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-4 pt-5 sm:px-6 md:gap-10 md:pt-8 lg:px-10"
        style={{ paddingBottom: barHeight + 32 }}
      >
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
              busy={recalculatingNow}
              pendingWhy={pendingWhy}
              onWhy={askWhy}
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
                    (l.tag === "err" || l.tag === "!!") && "text-red",
                    l.tag === "warn" && "text-amber",
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
          <span className="text-denim-300"># methodology:</span> hierarchical bayesian vibes model w/ hat-head fit
          covariates, bootstrapped over three pizza boxes (n = 1 hat). project links are read for real; the verdict is
          not. odds sum to 100% and are not up for discussion.
        </footer>
      </main>

      <ControlBar
        onLog={pushLog}
        onRecalculate={recalculate}
        recalculating={recalculatingNow}
        status={{ teams: teams?.length ?? null, engine, state: state.text, busy: state.busy }}
        hidden={!!whyReq}
        onHeight={setBarHeight}
      />

      <WhyDrawer request={whyReq} onOpenChange={(open) => !open && setDrawerTeam(null)} />
    </>
  );
}
