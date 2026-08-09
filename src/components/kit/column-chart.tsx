"use client";

import { hex } from "@/lib/colors";
import { formatCompact, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A Power BI-style column chart (Aug 2026 review: "I want charts like these").
 *
 * What makes a chart read as "Power BI" rather than a decorated div: a real
 * y-axis with nice-number tick labels, faint horizontal gridlines, solid
 * full-strength columns, an explicit dashed reference line with a legend, and
 * value labels when there's room. This component does exactly that, on the
 * theme's data-viz palette, and survives real council data — a negative day
 * (June's accruals reversing) draws downward from a zero line in teal, because
 * money coming back is not an error.
 *
 * Rendering: shapes live in a stretched SVG (crisp at any width via
 * non-scaling strokes); ALL text is HTML positioned by percentage, so labels
 * never distort.
 */

export interface ColumnPoint {
  label: string;
  value: number;
}

/** Round a raw step up to a 1 / 2 / 2.5 / 5 × 10ⁿ "nice" number. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / mag;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * mag;
}

export function ColumnChart({
  data,
  refValue,
  refLabel,
  barLabel,
  height = 170,
  labelEvery = 1,
  showValues = "auto",
}: {
  data: ColumnPoint[];
  /** Dashed horizontal reference (e.g. budget pace). */
  refValue?: number;
  refLabel?: string;
  /** Legend label for the columns. */
  barLabel: string;
  height?: number;
  /** Show every Nth x label — daily series get crowded. */
  labelEvery?: number;
  /** Value labels above bars. "auto" = only when there's room. */
  showValues?: boolean | "auto";
}) {
  if (!data.length) return null;

  const values = data.map((d) => d.value);
  const hasNegative = values.some((v) => v < 0);
  const rawMax = Math.max(...values, refValue ?? 0, 0);
  const rawMin = Math.min(...values, 0);

  // Nice tick domain: 3 steps above zero, and below when negatives exist.
  const step = niceStep(Math.max(rawMax, Math.abs(rawMin), 1) / 3);
  const top = Math.max(step * Math.ceil(rawMax / step), step);
  const bottom = hasNegative ? -step * Math.ceil(Math.abs(rawMin) / step) : 0;
  const span = top - bottom;

  const ticks: number[] = [];
  for (let t = bottom; t <= top + step / 2; t += step) ticks.push(t);

  /** Value → % from the TOP of the plot. */
  const yPct = (v: number) => ((top - v) / span) * 100;

  const W = 100; // percentage space
  const n = data.length;
  const band = W / n;
  const barW = Math.min(band * 0.62, 9); // cap so few columns don't become slabs
  const xPct = (i: number) => band * i + band / 2;

  const labelsOn = showValues === true || (showValues === "auto" && n <= 13);

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2.5 rounded-[2px]" style={{ background: hex.gold }} />
          {barLabel}
        </span>
        {hasNegative && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2.5 rounded-[2px]" style={{ background: hex.teal }} />
            credit / reversal
          </span>
        )}
        {refValue !== undefined && refLabel && (
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3.5 border-t-2 border-dashed border-muted-foreground" />
            {refLabel}
          </span>
        )}
      </div>

      <div className="flex">
        {/* Y axis tick labels (HTML, never distorted). */}
        <div className="relative w-11 flex-shrink-0" style={{ height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-1.5 -translate-y-1/2 font-mono text-[9px] tabular-nums text-muted-foreground"
              style={{ top: `${yPct(t)}%` }}
            >
              {formatCompact(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative flex-1" style={{ height }}>
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${W} ${height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 overflow-visible"
          >
            {/* Gridlines; the zero line is the strong one. */}
            {ticks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={W}
                y1={(yPct(t) / 100) * height}
                y2={(yPct(t) / 100) * height}
                stroke={t === 0 ? "var(--hairline)" : "var(--hairline-soft)"}
                strokeWidth={t === 0 ? 1.25 : 1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Columns. */}
            {data.map((d, i) => {
              const zero = (yPct(0) / 100) * height;
              const y = (yPct(d.value) / 100) * height;
              const negative = d.value < 0;
              const h = Math.max(Math.abs(zero - y), 1);
              return (
                <rect
                  key={`${d.label}-${i}`}
                  x={xPct(i) - barW / 2}
                  y={negative ? zero : y}
                  width={barW}
                  height={h}
                  rx={1}
                  fill={negative ? hex.teal : hex.gold}
                >
                  <title>{`${d.label}: ${formatCurrency(d.value)}`}</title>
                </rect>
              );
            })}

            {/* Reference line above the columns. */}
            {refValue !== undefined && (
              <line
                x1={0}
                x2={W}
                y1={(yPct(refValue) / 100) * height}
                y2={(yPct(refValue) / 100) * height}
                stroke="var(--color-muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.8}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Value labels (HTML). */}
          {labelsOn &&
            data.map((d, i) => (
              <span
                key={`v-${d.label}-${i}`}
                className="pointer-events-none absolute -translate-x-1/2 font-mono text-[9px] font-medium tabular-nums text-muted-foreground"
                style={{
                  left: `${xPct(i)}%`,
                  top: `calc(${yPct(Math.max(d.value, 0))}% - 13px)`,
                }}
              >
                {formatCompact(d.value)}
              </span>
            ))}
        </div>
      </div>

      {/* X labels. */}
      <div className="ml-11 mt-1.5 flex" aria-hidden>
        {data.map((d, i) => (
          <span
            key={`x-${d.label}-${i}`}
            className={cn("flex-1 truncate text-center font-mono text-[9px] text-muted-foreground")}
          >
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
