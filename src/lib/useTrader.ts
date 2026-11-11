"use client";

import { useState } from "react";
import { handleFor, isTraderId } from "@/convex/lib/trader";

const KEY = "hat-trick:trader";

function mint(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function load(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && isTraderId(saved)) return saved;
    const id = mint();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage blocked: an identity for this page load only.
    return mint();
  }
}

export type Trader = { id: string; handle: string };

/**
 * This browser's trader identity, shared by chat and bets. Client-only (the
 * app renders with ssr: false), stable for the life of the page.
 */
export function useTrader(): Trader {
  const [id] = useState(load);
  return { id, handle: handleFor(id) };
}
