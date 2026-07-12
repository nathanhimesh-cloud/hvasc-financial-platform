"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { CalendarRange, History, Loader2 } from "lucide-react";
import type { PeriodRef } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Financial-year / period navigation.
 *
 * Reads its state from the server (`selected`) and writes it to the URL, so a
 * chosen period is shareable, bookmarkable, and survives a refresh. Every page
 * that renders figures resolves the same `?fy=&m=` pair, so navigation between
 * pages keeps the period.
 *
 * When the user is on an archived period we say so loudly — a stale figure that
 * looks live is the single most dangerous thing this platform could show.
 */
export function PeriodSelector({
  periods,
  selected,
  isLatest,
  hasHistory,
}: {
  periods: PeriodRef[];
  selected: PeriodRef;
  isLatest: boolean;
  hasHistory: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // History accumulates one period per sync. With a single stored period the
  // control still renders — disabled, and saying why — because a selector that
  // vanishes reads as a missing feature rather than an empty archive.
  const value = `${selected.fyLabel}|${selected.periodMonth}`;

  const go = (next: string) => {
    const [fy, m] = next.split("|");
    startTransition(() => router.push(`${pathname}?fy=${encodeURIComponent(fy)}&m=${m}`));
  };

  // Group by financial year so a multi-year register stays readable.
  const years = [...new Set(periods.map((p) => p.fyLabel))];

  // `periods` arrives newest-first (the dropdown wants that). A slider reads
  // left-to-right as time moving forward, so it needs the reverse.
  const ordered = [...periods].reverse();
  const sliderIndex = Math.max(
    0,
    ordered.findIndex((p) => p.fyLabel === selected.fyLabel && p.periodMonth === selected.periodMonth),
  );
  const oldest = ordered[0];
  const newest = ordered[ordered.length - 1];

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <label className="relative flex items-center">
        <CalendarRange
          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-gold"
          strokeWidth={1.75}
        />
        <select
          aria-label="Financial year and period"
          value={value}
          onChange={(e) => go(e.target.value)}
          disabled={pending || !hasHistory}
          title={hasHistory ? undefined : "Only one period has been synced so far"}
          className="h-9 rounded-md border border-border bg-elevated pl-8 pr-8 text-[13px] font-medium text-foreground outline-none transition-colors focus:border-gold/40 disabled:opacity-60"
        >
          {years.map((fy) => (
            <optgroup key={fy} label={fy}>
              {periods
                .filter((p) => p.fyLabel === fy)
                .map((p) => (
                  <option key={`${p.fyLabel}|${p.periodMonth}`} value={`${p.fyLabel}|${p.periodMonth}`}>
                    {p.periodLabel}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      {/* Slider over the same periods, oldest -> newest. Scrubbing a timeline is
          faster than hunting a dropdown once a couple of years have accumulated.
          Both controls write the same URL, so they can't disagree. */}
      {hasHistory && (
        <label className="flex items-center gap-2">
          <span className="sr-only">Scrub period</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
            {oldest.periodLabel}
          </span>
          <input
            type="range"
            min={0}
            max={ordered.length - 1}
            step={1}
            value={sliderIndex}
            disabled={pending}
            onChange={(e) => {
              const p = ordered[Number(e.target.value)];
              if (p) go(`${p.fyLabel}|${p.periodMonth}`);
            }}
            aria-label={`Period: ${selected.periodLabel}`}
            className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-elevated accent-gold disabled:opacity-50"
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
            {newest.periodLabel}
          </span>
        </label>
      )}

      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" strokeWidth={2} />}

      {/*
        ONE chip, not three.
        This control used to end with three separate notes — "archived period",
        "one period synced so far", and "data as at ...". Two of those are
        reassurance, not information, and they appeared at the top of every single
        screen. The provenance now lives behind the page's info icon.

        The archived-period warning STAYS on the page, because a stale figure that
        looks live is the most dangerous thing this platform could show.
      */}
      {!isLatest && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10",
            "px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-amber",
          )}
        >
          <History className="h-3 w-3" strokeWidth={2} />
          Archived
        </span>
      )}
    </div>
  );
}
