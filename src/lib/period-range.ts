import type { AccountMonthly, AccountRef, MonthlyStatement } from "@/lib/types";

/**
 * Month filtering for the dashboard (Sep 2026 review: a checkbox multi-select,
 * "this is how it should select a date range").
 *
 * A selection is a SET of financial-year month indices, 1 = July — not a from/to
 * pair. That follows from the control: tick boxes and you can pick July and
 * September without August, which no pair of endpoints can express. Everything
 * here therefore sums PER MONTH rather than subtracting two endpoints.
 *
 * WHY THE MOVEMENT MATH LOOKS LIKE THIS. Practical stores balances CUMULATIVE to
 * each period (knowledge-base 01: GLBAL.BALANCE is year-to-date, not the month's
 * movement). So one month's movement is:
 *
 *     movement(m) = cumulative[m] − cumulative[m − 1]
 *
 * and July (m = 1) has nothing to subtract, because the year started at zero.
 * A selection's total is the sum of its months' movements, which for a
 * contiguous run collapses back to cumulative[last] − cumulative[first − 1].
 *
 * Council totals come from `monthlyStatements`, which the feed builds with a SQL
 * SUM over the whole ledger — authoritative, and not something to re-derive here.
 * Department figures come from `accountMonthly` (the per-account cumulative
 * series) joined through each account's department, because the monthly series
 * carries council totals only and has no per-directorate split of its own.
 */

/** Financial-year month indices, 1 = July. Order and duplicates don't matter. */
export type MonthSelection = number[];

export interface RangeTotals {
  income: number;
  expenses: number;
  net: number;
}

export interface DeptRangeFigures {
  expense: number;
  expenseBudget: number;
  revenue: number;
}

type Series = { bal: (number | undefined)[]; bud: (number | undefined)[] };

/**
 * Per-account cumulative series, keyed by the FULL GL code.
 *
 * NOT the 9-character prefix. `monthlyMapFromSnapshot` in budget-report.ts keys
 * on `code.slice(0, 9)`, which collapses siblings that differ only in the last
 * segment — Hope Vale has 7816-1100-0000 and 7816-1100-0002 — so one silently
 * overwrites the other. The full code is the account's identity and is what
 * `snapshot.accounts[]` carries, so join on that.
 */
export function accountSeries(accountMonthly?: AccountMonthly[]): Map<string, Series> {
  const map = new Map<string, Series>();
  for (const a of accountMonthly ?? []) {
    const bal: (number | undefined)[] = [];
    const bud: (number | undefined)[] = [];
    for (const mo of a.months) {
      bal[mo.m] = mo.balance;
      bud[mo.m] = mo.budget;
    }
    map.set(a.code.trim(), { bal, bud });
  }
  return map;
}

/**
 * The cumulative value AT month `m`.
 *
 * An account with no posting in a month has no row for it, and a missing row is
 * not a zero balance — it means "unchanged since the last one". Reading it as 0
 * would turn a quiet month into a full reversal of the account and then back
 * again. Walk back to the most recent month that does have a value.
 */
function cumAt(arr: (number | undefined)[], m: number): number {
  for (let i = Math.min(m, arr.length - 1); i >= 1; i--) {
    const v = arr[i];
    if (v !== undefined) return v;
  }
  return 0;
}

/** Movement in a single month, then summed across the selection. */
function movementOver(arr: (number | undefined)[], months: MonthSelection): number {
  let total = 0;
  for (const m of months) total += cumAt(arr, m) - (m > 1 ? cumAt(arr, m - 1) : 0);
  return total;
}

/** Sorted, de-duplicated, inside 1..latest. Empty input means "all months". */
export function normaliseMonths(months: MonthSelection, latest: number): MonthSelection {
  const all = Array.from({ length: latest }, (_, i) => i + 1);
  const clean = [...new Set(months)].filter((m) => m >= 1 && m <= latest).sort((a, b) => a - b);
  // Never render an empty dashboard because every box got unticked.
  return clean.length ? clean : all;
}

/** Is every available month selected — i.e. the default, whole year to date? */
export function isYearToDate(months: MonthSelection, latest: number): boolean {
  return normaliseMonths(months, latest).length === latest;
}

/** Are the selected months an unbroken run? Only affects how the label reads. */
function isContiguous(months: MonthSelection): boolean {
  for (let i = 1; i < months.length; i++) if (months[i] !== months[i - 1] + 1) return false;
  return true;
}

