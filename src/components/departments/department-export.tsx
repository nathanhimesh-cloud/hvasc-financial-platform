"use client";

import { ExportButton } from "@/components/kit/export-button";
import type { DepartmentDerived } from "@/lib/types";

/**
 * Export for the Manager View — the department summary as Excel/CSV (Hazel, 14 Aug:
 * CSV on every page). A thin client wrapper so the server page can hand it plain
 * rows; the columns (which are functions) live here on the client side.
 */
export function DepartmentExport({ departments }: { departments: DepartmentDerived[] }) {
  return (
    <ExportButton
      filename="hvasc-departments"
      sheets={[
        {
          name: "Departments",
          rows: departments,
          columns: [
            { header: "Department", value: (d) => d.name, width: 28 },
            { header: "Type", value: (d) => (d.kind === "cost-revenue" ? "Cost & revenue" : "Cost"), width: 16 },
            { header: "Annual budget", value: (d) => d.annualBudget || null, type: "money", width: 16 },
            { header: "YTD actual", value: (d) => d.ytdActual || null, type: "money", width: 16 },
            { header: "Revenue (YTD)", value: (d) => d.revenue || null, type: "money", width: 16 },
            { header: "YTD budget", value: (d) => d.ytdBudget || null, type: "money", width: 16 },
            { header: "Variance", value: (d) => d.variance, type: "money", width: 16 },
            { header: "% spent", value: (d) => d.pctSpent, type: "percent", width: 10 },
            { header: "Status", value: (d) => d.status, width: 16 },
          ],
        },
      ]}
    />
  );
}
