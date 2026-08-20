import { HardHat, FileClock, ArrowDownLeft, AlertTriangle } from "lucide-react";
import { Content, Panel } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { assessWorkingCapital, commitmentsBySupplier } from "@/lib/working-capital";
import { CommitmentsExport } from "@/components/commitments/commitments-export";
import { CapitalWipTable, SupplierCommitmentsTable, AgeingPanel } from "@/components/commitments/commitments-tables";
import { formatCurrency, formatCompact, formatPercent } from "@/lib/format";
import { loadPriorYear, previousFyLabel } from "@/lib/prior-year";
import { YoY } from "@/components/kit/yoy";

export const dynamic = "force-dynamic";

/**
 * Commitments & Debtors — money in flight (Build Brief B4 + C4).
 *
 * Everything here is invisible in the general ledger. A purchase order that's been
 * raised but not invoiced doesn't touch a GL account, so the CFO's spend figures
 * understate what the Council has actually committed to. Same for a debtor invoice
 * that's been sitting unpaid for six months: it's an asset on the balance sheet
 * and, in practice, may be nothing of the sort.
 */
export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const view = await resolvePeriodView(await searchParams);
  const wc = assessWorkingCapital(view.snapshot);
  const c = wc.commitments;

  // Commitments and ageing are point-in-time, so comparing to any earlier stored
  // period (same month or last year's close) is a fair like-for-like.
  const prior = await loadPriorYear(view.snapshot);
  const wcPrior = prior ? assessWorkingCapital(prior.snapshot) : null;
  const priorLabel = prior?.periodLabel ?? previousFyLabel(view.snapshot.period.fyLabel) ?? "last year";

  const allSuppliers = c ? commitmentsBySupplier(c.lines) : [];

  return (
    <Content>
      <PageToolbar
        view={view}
        print={false} /* the export menu (with Print/PDF) is provided in actions */
        actions={<CommitmentsExport suppliers={allSuppliers} />}
        notable={wc.receivables?.alarming || !!c?.staleCount}
        notes={
          <>
            <InfoNote label="What a commitment is">
              Value ordered on a purchase order but not yet invoiced — real, but not yet in the general
              ledger, so it&apos;s invisible on every other report.
            </InfoNote>
            <InfoNote label="How it&apos;s measured">
              Ordered less invoiced, per line, on orders raised in the last 12 months. Capital vs
              operating comes from the GL account each line posts to.
            </InfoNote>
            {c?.staleCount ? (
              <InfoNote label="Excluded from the total">
                {formatCurrency(c.stale ?? 0)} on {c.staleCount} order lines over a year old is left out
                — likely untidy ledger, not live obligations. Worth a clean-up.
              </InfoNote>
            ) : null}
            <InfoNote label="Ageing">
              Straight from Practical&apos;s own end-of-month buckets — nothing recomputed.
            </InfoNote>
          </>
        }
      />

      {wc.needsResync ? (
        <Panel className="py-14 text-center">
          <p className="text-[13px] text-muted-foreground">
            No commitments or debtor ageing in this snapshot yet. They appear after the next sync —
            the feed now reads the purchase-order module (
            <span className="font-mono">OPMST / OPDET</span>) and the debtor and creditor ledgers (
            <span className="font-mono">DRMST / CRMST</span>).
          </p>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              color="gold"
              icon={FileClock}
              label="Committed — Capital"
              value={formatCompact(c?.capital ?? 0)}
              meta={
                <span className="flex flex-col gap-0.5">
                  <span>Ordered, not yet invoiced</span>
                  <YoY now={c?.capital ?? 0} then={wcPrior?.commitments?.capital} good="neutral" suffix={priorLabel} />
                </span>
              }
            />
            <KpiCard
              color="teal"
              icon={FileClock}
              label="Committed — Operating"
              value={formatCompact(c?.operating ?? 0)}
              meta={
                <span className="flex flex-col gap-0.5">
                  <span>{c ? `${c.orderCount} open order lines` : "—"}</span>
                  <YoY now={c?.operating ?? 0} then={wcPrior?.commitments?.operating} good="neutral" suffix={priorLabel} />
                </span>
              }
              delay={60}
            />
            <KpiCard
              color="amber"
              icon={HardHat}
              label="Capital Works in Progress"
              value={formatCompact(wc.workInProgressTotal)}
              meta={
                <span className="flex flex-col gap-0.5">
                  <span>{wc.workInProgress.length} projects underway</span>
                  <YoY now={wc.workInProgressTotal} then={wcPrior?.workInProgressTotal} good="neutral" suffix={priorLabel} />
                </span>
              }
              delay={120}
            />
            <KpiCard
              color={wc.receivables?.alarming ? "red" : "teal"}
              icon={ArrowDownLeft}
              label="Owed to the Council"
              value={formatCompact(wc.receivables?.schedule.total ?? 0)}
              meta={
                <span className="flex flex-col gap-0.5">
                  <span>
                    {wc.receivables?.overdueShare != null
                      ? `${formatPercent(wc.receivables.overdueShare, 0)} over 90 days`
                      : "—"}
                  </span>
                  <YoY
                    now={wc.receivables?.schedule.total ?? 0}
                    then={wcPrior?.receivables?.schedule.total}
                    good="neutral"
                    suffix={priorLabel}
                  />
                </span>
              }
              delay={180}
            />
          </div>

          {/*
            The ONE thing that stays on the page.
            Everything else moved behind the info icon — methodology, provenance,
            the stale-order caveat. This didn't, because it is not an explanation:
            it is a finding, it costs the Council money, and someone has to act on
            it. That is the test for what earns a place on the screen.
          */}
          {wc.receivables?.alarming && (
            <Panel className="mb-5 flex gap-2.5 border-red/30 bg-red/5">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red" strokeWidth={1.75} />
              <div className="text-[12px] leading-relaxed text-muted-foreground">
                <span className="text-red">
                  {formatCurrency(wc.receivables.schedule.days90)} of the{" "}
                  {formatCurrency(wc.receivables.schedule.total)} owed to the Council is more than 90
                  days overdue
                </span>{" "}
                — {formatPercent(wc.receivables.overdueShare ?? 0, 0)} of the debtors book.
              </div>
            </Panel>
          )}

          {/* Capital works in progress */}
          {wc.workInProgress.length > 0 && (
            <CapitalWipTable rows={wc.workInProgress} total={wc.workInProgressTotal} />
          )}

          {/* Who we owe future money to */}
          {allSuppliers.length > 0 && (
            <SupplierCommitmentsTable rows={allSuppliers} total={c?.total ?? 0} />
          )}

          {wc.receivables && (
            <AgeingPanel
              title="Money owed TO the Council"
              subtitle="Debtors, aged"
              insight={wc.receivables}
              direction="in"
            />
          )}
          {wc.payables && (
            <AgeingPanel
              title="Money the Council OWES"
              subtitle="Creditors, aged"
              insight={wc.payables}
              direction="out"
            />
          )}
        </>
      )}
    </Content>
  );
}

