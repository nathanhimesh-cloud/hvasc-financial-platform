import { Landmark, Banknote, Send, AlertTriangle, Lock } from "lucide-react";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { PeriodSelector } from "@/components/kit/period-selector";
import { allGrantFigures, grantSummary, GRANT_REGISTER } from "@/lib/grants";
import { formatCompact, formatPercent } from "@/lib/format";
import { Content } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { PrintButton } from "@/components/kit/print-button";
import { GrantRegisterTable } from "@/components/grants/grant-register-table";
import { GrantMix } from "@/components/dashboard/grant-mix";
import { DataQualityBadge } from "@/components/kit/data-quality-badge";
import { grantIssues } from "@/lib/data-quality";
import { ReferenceUpload } from "@/components/kit/reference-upload";
import { referenceMeta } from "@/lib/reference";

export const dynamic = "force-dynamic";

export default async function GrantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const view = await resolvePeriodView(await searchParams);
  const snapshot = view.snapshot;
  const regMeta = (await referenceMeta())["grant-register"];
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PeriodSelector
          periods={view.periods}
          selected={view.selected}
          isLatest={view.isLatest}
          hasHistory={view.hasHistory}
        />
        <DataQualityBadge issues={grantIssues(s)} />
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

      <div className="mb-6">
        <GrantMix summary={s} periodLabel={snapshot.period.label} />
      </div>

      <div className="mb-6">
        <ReferenceUpload
          kind="grant-register"
          title="Grant Register"
          description="The Council's register, converted to JSON by scripts/import-grant-register.mjs. It sets each grant's value and the GL/job codes that carry its income and spend. Validated before it replaces anything: ids must be unique, totals numeric, code lists present. A rejected file changes nothing, and the version it replaces is kept."
          currentLabel={
            regMeta
              ? `${regMeta.itemCount} grants · uploaded ${new Date(regMeta.uploadedAt).toLocaleDateString("en-AU")}${regMeta.uploadedBy ? ` by ${regMeta.uploadedBy}` : ""}`
              : `${GRANT_REGISTER.grants.length} grants · ${GRANT_REGISTER.source}`
          }
        />
      </div>

      <GrantRegisterTable figures={figures} />
    </Content>
  );
}
