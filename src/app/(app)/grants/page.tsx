import { Landmark, Banknote, Send, AlertTriangle, Lock } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { allGrantFigures, grantSummary, GRANT_REGISTER } from "@/lib/grants";
import { formatCompact, formatPercent } from "@/lib/format";
import { Content } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { PrintButton } from "@/components/kit/print-button";
import { GrantRegisterTable } from "@/components/grants/grant-register-table";

export const dynamic = "force-dynamic";

export default async function GrantsPage() {
  const snapshot = await getSnapshot();
  const figures = allGrantFigures(snapshot);
  const s = grantSummary(figures);
  const utilisation = s.totalBudgetedExpense > 0 ? s.expenseToDate / s.totalBudgetedExpense : 0;

  return (
    <Content>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Register: {GRANT_REGISTER.source} · imported {GRANT_REGISTER.importedAt}
        </p>
        <PrintButton />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard color="gold" icon={Landmark} label="Grants Tracked" value={s.count} meta="From the grant register" />
        <KpiCard
          color="teal"
          icon={Banknote}
          label="Total Grant Income"
          value={formatCompact(s.totalGrantIncome)}
          meta={`${formatCompact(s.incomeToDate)} received to date`}
        />
        <KpiCard
          color="blue"
          icon={Send}
          label="Income Remaining"
          value={formatCompact(s.incomeRemaining)}
          meta="Still to be received"
        />
        <KpiCard
          color="amber"
          icon={Send}
          label="Spent to Date"
          value={formatCompact(s.expenseToDate)}
          meta={`${formatPercent(utilisation)} of budgeted expense`}
        />
        <KpiCard
          color={s.needsAttention > 0 ? "red" : "green"}
          icon={s.needsAttention > 0 ? AlertTriangle : Lock}
          label={s.needsAttention > 0 ? "Codes To Fix" : "Restricted Unspent"}
          value={s.needsAttention > 0 ? s.needsAttention : formatCompact(s.restrictedUnspent)}
          meta={s.needsAttention > 0 ? "Register rows unresolved" : "Unspent restricted grant cash"}
        />
      </div>

      <GrantRegisterTable figures={figures} />
    </Content>
  );
}
