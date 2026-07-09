import { Briefcase, Wallet, Activity, AlertTriangle, Unlink } from "lucide-react";
import { Content, Panel } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { PrintButton } from "@/components/kit/print-button";
import { PeriodSelector } from "@/components/kit/period-selector";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { jobBudgetGroups, jobBudgetSummary } from "@/lib/job-budgets";
import { JobBudgetTable } from "@/components/jobs/job-budget-table";
import { DataQualityBadge } from "@/components/kit/data-quality-badge";
import { jobIssues } from "@/lib/data-quality";
import { formatCompact, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const view = await resolvePeriodView(await searchParams);
  const groups = jobBudgetGroups(view.snapshot);
  const s = jobBudgetSummary(groups);
  const utilisation = s.totalBudget > 0 ? s.totalGlActual / s.totalBudget : 0;

  return (
    <Content>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodSelector
            periods={view.periods}
            selected={view.selected}
            isLatest={view.isLatest}
            hasHistory={view.hasHistory}
          />
          {groups.length > 0 && <DataQualityBadge issues={jobIssues(s)} />}
        </div>
        <PrintButton />
      </div>

      {groups.length === 0 ? (
        <Panel className="py-14 text-center">
          <p className="text-[13px] text-muted-foreground">
            No job budget data in this snapshot yet. It appears after the next sync from Practical —
            the ODBC build now reads the job register (<span className="font-mono">JCMST</span>)
            alongside job costs (<span className="font-mono">JCTRN</span>).
          </p>
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard color="gold" icon={Briefcase} label="Jobs Tracked" value={s.jobs} meta={`Across ${s.groups} GL accounts`} />
            <KpiCard color="teal" icon={Wallet} label="Budget" value={formatCompact(s.totalBudget)} meta="Held on the GL account" />
            <KpiCard
              color="amber"
              icon={Activity}
              label="Actual"
              value={formatCompact(s.totalGlActual)}
              meta={s.totalBudget > 0 ? `${formatPercent(utilisation)} of budget` : "No budget loaded"}
            />
            <KpiCard
              color={s.overBudget > 0 ? "red" : "green"}
              icon={AlertTriangle}
              label="Over Budget"
              value={s.overBudget}
              meta={`of ${s.groups} accounts`}
            />
            <KpiCard
              color={s.totalUnjobbed > 0 ? "amber" : "green"}
              icon={Unlink}
              label="Not Job-Costed"
              value={formatCompact(s.totalUnjobbed)}
              meta="Spend posted without a job"
            />
          </div>

          <JobBudgetTable groups={groups} />
        </>
      )}
    </Content>
  );
}
