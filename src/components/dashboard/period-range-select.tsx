"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, History } from "lucide-react";
import type { MonthSelection } from "@/lib/period-range";
import { cn } from "@/lib/utils";

/**
 * One dropdown. Click a month, click another, and everything on the page shows
 * that period.
 *
 * This control has been through three shapes. A from/to pair of selects was two
 * controls where one would do; a checkbox list with financial-year tabs and an
 * archived-snapshot panel was accurate but cluttered, and nobody wants to operate
 * a form to answer "how did August go". A plain list you click twice is what a
 * date-range picker is, so that is what this is.
 *
 * The months of BOTH financial years live in the one list, newest first, under a
 * quiet year heading. A period cannot straddle 30 June — the ledger closes and
 * reopens at zero, so a total spanning both years would be adding up movements
 * either side of a reset — and rather than refusing the click, picking a month in
 * the other year simply starts a fresh period there. Nothing to read, nothing to
 * undo.
 */
export interface MonthGroup {
  fy: "current" | "prior";
  label: string;
  /** Oldest first; rendered newest first. */
  months: { idx: number; month: string }[];
}

export function PeriodRangeSelect({
  groups,
  fy,
  selectedMonths,
  onChange,
  enabled,
  disabledHint,
  isLatest,
}: {
  groups: MonthGroup[];
  /** Which year the current selection belongs to. */
  fy: "current" | "prior";
  selectedMonths: MonthSelection;
  onChange: (next: { fy: "current" | "prior"; months: MonthSelection }) => void;
  enabled: boolean;
  disabledHint?: string;
  isLatest: boolean;
}) {
  const [open, setOpen] = useState(false);
  // First month of a period being picked, waiting for its partner.
  const [anchor, setAnchor] = useState<{ fy: "current" | "prior"; idx: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAnchor(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAnchor(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const active = groups.find((g) => g.fy === fy) ?? groups[0];
  const all = active?.months.map((m) => m.idx) ?? [];
  const isWholeYear = all.length > 0 && selectedMonths.length === all.length;
  const nameOf = (g: MonthGroup, idx: number) => g.months.find((m) => m.idx === idx)?.month ?? `M${idx}`;

  const first = selectedMonths[0];
  const last = selectedMonths[selectedMonths.length - 1];
  const label = !active
    ? "Period"
    : isWholeYear
      ? `${active.label} · all months`
      : first === last
        ? `${nameOf(active, first)} ${yearOf(active, first)}`
        : `${nameOf(active, first)} – ${nameOf(active, last)} ${yearOf(active, last)}`;

  /** Click a month: open a period, or close the one already open. */
  const pick = (g: MonthGroup, idx: number) => {
    // Anchor in a different year? That period can't span the boundary, so this
    // click starts a new one here instead of being rejected.
    if (!anchor || anchor.fy !== g.fy) {
      setAnchor({ fy: g.fy, idx });
      onChange({ fy: g.fy, months: [idx] });
      return;
    }
    const lo = Math.min(anchor.idx, idx);
    const hi = Math.max(anchor.idx, idx);
    const span = g.months.map((m) => m.idx).filter((m) => m >= lo && m <= hi);
    onChange({ fy: g.fy, months: span });
    setAnchor(null);
    setOpen(false);
  };

  const inSelection = (g: MonthGroup, idx: number) => g.fy === fy && selectedMonths.includes(idx);

  return (
    <div className="no-print relative" ref={ref}>
      <button
        type="button"
        onClick={() => enabled && setOpen((v) => !v)}
        disabled={!enabled}
        title={enabled ? undefined : disabledHint}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-elevated pl-3 pr-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-gold/40 disabled:opacity-50"
      >
        <CalendarRange className="h-3.5 w-3.5 flex-shrink-0 text-gold" strokeWidth={1.75} />
        {label}
        <ChevronDown
          className={cn("h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {!isLatest && (
        <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 align-middle font-mono text-[10px] uppercase tracking-[0.06em] text-amber">
          <History className="h-3 w-3" strokeWidth={2} />
          Archived
        </span>
      )}

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-11 z-50 w-[12.5rem] overflow-hidden rounded-md border border-border bg-card py-1 shadow-xl shadow-black/40"
        >
          {/* Shown only while a period is half-picked. At rest the list stays as
              plain as the control it replaces; the instruction appears exactly
              when it's useful and disappears again. */}
          {anchor && (
            <p className="mb-1 border-b border-border px-3 pb-1.5 text-center text-[11px] text-muted-foreground">
              From {nameOf(groups.find((g) => g.fy === anchor.fy)!, anchor.idx)} — pick the last month
            </p>
          )}

          <div className="max-h-[21rem] overflow-y-auto">
            {groups.map((g) => (
              <div key={g.fy} role="group" aria-label={g.label}>
                {/* The financial year, as an optgroup heading: centred, bold,
                    unclickable. Double-click it to take the whole year — the one
                    affordance kept off the surface, because a visible "All" link
                    beside every heading was more furniture than the list needed. */}
                <div
                  onDoubleClick={() => {
                    onChange({ fy: g.fy, months: g.months.map((m) => m.idx) });
                    setAnchor(null);
                    setOpen(false);
                  }}
                  title={`Double-click for all of ${g.label}`}
                  className="select-none px-3 py-1 text-center text-[12px] font-semibold text-foreground"
                >
                  {g.label}
                </div>
                {[...g.months].reverse().map((m) => {
                  const on = inSelection(g, m.idx);
                  const isAnchor = anchor?.fy === g.fy && anchor.idx === m.idx;
                  return (
                    <button
                      key={`${g.fy}-${m.idx}`}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => pick(g, m.idx)}
                      className={cn(
                        "flex w-full items-center justify-center px-3 py-[5px] text-center text-[13px] transition-colors",
                        isAnchor || on
                          ? "bg-gold font-medium text-black"
                          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                      )}
                    >
                      {m.month} {yearOf(g, m.idx)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The calendar year a financial-year month falls in. The FY runs July→June, so
 * months 1–6 are the year the label opens with and 7–12 have rolled into the
 * next one: FY2026-27 month 7 is January 2027, not January 2026.
 */
function yearOf(g: MonthGroup, idx: number): string {
  const start = Number(g.label.replace(/^FY/i, "").split("-")[0]);
  if (!Number.isFinite(start)) return "";
  return String(idx <= 6 ? start : start + 1);
}
