"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type { DataIssue } from "@/lib/data-quality";
import { cn } from "@/lib/utils";

/**
 * One indicator per page, replacing the inline caveat banners.
 *
 * Counts only warnings on the face of it — an "info" note shouldn't put an amber
 * dot on a page where nothing is wrong. Opens to the full list.
 */
export function DataQualityBadge({ issues }: { issues: DataIssue[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a panel you can't dismiss is a banner.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const warnings = issues.filter((i) => i.level === "warn");
  const clean = issues.length === 0;

  return (
    <div className="no-print relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={clean ? "All data checks passed" : `${issues.length} data notes`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
          clean
            ? "border-green/30 bg-green/5 text-green"
            : warnings.length > 0
              ? "border-amber/30 bg-amber/10 text-amber hover:bg-amber/15"
              : "border-border bg-elevated text-muted-foreground hover:text-foreground",
        )}
      >
        {clean ? (
          <>
            <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
            Checks passed
          </>
        ) : warnings.length > 0 ? (
          <>
            <AlertTriangle className="h-3 w-3" strokeWidth={2} />
            {warnings.length}
            {issues.length > warnings.length && (
              <span className="text-muted-foreground">+{issues.length - warnings.length}</span>
            )}
          </>
        ) : (
          <>
            <Info className="h-3 w-3" strokeWidth={2} />
            {issues.length}
          </>
        )}
      </button>

      {open && !clean && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(30rem,calc(100vw-2rem))] animate-in fade-in slide-in-from-top-1 rounded-lg border border-border bg-card shadow-xl shadow-black/40 duration-150">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Data notes ({issues.length})
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          <ul className="flex max-h-[24rem] flex-col gap-3 overflow-y-auto p-3">
            {issues.map((i) => (
              <li key={i.id} className="flex gap-2.5">
                {i.level === "warn" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber" strokeWidth={2} />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-foreground">{i.title}</span>
                    {i.owner && (
                      <span className="rounded-full border border-border bg-elevated px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                        {i.owner}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
