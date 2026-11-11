"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type Mood = "idle" | "thinking" | "smug" | "defensive";

/** The mascot SVGs are drawn on a 24×24 pixel grid. Render at multiples of this. */
export const MASCOT_GRID = 24;

const LABELS: Record<Mood, string> = {
  idle: "The hat, observing",
  thinking: "The hat, thinking",
  smug: "The hat, smug",
  defensive: "The hat, defensive",
};

/**
 * Loads /mascot/hat-<mood>.svg from public/; falls back to a cap emoji if the
 * file is missing. `scale` is the integer pixel multiple of the 24px grid.
 */
export default function Mascot({
  mood,
  scale = 4,
  className,
}: {
  mood: Mood;
  scale?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState<Partial<Record<Mood, boolean>>>({});
  const size = MASCOT_GRID * scale;

  if (broken[mood]) {
    return (
      <span
        role="img"
        aria-label={LABELS[mood]}
        style={{ fontSize: size * 0.7, width: size, height: size }}
        className={cn(
          "inline-flex items-center justify-center",
          mood === "thinking" && "pulse-soft",
          className,
        )}
      >
        🧢
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static pixel SVG, no optimisation wanted
    <img
      key={mood}
      src={`/mascot/hat-${mood}.svg`}
      alt={LABELS[mood]}
      width={size}
      height={size}
      draggable={false}
      onError={() => setBroken((b) => ({ ...b, [mood]: true }))}
      style={{
        imageRendering: "pixelated",
        // 1-grid-pixel light outline so the dark ink silhouette holds on the dark canvas.
        filter: [
          [scale, 0],
          [-scale, 0],
          [0, scale],
          [0, -scale],
        ]
          .map(([x, y]) => `drop-shadow(${x}px ${y}px 0 var(--denim-300))`)
          .join(" "),
      }}
      className={cn("select-none", mood === "thinking" && "pulse-soft", className)}
    />
  );
}
