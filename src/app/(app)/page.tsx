import { Content } from "@/components/kit/panel";
import { DashboardController } from "@/components/dashboard/dashboard-controller";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { loadPriorYear, priorDashboardStats, previousFyLabel } from "@/lib/prior-year";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function CfoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const view = await resolvePeriodView(await searchParams);

  // Whether to offer the "Map →" shortcuts. The mapping page refuses anyone
  // without the capability, but a button that leads to a 404 is worse than no
  // button — so read-only roles simply do not see it. With auth off (local dev)
  // everything is open, the same rule the mapping page applies to itself.
  const canMap = !isAuthConfigured() || can((await getSession())?.role, "mapping.edit");

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
      {/* The period control lives INSIDE the dashboard now: it carries the month
          range as well as the archived-period jump, and the range is client state
          the controller owns. One control, one place. */}
      <DashboardController
        snapshot={view.snapshot}
        prior={{ label: priorLabel, stats: priorStats }}
        periods={view.periods}
        selected={view.selected}
        isLatest={view.isLatest}
        canMap={canMap}
      />
    </Content>
  );
}
