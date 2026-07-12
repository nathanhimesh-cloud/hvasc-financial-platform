import { FileText, Receipt, AlertTriangle, Database } from "lucide-react";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { queryInvoices, queryBills } from "@/lib/billing";
import { formatCompact } from "@/lib/format";
import { BillingView } from "@/components/billing/billing-view";

export const dynamic = "force-dynamic";

/**
 * Invoices and supplier bills (Build Brief B4).
 *
 * Two directions, one page:
 *   Invoices       - money the Council is OWED   (Practical DRTRAN, 123,755 rows)
 *   Supplier bills - money the Council OWES      (Practical CRTRN,  205,597 rows)
 *
 * Ageing on `/commitments` tells you the TOTAL owed in each bucket. This tells you
 * WHICH invoices make up that total, and who owes them — which is the question you
 * actually have to act on. "$1.25M is over 90 days" is a fact; "QBuild owes $306K on
 * these eleven invoices" is a phone call.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = await resolvePeriodView(params);

  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;
  const search = typeof params.q === "string" ? params.q : undefined;
  const openOnly = params.open === "1";

  const [invoices, bills] = await Promise.all([
    queryInvoices({ from, to, search, openOnly, limit: 300 }),
    queryBills({ from, to, search, openOnly, limit: 300 }),
  ]);

  /*
    THE TABLES MIGHT NOT EXIST YET.

    `notReady` is true when scripts/billing-schema.sql hasn't been run, or the feed
    hasn't shipped a batch. An empty table would render as "no invoices" — which is a
    lie of exactly the kind this platform exists to avoid. It reads as "the Council is
    owed nothing", when the truth is "we haven't loaded it yet".
  */
  const notReady = invoices.notReady && bills.notReady;
  const empty = !notReady && invoices.total === 0 && bills.total === 0;

  return (
    <Content>
      <PageToolbar
        view={view}
        notes={
          <>
            <InfoNote label="Where these come from">
              Invoices are read from Practical&apos;s DRTRAN (123,755 rows); supplier bills from
              CRTRN (205,597). Both are read-only and land in the platform&apos;s own database, keyed
              on Practical&apos;s record number, so each sync ships only what is new.
            </InfoNote>
            <InfoNote label="Outstanding, not invoiced">
              An invoice&apos;s <span className="text-foreground">outstanding</span> figure is what is
              still unpaid on it — not what was originally billed. An invoice raised for $10,000 and
              paid down to $500 is a $500 problem, and showing the $10,000 would overstate what the
              Council is owed twentyfold.
            </InfoNote>
            <InfoNote label="Cancelled cheques are not debts">
              Practical carries <span className="text-foreground">1,634 cancelled</span> supplier
              transactions. They are excluded from what the Council owes. Treating &quot;not
              paid&quot; as &quot;still owed&quot; would present every one of them as money that
              still has to be found.
            </InfoNote>
          </>
        }
      />

      {notReady ? (
        <Panel className="border-amber/30 bg-amber/[0.04]">
          <div className="flex items-start gap-2.5">
            <Database className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
            <div className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="text-amber">Not loaded yet.</span> This page needs two things, in
              order:
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4">
                <li>
                  Run <code className="font-mono text-[12px] text-foreground">scripts/billing-schema.sql</code>{" "}
                  against the database.
                </li>
                <li>
                  Run the feed on the Council&apos;s server —{" "}
                  <code className="font-mono text-[12px] text-foreground">07-run-feed.ps1</code>.
                </li>
              </ol>
              <p className="mt-2">
                It says <span className="text-foreground">not loaded</span> rather than{" "}
                <span className="text-foreground">no invoices</span> on purpose. An empty table would
                read as &quot;the Council is owed nothing&quot;, which is not what we know.
              </p>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              color="teal"
              icon={FileText}
              label="Owed to the Council"
              value={formatCompact(invoices.totalOutstanding)}
              meta={`${invoices.total} invoices · ${formatCompact(invoices.totalInvoiced)} billed`}
            />
            <KpiCard
              color="gold"
              icon={Receipt}
              label="Owed by the Council"
              value={formatCompact(bills.totalOpen)}
              meta={`${bills.total} supplier bills`}
            />
            <KpiCard
              color="blue"
              icon={Receipt}
              label="Bills, all statuses"
              value={formatCompact(bills.totalAmount)}
              meta="Including paid and cancelled"
            />
            <KpiCard
              color={bills.cancelledCount > 0 ? "amber" : "green"}
              icon={AlertTriangle}
              label="Cancelled"
              value={String(bills.cancelledCount)}
              meta="Excluded from what's owed"
            />
          </div>

          {empty ? (
            <Panel>
              <PanelHeader title="Nothing in range" subtitle="Try widening the dates" />
              <p className="text-[13px] text-muted-foreground">
                The tables are loaded but no invoice or bill matches the current filters.
              </p>
            </Panel>
          ) : (
            <BillingView invoices={invoices} bills={bills} />
          )}
        </>
      )}
    </Content>
  );
}
