"use client";

import { hex } from "@/lib/colors";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";
import { revenueComposition, type RevenueBucketKey } from "@/lib/revenue-mix";
import type { RevenueLine } from "@/lib/types";

/**
 * Where the income comes from (Aug 2026 review): operating grants, capital
 * grants, enterprise revenue, interest and other — one stacked bar plus a
 * legend, honouring the dashboard's period/monthly filters via the lines it's
 * handed. Zero buckets stay listed at $0 rather than vanishing: "no capital
 * grants yet this year" is information.
 */
export function RevenueComposition({
  lines,
  totalIncome,
  periodLabel,
}: {
  lines: RevenueLine[];
  totalIncome: number;
  periodLabel: string;
}) {
  const buckets = revenueComposition(lines, totalIncome);

  const colors: Record<RevenueBucketKey, string> = {
    "operating-grants": hex.teal,
    "capital-grants": hex.blue,
    enterprise: hex.gold,
    interest: hex.green,
    other: hex.amber,
  };

  const barTotal = buckets.reduce((a, b) => a + Math.max(b.amount, 0), 0);

  return (
    <Panel className="h-full">
      <PanelHeader title="Revenue Composition" right={<CardBadge>{periodLabel}</CardBadge>} />

      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              Total income
            </span>
            <span className="font-heading text-[22px] font-semibold tabular-nums text-foreground">
              {formatCompact(totalIncome)}
            </span>
          </div>

          <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-[var(--track)]">
            {buckets.map((b) =>
              b.amount > 0 && barTotal > 0 ? (
                <div
                  key={b.key}
                  className="h-full transition-[width] duration-700 ease-out"
                  style={{ width: `${(b.amount / barTotal) * 100}%`, background: colors[b.key] }}
                  title={`${b.label} ${formatCurrency(b.amount)}`}
                />
              ) : null,
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {buckets.map((b) => (
            <div key={b.key} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: colors[b.key] }}
              />
              <span className="flex-shrink-0 text-[13px] font-medium text-foreground">{b.label}</span>
              {b.lineCount > 0 && (
                <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
                  · {b.lineCount} line{b.lineCount === 1 ? "" : "s"}
                </span>
              )}
              <span
                className="ml-auto flex-shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums"
                style={{ color: b.amount !== 0 ? colors[b.key] : undefined }}
              >
                {formatCurrency(b.amount)}
              </span>
              <span className="w-11 flex-shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatPercent(b.share, 1)}
              </span>
            </div>
          ))}
        </div>

        <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
          Classified by revenue-line name; anything unrecognised lands in Other rather than being
          guessed, and the buckets reconcile to total income.
        </p>
      </div>
    </Panel>
  );
}
