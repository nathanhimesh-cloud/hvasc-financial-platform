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

  /*
    THREE DIFFERENT KINDS OF "NOTHING HERE", AND THEY NEED THREE DIFFERENT ANSWERS.

      notReady    - the tables don't exist. Run the migration.
      neverLoaded - the tables exist and are EMPTY. The feed has never delivered.
      empty       - there is data, but none of it matches the current filters.

    Collapsing the middle case into the last one is what the first version did, and it
    told the user to "try widening the dates" when no date would have helped — sending
    them to hunt a filter bug that did not exist. The fix for an empty table is on the
    Council's server, not in the date picker.
  */
  const neverLoaded = !notReady && invoices.neverLoaded && bills.neverLoaded;
  const empty = !notReady && !neverLoaded && invoices.total === 0 && bills.total === 0;

  /*
    TWO PAGES OF THE SAME PLATFORM MUST NOT DISAGREE ABOUT WHAT THE COUNCIL IS OWED.

    The ageing panel on /commitments reads DRMST's balance buckets — the debtor's
    CURRENT total, all history. This page reads DRTRAN, invoice by invoice, and it
    backfills incrementally: 2,000 rows a run, so a fresh install shows a fraction of
    the ledger for the first day or two.

    During that window /billing says "$125,011 owed" while /commitments says
    "$1,917,700". Both are on screen, both are wrong to trust, and nothing tells the
    reader which. That is worse than showing nothing — it is the platform contradicting
    itself, and a CEO who catches it stops believing every other number too.

    So: compare against the ageing total, and say so when they don't line up.
  */
  const agedTotal = view.snapshot.ageing?.receivables?.total ?? 0;
  const loadedShare = agedTotal > 0 ? invoices.totalOutstanding / agedTotal : 1;
  const backfilling = !notReady && !neverLoaded && agedTotal > 0 && loadedShare < 0.9;

  return (
    <Content>
      <PageToolbar
        view={view}
        notes={
          <>
            <InfoNote label="Where these come from">
              Invoices from Practical&apos;s DRTRAN, supplier bills from CRTRN — read-only, keyed on the
              record number so each sync ships only what&apos;s new.
            </InfoNote>
            <InfoNote label="Outstanding, not invoiced">
              &quot;Outstanding&quot; is what&apos;s still unpaid, not the original bill — a $10,000
              invoice paid down to $500 is a $500 debt.
            </InfoNote>
            <InfoNote label="Cancelled cheques are not debts">
              Cancelled supplier transactions are excluded from what the Council owes.
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
          {/* The platform must never let two of its own pages disagree in silence. */}
          {backfilling && (
            <Panel className="mb-5 border-amber/30 bg-amber/[0.04]">
              <div className="flex items-start gap-2.5">
                <Database className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
                <div className="text-[12px] leading-relaxed text-muted-foreground">
                  <span className="text-amber">
                    Still loading — these figures are incomplete. Do not quote them yet.
                  </span>
                  <p className="mt-1.5">
                    This page shows{" "}
                    <span className="text-foreground">
                      {formatCompact(invoices.totalOutstanding)}
                    </span>{" "}
                    owed to the Council. The ageing report says{" "}
                    <span className="text-foreground">{formatCompact(agedTotal)}</span>.{" "}
                    <span className="text-foreground">The ageing report is right.</span>
                  </p>
                  <p className="mt-1.5">
                    Invoices load 2,000 at a time, so a new install takes a day or two of syncs to
                    catch up. This banner disappears on its own once the two agree — it is here so
                    nobody reads a partial figure as the whole one.
                  </p>
                </div>
              </div>
            </Panel>
          )}

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

          {neverLoaded ? (
            <Panel className="border-amber/30 bg-amber/[0.04]">
              <PanelHeader
                title="The tables are ready. No data has arrived."
                subtitle="This is a feed problem, not a filter problem"
              />
              <div className="flex items-start gap-2.5">
                <Database className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" strokeWidth={1.75} />
                <div className="text-[13px] leading-relaxed text-muted-foreground">
                  The database is set up correctly, but the Council&apos;s server has never sent an
                  invoice or a supplier bill. <span className="text-foreground">No date range will
                  help</span> — there is nothing to find.
                  <p className="mt-2">Two things to check on HVASC-APP02:</p>
                  <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4">
                    <li>
                      Is it running the <span className="text-foreground">current</span>{" "}
                      <code className="font-mono text-[12px] text-foreground">05-build-snapshot.ps1</code>?
                      The build log should print{" "}
                      <span className="text-foreground">&quot;Invoices + supplier bills (B4)&quot;</span>.
                      If it doesn&apos;t, the script on the server is out of date.
                    </li>
                    <li>
                      Did the <span className="text-foreground">push</span> succeed? A failed push
                      leaves the cursor where it was and sends nothing.
                    </li>
                  </ol>
                </div>
              </div>
            </Panel>
          ) : empty ? (
            <Panel>
              <PanelHeader title="Nothing in range" subtitle="Try widening the dates" />
              <p className="text-[13px] text-muted-foreground">
                There <span className="text-foreground">is</span> invoice and bill data loaded — none
                of it falls inside the current filters.
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
