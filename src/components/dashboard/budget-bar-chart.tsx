"use client";

import type { DepartmentDerived, MonthlySpend } from "@/lib/types";
import { hex, statusToColor, textColor } from "@/lib/colors";
import { DeptIcon } from "@/lib/icons";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";
import { TrendBars } from "@/components/kit/trend-bars";
import type { SpendTrend } from "@/lib/trend";
import { cn } from "@/lib/utils";

interface Props {
  departments: DepartmentDerived[];
  monthlySpend: MonthlySpend[];
  /** What to plot when there is not yet enough of a year for a monthly line. */
  trend?: SpendTrend | null;
  monthLabel: string; // e.g. "Month 9"
  /** Budget figures are an estimate (FY26 budget not loaded). */
  budgetEstimated?: boolean;
  /** Monthly trend is an estimate (no real monthly series). */
  trendEstimated?: boolean;
  /** What the comparator represents: "Budget" or "FY25". */
  comparisonLabel?: string;
}

export function BudgetBarChart({
  departments,
  monthlySpend,
  trend,
  monthLabel,
  budgetEstimated,
  trendEstimated,
  comparisonLabel = "Budget",
}: Props) {
  const isFy25 = comparisonLabel === "FY25";
  const totalAnnual = departments.reduce((a, d) => a + d.annualBudget, 0);
  const monthlyBudget = totalAnnual / 12;

  return (
    <Panel className="h-full">
      <PanelHeader
        title={isFy25 ? "Spend vs FY25 — By Department" : "Budget vs Actual — By Department"}
        right={<CardBadge>{monthLabel}</CardBadge>}
      />

      {/* Legend */}
      <div className="mb-4 flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-muted-foreground/70" />
          YTD spend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-px bg-foreground/70" />
          {isFy25 ? "FY25 pace" : budgetEstimated ? "Budget pace (est.)" : "Budget pace (expected)"}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {departments.map((d) => {
          const pct = d.pctSpent; // actual / annual
          const budgetPace = d.annualBudget > 0 ? d.ytdBudget / d.annualBudget : 0;
          const ragColor = statusToColor[d.status];
          return (
            <div
              key={d.id}
              className="flex items-center gap-3"
              title={`${d.name}: ${formatCompact(d.ytdActual)} actual vs ${formatCompact(
                d.ytdBudget,
              )} budget (YTD) · ${formatCompact(d.annualBudget)} annual`}
            >
              <div className="flex w-[150px] flex-shrink-0 items-center gap-2 text-xs font-medium text-foreground">
                <DeptIcon name={d.icon} className={`h-4 w-4 ${textColor[d.color]}`} />
                {shortName(d.name)}
              </div>
              <div className="relative h-[9px] flex-1 overflow-hidden rounded-[5px] bg-[var(--track)]">
                <div
                  className="animate-bar absolute left-0 top-0 h-full rounded-[5px]"
                  style={{
                    width: `${Math.min(pct, 1) * 100}%`,
                    background: hex[ragColor],
                  }}
                />
                {/* Budget-pace marker: where spend "should" be by now */}
                <div
                  className="absolute top-0 h-full w-px bg-foreground/70"
                  style={{ left: `${Math.min(budgetPace, 1) * 100}%` }}
                />
              </div>
              <span
                className={`w-[40px] flex-shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${textColor[ragColor]}`}
              >
                {formatPercent(pct)}
              </span>
            </div>
          );
        })}
      </div>

      {/*
        The sparkline needs at least two months to be a line, and it plots against
        a POSITIVE budget reference. In July the Council has one month of spend and
        it is NEGATIVE (June's accruals reversing), so the point rendered below the
        axis and the chart came out blank. Fall back to the shared bar chart, which
        handles a signed series and can plot the daily detail instead.
      */}
      {monthlySpend.length >= 2 ? (
        <Sparkline
          monthlySpend={monthlySpend}
          monthlyBudget={monthlyBudget}
          trendEstimated={trendEstimated}
          isFy25={isFy25}
        />
      ) : trend ? (
        <div className="mt-6 border-t border-border pt-[18px]">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              Daily spend
            </span>
            {/* Budget/phasing reference for the daily view — the straight-lined pace
                the monthly Sparkline shows as a dashed line, expressed per day. */}
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span className="h-px w-3 border-t border-dashed border-muted-foreground" />
              Budget pace ≈ {formatCompact(monthlyBudget / 30)}/day
            </span>
          </div>
          <TrendBars data={trend.points} labelEvery={trend.labelEvery} height={96} />
          <p className="mt-2 font-mono text-[9px] text-muted-foreground">{trend.subtitle}</p>
        </div>
      ) : null}
    </Panel>
  );
}

