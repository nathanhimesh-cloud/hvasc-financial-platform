"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CalendarRange, Check, ChevronDown, History, Loader2 } from "lucide-react";
import type { PeriodRef } from "@/lib/types";
import type { MonthSelection } from "@/lib/period-range";
import { isYearToDate, normaliseMonths } from "@/lib/period-range";
import { cn } from "@/lib/utils";

/**
 * The period control: a checkbox multi-select over the months in this financial
 * year, plus a way into an archived snapshot.
 *
 * Checkboxes rather than a from/to pair, because ticking boxes lets you take July
 * and September without August — a real question ("what did the two quarter-end
 * months cost?") that endpoints cannot express. Everything downstream sums per
 * month, so a scattered selection totals exactly the months ticked.
 *
 * Selected months show as chips on the closed button, so the page never displays
 * a filtered figure without saying what it is filtered to.
 *
 * No search box: twelve months is a list you read, not one you search, and a
 * search field over twelve items is furniture.
 */
export function PeriodRangeSelect({
  months,
  selectedMonths,
  latest,
  onMonths,
  rangeEnabled,
  rangeDisabledHint,
  periods,
  selected,
  isLatest,
  fy,
  onFy,
  currentFyLabel,
  priorFyLabel,
}: {
  /** Months in the CURRENT snapshot, oldest first. */
  months: { idx: number; month: string }[];
  selectedMonths: MonthSelection;
  latest: number;
  onMonths: (next: MonthSelection) => void;
  rangeEnabled: boolean;
  rangeDisabledHint?: string;
  /** Archived snapshots, newest first. */
  periods: PeriodRef[];
  selected: PeriodRef;
  isLatest: boolean;
  /** Which financial year the checkboxes below belong to. */
  fy: "current" | "prior";
  onFy: (next: "current" | "prior") => void;
  currentFyLabel: string;
  /** Undefined when the snapshot carries no prior-year monthly series. */
  priorFyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const sel = normaliseMonths(selectedMonths, latest);
  const allOn = isYearToDate(sel, latest);
  const isOn = (idx: number) => sel.includes(idx);
  // On the prior year the calendar year differs from the loaded snapshot label,
  // so take it from the month itself rather than from the snapshot.
  const fyYear =
    fy === "prior"
      ? (months[months.length - 1]?.month ?? "").split(" ")[1] ?? (priorFyLabel ?? "")
      : selected.periodLabel.split(" ")[1] ?? "";

  const toggle = (idx: number) => {
    const next = isOn(idx) ? sel.filter((m) => m !== idx) : [...sel, idx];
    // Unticking the last box would blank the page; treat it as "back to all".
    onMonths(next.length ? next : months.map((m) => m.idx));
  };

  const go = (p: PeriodRef) => {
    startTransition(() => router.push(`${pathname}?fy=${encodeURIComponent(p.fyLabel)}&m=${p.periodMonth}`));
    setOpen(false);
  };

  const earlier = periods.filter(
    (p) => !(p.fyLabel === selected.fyLabel && p.periodMonth === selected.periodMonth),
  );

  // Chips on the closed button. Past three, the count says it better.
  const chips = allOn ? [] : sel.map((m) => months.find((x) => x.idx === m)?.month ?? `M${m}`);

  return (
    <div className="no-print relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 max-w-[24rem] items-center gap-2 rounded-md border border-border bg-elevated pl-3 pr-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-gold/40"
      >
        <CalendarRange className="h-3.5 w-3.5 flex-shrink-0 text-gold" strokeWidth={1.75} />

        {/* Chips first, THEN the year — so a single month reads "Aug 2026" the way
            anyone would say it, not "2026 Aug". */}
        {allOn ? (
          <span className="flex-shrink-0">
            {fy === "prior" ? `${priorFyLabel} · full year` : `${selected.periodLabel} · YTD`}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1 overflow-hidden">
              {chips.length <= 3 ? (
                chips.map((c) => (
                  <span
                    key={c}
                    className="rounded border border-gold/40 bg-gold-dim px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-gold-light"
                  >
                    {c}
                  </span>
                ))
              ) : (
                <span className="rounded border border-gold/40 bg-gold-dim px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-gold-light">
                  {chips.length} months
                </span>
              )}
            </span>
            <span className="flex-shrink-0 text-muted-foreground">{fyYear}</span>
          </>
        )}

        {pending && <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-muted-foreground" strokeWidth={2} />}
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
          aria-multiselectable
          className="absolute left-0 top-11 z-50 w-[17rem] overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-black/40"
        >
          <div className="border-b border-border px-3 py-2">
            {/* Financial-year switch. Two tabs, not one merged list, because a
                selection can't span both: the ledger closes at 30 June and
                reopens at zero, so adding July 2025 to August 2026 would be
                summing movements either side of a reset. */}
            {priorFyLabel ? (
              <div className="flex items-center overflow-hidden rounded-md border border-border">
                {[
                  { key: "current" as const, label: currentFyLabel },
                  { key: "prior" as const, label: priorFyLabel },
                ].map((y) => (
                  <button
                    key={y.key}
                    type="button"
                    onClick={() => onFy(y.key)}
                    className={cn(
                      "flex-1 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
                      fy === y.key
                        ? "bg-gold-dim text-gold-light"
                        : "bg-elevated text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {y.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {currentFyLabel}
              </span>
            )}
            {!rangeEnabled && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {rangeDisabledHint ?? "Only one month is available."}
              </p>
            )}
          </div>

          <div className="max-h-[17rem] overflow-y-auto py-1">
            <Row
              label="All months"
              checked={allOn}
              disabled={!rangeEnabled}
              onToggle={() => onMonths(months.map((m) => m.idx))}
              strong
            />
            {months.map((m) => (
              <Row
                key={m.idx}
                label={`${m.month} ${fyYear}`}
                checked={isOn(m.idx)}
                disabled={!rangeEnabled}
                onToggle={() => toggle(m.idx)}
              />
            ))}
          </div>

          {earlier.length > 0 && (
            <div className="border-t border-border bg-elevated/40 px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Earlier periods
              </span>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                A saved snapshot from a previous sync — a different dataset, so it
                can&apos;t be combined with the months above.
              </p>
              <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {earlier.map((p) => (
                  <button
                    key={`${p.fyLabel}|${p.periodMonth}`}
                    type="button"
                    onClick={() => go(p)}
                    className="rounded border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold-light"
                  >
                    {p.periodLabel}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  checked,
  disabled,
  onToggle,
  strong,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] transition-colors",
        "hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40",
        strong ? "font-semibold text-foreground" : "text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors",
          checked ? "border-gold bg-gold text-black" : "border-border bg-elevated",
        )}
      >
        {checked && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
      {label}
    </button>
  );
}
