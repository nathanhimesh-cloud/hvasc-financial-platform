import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A compact "vs last year" indicator — one consistent way to show a year-on-year
 * change wherever a figure has a prior-year counterpart.
 *
 * Deliberately plain (no hooks, safe in server or client components). Three habits
 * are baked in:
 *   - When there is NO prior figure yet (`then` null/undefined), it still renders —
 *     a quiet "vs last year · —". The row is always present, so the moment the
 *     archive holds last year it fills in on its own. Absence is shown, not hidden.
 *   - A percentage off a near-zero base is noise, so we show "—" not "+4000%".
 *   - "Good" is caller-declared: more income is good (`good="up"`), more expense is
 *     not (`good="down"`), and some figures are neither (`good="neutral"`).
 */
export function yoyPct(now: number, then: number): number | null {
  return Math.abs(then) > 1 ? ((now - then) / Math.abs(then)) * 100 : null;
}

export function YoY({
  now,
  then,
  good = "neutral",
  prefix = "vs",
  suffix = "last year",
  className,
}: {
  now: number;
  then?: number | null;
  good?: "up" | "down" | "neutral";
  /** Leading word before the prior figure, e.g. "vs". */
  prefix?: string;
  /** Trailing context, e.g. "FY2025-26". */
  suffix?: string;
  className?: string;
}) {
  const has = then != null && Number.isFinite(then);

  // No prior figure yet — show the placeholder so the reader knows it's coming.
  if (!has) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground/70", className)}
        title="No prior-year figure in the archive yet — this fills in automatically once last year's data is stored."
      >
        {prefix} {suffix} · —
      </span>
    );
  }

  const pct = yoyPct(now, then!);
  const up = now >= then!;
  const tone =
    good === "neutral" || pct === null
      ? "text-muted-foreground"
      : (good === "up" ? up : !up)
        ? "text-green"
        : "text-red";
  const Icon = pct === null ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[10px] tabular-nums", className)}>
      <span className="text-muted-foreground">
        {prefix} {formatCompact(then!)}
        {suffix ? ` ${suffix}` : ""}
      </span>
      <Icon className={cn("h-3 w-3 flex-shrink-0", tone)} strokeWidth={2.25} />
      <span className={tone}>{pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}</span>
    </span>
  );
}
