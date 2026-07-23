import { Content } from "@/components/kit/panel";
import { DashboardController } from "@/components/dashboard/dashboard-controller";
import { PeriodSelector } from "@/components/kit/period-selector";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { loadPriorYear, priorDashboardStats, previousFyLabel } from "@/lib/prior-year";

export const dynamic = "force-dynamic";

export default async function CfoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const view = await resolvePeriodView(await searchParams);

  // "This time last year" for the KPI cards. Same-month basis so it lines up with
  // the default council-wide, year-to-date view. When the archive has no prior year
  // yet, the label is still passed so the cards show a "vs …—" placeholder that
  // fills in automatically once last year is stored.
  const prior = await loadPriorYear(view.snapshot);
  const priorStats = prior?.sameMonth ? priorDashboardStats(prior.snapshot) : {};
  const priorLabel =
    prior?.sameMonth && prior.periodLabel
      ? prior.periodLabel
      : (previousFyLabel(view.snapshot.period.fyLabel) ?? "last year");

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
      <DashboardController snapshot={view.snapshot} prior={{ label: priorLabel, stats: priorStats }} />
    </Content>
  );
}
