import { Content } from "@/components/kit/panel";
import { DashboardController } from "@/components/dashboard/dashboard-controller";
import { PeriodSelector } from "@/components/kit/period-selector";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";

export const dynamic = "force-dynamic";

export default async function CfoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const view = await resolvePeriodView(await searchParams);
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
      <DashboardController snapshot={view.snapshot} />
    </Content>
  );
}
