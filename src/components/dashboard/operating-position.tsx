"use client";

import { useState } from "react";
import { hex } from "@/lib/colors";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";
import { CountUp } from "@/components/kit/count-up";
import { cn } from "@/lib/utils";

/**
 * Council operating position for the year-to-date. The Income Statement
 * reconciles (Income − Expenses = Net), so we show it as a composition donut —
 * how the council's income split between expenses and what it retained — plus
 * the headline ratios. Far clearer than three separate bars.
 */
export function OperatingPosition({
  totalIncome,
  totalExpenses,
  netResult,
  periodLabel,
}: {
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
  periodLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const surplus = netResult >= 0;
  const margin = totalIncome > 0 ? netResult / totalIncome : 0;
  const spendRatio = totalIncome > 0 ? totalExpenses / totalIncome : 0;

  // Donut: of total income, how much was spent vs retained.
  const expShare = totalIncome > 0 ? Math.min(totalExpenses / totalIncome, 1) : 0;
  const surShare = Math.max(0, 1 - expShare);

  // One source of truth for both the arcs and the legend, so hover cross-highlights.
  const items = [
    { label: "Expenses", value: totalExpenses, pct: spendRatio, frac: expShare, color: hex.amber },
    { label: surplus ? "Net Surplus" : "Net Deficit", value: netResult, pct: margin, frac: surShare, color: surplus ? hex.green : hex.red },
  ];

  const R = 40;
  const SW = 14;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  const segments = items.map((p) => {
    const len = p.frac * CIRC;
    const seg = { color: p.color, dash: `${len} ${CIRC - len}`, offset: -acc };
    acc += len;
    return seg;
  });

  const active = hover !== null ? items[hover] : null;
  const centreValue = active ? active.value : totalIncome;
  const centreLabel = active ? active.label.toUpperCase() : "INCOME";

  return (
    <Panel className="h-full">
      <PanelHeader title="Operating Position — YTD" right={<CardBadge>{periodLabel}</CardBadge>} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
        {/* Composition donut + legend */}
        <div className="relative flex items-center gap-5">
          <svg
            width="118"
            height="118"
            viewBox="0 0 100 100"
            className="flex-shrink-0 origin-center animate-in fade-in zoom-in-75 fill-mode-both duration-700 ease-out"
            onMouseLeave={() => setHover(null)}
          >
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--elevated)" strokeWidth={SW} />
            {segments.map((s, i) => (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? SW + 3 : SW}
                strokeLinecap="butt"
                strokeDasharray={s.dash}
                strokeDashoffset={s.offset}
                transform="rotate(-90 50 50)"
                opacity={hover !== null && hover !== i ? 0.4 : 1}
                style={{ cursor: "pointer", transition: "opacity 120ms ease, stroke-width 120ms ease" }}
                onMouseEnter={() => setHover(i)}
              />
            ))}
            <text x="50" y="47" textAnchor="middle" fill={active ? active.color : "var(--foreground)"} fontFamily="var(--font-heading)" fontSize="13.5" fontWeight="800">
              {formatCompact(centreValue)}
            </text>
            <text x="50" y="58" textAnchor="middle" fill="var(--muted-foreground)" fontFamily="var(--font-mono)" fontSize="6.5" letterSpacing="1.5">
              {centreLabel}
            </text>
          </svg>

          {/* Tooltip on segment hover — leads with the value. */}
          {active && (
            <div className="pointer-events-none absolute -top-1 left-14 z-20 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 shadow-xl shadow-black/20">
              <div className="font-heading text-[16px] font-bold leading-none tabular-nums" style={{ color: active.color }}>
                {formatCurrency(active.value)}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {active.label} · {formatPercent(active.pct)} of income
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {items.map((it, i) => (
              <LegendRow
                key={it.label}
                color={it.color}
                label={it.label}
                value={it.value}
                pct={it.pct}
                dim={hover !== null && hover !== i}
                onHover={(on) => setHover(on ? i : null)}
              />
            ))}
          </div>
        </div>

        <div className="hidden lg:block lg:h-20 lg:w-px lg:bg-border" />

        {/* Headline ratios as tiles */}
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Tile label="Surplus margin" value={<CountUp value={margin} format="percent" />} tone={surplus ? "pos" : "neg"} hint="net ÷ income" />
          <Tile label="Spend rate" value={<CountUp value={spendRatio} format="percent" />} hint="of income spent" />
          <Tile label={surplus ? "Surplus Year to Date" : "Shortfall Year to Date"} value={<CountUp value={Math.abs(netResult)} format="compact" />} tone={surplus ? "pos" : "neg"} hint={periodLabel} />
        </div>
      </div>
    </Panel>
  );
}

function LegendRow({
  color,
  label,
  value,
  pct,
  dim,
  onHover,
}: {
  color: string;
  label: string;
  value: number;
  pct: number;
  dim?: boolean;
  onHover?: (on: boolean) => void;
}) {
  return (
    <div
      className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 transition-all", dim ? "opacity-40" : "hover:bg-[var(--hairline-soft)]")}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
      <span className="w-[92px] flex-shrink-0 text-[13px] font-medium text-foreground">{label}</span>
      <span className="w-[64px] flex-shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums" style={{ color }}>
        <CountUp value={value} format="compact" />
      </span>
      <span className="w-9 flex-shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatPercent(pct)}
      </span>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "pos" | "neg";
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-elevated/30 px-3 py-2.5 transition-colors hover:border-[var(--hairline)]">
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-heading text-[19px] font-semibold tabular-nums",
          tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