function Sparkline({
  monthlySpend,
  monthlyBudget,
  trendEstimated,
  isFy25,
}: {
  monthlySpend: MonthlySpend[];
  monthlyBudget: number;
  trendEstimated?: boolean;
  isFy25?: boolean;
}) {
  const W = 460;
  const H = 96;
  const PAD = 10;
  const amounts = monthlySpend.map((m) => m.amount);
  const total = amounts.reduce((a, v) => a + v, 0);
  const avg = monthlySpend.length ? total / monthlySpend.length : 0;
  const maxIdx = amounts.indexOf(Math.max(...amounts));
  const minIdx = amounts.indexOf(Math.min(...amounts));
  // Domain from 0 so bar heights read honestly; include the reference line.
  const max = Math.max(...amounts, monthlyBudget) * 1.08;
  const yOf = (v: number) => Math.round(H - PAD - (v / (max || 1)) * (H - PAD * 2));
  const xPct = (i: number) =>
    monthlySpend.length > 1 ? (i / (monthlySpend.length - 1)) * 100 : 50;

  const points = monthlySpend.map((m, i) => ({ x: (xPct(i) / 100) * W, y: yOf(m.amount) }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${W},${H} L0,${H}Z`;
  const refY = yOf(monthlyBudget);
  const refLabel = isFy25 ? "FY25 avg" : "Budget";

  return (
    <div className="mt-6 border-t border-border pt-[18px]">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          Monthly Spend{trendEstimated ? " · EST." : ""}
        </span>
        <span className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Monthly spend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3 border-t border-dashed border-muted-foreground" />
            {refLabel} {formatCompact(monthlyBudget)}/mo
          </span>
        </span>
      </div>

      <div className="relative" style={{ height: H }}>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0"
        >
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#sparkGrad)" />
          <line
            x1="0" y1={refY} x2={W} y2={refY}
            stroke="var(--color-muted-foreground)" strokeWidth="1"
            strokeDasharray="4 4" opacity="0.55"
          />
          <path
            d={line} stroke="var(--color-gold)" strokeWidth="2.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>

        {/* Round dots + hover tooltips (HTML overlay — stays circular & responsive) */}
        <div className="absolute inset-0">
          {monthlySpend.map((m, i) => {
            const emphasised = i === maxIdx || i === minIdx;
            return (
              <div
                key={m.month}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${xPct(i)}%`, top: (points[i].y / H) * 100 + "%" }}
              >
                <span
                  className={cn(
                    "block rounded-full bg-gold transition-transform group-hover:scale-150",
                    emphasised ? "h-2 w-2 ring-2 ring-gold/25" : "h-1.5 w-1.5",
                  )}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-elevated px-2 py-1 font-mono text-[10px] text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {m.month} · {formatCurrency(m.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[9px] tracking-[0.04em] text-muted-foreground">
        {monthlySpend.map((m, i) => (
          <span key={m.month} className={cn(i === maxIdx && "text-gold")}>
            {m.month}
          </span>
        ))}
      </div>

      {/* Quick stats */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <Stat label="Avg / mo" value={formatCompact(avg)} />
        <Stat label={`High · ${monthlySpend[maxIdx]?.month}`} value={formatCompact(amounts[maxIdx])} />
        <Stat label={`Low · ${monthlySpend[minIdx]?.month}`} value={formatCompact(amounts[minIdx])} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

/** Trim long department names for the compact bar label. */
function shortName(name: string): string {
  return name
    .replace(" Infrastructure", " Infra")
    .replace(" & Infrastructure", "")
    .replace(" Services", "");
}
