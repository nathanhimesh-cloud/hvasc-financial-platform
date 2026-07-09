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

      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" strokeWidth={2} />}

      {!isLatest && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10",
            "px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-amber",
          )}
        >
          <History className="h-3 w-3" strokeWidth={2} />
          Archived period — not the latest
        </span>
      )}

      {!hasHistory && (
        <span className="font-mono text-[10px] text-muted-foreground">
          one period synced so far
        </span>
      )}

      {selected.generatedAt && (
        <span className="font-mono text-[10px] text-muted-foreground">
          data as at {selected.generatedAt}
        </span>
      )}
    </div>
  );
}
