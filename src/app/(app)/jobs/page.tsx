import { Briefcase, Wallet, Activity, AlertTriangle, Unlink } from "lucide-react";
import { Content, Panel } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { PrintButton } from "@/components/kit/print-button";
import { PeriodSelector } from "@/components/kit/period-selector";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { jobBudgetGroups, jobBudgetSummary } from "@/lib/job-budgets";
import { JobBudgetTable } from "@/components/jobs/job-budget-table";
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
        <PeriodSelector
          periods={view.periods}
          selected={view.selected}
          isLatest={view.isLatest}
          hasHistory={view.hasHistory}
        />
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

          {/* Two limitations the Council should see rather than discover later. */}
          {(s.noBudget > 0 || s.unmappedJobs > 0 || !s.hasCommitments) && (
            <Panel className="mb-6 flex flex-col gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {s.noBudget > 0 && (
                <p>
                  <span className="text-amber">{s.noBudget} GL account{s.noBudget === 1 ? "" : "s"}</span> carry
                  spend but no budget in Practical, so they can&apos;t be tracked against one.
                </p>
              )}
              {s.unmappedJobs > 0 && (
                <p>
                  <span className="text-amber">{s.unmappedJobs} job{s.unmappedJobs === 1 ? "" : "s"}</span> have no
                  GL account on the job register and are grouped under &quot;Jobs with no GL account&quot;.
                </p>
              )}
              {!s.hasCommitments && (
                <p>
                  Practical records <span className="text-foreground">no commitments</span> against jobs (the
                  Committed column is empty on every job), so committed-but-unspent figures can&apos;t be shown.
                </p>
              )}
            </Panel>
          )}

          <JobBudgetTable groups={groups} />
        </>
      )}
    </Content>
  );
}
