"use client";

import { ExportButton } from "@/components/kit/export-button";

/**
 * Export for Commitments & Debtors (Hazel, 14 Aug: CSV on every page). Client
 * wrapper so the server page hands it plain supplier rows.
 */
export function CommitmentsExport({
  suppliers,
}: {
  suppliers: { supplier: string; amount: number; count: number }[];
}) {
  return (
    <ExportButton
      filename="hvasc-commitments"
      sheets={[
        {
          name: "Commitments by supplier",
          rows: suppliers,
          columns: [
            { header: "Supplier", value: (s) => s.supplier, width: 40 },
            { header: "Committed (ordered, not invoiced)", value: (s) => s.amount || null, type: "money", width: 30 },
            { header: "Order lines", value: (s) => s.count, type: "number", width: 12 },
          ],
        },
      ]}
    />
  );
}
