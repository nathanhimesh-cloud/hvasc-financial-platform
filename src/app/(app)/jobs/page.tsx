import { Briefcase, Wallet, Activity, AlertTriangle, Unlink } from "lucide-react";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { Content, Panel } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { jobBudgetGroups, jobBudgetSummary } from "@/lib/job-budgets";
import { JobBudgetTable } from "@/components/jobs/job-budget-table";
import { DataQualityBadge } from "@/components/kit/data-quality-badge";
import { jobIssues } from "@/lib/data-quality";
import { formatCompact, formatPercent } from "@/lib/format";
import { loadPriorYear, previousFyLabel } from "@/lib/prior-year";
import { YoY } from "@/components/kit/yoy";

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const view = await resolvePeriodView(await searchParams);
  const groups = jobBudgetGroups(view.snapshot);
  const s = jobBudgetSummary(groups);

  // Actual job spend is a year-to-date flow → compare only to the same month last year,
  // and only when the prior snapshot actually carries job data (a GL-only prior-year
  // rebuild doesn't, so we show "—" rather than a misleading zero).
  const prior = await loadPriorYear(view.snapshot);
  const priorHasJobs = !!(prior?.snapshot.jobBudgets?.length || prior?.snapshot.jobCosts?.length);
  const priorS = prior?.sameMonth && priorHasJobs ? jobBudgetSummary(jobBudgetGroups(prior.snapshot)) : null;
  const priorLabel = prior?.periodLabel ?? previousFyLabel(view.snapshot.period.fyLabel) ?? "last year";


  return (
    <Content>
      <PageToolbar
        view={view}
        print={false} /* the job budget table carries the unified export menu */
        filters={groups.length > 0 ? <DataQualityBadge issues={jobIssues(s)} /> : undefined}
        notes={
          <>
            <InfoNote label="Where the budget lives">
              Practical holds the budget on the GL <span className="text-foreground">account</span>, not
              on the job — in the FY26 export only 12 of 384 jobs carried an estimate of their own. So
              this mirrors Practical&apos;s own Jobs Budget report: budget from the account, actuals from
              the jobs beneath it.
            </InfoNote>
            <InfoNote label="Actual vs job-costed">
              <span className="text-foreground">Actual</span> is the account&apos;s full balance;{" "}
              <span className="text-foreground">job-costed</span> is only the part carrying a job code.
              The difference is spend posted without a job — kept visible rather than netted away.
            </InfoNote>
            <InfoNote label="Committed">
              Value ordered on purchase orders but not yet invoiced. Practical&apos;s own committed field
              is unused at this site, so it comes from the order ledger. A job can be under budget on
              actuals and already over-committed on orders.
            </InfoNote>
          </>
        }
      />

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
              meta={
                <span className="flex flex-col gap-0.5">
                  <span>
                    {s.totalBudgetYtd > 0 ? `${formatPercent(s.totalGlActual / s.totalBudgetYtd)} of budget to date` : "No budget loaded"}
                  </span>
                  <YoY now={s.totalGlActual} then={priorS?.totalGlActual} good="neutral" suffix={priorLabel} />
                </span>
              }
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
