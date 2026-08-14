import Link from "next/link";
import { CornerDownRight } from "lucide-react";
import { Content, Panel } from "@/components/kit/panel";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { TransactionsView } from "@/components/reports/transactions-view";
import { resolvePeriodView, periodDateRange, type SearchParams } from "@/lib/periods";
import { queryTransactions, isLedgerEnabled } from "@/lib/ledger";

export const dynamic = "force-dynamic";

/**
 * The transaction ledger (Build Brief B3).
 *
 * This existed already — buried as a TAB inside Detailed Reports, which is where
 * nobody found it. Nathan went looking for "the page with daily transactions and a
 * date range" and couldn't locate it in his own product. A feature nobody can find
 * is a feature that doesn't exist, so it gets its own page and its own nav item.
 *
 * The filtering runs in the DATABASE, not the browser: the date range and search
 * are applied by Postgres across the whole financial year, so a search matches
 * transactions that were never sent to the page. The period on screen bounds the
 * query, so an archived month never lists transactions dated after the figures
 * above it.
 */
function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const view = await resolvePeriodView(sp);
  const snapshot = view.snapshot;
  const { period } = snapshot;

  const range = periodDateRange(period.fyLabel, period.monthOfYear);

  // `code` arrives when someone CLICKED a figure elsewhere (the B3 drill-down).
  // It's prefix-matched in Postgres, so "1255-2000" drills into every sub-account
  // beneath it — which is how a reader thinks about an account.
  const code = one(sp.code);
  const filters = { q: one(sp.q), from: one(sp.from), to: one(sp.to), code };
  const hasFilters = !!(filters.q || filters.from || filters.to || code);

  // Never let a user-supplied bound escape the selected period.
  const from = filters.from && range && filters.from > range.from ? filters.from : range?.from;
  const to = filters.to && range && filters.to < range.to ? filters.to : range?.to;

  const ledger = await queryTransactions({
    fyLabel: period.fyLabel,
    from,
    to,
    search: filters.q,
    code,
    limit: 1000,
  });

  // The name of the account we drilled into, for the banner. Taken from the rows
  // themselves so it's whatever Practical calls it, not a label we invented.
  const drillAccount = code ? (ledger.rows[0]?.account ?? "") : "";

  // The ledger owns the data once it has any. Otherwise fall back to whatever the
  // snapshot still carries, and tell the view it must filter in the browser.
  const useLedger = isLedgerEnabled() && (ledger.total > 0 || hasFilters);
  const transactions = useLedger ? ledger.rows : (snapshot.transactions ?? []);
  const transactionTotal = useLedger ? ledger.total : transactions.length;

  // Keep the selected period in the URL when the filter bar rewrites it.
  const preservedParams: Record<string, string> = {};
  if (!view.isLatest || one(sp.fy)) {
    preservedParams.fy = view.selected.fyLabel;
    preservedParams.m = String(view.selected.periodMonth);
  }

  return (
    <Content>
      <PageToolbar
        view={view}
        print={false} /* the transactions table carries the unified export menu */
        notes={
          <>
            <InfoNote label="Where these come from">
              Every posting in the general ledger (<span className="font-mono">GLTRN</span>), synced
              three times a day. Nothing is summarised or rounded — this is the ledger itself.
            </InfoNote>
            <InfoNote label="The search runs in the database">
              Search and date range apply across the whole year in the database — they find rows never
              sent to this page.
            </InfoNote>
            <InfoNote label="Current year only">
              Transaction detail is kept for the <span className="text-foreground">current year
              only</span>. Prior years hold monthly totals, not individual postings.
            </InfoNote>
          </>
        }
      />

      {/*
        You arrived here by CLICKING a figure. Say so, say which account, and give
        a way back to the whole ledger — otherwise a filtered view looks like a
        broken one, and the reader concludes there are only nine transactions in
        the entire council.
      */}
      {code && (
        <Panel className="mb-4 flex flex-wrap items-center justify-between gap-3 border-gold/25 bg-gold-dim">
          <div className="flex items-center gap-2.5">
            <CornerDownRight className="h-4 w-4 flex-shrink-0 text-gold" strokeWidth={2} />
            <span className="text-[13px] text-foreground">
              Transactions behind{" "}
              <span className="font-mono text-gold-light">{code}</span>
              {drillAccount && <span className="text-muted-foreground"> · {drillAccount}</span>}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {transactionTotal?.toLocaleString()} row{transactionTotal === 1 ? "" : "s"}
            </span>
          </div>
          <Link
            href="/transactions"
            className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            show all transactions →
          </Link>
        </Panel>
      )}

      <TransactionsView
        transactions={transactions}
        transactionTotal={transactionTotal}
        dailySpend={snapshot.dailySpend ?? []}
        fyLabel={period.fyLabel}
        serverFiltered={useLedger}
        filters={filters}
        ledgerTotals={useLedger ? { debit: ledger.totalDebit, credit: ledger.totalCredit } : undefined}
        preservedParams={preservedParams}
      />
    </Content>
  );
}
