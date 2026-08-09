import { Construction, Activity, FileClock, PiggyBank } from "lucide-react";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { Content, InfoBanner } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { buildCapitalProgramme } from "@/lib/capital-projects";
import { CapitalProjectsTable } from "@/components/capital/capital-projects-table";
import { formatCompact, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Capital Projects — granular year-to-date tracking for the FY27 capital
 * programme (Aug 2026 dashboard review). Budget per job from the printed Job
 * Cost Budget report; actuals and commitments live from the Practical feed.
 */
export default async function CapitalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const view = await resolvePeriodView(await searchParams);
  const programme = buildCapitalProgramme(view.snapshot);
  const t = programme.totals;

  return (
    <Content>
      <PageToolbar
        view={view}
        notes={
          <>
            <InfoNote label="Where the budgets come from">
              <span className="text-foreground">Orig Bud</span> is the adopted figure as printed on
              Practical&apos;s Job Cost Budget report ({programme.asAt}). <span className="text-foreground">
              Curr Bud</span> comes LIVE from Practical&apos;s job register (JCMST estimate) each sync —
              when the two differ, the budget has genuinely moved since printing.
            </InfoNote>
            <InfoNote label="Why capital spend isn't in expenses">
              Capital works post to <span className="text-foreground">work-in-progress asset
              accounts</span>, not operating expense accounts — so a busy capital month shows here
              and on the balance sheet, not in the P&amp;L.
            </InfoNote>
            <InfoNote label="Committed">
              Open purchase-order value by job. A project can be barely spent on actuals and already
              fully committed on orders — remaining is budget less <span className="text-foreground">
              both</span>.
            </InfoNote>
          </>
        }
      />

      {!programme.hasLiveData && (
        <div className="mb-4">
          <InfoBanner>
            No job-cost or commitment data in this snapshot yet — Actual and Committed read $0 until
            the next Practical sync. Budgets are unaffected.
          </InfoBanner>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          color="gold"
          icon={Construction}
          label="FY27 Programme"
          value={formatCompact(t.currBudget)}
          meta={
            programme.liveBudgets > 0
              ? `${programme.jobCount} jobs · current budgets live from Practical`
              : `${programme.jobCount} jobs · as printed ${programme.asAt}`
          }
        />
        <KpiCard
          color="amber"
          icon={Activity}
          label="Actual Spend"
          value={formatCompact(t.actual)}
          meta={`${formatPercent(t.pctSpent, 1)} of programme`}
        />
        <KpiCard
          color="blue"
          icon={FileClock}
          label="Committed"
          value={formatCompact(t.committed)}
          meta="Open purchase orders"
        />
        <KpiCard
          color={t.remaining < 0 ? "red" : "green"}
          icon={PiggyBank}
          label="Remaining"
          value={formatCompact(t.remaining)}
          meta="Budget less actual + committed"
        />
      </div>

      <CapitalProjectsTable programme={programme} />
    </Content>
  );
}
