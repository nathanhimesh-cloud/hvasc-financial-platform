import { TrendingUp, TrendingDown, Wallet, Building2 } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { deriveDepartments } from "@/lib/derive";
import { Content } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { ManagerCard } from "@/components/managers/manager-card";
import { DepartmentExport } from "@/components/departments/department-export";
import { CostRecoveryPanel } from "@/components/departments/cost-recovery-panel";
import { costRecovery } from "@/lib/cost-recovery";
import { formatCompact } from "@/lib/format";
import { loadPriorYear, previousFyLabel } from "@/lib/prior-year";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const snapshot = await getSnapshot();
  const departments = deriveDepartments(snapshot);
  const recovery = costRecovery(departments);

  // Council-wide headline, same figures as the CFO dashboard — the income side
  // included, not just spend (Aug 2026 review). Falls back to summing the
  // departments if the snapshot has no consolidated income statement.
  const totalIncome = snapshot.incomeTotals?.totalIncome ?? departments.reduce((a, d) => a + (d.revenue ?? 0), 0);
  const totalExpenses = snapshot.incomeTotals?.totalExpenses ?? departments.reduce((a, d) => a + d.ytdActual, 0);
  const netResult = snapshot.incomeTotals?.netResult ?? totalIncome - totalExpenses;
  const surplus = netResult >= 0;

  // Same-month last year for a fair year-to-date spend delta (when archived). The
  // label is passed even when the archive has nothing yet, so each card shows a
  // "vs …—" placeholder that fills in automatically once last year is stored.
  const prior = await loadPriorYear(snapshot);
  const priorLabel = prior?.periodLabel ?? previousFyLabel(snapshot.period.fyLabel) ?? "last year";
  const priorYtdBySlug = new Map<string, number>();
  if (prior?.sameMonth) {
    for (const p of prior.snapshot.departments) priorYtdBySlug.set(p.slug, p.ytdActual);
  }

  return (
    <Content>
      <div className="no-print mb-4 flex justify-end">
        <DepartmentExport departments={departments} />
      </div>

      {/* Council-wide headline — the same income / expense / result stats as the
          CFO dashboard, so the departmental view opens with the whole picture. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard color="teal" icon={TrendingUp} label="Total Income" value={formatCompact(totalIncome)} meta={snapshot.period.label} href="/reports" />
        <KpiCard color="amber" icon={TrendingDown} label="Total Expenses" value={formatCompact(totalExpenses)} meta={snapshot.period.label} href="/reports" />
        <KpiCard color={surplus ? "green" : "red"} icon={Wallet} label={surplus ? "Net Surplus" : "Net Deficit"} value={formatCompact(Math.abs(netResult))} meta={surplus ? "Income over spend" : "Spend over income"} />
        <KpiCard color="blue" icon={Building2} label="Departments" value={departments.length} meta="Cost & revenue centres" />
      </div>

      {/* B7 — do the trading operations pay for themselves? Refuses to score
          rather than divide by a negative year-to-date cost. */}
      <div className="mb-4">
        <CostRecoveryPanel recovery={recovery} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {departments.map((d) => (
          <ManagerCard
            key={d.id}
            department={d}
            period={snapshot.period}
            priorYtd={priorYtdBySlug.get(d.slug)}
            priorLabel={priorLabel}
          />
        ))}
      </div>
    </Content>
  );
}
