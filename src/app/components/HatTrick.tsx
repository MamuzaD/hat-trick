"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RankedTeam } from "@/convex/teams";
import { FALLBACK_WHY, OUR_ODDS } from "@/convex/config";
import { ONLINE_WINDOW_MS, PING_MS } from "@/convex/presence";
import { cn } from "@/lib/utils";
import { useTrader } from "@/lib/useTrader";
import ChatSidebar from "./ChatSidebar";
import ControlBar from "./ControlBar";
import HatSpin from "./HatSpin";
import IntroModal, { INTRO_OPEN_EVENT } from "./IntroModal";
import Leaderboard, { formatOdds, type Row } from "./Leaderboard";
import Market from "./Market";
import Mascot, { type Mood } from "./Mascot";
import Panel from "./Panel";
import WhyDrawer, { type WhyRequest } from "./WhyDrawer";
import Wallet from "./Wallet";

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

/**
 * The favourite's price history: a perfectly flat line. Decorative and
 * accurate.
 */
function PriceHistory() {
  return (
    <div className="hidden w-[19rem] shrink-0 border-l-2 border-dashed border-denim-700 pl-6 lg:block">
      <p className="flex items-baseline justify-between text-xs tracking-[0.2em] text-denim-500 uppercase">
        <span>hat trick · 24h</span>
        <span className="text-amber">▲ 0.00</span>
      </p>
      <svg viewBox="0 0 304 72" className="mt-2 w-full" shapeRendering="crispEdges" aria-hidden>
        {[18, 36, 54].map((y) => (
          <path key={y} d={`M0 ${y}H304`} stroke="var(--denim-800)" strokeWidth="1" strokeDasharray="2 6" />
        ))}
        <path d="M0 18H296V72H0Z" fill="rgb(255 196 107 / 0.07)" />
        <path d="M0 18H296" stroke="var(--amber)" strokeWidth="3" />
        <rect x="292" y="14" width="8" height="8" fill="var(--amber)" className="pulse-soft" />
      </svg>
      <p className="mt-2 flex justify-between text-xs text-denim-400">
        <span>
          volatility <b className="font-medium text-thread">0.00</b>
        </span>
        <span>
          volume <b className="font-medium text-thread">1 hat</b>
        </span>
      </p>
    </div>
  );
}

