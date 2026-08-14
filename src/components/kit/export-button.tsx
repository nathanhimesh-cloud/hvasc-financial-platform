"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText, Printer, ChevronDown } from "lucide-react";
import { downloadXlsx, type XlsxSheet } from "@/lib/export-xlsx";
import { cn } from "@/lib/utils";

/**
 * The one export control, used on every page for consistency (Hazel, 14 Aug: keep
 * a single export icon everywhere, and fold Print/PDF into it rather than a separate
 * button). Clicking the icon opens a menu with, in order:
 *
 *   Print / PDF   — the browser print dialog ("Save as PDF"); `@media print` in
 *                   globals.css swaps to a light palette and hides chrome.
 *   Excel (.xlsx) — a real workbook (only when the page supplies table data).
 *   CSV           — plain text, for piping elsewhere (only when supplied).
 *
 * Print is ALWAYS offered, so even a page with no tabular export still exposes the
 * same control. Excel/CSV appear only when there's data to write, so the menu never
 * shows a dead option.
 *
 * On why Excel and not just CSV: CSV mangles GL codes — "0205-4147" becomes April
 * 2147 in Excel's Australian-locale importer — so a real .xlsx is the safe default.
 */
export function ExportButton<T>({
  filename,
  sheets,
  meta,
  csv,
  label = "Export",
}: {
  filename?: string;
  sheets?: XlsxSheet<T>[];
  meta?: { period?: string; generatedAt?: string };
  /** Optional CSV fallback — the page's own per-table exporter. */
  csv?: () => void;
  label?: string;
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

  const hasXlsx = !!filename && !!sheets && sheets.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="no-print inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-[var(--hairline)] hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-md border border-border bg-card shadow-xl shadow-black/40">
          {/* Print / PDF — always available. */}
          <MenuItem
            icon={<Printer className="h-3.5 w-3.5" strokeWidth={1.75} />}
            onClick={() => {
              setOpen(false);
              // Let the menu close before the print dialog paints.
              setTimeout(() => window.print(), 0);
            }}
          >
            Print / PDF
          </MenuItem>

          {hasXlsx && (
            <MenuItem
              border
              icon={<FileSpreadsheet className="h-3.5 w-3.5 text-green" strokeWidth={1.75} />}
              onClick={() => {
                downloadXlsx(filename!, sheets!, meta);
                setOpen(false);
              }}
            >
              Excel (.xlsx)
            </MenuItem>
          )}

          {csv && (
            <MenuItem
              border
              icon={<FileText className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => {
                csv();
                setOpen(false);
              }}
            >
              CSV
            </MenuItem>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  border,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  border?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-elevated",
        border && "border-t border-border",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
