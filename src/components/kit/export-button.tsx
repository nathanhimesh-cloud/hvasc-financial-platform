"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { downloadXlsx, type XlsxSheet } from "@/lib/export-xlsx";
import { cn } from "@/lib/utils";

/**
 * Export, in the two formats the brief asks for.
 *
 * Every report had a "Export CSV" button and the brief asks for **Excel and PDF**.
 * CSV is not Excel: it opens as text, loses numbers as numbers, and — the one that
 * actually bites — mangles GL codes. "0205-4147" is a date to Excel's CSV importer
 * in an Australian locale, and a finance officer who opens a CSV of account codes
 * finds half of them turned into April 2147.
 *
 * PDF is the Print button (browsers print to PDF and the pages carry print styles).
 * So this covers the third: a real `.xlsx`.
 *
 * CSV stays, because some people pipe it into other things.
 */
export function ExportButton<T>({
  filename,
  sheets,
  meta,
  csv,
}: {
  filename: string;
  sheets: XlsxSheet<T>[];
  meta?: { period?: string; generatedAt?: string };
  /** Optional CSV fallback — the existing per-table exporter. */
  csv?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="no-print inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-[rgba(255,255,255,0.2)] hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
        Export
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-md border border-border bg-card shadow-xl shadow-black/40">
          <button
            type="button"
            onClick={() => {
              downloadXlsx(filename, sheets, meta);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-elevated"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-green" strokeWidth={1.75} />
            Excel (.xlsx)
          </button>
          {csv && (
            <button
              type="button"
              onClick={() => {
                csv();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-left text-[13px]",
                "text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground",
              )}
            >
              <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
              CSV
            </button>
          )}
        </div>
      )}
    </div>
  );
}
