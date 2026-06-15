"use client";

import { hex } from "@/lib/colors";
import { formatCompact, formatPercent } from "@/lib/format";
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
  const surplus = netResult >= 0;
  const margin = totalIncome > 0 ? netResult / totalIncome : 0;
  const spendRatio = totalIncome > 0 ? totalExpenses / totalIncome : 0;

  // Donut: of total income, how much was spent vs retained.
  const expShare = totalIncome > 0 ? Math.min(totalExpenses / totalIncome, 1) : 0;
  const surShare = Math.max(0, 1 - expShare);

  const R = 40;
  const SW = 14;
  const CIRC = 2 * Math.PI * R;
  const parts = [
    { color: hex.amber, frac: expShare },
    { color: surplus ? hex.green : hex.red, frac: surShare },
  ];
  let acc = 0;
  const segments = parts.map((p) => {
    const len = p.frac * CIRC;
    const seg = { color: p.color, dash: `${len} ${CIRC - len}`, offset: -acc };
    acc += len;
    return seg;
  });

  return (
    <Panel className="h-full">
      <PanelHeader title="Operating Position — YTD" right={<CardBadge>{periodLabel}</CardBadge>} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
        {/* Composition donut + legend */}
        <div className="flex items-center gap-5">
          <svg
            width="118"
            height="118"
            viewBox="0 0 100 100"
            className="flex-shrink-0 origin-center animate-in fade-in zoom-in-75 fill-mode-both duration-700 ease-out"
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
                strokeWidth={SW}
                strokeLinecap="butt"
                strokeDasharray={s.dash}
                strokeDashoffset={s.offset}
                transform="rotate(-90 50 50)"
              />
            ))}
            <text x="50" y="47" textAnchor="middle" fill="#ffffff" fontFamily="var(--font-heading)" fontSize="13.5" fontWeight="800">
              {formatCompact(totalIncome)}
            </text>
            <text x="50" y="58" textAnchor="middle" fill="var(--muted-foreground)" fontFamily="var(--font-mono)" fontSize="6.5" letterSpacing="1.5">
              INCOME
            </text>
          </svg>

          <div className="flex flex-col gap-3">
            <LegendRow color={hex.amber} label="Expenses" value={totalExpenses} pct={spendRatio} />
            <LegendRow
              color={surplus ? hex.green : hex.red}
              label={surplus ? "Net Surplus" : "Net Deficit"}
              value={netResult}
              pct={margin}
            />
          </div>
        </div>

        <div className="hidden lg:block lg:h-20 lg:w-px lg:bg-border" />

        {/* Headline ratios as tiles */}
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Tile label="Surplus margin" value={<CountUp value={margin} format="percent" />} tone={surplus ? "pos" : "neg"} hint="net ÷ income" />
          <Tile label="Spend rate" value={<CountUp value={spendRatio} format="percent" />} hint="of income spent" />
          <Tile label={surplus ? "Retained YTD" : "Shortfall YTD"} value={<CountUp value={Math.abs(netResult)} format="compact" />} tone={surplus ? "pos" : "neg"} hint={periodLabel} />
        </div>
      </div>
    </Panel>
  );
}

function LegendRow({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <div className="flex items-center gap-2.5">
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
    <div className="rounded-md border border-border bg-elevated/30 px-3 py-2.5 transition-colors hover:border-[rgba(255,255,255,0.16)]">
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
