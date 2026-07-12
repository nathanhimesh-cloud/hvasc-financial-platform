import { Content } from "@/components/kit/panel";
import { PrintButton } from "@/components/kit/print-button";
import { PeriodSelector } from "@/components/kit/period-selector";
import { MonthlyReportView } from "@/components/reports/monthly-report-view";
import { MonthlyReportPicker } from "@/components/reports/monthly-report-picker";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { buildMonthlyReport, reportScopes } from "@/lib/monthly-report";

export const dynamic = "force-dynamic";

/**
 * Monthly management report (engagement letter, Schedule 1).
 *
 * One page produces every pack the contract calls for: a consolidated CFO /
 * senior-leadership report and one per department, each print/PDF-ready. The
 * scope is chosen from the URL (?report=), the period from the shared period
 * selector, so a specific pack for a specific month is a shareable link.
 */
export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const view = await resolvePeriodView(sp);
  const scopes = reportScopes(view.snapshot);

  const requested = Array.isArray(sp.report) ? sp.report[0] : sp.report;
  const selected = scopes.some((s) => s.id === requested) ? (requested as string) : "consolidated";

  const report = buildMonthlyReport(view.snapshot, selected);

  return (
    <Content>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <MonthlyReportPicker scopes={scopes} selected={selected} />
          <PeriodSelector
            periods={view.periods}
            selected={view.selected}
            isLatest={view.isLatest}
            hasHistory={view.hasHistory}
          />
        </div>
        <PrintButton label="Print / PDF this report" />
      </div>

      <MonthlyReportView report={report} />
    </Content>
  );
}
