"use client";

import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A bar chart that survives real council data.
 *
 * The version this replaces did `Math.max(...amounts, 1)` to find the scale.
 * In July, the Council's only month of expenditure is **negative** (−$47,903 —
 * June's accruals reversing), so the maximum came out as `1`, every bar was
 * clamped to a 2% minimum height, and the chart rendered as an empty box. It
 * looked like missing data. It was one month of real data and a broken scale.
 *
 * So: scale on the largest ABSOLUTE value, and draw negative bars DOWNWARD from
 * a zero baseline, which is what a negative number means and what an accountant
 * expects to see.
 */

export interface TrendPoint {
  label: string;
  amount: number;
}

export function TrendBars({
  data,
  highlight,
  height = 150,
  /** Show every Nth label. Daily series get crowded; monthly ones don't. */
  labelEvery = 1,
}: {
  data: TrendPoint[];
  highlight?: string;
  height?: number;
  labelEvery?: number;
}) {
  if (!data.length) return null;

  const peak = Math.max(...data.map((d) => Math.abs(d.amount)), 1);
  const hasNegative = data.some((d) => d.amount < 0);

  // With negatives in play the axis sits in the middle; without, at the bottom.
  const zeroLine = hasNegative ? 50 : 100;

  return (
    <div className="w-full">
      <div className="relative w-full" style={{ height }}>
        {/* The zero axis. Only worth drawing when something crosses it. */}
        {hasNegative && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-border"
            style={{ top: `${zeroLine}%` }}
          />
        )}

        <div className="flex h-full w-full items-stretch gap-[3px]">
          {data.map((d, i) => {
            const pct = (Math.abs(d.amount) / peak) * (hasNegative ? 50 : 100);
            const isHi = highlight != null && d.label === highlight;
            const negative = d.amount < 0;

            return (
              <div key={`${d.label}-${i}`} className="group relative flex-1">
                <div
                  className={cn(
                    "absolute w-full transition-colors",
                    /*
                      COLOUR MEANS SOMETHING, so it has to mean the right thing.

                      Positive bars were `bg-elevated` — near-black on a black
                      background, which is why the chart looked half-empty: the
                      spend days were invisible and only the negatives showed.

                      And negative bars were RED, which reads as an error. A
                      negative expense day is not an error. It is June's year-end
                      accruals reversing — money coming BACK. Painting that red
                      tells the CFO something went wrong when nothing did.

                      Gold = money out. Teal = money back. Neither is a verdict.
                    */
                    negative
                      ? "rounded-b bg-teal/60 group-hover:bg-teal"
                      : isHi
                        ? "rounded-t bg-gold group-hover:bg-gold-light"
                        : "rounded-t bg-gold/50 group-hover:bg-gold",
                  )}
                  style={
                    negative
                      ? { top: `${zeroLine}%`, height: `${Math.max(pct, 1)}%` }
                      : { bottom: `${100 - zeroLine}%`, height: `${Math.max(pct, 1)}%` }
                  }
                  title={`${d.label}: ${formatCompact(d.amount)}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* A bar below the axis needs explaining the first time you see one. */}
      {hasNegative && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2.5 rounded-sm bg-gold/60" />
            spend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2.5 rounded-sm bg-teal/60" />
            below the line = a credit, not a loss — usually June&apos;s accruals reversing
          </span>
        </div>
      )}

      <div className="mt-1.5 flex w-full gap-[3px]">
        {data.map((d, i) => (
          <span
            key={`${d.label}-label-${i}`}
            className={cn(
              "flex-1 truncate text-center font-mono text-[9px]",
              highlight != null && d.label === highlight ? "text-gold-light" : "text-muted-foreground",
            )}
          >
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
