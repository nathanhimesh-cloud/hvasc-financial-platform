"use client";

import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where the explanations go.
 *
 * Every page had grown two or three amber panels of methodology — why the ratio
 * is contextual, why the cash figure is a bound, why the prior year is used. All
 * of it true, all of it necessary *somewhere*, none of it something a CFO wants to
 * read past every single morning to reach the number.
 *
 * So it lives behind one icon. Present, one click away, and not in the way. The
 * one exception is a finding that demands ACTION — an unreconciled statement, a
 * debtors book that's two-thirds overdue — which stays on the page, because
 * hiding that would be the opposite of the point.
 */
export function InfoPopover({
  title = "About these figures",
  children,
  /** Draws attention to the icon when there's something genuinely notable inside. */
  notable,
}: {
  title?: string;
  children: React.ReactNode;
  notable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={title}
        aria-expanded={open}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
          "hover:border-[rgba(255,255,255,0.2)] hover:bg-elevated hover:text-foreground",
          open && "border-[rgba(255,255,255,0.2)] bg-elevated text-foreground",
          notable && !open && "border-gold/30 text-gold",
        )}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-10 z-50 w-[min(30rem,calc(100vw-3rem))] rounded-[var(--radius-lg)]",
            "border border-border bg-card p-4 shadow-xl shadow-black/40",
            "animate-in fade-in slide-in-from-top-1 duration-150",
          )}
        >
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <span className="text-[13px] font-semibold text-foreground">{title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-col gap-2.5 text-[12px] leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/** One labelled note inside an InfoPopover. */
export function InfoNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-foreground">{label}</div>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
