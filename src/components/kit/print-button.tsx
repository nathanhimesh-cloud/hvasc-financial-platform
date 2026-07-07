"use client";

import { Printer } from "lucide-react";

/**
 * Print / export-to-PDF (brief B3). Triggers the browser print dialog, where the
 * user picks "Save as PDF". The `@media print` rules in globals.css swap to a
 * light palette and hide the app chrome so the report prints cleanly. Marked
 * `.no-print` so the button itself never appears in the PDF.
 */
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}
