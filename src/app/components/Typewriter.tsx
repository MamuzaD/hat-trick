"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Types `text` out character by character (the Claude answer isn't streamed,
 * so this is cosmetic). Key it by the text to restart. Instant when
 * `animate` is false or the user prefers reduced motion.
 */
export default function Typewriter({
  text,
  animate = true,
  cps = 55,
  className,
}: {
  text: string;
  animate?: boolean;
  /** characters per second */
  cps?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const instant = !animate || !!reduce;
  const [n, setN] = useState(instant ? text.length : 0);

  useEffect(() => {
    if (instant) return;
    const id = setInterval(() => {
      setN((c) => {
        if (c >= text.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 1000 / cps);
    return () => clearInterval(id);
  }, [instant, text, cps]);

  const shown = instant ? text : text.slice(0, n);
  const typing = !instant && n < text.length;

  return (
    <span className={className}>
      {shown}
      {typing && <span aria-hidden className="ml-px inline-block h-[1em] w-[0.6ch] translate-y-[0.15em] bg-current" />}
      {typing && <span className="sr-only">{text}</span>}
    </span>
  );
}
