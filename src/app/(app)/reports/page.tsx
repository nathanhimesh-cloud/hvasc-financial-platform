import { Content } from "@/components/kit/panel";
import { ReportsView, type ReportPeriod, type ReportDept } from "@/components/reports/reports-view";
import { PeriodSelector } from "@/components/kit/period-selector";
import { resolvePeriodView, periodDateRange, type SearchParams } from "@/lib/periods";
import { assessIntegrity } from "@/lib/integrity";
import { budgetReportFY27 } from "@/data/budget-report-fy27";
import { queryTransactions, isLedgerEnabled } from "@/lib/ledger";
import type { IncomeStatement } from "@/lib/types";

export const dynamic = "force-dynamic";

/** First value of a possibly-repeated query param, trimmed to nothing-or-something. */
function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const view = await resolvePeriodView(sp);
  const snapshot = view.snapshot;
  const { period } = snapshot;
  const integrity = assessIntegrity(snapshot);

  // ── Transaction ledger (B1) ────────────────────────────────────────────────
  // Transactions live in Postgres (upserted on every sync), so the date range and
  // search are applied by the DATABASE across the whole year — not to a page of
  // rows already in memory. The period on screen bounds the query, so an archived
  // month never lists transactions dated after the figures above them.
  const range = periodDateRange(period.fyLabel, period.monthOfYear);
  const filters = { q: one(sp.q), from: one(sp.from), to: one(sp.to) };
  const hasFilters = !!(filters.q || filters.from || filters.to);

  // Never let a user-supplied bound escape the selected period.
  const from = filters.from && range && filters.from > range.from ? filters.from : range?.from;
  const to = filters.to && range && filters.to < range.to ? filters.to : range?.to;

  const ledger = await queryTransactions({
    fyLabel: period.fyLabel,
    from,
    to,
    search: filters.q,
    limit: 1000,
  });

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

  // Cumulative P&L checkpoints (Jul…current). Fall back to a single YTD point
  // built from incomeTotals if the snapshot predates monthly statements.
  let periods: ReportPeriod[] = (snapshot.monthlyStatements ?? []).map((s) => ({
    idx: s.idx,
    month: s.month,
    totalIncome: s.totalIncome,
    totalExpenses: s.totalExpenses,
    netResult: s.netResult,
    revenueLines: s.revenueLines.map((r) => ({ id: r.id, label: r.label, ytd: r.ytd })),
  }));
  if (!periods.length) {
    const it: IncomeStatement = snapshot.incomeTotals ?? {
      totalIncome: snapshot.revenueLines.reduce((a, r) => a + r.ytd, 0),
      totalExpenses: snapshot.departments.reduce((a, d) => a + d.ytdActual, 0),
      netResult: 0,
      revenueLines: snapshot.revenueLines,
    };
    periods = [
      {
        idx: period.monthOfYear,
        month: period.label.split(" ")[0],
        totalIncome: it.totalIncome,
        totalExpenses: it.totalExpenses,
        netResult: it.netResult,
        revenueLines: it.revenueLines.map((r) => ({ id: r.id, label: r.label, ytd: r.ytd })),
      },
    ];
  }

  const departments: ReportDept[] = snapshot.departments.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    icon: d.icon,
    ytdActual: d.ytdActual,
    ytdBudget: d.ytdBudget,
    annualBudget: d.annualBudget,
  }));

  return (
    <Content>
      <div className="mb-4">
        <PeriodSelector
          periods={view.periods}
          selected={view.selected}
          isLatest={view.isLatest}
          hasHistory={view.hasHistory}
        />
      </div>
      <ReportsView
        fyLabel={period.fyLabel}
        monthOfYear={period.monthOfYear}
        monthsInYear={period.monthsInYear}
        comparisonLabel={period.comparisonLabel ?? "Budget"}
        periods={periods}
        departments={departments}
        monthlySpend={snapshot.monthlySpend}
        balanceSheet={snapshot.balanceSheet}
        cashFlow={snapshot.cashFlow}
        integrity={integrity}
        generatedAt={snapshot.meta?.generatedAt}
        source={snapshot.meta?.source}
        budgetData={budgetReportFY27}
        transactions={transactions}
        transactionTotal={transactionTotal}
        dailySpend={snapshot.dailySpend ?? []}
        ledger={{
          serverFiltered: useLedger,
          filters,
          totals: useLedger ? { debit: ledger.totalDebit, credit: ledger.totalCredit } : undefined,
          preservedParams,
        }}
      />
    </Content>
  );
}
