"use client";

import { Activity } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCompact, formatSignedCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Operating result — actual vs budget, month by month and year-to-date (Build
 * Brief B6).
 *
 * The operating result (income − expenses) is the single line a CFO watches: is the
 * Council living within its means this year? The bars are the RESULT EACH MONTH (a
 * surplus above the line, a deficit below); the gold marker is the straight-lined
 * budget pace for the same point. Early-year deficits are normal — rates are levied
 * once, late — so the chart states that rather than flagging it.
 */
interface Period {
  idx: number;
  month: string;
  netResult: number; // cumulative YTD
}

export function OperatingResultTrend({
  periods,
  annualBudgetNet,
  monthsInYear = 12,
}: {
  periods: Period[];
  /** Full-year budgeted operating result (revenue budget − expense budget). */
  annualBudgetNet?: number;
  monthsInYear?: number;
}) {
  // Per-month movement from the cumulative YTD series.
  const pts = periods.map((p, i) => ({
    month: p.month,
    idx: p.idx,
    ytd: p.netResult,
    movement: i === 0 ? p.netResult : p.netResult - periods[i - 1].netResult,
    // Straight-lined budget: this month's slice of the annual budgeted result.
    budgetMovement: annualBudgetNet != null ? annualBudgetNet / monthsInYear : null,
  }));

  const last = pts[pts.length - 1];
  const budgetYtd = annualBudgetNet != null && last ? (annualBudgetNet * last.idx) / monthsInYear : null;

  const peak = Math.max(
    ...pts.flatMap((p) => [Math.abs(p.movement), Math.abs(p.budgetMovement ?? 0)]),
    1,
  );
  const half = 60; // px above / below the zero line

  return (
    <Panel>
      <PanelHeader
        title="Operating result"
        subtitle="Surplus / deficit each month · vs budget"
        right={<Activity className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Result year-to-date {last ? `· ${last.month}` : ""}
          </div>
          <div
            className={cn(
              "font-heading text-[22px] font-semibold tabular-nums",
              (last?.ytd ?? 0) >= 0 ? "text-green" : "text-red",
            )}
          >
            {last ? formatSignedCompact(last.ytd) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Budget pace
          </div>
          <div className="font-heading text-[16px] font-semibold tabular-nums text-muted-foreground">
            {budgetYtd != null ? formatSignedCompact(budgetYtd) : "—"}
          </div>
        </div>
      </div>

      {/* Bars around a centre zero line. */}
      <div className="relative" style={{ height: `${half * 2 + 4}px` }}>
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div className="relative flex h-full items-center gap-2">
          {pts.map((p) => {
            const h = Math.round((Math.abs(p.movement) / peak) * half);
            const up = p.movement >= 0;
            const bH = p.budgetMovement != null ? Math.round((Math.abs(p.budgetMovement) / peak) * half) : 0;
            const bUp = (p.budgetMovement ?? 0) >= 0;
            return (
              <div key={p.month} className="relative flex min-w-0 flex-1 flex-col items-center justify-center self-stretch">
                {/* Actual movement bar */}
                <div
                  title={`${p.month} · ${formatSignedCompact(p.movement)}`}
                  className={cn(
                    "absolute w-full max-w-[42px] rounded-sm",
                    up ? "bottom-1/2 bg-green/80" : "top-1/2 bg-red/80",
                  )}
                  style={{ height: `${Math.max(h, 2)}px` }}
                />
                {/* Budget pace marker (thin gold line) */}
                {p.budgetMovement != null && (
                  <div
                    title={`${p.month} · budget ${formatSignedCompact(p.budgetMovement)}`}
                    className="absolute left-1/2 w-[60%] -translate-x-1/2 border-t-2 border-gold/70"
                    style={bUp ? { bottom: `calc(50% + ${bH}px)` } : { top: `calc(50% + ${bH}px)` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-2">
        {pts.map((p) => (
          <span
            key={p.month}
            className="min-w-0 flex-1 truncate text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
          >
            {p.month}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-green/80" /> Surplus</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red/80" /> Deficit</span>
        {annualBudgetNet != null && (
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-gold/70" /> Budget pace</span>
        )}
      </div>
    </Panel>
  );
}
