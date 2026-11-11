"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

/** Braille spinner. Static under prefers-reduced-motion. */
export default function Spinner() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 80);
    return () => clearInterval(id);
  }, [reduce]);
  return (
    <span aria-hidden className="inline-block w-[1ch] text-center">
      {reduce ? "…" : FRAMES[i]}
    </span>
  );
}