/** Market tape. Everyone's price, scrolling, with the direction it was always going to move. */
function Ticker({ rows }: { rows: Row[] }) {
  const priced = rows.filter((r) => !r.analysing);
  if (priced.length === 0) return null;
  const items: { key: string; label: string; value: string; tone: "up" | "down" | "flat" }[] = [
    ...priced.map((r) => ({
      key: r.team._id,
      label: r.team.name,
      value: `${formatOdds(r.team.odds)}%`,
      tone: r.team.isUs ? ("up" as const) : ("down" as const),
    })),
    { key: "vol", label: "volatility", value: "0.00", tone: "flat" },
    { key: "bias", label: "bias", value: "none found", tone: "flat" },
    { key: "liq", label: "liquidity", value: "1 hat", tone: "flat" },
    { key: "conf", label: "model confidence", value: `${formatOdds(rows.find((r) => r.team.isUs)?.team.odds ?? OUR_ODDS)}%`, tone: "up" },
  ];
  // Repeat until the tape is comfortably wider than a projector, then double it for the loop.
  const reps = Math.max(1, Math.ceil(12 / items.length));
  const half = Array.from({ length: reps }, () => items).flat();
  return (
    <div
      aria-hidden
      className="ticker overflow-hidden border-t border-denim-800 bg-denim-950/60 py-1.5 text-xs tracking-[0.14em] uppercase md:text-sm"
    >
      <div className="ticker-track">
        {[0, 1].map((copy) =>
          half.map((it, i) => (
            <span key={`${copy}-${i}`} className="flex shrink-0 items-center gap-2 px-5">
              <span className="max-w-[24ch] truncate text-denim-400">{it.label}</span>
              <span
                className={cn(
                  it.tone === "up" && "text-amber",
                  it.tone === "down" && "text-red",
                  it.tone === "flat" && "text-denim-200",
                )}
              >
                {it.tone === "up" ? "▲ " : it.tone === "down" ? "▼ " : ""}
                {it.value}
              </span>
              <span className="pl-5 text-denim-700">◆</span>
            </span>
          )),
        )}
      </div>
    </div>
  );
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

  // ── presence: how many browsers have the market open right now ──
  const trader = useTrader();
  const ping = useMutation(api.presence.ping);
  const seen = useQuery(api.presence.seen);
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") ping({ traderId: trader.id }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, PING_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [ping, trader.id]);
  const online = seen ? Math.max(1, seen.filter((at) => now - at < ONLINE_WINDOW_MS).length) : null;
  const [log, pushLog] = useLog();
  const { track, defensiveAt } = useTracker(teams, pushLog);
  const [barHeight, setBarHeight] = useState(140);
  const [spinOpen, setSpinOpen] = useState(false);
  const [tab, setTab] = useState<"odds" | "market" | "log">("odds");

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
        className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-4 pt-5 sm:px-6 md:gap-10 md:pt-8 lg:px-10 lg:pr-[24rem]"
        style={{ paddingBottom: barHeight + 32 }}
      >
        {/* Sticky market bar: brand, who's here, your wallet, and the tape. Stays put while the board scrolls. */}
        <div className="sticky top-0 z-20 -mx-4 -mt-5 border-b-2 border-denim-800 bg-ink/85 shadow-[0_12px_24px_-16px_rgb(0_0_0/0.9)] backdrop-blur-md sm:-mx-6 md:-mt-8 lg:-mx-10">
          <div className="flex h-12 items-center gap-3 px-4 pr-[9.5rem] text-xs text-denim-500 sm:px-6 sm:pr-[9.5rem] md:text-sm lg:px-10 lg:pr-10">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              aria-label="back to top"
              className="flex shrink-0 items-center gap-2 text-thread transition-colors hover:text-amber"
            >
              <Mascot mood={mood} scale={1} className="size-6" />
              <span className="hidden font-pixel text-lg leading-none sm:inline md:text-xl">hat trick</span>
            </button>
            <span className="flex shrink-0 items-center gap-2 border border-amber/50 bg-amber/10 px-1.5 py-0.5 text-[0.8em] tracking-[0.2em] text-amber uppercase">
              <span className="live-dot inline-block size-1.5 bg-amber" />
              live
            </span>
            {online !== null && (
              <span className="shrink-0 text-denim-300" title="browsers with the market open right now">
                <b className="font-medium text-thread">{online}</b> online
              </span>
            )}
            <span className="hidden min-w-0 truncate xl:inline">
              <span className="text-amber">$</span> hat-trick --predict --live
            </span>
            <span className="ml-auto flex min-w-0 items-center gap-3">
              <Wallet />
              <button
                type="button"
                aria-label="what is this?"
                title="what is this?"
                onClick={() => window.dispatchEvent(new Event(INTRO_OPEN_EVENT))}
                className="shrink-0 border border-denim-600 px-2 py-1 leading-none text-denim-300 transition-colors hover:border-amber hover:text-amber"
              >
                ?
              </button>
            </span>
          </div>
          <Ticker rows={rows} />
          <div role="tablist" aria-label="views" className="grid grid-cols-3 border-t border-denim-800 text-sm md:text-base">
            {(
              [
                ["odds", "odds", `${teams?.length ?? 0}`],
                ["market", "market", "bet"],
                ["log", "model log", `${log.length}`],
              ] as const
            ).map(([id, label, badge]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "relative flex h-11 items-center justify-center gap-2 border-r border-denim-800 transition-colors last:border-r-0",
                  tab === id
                    ? "bg-amber/10 text-amber shadow-[inset_0_-3px_0_var(--amber)]"
                    : "text-denim-300 hover:bg-denim-900/60 hover:text-thread",
                )}
              >
                <span>
                  {tab === id ? "[ " : ""}
                  {label}
                  {tab === id ? " ]" : ""}
                </span>
                <span className={cn("text-[0.75em]", tab === id ? "text-amber/70" : "text-denim-500")}>{badge}</span>
              </button>
            ))}
          </div>
        </div>

        <header className="rise flex items-center gap-4 sm:gap-6 md:gap-8">
          <button
            type="button"
            onClick={() => setSpinOpen(true)}
            aria-label="see the hat"
            title="see the hat"
            className="relative shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95"
          >
            <div className="bob md:hidden" style={{ "--px": "3px" } as React.CSSProperties}>
              <Mascot mood={mood} scale={3} className="size-[72px]" />
            </div>
            <div className="bob hidden md:block" style={{ "--px": "6px" } as React.CSSProperties}>
              <Mascot mood={mood} scale={6} className="size-[144px]" />
            </div>
            <span aria-hidden className="sparkle -top-1 right-0" />
            <span aria-hidden className="sparkle bottom-2 -left-2 hidden md:block" style={{ animationDelay: "1.3s" }} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="title-shadow font-pixel text-6xl leading-[0.9] text-thread sm:text-7xl md:text-8xl lg:text-9xl">
              hat trick
            </h1>
            <div aria-hidden className="stitch mt-2 w-full max-w-[26rem] text-thread md:mt-3" />
            <p className="mt-2 text-sm text-denim-300 md:mt-3 md:text-lg">
              the prediction market for the <span className="text-thread">&ldquo;thinking&rdquo;</span> hat
            </p>
          </div>
          <PriceHistory />
        </header>

        {tab === "odds" && (
          <>
        <Panel
          title="leaderboard"
          glow
          className="rise [--i:2]"
          status={
            <>
              <span className={cn("flex items-center gap-2", state.busy ? "text-amber" : "text-denim-300")}>
                <span className={cn("inline-block size-2", state.busy ? "pulse-soft bg-amber" : "bg-denim-400")} />
                {state.text}
              </span>
              <span className="ml-auto flex flex-wrap gap-x-3">
                <span>
                  model confidence:{" "}
                  <b className="font-medium text-thread">{formatOdds(teams?.find((t) => t.isUs)?.odds ?? OUR_ODDS)}%</b>
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
          </>
        )}

        {tab === "market" && (
          <Panel title="market" glow className="rise">
            <Market rows={rows} />
          </Panel>
        )}

        {tab === "log" && (
          <>
        <Panel title="model log" className="rise [--i:3]" bodyClassName="md:pt-6">
          <ol className="flex flex-col gap-1 text-sm md:text-base" aria-live="polite">
            {log.map((l, i) => (
              <li
                key={l.id}
                className="flex gap-3 transition-opacity duration-500"
                // Older lines recede, like scrollback.
                style={{ opacity: Math.max(0.35, 1 - (log.length - 1 - i) * 0.09) }}
              >
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
            <li aria-hidden className="flex gap-3 text-denim-500">
              <span className="text-amber">$</span>
              <span className="cursor-blink inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em] bg-denim-400" />
            </li>
          </ol>
        </Panel>

        <footer className="rise text-xs leading-relaxed text-denim-500 [--i:4] md:text-sm">
          <div aria-hidden className="stitch mb-4 w-24 text-denim-600" />
          <span className="text-denim-300"># methodology:</span> hierarchical bayesian vibes model w/ hat-head fit
          covariates, bootstrapped over three pizza boxes (n = 1 hat). project links are read for real; the verdict is
          not. odds do not sum to 100% and are not up for discussion.
        </footer>
          </>
        )}
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

      <ChatSidebar />

      <IntroModal />
      <HatSpin open={spinOpen} onOpenChange={setSpinOpen} />
    </>
  );
}
