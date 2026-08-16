import { Content } from "@/components/kit/panel";
import { PageToolbar } from "@/components/kit/page-toolbar";
import { InfoNote } from "@/components/kit/info-popover";
import { MonthlyReportView } from "@/components/reports/monthly-report-view";
import { MonthlyReportPicker } from "@/components/reports/monthly-report-picker";
import { MonthlyReportExport } from "@/components/reports/monthly-report-export";
import { resolvePeriodView, type SearchParams } from "@/lib/periods";
import { buildMonthlyReport, reportScopes } from "@/lib/monthly-report";
import { loadPriorYear } from "@/lib/prior-year";

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

  // Same month last year (when archived) gives a like-for-like YTD comparison.
  const prior = await loadPriorYear(view.snapshot);
  const report = buildMonthlyReport(view.snapshot, selected, prior?.sameMonth ? prior.snapshot : undefined);

  return (
    <Content>
      <PageToolbar
        view={view}
        print={false} /* the export menu (with Print/PDF) is provided in actions */
        actions={<MonthlyReportExport report={report} />}
        filters={<MonthlyReportPicker scopes={scopes} selected={selected} />}
        notes={
          <InfoNote label="Early in the financial year">
            Year-to-date figures in the first months of a year are small, and expenses can read
            negative where June&apos;s year-end accruals are being reversed. That is expected, not an
            error.
          </InfoNote>
        }
      />

      <MonthlyReportView report={report} />
    </Content>
  );
}