/**
 * Council income / expenses / net for the selection. Each month contributes its
 * own movement, so a non-contiguous pick totals only the months ticked.
 */
export function rangeCouncilTotals(
  statements: MonthlyStatement[] | undefined,
  months: MonthSelection,
): RangeTotals | null {
  const ms = statements ?? [];
  if (!ms.length) return null;

  // Same "last known value" rule as the per-account series: a month with no
  // statement inherits the one before it rather than reading as zero.
  const at = (idx: number) => {
    let hit: (typeof ms)[number] | null = null;
    for (const s of ms) if (s.idx <= idx && (!hit || s.idx > hit.idx)) hit = s;
    return hit;
  };

  let income = 0;
  let expenses = 0;
  let matched = 0;
  for (const m of months) {
    const end = at(m);
    if (!end) continue;
    matched++;
    const start = m > 1 ? at(m - 1) : null;
    income += end.totalIncome - (start?.totalIncome ?? 0);
    expenses += end.totalExpenses - (start?.totalExpenses ?? 0);
  }
  if (!matched) return null;
  return { income, expenses, net: income - expenses };
}

/**
 * Per-department expense, expense budget and revenue for the selection.
 *
 * Returns null when the feed hasn't shipped `accountMonthly` — an older snapshot,
 * or one built before the per-account series was added. Callers should fall back
 * to the snapshot's own department figures and disable the control rather than
 * render zeros, which read as "this department spent nothing".
 */
export function rangeDepartments(
  accounts: AccountRef[] | undefined,
  accountMonthly: AccountMonthly[] | undefined,
  months: MonthSelection,
): Map<string, DeptRangeFigures> | null {
  const series = accountSeries(accountMonthly);
  if (series.size === 0) return null;

  const out = new Map<string, DeptRangeFigures>();
  let matched = 0;

  for (const a of accounts ?? []) {
    if (!a.departmentId) continue; // unmapped: it belongs in the reconciling row, not a department
    const s = series.get(a.code.trim());
    if (!s) continue;
    matched++;

    const cur = out.get(a.departmentId) ?? { expense: 0, expenseBudget: 0, revenue: 0 };
    if (a.kind === "expense") {
      cur.expense += movementOver(s.bal, months);
      cur.expenseBudget += movementOver(s.bud, months);
    } else if (a.kind === "revenue") {
      cur.revenue += movementOver(s.bal, months);
    }
    out.set(a.departmentId, cur);
  }

  // A series that joins to nothing is a broken join, not an empty council.
  return matched > 0 ? out : null;
}

/**
 * The selected months as "YYYY-MM" keys, for filtering the daily series.
 *
 * The financial year runs July→June, so FY month 1 is July of the year the label
 * OPENS with: "FY2026-27" starts July 2026, and month 7 (January) has already
 * rolled into 2027. Getting that backwards is what once produced a "Jul 2027"
 * period label for July 2026.
 */
export function monthKeys(months: MonthSelection, fyLabel: string): Set<string> {
  const startYear = Number(String(fyLabel).replace(/^FY/i, "").split("-")[0]);
  const keys = new Set<string>();
  if (!Number.isFinite(startYear)) return keys;
  for (const m of months) {
    const zeroBased = 6 + (m - 1); // 6 = July
    const y = startYear + Math.floor(zeroBased / 12);
    const cal = (zeroBased % 12) + 1;
    keys.add(`${y}-${String(cal).padStart(2, "0")}`);
  }
  return keys;
}

/**
 * How the selection reads in a chip or a panel title. Year-to-date keeps the
 * wording the Council already recognises; a run is spelled end to end; a
 * scattered pick lists the months, and past four just counts them, because a
 * title is not a place to read out eleven abbreviations.
 */
export function rangeLabel(
  months: MonthSelection,
  monthName: (idx: number) => string,
  latest: number,
): string {
  const sel = normaliseMonths(months, latest);
  if (isYearToDate(sel, latest)) return `YTD to ${monthName(sel[sel.length - 1])}`;
  if (sel.length === 1) return monthName(sel[0]);
  if (isContiguous(sel)) return `${monthName(sel[0])}–${monthName(sel[sel.length - 1])}`;
  if (sel.length <= 4) return sel.map(monthName).join(", ");
  return `${sel.length} months`;
}
