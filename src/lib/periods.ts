import "server-only";
import { getSnapshot, getSnapshotForPeriod } from "@/lib/data";
import { listPeriods, type PeriodRef } from "@/lib/history";
import type { FinancialSnapshot } from "@/lib/types";

/**
 * Period navigation.
 *
 * Every push archives its own (financial year, period) row in Postgres, so the
 * platform accumulates history month by month and year over year. This resolves
 * which of those periods a page should render, from `?fy=FY2025-26&m=12`.
 *
 * The live snapshot is always offered as a period even when Postgres isn't
 * configured — so with no database the selector simply shows one option and the
 * app behaves exactly as it did before.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export interface PeriodView {
  snapshot: FinancialSnapshot;
  /** Every selectable period, newest first. */
  periods: PeriodRef[];
  selected: PeriodRef;
  /** False when the user is looking at an archived period rather than the latest. */
  isLatest: boolean;
  /** True when more than one period exists, i.e. the selector is worth showing. */
  hasHistory: boolean;
}

function same(a: PeriodRef, b: PeriodRef): boolean {
  return a.fyLabel === b.fyLabel && a.periodMonth === b.periodMonth;
}

/** Newest first. FY labels sort correctly as strings ("FY2026-27" > "FY2025-26"). */
function newestFirst(a: PeriodRef, b: PeriodRef): number {
  return b.fyLabel.localeCompare(a.fyLabel) || b.periodMonth - a.periodMonth;
}

function livePeriodOf(snapshot: FinancialSnapshot): PeriodRef {
  return {
    fyLabel: snapshot.period.fyLabel,
    periodMonth: snapshot.period.monthOfYear,
    periodLabel: snapshot.period.label,
    generatedAt: snapshot.meta?.generatedAt?.slice(0, 10) ?? null,
  };
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Calendar date bounds for an Australian financial-year period. `periodMonth` is
 * 1 = July … 12 = June, and "FY2025-26" starts in July 2025.
 *
 * Used to bound a ledger query to the period on screen — otherwise selecting an
 * archived month would still list the whole year's transactions beneath it.
 */
export function periodDateRange(fyLabel: string, periodMonth: number): { from: string; to: string } | null {
  const m = fyLabel.match(/^FY(\d{4})-\d{2}$/);
  if (!m || periodMonth < 1 || periodMonth > 12) return null;
  const startYear = Number(m[1]);

  // Jul–Dec fall in the starting calendar year; Jan–Jun in the next one.
  const calMonth = periodMonth <= 6 ? periodMonth + 6 : periodMonth - 6;
  const calYear = periodMonth <= 6 ? startYear : startYear + 1;

  const pad = (n: number) => String(n).padStart(2, "0");
  // Day 0 of the following month is the last day of this one — leap-year safe.
  const lastDay = new Date(Date.UTC(calYear, calMonth, 0)).getUTCDate();
  return {
    from: `${startYear}-07-01`,
    to: `${calYear}-${pad(calMonth)}-${pad(lastDay)}`,
  };
}

export async function resolvePeriodView(searchParams: SearchParams = {}): Promise<PeriodView> {
  const live = await getSnapshot();
  const livePeriod = livePeriodOf(live);

  const stored = await listPeriods();
  const periods = [livePeriod, ...stored.filter((p) => !same(p, livePeriod))].sort(newestFirst);

  const fy = first(searchParams.fy);
  const month = Number(first(searchParams.m));
  const requested =
    fy && Number.isInteger(month)
      ? periods.find((p) => p.fyLabel === fy && p.periodMonth === month)
      : undefined;

  // No request, an unknown period, or the live one → render the live snapshot.
  if (!requested || same(requested, livePeriod)) {
    return {
      snapshot: live,
      periods,
      selected: livePeriod,
      isLatest: same(periods[0], livePeriod),
      hasHistory: periods.length > 1,
    };
  }

  return {
    snapshot: await getSnapshotForPeriod(requested.fyLabel, requested.periodMonth),
    periods,
    selected: requested,
    isLatest: same(periods[0], requested),
    hasHistory: periods.length > 1,
  };
}
