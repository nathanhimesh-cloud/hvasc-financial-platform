import { HardHat, FileClock, ArrowDownLeft, ArrowUpRight, AlertTriangle } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { assessWorkingCapital, commitmentsBySupplier, type AgeingInsight } from "@/lib/working-capital";
import { formatCurrency, formatCompact, formatPercent } from "@/lib/format";
import { loadPriorYear, previousFyLabel } from "@/lib/prior-year";
import { YoY } from "@/components/kit/yoy";
import { cn } from "@/lib/utils";

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

  const suppliers = c ? commitmentsBySupplier(c.lines).slice(0, 8) : [];

  return (
    <Content>
      <PageToolbar
        view={view}
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
            <Panel className="mb-4">
              <PanelHeader
                title="Capital works in progress"
                subtitle="Spend accumulating on projects not yet complete"
                right={
                  <span className="font-mono text-[12px] tabular-nums text-foreground">
                    {formatCurrency(wc.workInProgressTotal)}
                  </span>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="pb-2 text-left font-normal">Project</th>
                      <th className="pb-2 text-right font-normal">Spend to date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wc.workInProgress.map((w) => (
                      <tr key={w.code} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4">
                          <div className="text-foreground">{w.project}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{w.code}</div>
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-foreground">
                          {formatCurrency(w.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* Who we owe future money to */}
          {suppliers.length > 0 && (
            <Panel className="mb-4">
              <PanelHeader
                title="Outstanding purchase orders, by supplier"
                subtitle="Ordered, not yet invoiced"
                right={
                  <span className="font-mono text-[12px] tabular-nums text-foreground">
                    {formatCurrency(c?.total ?? 0)}
                  </span>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="pb-2 text-left font-normal">Supplier</th>
                      <th className="pb-2 text-right font-normal">Orders</th>
                      <th className="pb-2 text-right font-normal">Committed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s.supplier} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 text-foreground">{s.supplier}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {s.count}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-foreground">
                          {formatCurrency(s.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
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

function AgeingPanel({
  title,
  subtitle,
  insight,
  direction,
}: {
  title: string;
  subtitle: string;
  insight: AgeingInsight;
  direction: "in" | "out";
}) {
  const s = insight.schedule;
  const Icon = direction === "in" ? ArrowDownLeft : ArrowUpRight;

  const buckets = [
    { label: "Current", value: s.current, tone: "text-foreground" },
    { label: "30 days", value: s.days30, tone: "text-foreground" },
    { label: "60 days", value: s.days60, tone: "text-amber" },
    { label: "90+ days", value: s.days90, tone: insight.alarming ? "text-red" : "text-amber" },
  ];

  return (
    <Panel className="mb-4">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
            {title}
          </span>
        }
        subtitle={`${subtitle} · ${s.count} accounts`}
        right={
          <span className="font-mono text-[12px] tabular-nums text-foreground">
            {formatCurrency(s.total)}
          </span>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-md border border-border bg-elevated/30 px-3 py-2.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
              {b.label}
            </div>
            <div className={cn("mt-1 font-mono text-[13px] font-semibold tabular-nums", b.tone)}>
              {formatCurrency(b.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[12px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="pb-2 text-left font-normal">Account</th>
              <th className="pb-2 text-right font-normal">Current</th>
              <th className="pb-2 text-right font-normal">30</th>
              <th className="pb-2 text-right font-normal">60</th>
              <th className="pb-2 text-right font-normal">90+</th>
              <th className="pb-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {s.accounts.slice(0, 20).map((a) => {
              // A balance that is ENTIRELY 90+ days old is the one to chase first.
              const allOverdue = a.total > 0 && a.days90 >= a.total - 0.005;
              return (
                <tr key={a.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4">
                    <div className="text-foreground">{a.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{a.id}</div>
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {a.current ? formatCurrency(a.current) : "—"}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {a.days30 ? formatCurrency(a.days30) : "—"}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {a.days60 ? formatCurrency(a.days60) : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right font-mono tabular-nums",
                      a.days90 > 0 ? (allOverdue ? "text-red" : "text-amber") : "text-muted-foreground",
                    )}
                  >
                    {a.days90 ? formatCurrency(a.days90) : "—"}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-foreground">
                    {formatCurrency(a.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {s.count > 20 && (
        <p className="mt-3 font-mono text-[10px] text-muted-foreground">
          Showing the 20 largest of {s.count} accounts.
        </p>
      )}
    </Panel>
  );
}
