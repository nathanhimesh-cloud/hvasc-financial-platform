"use client";

import { Info, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { hex } from "@/lib/colors";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";
import { CountUp } from "@/components/kit/count-up";
import { MIN_MONTHS_COVER, type CashBreakdown } from "@/lib/liquidity";
import { cn } from "@/lib/utils";

/**
 * Cash position & restrictions (CFO recommendation C1).
 *
 * The Council's headline cash balance is misleading on its own: a large share is
 * unspent grant money tied to a funded purpose. This panel splits it, and states
 * plainly that the split is a bound rather than an exact figure while the Grant
 * Register is missing opening balances / job codes for some restricted grants.
 */
export function CashPosition({ cash, periodLabel }: { cash: CashBreakdown; periodLabel: string }) {
  const { totalCash, restrictedCash, unrestrictedCash, monthsCover, monthlyOpex, exact, unmeasured } = cash;
  const restrictedShare = totalCash > 0 ? Math.min(Math.max(restrictedCash / totalCash, 0), 1) : 0;
  const unrestrictedShare = 1 - restrictedShare;

  // "at least" / "up to" — never imply precision we don't have.
  const approx = (n: number, kind: "floor" | "ceiling") =>
    exact ? formatCompact(n) : `${kind === "floor" ? "≥" : "≤"} ${formatCompact(n)}`;

  return (
    <Panel className="h-full">
      <PanelHeader
        title="Cash Position & Restrictions"
        right={<CardBadge>{periodLabel}</CardBadge>}
      />

      <div className="flex flex-col gap-5">
        {/* Total, then the split as one stacked bar. */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              Total cash &amp; bank
            </span>
            <span className="font-heading text-[22px] font-semibold tabular-nums text-foreground">
              <CountUp value={totalCash} format="compact" />
            </span>
          </div>

          <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full transition-[width] duration-700 ease-out"
              style={{ width: `${restrictedShare * 100}%`, background: hex.amber }}
              title={`Restricted ${formatCurrency(restrictedCash)}`}
            />
            <div
              className="h-full transition-[width] duration-700 ease-out"
              style={{ width: `${unrestrictedShare * 100}%`, background: hex.teal }}
              title={`Unrestricted ${formatCurrency(unrestrictedCash)}`}
            />
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <LegendRow
              color={hex.amber}
              icon={Lock}
              label="Restricted"
              hint="tied to a grant purpose"
              value={approx(restrictedCash, "floor")}
              pct={restrictedShare}
            />
            <LegendRow
              color={hex.teal}
              icon={LockOpen}
              label="Unrestricted"
              hint="Council may direct"
              value={approx(unrestrictedCash, "ceiling")}
              pct={unrestrictedShare}
            />
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Liquidity rule. */}
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="Months of cover"
            value={
              monthsCover === null
                ? "—"
                : `${exact ? "" : "≤ "}${monthsCover.toFixed(1)}`
            }
            tone={cash.belowMinimum ? "neg" : "pos"}
            hint={`unrestricted ÷ opex · min ${MIN_MONTHS_COVER}`}
          />
          <Tile
            label="Monthly opex"
            value={<CountUp value={monthlyOpex} format="compact" />}
            hint="run rate"
          />
        </div>

        {cash.belowMinimum && (
          <Note tone="bad" icon={TriangleAlert}>
            Unrestricted cash covers less than the {MIN_MONTHS_COVER}-month minimum
            {monthsCover !== null && ` (${monthsCover.toFixed(1)} months)`}. This holds even on the
            optimistic reading below.
          </Note>
        )}

        {!exact && (
          <Note tone="info" icon={Info}>
            <span className="text-foreground">These are bounds, not exact figures.</span> The Grant
            Register has no opening balance for {unmeasured.missingOpeningBalance} restricted grant
            {unmeasured.missingOpeningBalance === 1 ? "" : "s"} and no job code for{" "}
            {unmeasured.missingJobCodes}, so unmeasured restrictions make restricted cash a floor —
            and unrestricted cash and months of cover a ceiling. Resolves once the Council supplies
            opening balances at 30 Jun 26 and the remaining job codes.
          </Note>
        )}

        {/* Every line we counted as cash, so the total can be checked against Practical. */}
        <details className="group">
          <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground">
            {cash.cashLines.length} accounts counted as cash
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {cash.cashLines.map((l) => (
              <div key={l.label} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate text-muted-foreground">{l.label}</span>
                <span className="flex-shrink-0 font-mono tabular-nums text-foreground">
                  {formatCurrency(l.amount)}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </Panel>
  );
}

function LegendRow({
  color,
  icon: Icon,
  label,
  hint,
  value,
  pct,
}: {
  color: string;
  icon: typeof Lock;
  label: string;
  hint: string;
  value: string;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} style={{ color }} />
      <span className="flex-shrink-0 text-[13px] font-medium text-foreground">{label}</span>
      <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">· {hint}</span>
      <span
        className="ml-auto flex-shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums"
        style={{ color }}
      >
        {value}
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
    <div className="rounded-md border border-border bg-elevated/30 px-3 py-2.5">
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

function Note({
  tone,
  icon: Icon,
  children,
}: {
  tone: "bad" | "info";
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed",
        tone === "bad"
          ? "border-red/30 bg-red/5 text-muted-foreground"
          : "border-border bg-elevated/30 text-muted-foreground",
      )}
    >
      <Icon
        className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0", tone === "bad" ? "text-red" : "text-muted-foreground")}
        strokeWidth={1.75}
      />
      <p>{children}</p>
    </div>
  );
}
