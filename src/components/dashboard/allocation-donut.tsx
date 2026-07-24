"use client";

import type { Department, RevenueLine } from "@/lib/types";
import { hex } from "@/lib/colors";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";

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
  // MAKE THE BREAKDOWN TIE TO THE HEADLINE.
  // The revenue lines cover grants + revenue mapped to a department. `totalRevenue`
  // is the Total Income headline (every revenue account). Any difference is revenue
  // not yet assigned to a department — show it as its own line so the list always
  // sums to the headline, rather than sitting silently ~$18K short.
  const listed = revenueLines.reduce((a, r) => a + r.ytd, 0);
  const other = totalRevenue - listed;
  const showOther = other >= 1;
  const reconciledTotal = showOther ? totalRevenue : listed;
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

      <div className="flex items-center gap-[22px]">
        <svg
          width="114"
          height="114"
          viewBox="0 0 114 114"
          className="flex-shrink-0 origin-center animate-in fade-in zoom-in-75 fill-mode-both duration-700 ease-out"
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
              strokeWidth="17"
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
              transform="rotate(-90 57 57)"
            />
          ))}
          <text x="57" y="54" textAnchor="middle" fill="#ffffff" fontFamily="var(--font-heading)" fontSize="14" fontWeight="800">
            {formatCompact(totalBudget)}
          </text>
          <text x="57" y="65" textAnchor="middle" fill="var(--muted-foreground)" fontFamily="var(--font-mono)" fontSize="7.5" letterSpacing="1.5">
            {isFy25 ? "FY25 SPEND" : "TOTAL"}
          </text>
        </svg>

        <div className="flex flex-1 flex-col gap-2">
          {sorted.map(({ department, share }) => (
            <div key={department.id} className="flex items-center gap-2.5 text-xs">
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
        <div className="mb-3 font-mono text-[10px] tracking-[0.06em] text-[#8aa0b8]">
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
              title="Revenue in accounts not yet assigned to a department. Included so the breakdown ties to Total Income."
            >
              <span className="text-[13px] font-medium text-muted-foreground">
                Other revenue
              </span>
              <span className="font-mono text-[13px] font-bold text-muted-foreground">
                {formatCurrency(other)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-[13px] font-bold text-white">
              Total Revenue YTD
            </span>
            <span className="font-mono text-sm font-bold text-green">
              {formatCurrency(reconciledTotal)}
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
