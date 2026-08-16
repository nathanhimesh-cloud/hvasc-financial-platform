"use client";

import { ExportButton } from "@/components/kit/export-button";
import type { MonthlyReport } from "@/lib/monthly-report";

/**
 * Export for the Monthly Management Report (Hazel, 14 Aug: CSV on every page).
 * Client wrapper — writes the report's line items (departments or GL lines) to
 * Excel/CSV; the printable pack itself is the Print/PDF option.
 */
export function MonthlyReportExport({ report }: { report: MonthlyReport }) {
  return (
    <ExportButton
      filename={`hvasc-monthly-report-${report.scope}`}
      sheets={[
        {
          name: report.linesLabel.slice(0, 28) || "Report",
          rows: report.lines,
          columns: [
            { header: report.scope === "consolidated" ? "Department" : "Account", value: (l) => l.label, width: 34 },
            { header: "Budget", value: (l) => l.budget || null, type: "money", width: 16 },
            { header: "Actual", value: (l) => l.actual || null, type: "money", width: 16 },
            { header: "Variance", value: (l) => l.variance, type: "money", width: 16 },
            { header: "% used", value: (l) => l.utilisation || null, type: "percent", width: 10 },
          ],
        },
      ]}
    />
  );
}
