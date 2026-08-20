"use client";

import { useState } from "react";
import type { Department, RevenueLine } from "@/lib/types";
import { hex } from "@/lib/colors";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";
import { cn } from "@/lib/utils";

interface Props {
  allocation: { department: Department; share: number }[];
  totalBudget: number;
  revenueLines: RevenueLine[];
  /** Total income headline — the revenue lines are reconciled up to this. */
  totalRevenue: number;
  /** Budget figures are an estimate (FY26 budget not loaded). */
  budgetEstimated?: boolean;
  /** What the comparator represents: "Budget" or "FY25". */
  comparisonLabel?: string;
}

export function AllocationDonut({
  allocation,
  totalBudget,
  revenueLines,
  totalRevenue,
  budgetEstimated,
  comparisonLabel = "Budget",
}: Props) {
  // MAKE THE BREAKDOWN TIE TO THE HEADLINE — BOTH DIRECTIONS.
  // The revenue lines cover grants + revenue mapped to a department. `totalRevenue`
  // is the Total Income headline (every revenue account). The remainder is revenue
  // not assigned to a department — usually a small positive, but it can be NEGATIVE
  // (contra / adjustment accounts that net down the total). Either way we show it as
  // its own line and make the Total equal the headline, so it always reconciles.
  const [hover, setHover] = useState<number | null>(null);
  const listed = revenueLines.reduce((a, r) => a + r.ytd, 0);
  const other = totalRevenue - listed;
  const showOther = Math.abs(other) >= 1;
  const isFy25 = comparisonLabel === "FY25";
  const r = 42;
  const circ = 2 * Math.PI * r;
  // Sort biggest-first so the legend reads top-to-bottom by size and the donut's
  // largest slices sit together — much easier to scan.
  const sorted = [...allocation].sort((a, b) => b.share - a.share);
  const segments = sorted.map(({ department, share }, i) => {
    const offset = sorted
      .slice(0, i)
      .reduce((acc, a) => acc + a.share * circ, 0);
    const len = share * circ;
    return {
      color: hex[department.color],
      dash: `${len} ${circ - len}`,
      offset: -offset,
    };
  });

  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader
        title={isFy25 ? "FY25 Spend Allocation" : budgetEstimated ? "Budget Allocation (est.)" : "Budget Allocation"}
        right={<CardBadge>{allocation.length} depts</CardBadge>}
      />

      <div className="relative flex items-center gap-[22px]">
        <svg
          width="114"
          height="114"
          viewBox="0 0 114 114"
          className="flex-shrink-0 origin-center animate-in fade-in zoom-in-75 fill-mode-both duration-700 ease-out"
          onMouseLeave={() => setHover(null)}
        >
          <circle cx="57" cy="57" r={r} fill="none" stroke="var(--elevated)" strokeWidth="17" />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="57"
              cy="57"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === i ? 20 : 17}
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
              transform="rotate(-90 57 57)"
              opacity={hover !== null && hover !== i ? 0.4 : 1}
              style={{ cursor: "pointer", transition: "opacity 120ms ease, stroke-width 120ms ease" }}
              onMouseEnter={() => setHover(i)}
            />
          ))}
          <text x="57" y="54" textAnchor="middle" fill={hover !== null ? hex[sorted[hover].department.color] : "var(--foreground)"} fontFamily="var(--font-heading)" fontSize="14" fontWeight="800">
            {formatCompact(hover !== null ? sorted[hover].department.annualBudget : totalBudget)}
          </text>
          <text x="57" y="65" textAnchor="middle" fill="var(--muted-foreground)" fontFamily="var(--font-mono)" fontSize="7.5" letterSpacing="1.5">
            {hover !== null ? "DEPT" : isFy25 ? "FY25 SPEND" : "TOTAL"}
          </text>
        </svg>

        {/* Tooltip on slice hover — value first, then the department and its share. */}
        {hover !== null && (
          <div className="pointer-events-none absolute left-16 top-0 z-20 -translate-y-2 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 shadow-xl shadow-black/20">
            <div className="font-heading text-[16px] font-bold leading-none tabular-nums" style={{ color: hex[sorted[hover].department.color] }}>
              {formatCurrency(sorted[hover].department.annualBudget)}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {shortLabel(sorted[hover].department.name)} · {formatPercent(sorted[hover].share)}
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2">
          {sorted.map(({ department, share }, i) => (
            <div
              key={department.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-xs transition-all",
                hover !== null && hover !== i ? "opacity-40" : "hover:bg-[var(--hairline-soft)]",
              )}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: hex[department.color] }}
              />
              <span className="flex-1 truncate font-medium text-foreground">
                {shortLabel(department.name)}
              </span>
              <span className="w-[56px] flex-shrink-0 text-right font-mono text-[11px] tabular-nums text-subtle">
                {formatCompact(department.annualBudget)}
              </span>
              <span className="w-9 flex-shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums text-foreground">
                {formatPercent(share)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue centres — pinned toward the bottom so the card fills its height */}
      <div className="mt-auto border-t border-border pt-[18px]">
        <div className="mb-3 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
          REVENUE CENTRES · YTD
        </div>
        <div className="flex flex-col gap-[9px]">
          {revenueLines.map((rev) => (
            <div key={rev.id} className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-foreground">
                {rev.label}
              </span>
              <span className="font-mono text-[13px] font-bold text-green">
                {formatCurrency(rev.ytd)}
              </span>
            </div>
          ))}
          {showOther && (
            <div
              className="flex items-center justify-between"
              title="Revenue not assigned to a department (or net contra/adjustment accounts). Included so the breakdown ties to Total Income."
            >
              <span className="text-[13px] font-medium text-foreground">
                Other revenue
              </span>
              <span className={cn("font-mono text-[13px] font-bold", other >= 0 ? "text-green" : "text-red")}>
                {formatCurrency(other)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-[13px] font-bold text-foreground">
              Total Revenue YTD
            </span>
            <span className="font-mono text-sm font-bold text-green">
              {formatCurrency(totalRevenue)}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function shortLabel(name: string): string {
  return name
    .replace(" Infrastructure", "")
    .replace(" & Infrastructure", "")
    .replace(" Services", "")
    .replace("Child Care", "Child Care");
}
