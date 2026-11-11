"use client";

import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useTrader } from "@/lib/useTrader";
import { cn } from "@/lib/utils";

type Tick = { value: number; dir: "up" | "down" };

const COUNT_MS = 600;
const FLASH_MS = 1100;

/** Counts from the old balance to the new one and reports which way it went. */
function useTick(target: number | undefined): Tick | null {
  const [tick, setTick] = useState<Tick | null>(null);
  const last = useRef(target);

  useEffect(() => {
    const from = last.current;
    last.current = target;
    if (target === undefined || from === undefined || from === target) return;

    const dir = target > from ? "up" : "down";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const p = still ? 1 : Math.min(1, (now - t0) / COUNT_MS);
      setTick({ value: Math.round(from + (target - from) * p), dir });
      if (p < 1) raf = requestAnimationFrame(step);
    });
    const done = setTimeout(() => setTick(null), FLASH_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [target]);

  return tick;
}

/** Small always-visible balance chip. */
export default function Wallet() {
  const trader = useTrader();
  const wallet = useQuery(api.bets.wallet, { traderId: trader.id });
  const tick = useTick(wallet?.coins);
  const coins = tick?.value ?? wallet?.coins;

  return (
    <span
      title={`${trader.handle} · ${coins ?? "–"} hat coins`}
      className={cn(
        "flex shrink-0 items-center gap-1.5 border border-denim-600 bg-denim-950/70 px-1.5 py-0.5 text-[0.7em] tracking-[0.1em] text-denim-400 transition-colors",
        tick?.dir === "up" && "wallet-flash border-amber text-amber",
        tick?.dir === "down" && "wallet-flash border-red text-red",
      )}
    >
      <span className="hidden sm:inline">{trader.handle}</span>
      <span aria-hidden className="hidden text-denim-600 sm:inline">
        ·
      </span>
      <span aria-hidden className="hat-coin" />
      <b
        className={cn(
          "font-medium",
          tick?.dir === "up" ? "text-amber" : tick?.dir === "down" ? "text-red" : "text-thread",
        )}
      >
        {coins ?? "–"}
      </b>
      {tick && <span aria-hidden>{tick.dir === "up" ? "▲" : "▼"}</span>}
      <span className="sm:hidden">hc</span>
      <span className="hidden sm:inline">hat coins</span>
    </span>
  );
}
