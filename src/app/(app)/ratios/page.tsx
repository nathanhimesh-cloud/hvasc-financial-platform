import { CheckCircle2, AlertTriangle, Info, MinusCircle } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { PrintButton } from "@/components/kit/print-button";
import { PeriodSelector } from "@/components/kit/period-selector";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { assessRatios, type Ratio } from "@/lib/ratios";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Statutory financial sustainability ratios (Build Brief B8).
 *
 * Hope Vale is a **Tier 8** council under the Financial Management
 * (Sustainability) Guideline 2024 — confirmed from their own audited FY2025
 * Financial Sustainability Statement.
 *
 * The Operating Surplus Ratio is CONTEXTUAL for Tier 8: it has no benchmark, and
 * this page never red-flags it. Showing a red light against a target the Council
 * is not held to would be worse than showing nothing.
 */
export default async function RatiosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const view = await resolvePeriodView(await searchParams);
  const report = assessRatios(view.snapshot);

  const groups = ["Operating Performance", "Liquidity", "Asset Management", "Financial Capacity"] as const;

  return (
    <Content>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodSelector
            periods={view.periods}
            selected={view.selected}
            isLatest={view.isLatest}
            hasHistory={view.hasHistory}
          />
          <span className="rounded-full border border-gold/30 bg-gold-dim px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-gold-light">
            Tier {report.tier} council
          </span>
        </div>
        <PrintButton />
      </div>

      {/* The tier rule — the most important thing on this page. */}
      <Panel className="mb-5 flex gap-2.5">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold" strokeWidth={1.75} />
        <div className="text-[12px] leading-relaxed text-muted-foreground">
          Hope Vale is <span className="text-foreground">Tier 8</span> under the Financial Management
          (Sustainability) Guideline 2024 — confirmed from the Council&apos;s audited FY2025 Financial
          Sustainability Statement. Benchmarks differ by tier.{" "}
          <span className="text-foreground">
            The Operating Surplus Ratio is contextual for Tier 8 — it has no benchmark
          </span>
          , so it is reported but never flagged. The Leverage Ratio is omitted because the Council holds
          no debt (the Cash Flow&apos;s financing section is empty, which corroborates this).
        </div>
      </Panel>

      {report.needsResync && (
        <Panel className="mb-5 flex gap-2.5 border-amber/30 bg-amber/5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
          <div className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-amber">Awaiting a data resync.</span> The ratios need the
            operating-versus-capital split, which the feed now reads from Practical&apos;s own report
            definitions (FR reports 743 and 744). Run the next sync and these populate.
          </div>
        </Panel>
      )}

      {groups.map((g) => {
        const rows = report.ratios.filter((r) => r.group === g);
        if (!rows.length) return null;
        return (
          <Panel key={g} className="mb-4">
            <PanelHeader title={g} />
            <div className="flex flex-col gap-3">
              {rows.map((r) => (
                <RatioRow key={r.id} r={r} />
              ))}
            </div>
          </Panel>
        );
      })}

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Reference figures are the Council&apos;s audited FY2025 actuals, from its published Financial
        Sustainability Statement. Ratios marked &quot;needs data&quot; require the asset register or
        external (ABS) data that the finance system does not hold.
      </p>
    </Content>
  );
}

function RatioRow({ r }: { r: Ratio }) {
  const fmt = (v: number | null) =>
    v === null ? "—" : r.unit === "months" ? `${v.toFixed(1)} months` : formatPercent(v / 100, 2);

  const tone =
    r.status === "pass"
      ? "text-green"
      : r.status === "fail"
        ? "text-red"
        : r.status === "contextual"
          ? "text-foreground"
          : "text-muted-foreground";

  const Icon =
    r.status === "pass"
      ? CheckCircle2
      : r.status === "fail"
        ? AlertTriangle
        : r.status === "contextual"
          ? Info
          : MinusCircle;

  return (
    <div className="rounded-md border border-border bg-elevated/30 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", tone)} strokeWidth={2} />
            <span className="text-[13px] font-semibold text-foreground">{r.label}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{r.meaning}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{r.formula}</p>
          {r.blockedReason && (
            <p className="mt-1 text-[11px] leading-relaxed text-amber">{r.blockedReason}</p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-start gap-5 text-right">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
              This year
            </div>
            <div className={cn("mt-0.5 font-heading text-[19px] font-semibold tabular-nums", tone)}>
              {r.status === "unavailable" ? "needs data" : fmt(r.value)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
              Target
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{r.targetLabel}</div>
          </div>
          {r.audited2025 !== undefined && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                Audited FY25
              </div>
              <div className="mt-0.5 font-mono text-[12px] tabular-nums text-muted-foreground">
                {r.unit === "months" ? `${r.audited2025} mo` : `${r.audited2025}%`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
