"use client";

import { useState } from "react";

export type Mood = "idle" | "thinking" | "smug" | "defensive";

const LABELS: Record<Mood, string> = {
  idle: "The hat, observing",
  thinking: "The hat, thinking",
  smug: "The hat, smug",
  defensive: "The hat, defensive",
};

/** Loads /mascot/hat-<mood>.svg from public/; falls back to a cap emoji if missing. */
export default function Mascot({ mood, size = 120 }: { mood: Mood; size?: number }) {
  const [broken, setBroken] = useState<Partial<Record<Mood, boolean>>>({});

  if (broken[mood]) {
    return (
      <span
        role="img"
        aria-label={LABELS[mood]}
        style={{ fontSize: size * 0.7, width: size, height: size }}
        className={`inline-flex items-center justify-center ${mood === "thinking" ? "shimmer" : ""}`}
      >
        🧢
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG swap, no optimisation needed
    <img
      key={mood}
      src={`/mascot/hat-${mood}.svg`}
      alt={LABELS[mood]}
      width={size}
      height={size}
      onError={() => setBroken((b) => ({ ...b, [mood]: true }))}
      className={`select-none drop-shadow-[0_8px_18px_rgb(0_0_0/0.35)] ${mood === "thinking" ? "shimmer" : ""}`}
      draggable={false}
    />
  );
}
