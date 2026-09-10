"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { CalendarRange, History, Loader2 } from "lucide-react";
import type { PeriodRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SelectField } from "@/components/kit/select-field";

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

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <SelectField
        ariaLabel="Financial year and period"
        icon={CalendarRange}
        value={value}
        onChange={go}
        disabled={pending || !hasHistory}
        title={hasHistory ? undefined : "Only one period has been synced so far"}
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
      </SelectField>

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
