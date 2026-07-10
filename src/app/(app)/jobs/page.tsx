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
            <KpiCard color="teal" icon={Wallet} label="Annual Budget" value={formatCompact(s.totalBudget)} meta={`${formatCompact(s.totalBudgetYtd)} budgeted to date`} />
            <KpiCard
              color="amber"
              icon={Activity}
              label="Actual"
              value={formatCompact(s.totalGlActual)}
              meta={s.totalBudgetYtd > 0 ? `${formatPercent(s.totalGlActual / s.totalBudgetYtd)} of budget to date` : "No budget loaded"}
            />
            <KpiCard
              color={s.overBudget > 0 ? "red" : "green"}
              icon={AlertTriangle}
              label="Over Budget"
              value={s.overBudget}
              meta={`of ${s.groups} accounts`}
            />
            {/* Job costs can exceed an operating account's balance because the
                capital portion posts to an asset account. Showing one netted
                figure produced a nonsensical negative "not job-costed" total. */}
            <KpiCard
              color={s.totalNonOperating > 0 ? "blue" : "green"}
              icon={Unlink}
              label="Capital / Non-Operating"
              value={formatCompact(s.totalNonOperating)}
              meta="Job spend outside the expense chart"
            />
          </div>

          <JobBudgetTable groups={groups} />
        </>
      )}
    </Content>
  );
}
