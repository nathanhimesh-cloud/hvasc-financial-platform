"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatCompact,
  formatCurrency,
  formatPercent,
  formatSignedCompact,
} from "@/lib/format";

type Fmt = "compact" | "currency" | "percent" | "signed" | "plain" | "decimal";

function render(n: number, f: Fmt): string {
  switch (f) {
    case "compact":
      return formatCompact(n);
    case "currency":
      return formatCurrency(n);
    case "percent":
      return formatPercent(n);
    case "signed":
      return formatSignedCompact(n);
    // Rounding a threshold measure (e.g. 2.6 months of cover against a 3-month
    // minimum) would print "3" beside a breach warning. Keep one decimal.
    case "decimal":
      return n.toFixed(1);
    default:
      return Math.round(n).toLocaleString();
  }
}

/**
 * Counts a number up from 0 to `value` on mount with an ease-out curve, then
 * formats it. Respects prefers-reduced-motion (shows the final value at once).
 */
export function CountUp({
  value,
  format = "plain",
  duration = 900,
}: {
  value: number;
  format?: Fmt;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      raf.current = requestAnimationFrame(() => setN(value));
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
      };
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <>{render(n, format)}</>;
}
