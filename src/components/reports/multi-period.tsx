"use client";

import { Columns3 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCompact } from "@/lib/format";
import type { ReportPeriod } from "./reports-view";
import { cn } from "@/lib/utils";

/**
 * Months side by side (Build Brief B1: "multi-period columns").
 *
 * The three statements answer "where are we now". This answers "how did we get here"
 * — the shape of the year, which no single-period view can show. A budget overspend
 * that arrived in one bad month is a different problem from one that crept up over
 * six, and until now you could not tell those apart.
 *
 * Each column is the MOVEMENT in that month, not the cumulative total: the snapshot
 * stores year-to-date checkpoints, so each month is that checkpoint minus the one
 * before it. Showing cumulative columns side by side would just draw a staircase and
 * tell you nothing.
 */
export function MultiPeriod({ periods }: { periods: ReportPeriod[] }) {
  // Fewer than two checkpoints means there is nothing to compare. Say so plainly —
  // an empty grid with headers looks like a bug, and we've shipped that mistake once.
  if (periods.length < 2) {
    return (
      <Panel>
        <PanelHeader title="Month by month" subtitle="Each month's movement, side by side" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Only <span className="text-foreground">{periods.length || "no"}</span>{" "}
          {periods.length === 1 ? "month is" : "months are"} posted in this financial year, so there is
          nothing yet to compare. This table fills out as the year runs — one column per month.
        </p>
      </Panel>
    );
  }

  const sorted = [...periods].sort((a, b) => a.idx - b.idx);

  // Each column = this checkpoint − the previous one. The first month IS its own
  // movement, because the year started at zero.
  const cols = sorted.map((p, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    return {
      idx: p.idx,
      month: p.month,
      income: p.totalIncome - (prev?.totalIncome ?? 0),
      expenses: p.totalExpenses - (prev?.totalExpenses ?? 0),
      net: p.netResult - (prev?.netResult ?? 0),
    };
  });

  const rows = [
    { label: "Income", pick: (c: (typeof cols)[number]) => c.income },
    { label: "Expenses", pick: (c: (typeof cols)[number]) => c.expenses },
    { label: "Net result", pick: (c: (typeof cols)[number]) => c.net, strong: true },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Month by month"
        subtitle="Each month's movement — not the running total"
        right={<Columns3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
      />

      {/* Wide tables scroll INSIDE their own container. The page body must never
          scroll sideways — twelve columns on a laptop otherwise breaks the layout. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="sticky left-0 bg-card pb-2 pr-4 text-left font-normal">&nbsp;</th>
              {cols.map((c) => (
                <th key={c.idx} className="pb-2 pl-4 text-right font-normal">
                  {c.month}
                </th>
              ))}
              <th className="pb-2 pl-4 text-right font-normal text-foreground">Year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = cols.reduce((a, c) => a + row.pick(c), 0);
              return (
                <tr
                  key={row.label}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    row.strong && "border-t border-border font-semibold",
                  )}
                >
                  <td className="sticky left-0 bg-card py-2.5 pr-4 text-left text-foreground">
                    {row.label}
                  </td>
                  {cols.map((c) => {
                    const v = row.pick(c);
                    return (
                      <td
                        key={c.idx}
                        className={cn(
                          "py-2.5 pl-4 text-right font-mono tabular-nums",
                          // Only the net line is colour-coded. A "negative" expense is
                          // an accrual reversal, not good news, and colouring it green
                          // would say the opposite of what it means.
                          row.strong
                            ? v < 0
                              ? "text-red"
                              : "text-green"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatCompact(v)}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "py-2.5 pl-4 text-right font-mono font-semibold tabular-nums",
                      row.strong ? (total < 0 ? "text-red" : "text-green") : "text-foreground",
                    )}
                  >
                    {formatCompact(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Each column is that month on its own. A negative expense is not a saving — it is last
        year&apos;s accrual reversing, which is why only the net line is colour-coded.
      </p>
    </Panel>
  );
}
