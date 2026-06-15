import { Content } from "@/components/kit/panel";
import { getSnapshot } from "@/lib/data";
import { ReportsView, type ReportPeriod, type ReportDept } from "@/components/reports/reports-view";
import type { IncomeStatement } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const snapshot = await getSnapshot();
  const { period } = snapshot;

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
      <ReportsView
        fyLabel={period.fyLabel}
        monthOfYear={period.monthOfYear}
        monthsInYear={period.monthsInYear}
        comparisonLabel={period.comparisonLabel ?? "Budget"}
        periods={periods}
        departments={departments}
        monthlySpend={snapshot.monthlySpend}
      />
    </Content>
  );
}
