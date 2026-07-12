"use client";

import { TrendingUp } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCompact, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Revenue: actual against budget (Build Brief B6).
 *
 * The spend trend shows what went OUT. This shows what came IN, against what was
 * meant to — the other half of the question, and the half that decides whether the
 * year works.
 *
 * BOTH LINES ARE CUMULATIVE, on purpose. Council revenue is lumpy: a single grant
 * instalment can make one month look like a triumph and the next like a collapse.
 * Month-on-month, that noise buries the signal. Cumulatively, the only thing that
 * matters is visible — is the gap between the two lines opening or closing.
 */
export function RevenueVsBudget({
  points,
  annualBudget,
}: {
  points: { month: string; actual: number; budget: number }[];
  annualBudget: number;
}) {
  if (points.length < 2) {
    return (
      <Panel>
        <PanelHeader title="Revenue against budget" subtitle="Cumulative, across the year" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          A trend needs at least two months.{" "}
          <span className="text-foreground">
            {points.length === 1 ? "One month is" : "No months are"} posted
          </span>{" "}
          in this financial year — this chart draws itself once the second month lands. Until then,
          the year-to-date figures on the Reports page are the whole picture.
        </p>
      </Panel>
    );
  }

  /*
    SCALE ON THE LARGEST ABSOLUTE VALUE ACROSS BOTH SERIES.

    This is the bug that has bitten twice already. `Math.max(...values, 1)` looks
    defensive and is a trap: one negative month makes the maximum 1, every bar
    computes to ~0% height, and the chart renders EMPTY. It doesn't look broken —
    it looks like there's no data, which is worse.
  */
  const peak = Math.max(...points.flatMap((p) => [Math.abs(p.actual), Math.abs(p.budget)]), 1);

  const last = points[points.length - 1];
  const variance = last.actual - last.budget;
  const behind = variance < 0;
  const pct = last.budget !== 0 ? (variance / Math.abs(last.budget)) * 100 : 0;

  return (
    <Panel>
      <PanelHeader
        title="Revenue against budget"
        subtitle="Cumulative — the gap is the point"
        right={<TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {behind ? "Behind budget" : "Ahead of budget"}
          </div>
          {/*
            NOT COLOUR-CODED, and that is the decision.

            "Behind budget" against a straight-lined revenue budget is the NORMAL
            state for most of a Council's year — the rates haven't been levied yet.
            Painting it amber would flag an artefact as a finding every month until
            about March, and a warning that is always on is a warning nobody reads.
            The figure is stated; the reader is trusted to read the caveat below it.
          */}
          <div className="font-heading text-[22px] font-semibold tabular-nums text-foreground">
            {formatCurrency(Math.abs(variance))}
            <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
              {pct >= 0 ? "+" : ""}
              {pct.toFixed(1)}% at {last.month}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.06em]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-teal" /> Actual
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm border border-muted-foreground/50 bg-transparent" />{" "}
            Budget
          </span>
        </div>
      </div>

      {/*
        FIXED PIXEL HEIGHT on the track. A percentage height inside an `items-end`
        flex parent with no height of its own computes to 0px — that is the exact bug
        that made DailyBars render as an empty strip. Every bar is measured against
        `peak`, in px, so it cannot happen here.
      */}
      <div className="flex h-[140px] items-end gap-2">
        {points.map((p) => {
          const aH = Math.round((Math.abs(p.actual) / peak) * 132);
          const bH = Math.round((Math.abs(p.budget) / peak) * 132);
          return (
            <div key={p.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-[132px] w-full items-end justify-center gap-[3px]">
                {/* Budget: an outline. It's the plan, not the fact — it shouldn't
                    read as solid as the thing that actually happened. */}
                <div
                  title={`${p.month} budget: ${formatCompact(p.budget)}`}
                  className="w-1/2 rounded-t-sm border border-muted-foreground/40 bg-transparent"
                  style={{ height: `${Math.max(bH, 2)}px` }}
                />
                <div
                  title={`${p.month} actual: ${formatCompact(p.actual)}`}
                  className="w-1/2 rounded-t-sm bg-teal"
                  style={{ height: `${Math.max(aH, 2)}px` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-2">
        {points.map((p) => (
          <span
            key={p.month}
            className="min-w-0 flex-1 truncate text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
          >
            {p.month}
          </span>
        ))}
      </div>

      {/*
        THE CAVEAT IS NOT BOILERPLATE — READ src/lib/revenue-trend.ts.

        Practical straight-lines the budget: one twelfth per month. Real Council
        revenue is lumpy — rates land in a couple of hits, grant instalments arrive on
        the funder's schedule. So "behind budget" in September is usually an artefact
        of straight-lining, not a finding. Saying so is the difference between a chart
        that informs and one that starts an unnecessary meeting.
      */}
      <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Practical <span className="text-foreground">straight-lines</span> the budget —{" "}
        {formatCompact(annualBudget)} across the year, one twelfth a month. Real revenue is lumpy:
        rates land in a few hits, grants arrive on the funder&apos;s schedule. Early in the year the
        gap says more about that flat line than about the Council.
      </p>
    </Panel>
  );
}
