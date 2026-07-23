import Link from "next/link";
import { Scale, Info } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCurrency, formatCompact } from "@/lib/format";
import type { CostRecovery } from "@/lib/cost-recovery";
import { DeptIcon } from "@/lib/icons";
import { bgDim, textColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * Cost recovery for trading operations (B7).
 *
 * Only departments Practical marks as revenue-generating are scored. A library isn't
 * failing at 0% cost recovery — it was never meant to trade. Scoring every cost centre
 * would fill the page with red that means nothing.
 */
export function CostRecoveryPanel({ recovery }: { recovery: CostRecovery }) {
  if (recovery.trading.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title="Cost recovery"
        subtitle="Trading operations — do they pay for themselves?"
        right={<Scale className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
      />

      {/*
        The whole panel refuses to score when the year is too young. See the long
        comment in src/lib/cost-recovery.ts — dividing by a negative year-to-date cost
        produces a confident, catastrophic lie.
      */}
      {recovery.tooEarly ? (
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-elevated/40 px-3.5 py-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">Too early in the year to measure.</span> Populates once
            each trading department has real spend on the ledger.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Council subsidy
              </span>
              <div
                className={cn(
                  "font-heading text-[22px] font-semibold tabular-nums",
                  recovery.totalSubsidy > 0 ? "text-amber" : "text-green",
                )}
              >
                {formatCurrency(Math.abs(recovery.totalSubsidy))}
                <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                  {recovery.totalSubsidy > 0 ? "funded by the Council" : "contributed to the Council"}
                </span>
              </div>
            </div>
            <div className="text-[12px] text-muted-foreground">
              {formatCompact(recovery.totalRevenue)} earned against {formatCompact(recovery.totalCost)}{" "}
              spent
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {recovery.trading.map((r) => (
              <li key={r.id}>
                {r.ratio === null ? (
                  <div className="flex items-center gap-2.5 rounded-md border border-border bg-elevated/30 px-3 py-2.5">
                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", bgDim[r.color])}>
                      <DeptIcon name={r.icon} className={cn("h-3.5 w-3.5", textColor[r.color])} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground">{r.name}</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{r.why}</p>
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      not yet measurable
                    </span>
                  </div>
                ) : (
                  <Link
                    href={`/departments/${r.slug}`}
                    className="block rounded-md border border-border bg-elevated/30 px-3 py-2.5 transition-colors hover:border-[rgba(255,255,255,0.18)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", bgDim[r.color])}>
                        <DeptIcon name={r.icon} className={cn("h-3.5 w-3.5", textColor[r.color])} />
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-foreground">{r.name}</span>
                      <span
                        className={cn(
                          "font-heading text-[16px] font-semibold tabular-nums",
                          r.level === "good" ? "text-green" : r.level === "warn" ? "text-amber" : "text-red",
                        )}
                      >
                        {r.ratio.toFixed(0)}%
                      </span>
                    </div>

                    {/* The bar caps at 100% — past that it's fully recovered, and a
                        200% bar would just be a longer green rectangle saying so. */}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          r.level === "good" ? "bg-green" : r.level === "warn" ? "bg-amber" : "bg-red",
                        )}
                        style={{ width: `${Math.min(100, Math.max(0, r.ratio))}%` }}
                      />
                    </div>

                    <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                      <span>{formatCompact(r.revenue)} earned</span>
                      <span>
                        {r.subsidy > 0
                          ? `${formatCompact(r.subsidy)} subsidised`
                          : `${formatCompact(-r.subsidy)} surplus`}
                      </span>
                    </div>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {recovery.costCentres.length > 0 && (
        <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">Not scored:</span>{" "}
          {recovery.costCentres.map((c) => c.name).join(", ")} — cost centres, not trading operations.
          They are funded to deliver a service, not to break even.
        </p>
      )}
    </Panel>
  );
}
