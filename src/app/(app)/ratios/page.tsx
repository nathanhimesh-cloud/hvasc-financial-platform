import { CheckCircle2, AlertTriangle, Info, MinusCircle } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { assessRatios, type Ratio } from "@/lib/ratios";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Statutory financial sustainability ratios (Build Brief B8).
 *
 * Hope Vale is **Tier 8** — confirmed from their audited FY2025 Financial
 * Sustainability Statement. The Operating Surplus Ratio is CONTEXTUAL for Tier 8:
 * it has no benchmark, and this page never red-flags it.
 *
 * LAYOUT. The first version gave equal weight to every measure, so three real
 * ratios sat among four that said "needs data" in identical boxes, each with a
 * paragraph of orange explanation. The page read as broken when it was mostly
 * working. Computed ratios lead; the ones we can't compute are folded into one
 * quiet section at the bottom that says what's missing and who can supply it.
 */
export default async function RatiosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const view = await resolvePeriodView(await searchParams);
  const report = assessRatios(view.snapshot);

  const live = report.ratios.filter((r) => r.status !== "unavailable");
  const blocked = report.ratios.filter((r) => r.status === "unavailable");

  const groups = ["Operating Performance", "Liquidity", "Asset Management", "Financial Capacity"] as const;

  return (
    <Content>
      <PageToolbar
        view={view}
        filters={
          <span className="rounded-full border border-gold/30 bg-gold-dim px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-gold-light">
            Tier {report.tier}
          </span>
        }
        notable
        notes={
          <>
            <InfoNote label="Tier 8">
              Hope Vale is Tier 8 (2024 Sustainability Guideline). The Operating Surplus Ratio is{" "}
              <span className="text-foreground">contextual for Tier 8 — no benchmark</span>, so it&apos;s
              reported but never flagged.
            </InfoNote>
            <InfoNote label="Why last year&apos;s figures?">
              These are annual measures; a July-only surplus ratio would be meaningless. Flow ratios use{" "}
              {report.flowBasis}; cash-cover and asset ratios are current.
            </InfoNote>
            <InfoNote label="No leverage ratio">
              Omitted — the Council holds no debt.
            </InfoNote>
            <InfoNote label="Reference figures">
              &quot;Audited FY25&quot; is the Council&apos;s own published actual.
            </InfoNote>
          </>
        }
      />

      {report.needsResync && (
        <Panel className="mb-4 flex gap-2.5 border-amber/30 bg-amber/5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
          <div className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-amber">Awaiting a data resync.</span> Run the next sync and these
            populate.
          </div>
        </Panel>
      )}

      {/*
        WITHHELD IS NOT THE SAME AS NOT-SYNCED, and the reader deserves to know which.
        The feed deliberately holds the flow ratios back when Practical's report
        doesn't reconcile to the ledger (typically a mid-flight year-end roll). Saying
        "run the next sync" there would be a lie — the next sync withholds them again.
        So we show the real reason, straight from the feed.
      */}
      {report.withheld && (
        <Panel className="mb-4 flex gap-2.5 border-amber/30 bg-amber/5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
          <div className="text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-amber">
              The operating and capital ratios are held back this period — not shown wrong.
            </span>
            <p className="mt-1.5">
              {report.withheldReason ??
                "Practical's operating/capital report doesn't currently reconcile to the general ledger, so the split it produces can't be trusted. The ratios return automatically once the figures reconcile — most often after the prior year is finalised in Practical."}
            </p>
          </div>
        </Panel>
      )}

      {groups.map((g) => {
        const rows = live.filter((r) => r.group === g);
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

      {blocked.length > 0 && (
        <Panel>
          <PanelHeader
            title="Not yet computable"
            subtitle={`${blocked.length} of ${report.ratios.length} measures · what each one needs`}
          />
          <div className="flex flex-col divide-y divide-border">
            {blocked.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-[13rem] flex-1 items-center gap-2">
                  <MinusCircle className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
                  <span className="text-[13px] text-foreground">{r.label}</span>
                </div>
                <p className="flex-[2] text-[11px] leading-relaxed text-muted-foreground">
                  {r.blockedReason}
                </p>
                {r.audited2025 !== undefined && (
                  <div className="text-right">
                    <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                      Audited FY25
                    </div>
                    <div className="font-mono text-[12px] tabular-nums text-muted-foreground">
                      {r.unit === "months" ? `${r.audited2025} mo` : `${r.audited2025}%`}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </Content>
  );
}

function RatioRow({ r }: { r: Ratio }) {
  const fmt = (v: number | null) =>
    v === null ? "—" : r.unit === "months" ? `${v.toFixed(1)} months` : formatPercent(v / 100, 2);

  // "provisional" and "contextual" read neutral — neither is a verdict.
  const tone =
    r.status === "pass"
      ? "text-green"
      : r.status === "fail"
        ? "text-red"
        : "text-foreground";

  const Icon =
    r.status === "pass"
      ? CheckCircle2
      : r.status === "fail"
        ? AlertTriangle
        : Info;

  return (
    <div className="rounded-md border border-border bg-elevated/30 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", tone)} strokeWidth={2} />
            <span className="text-[13px] font-semibold text-foreground">{r.label}</span>
            {r.status === "provisional" && (
              <span className="rounded border border-border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                Provisional
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{r.meaning}</p>
        </div>

        <div className="flex flex-shrink-0 items-start gap-5 text-right">
          <div>
            <div className={cn("font-heading text-[20px] font-semibold tabular-nums", tone)}>
              {fmt(r.value)}
            </div>
            <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{r.basis}</div>
          </div>
          <div className="min-w-[8rem]">
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
