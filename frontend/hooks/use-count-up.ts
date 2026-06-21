"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 (or `from`) to `value` over `durationMs` using an
 * exponential ease-out curve. Re-runs whenever `value` changes.
 *
 * Used for the KPI band on the Command Center so numbers feel alive on load
 * without being decorative. Motion conveys state, per the design law.
 */
export function useCountUp(
  value: number,
  opts: { durationMs?: number; from?: number } = {}
): number {
  const { durationMs = 900, from = 0 } = opts;
  const [display, setDisplay] = useState(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const startVal = from;
    const delta = value - startVal;

    // ease-out-quart: 1 - (1 - t)^4
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(startVal + delta * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}
