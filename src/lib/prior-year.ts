import "server-only";
import type { FinancialSnapshot } from "@/lib/types";
import { loadSnapshot, loadPriorYearSnapshot } from "@/lib/history";

/**
 * Prior-year comparatives for pages whose figures live in the snapshot rather than
 * in the always-present `priorYear` block (grants, commitments, jobs, ageing).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO KINDS OF "LAST YEAR", AND WHY THE DIFFERENCE MATTERS
 *
 * A YEAR-TO-DATE flow (grant income received so far, spend so far) must be compared
 * to the SAME point last year — July-to-July — or the comparison is a lie: one month
 * against a full year always looks like a 90% collapse. So we first try to load last
 * year's snapshot for the SAME month.
 *
 * A POINT-IN-TIME balance (debtors outstanding, open commitments, cash) has no
 * "year to date" — it's a photograph. For those, last year's CLOSE (its most recent
 * stored period) is the natural comparator, the way a Balance Sheet shows this year
 * beside last year-end. If the same month isn't archived, we fall back to that close
 * and flag it, so the page can label it honestly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PriorYearComparison {
  /** The prior financial year, e.g. "FY2025-26". */
  fyLabel: string;
  /** The prior period actually loaded, e.g. "July 2025" or "June 2026". */
  periodLabel: string;
  /** True = same month last year (fair YTD basis). False = last year's close (point-in-time). */
  sameMonth: boolean;
  /** The prior-year snapshot to read comparable figures from. */
  snapshot: FinancialSnapshot;
}

/** "FY2026-27" → "FY2025-26". Null on an unrecognised label. */
export function previousFyLabel(fy: string): string | null {
  const m = /^FY(\d{4})-(\d{2})$/.exec(fy);
  if (!m) return null;
  const start = Number(m[1]);
  const prevStart = start - 1;
  return `FY${prevStart}-${String((prevStart + 1) % 100).padStart(2, "0")}`;
}

/**
 * Load the best available prior-year snapshot for a comparison, or null when the
 * archive holds no earlier year yet (e.g. before FY2025-26 is backfilled).
 */
export async function loadPriorYear(current: FinancialSnapshot): Promise<PriorYearComparison | null> {
  const fy = current.period?.fyLabel;
  const month = current.period?.monthOfYear;
  if (!fy) return null;

  const prevFy = previousFyLabel(fy);

  // Preferred: the same month last year — a like-for-like year-to-date basis.
  if (prevFy && month) {
    const same = await loadSnapshot(prevFy, month);
    if (same) {
      return { fyLabel: prevFy, periodLabel: same.period?.label ?? prevFy, sameMonth: true, snapshot: same };
    }
  }

  // Fallback: the most recent stored period of any earlier year (usually year-end).
  const prior = await loadPriorYearSnapshot(fy);
  if (prior) {
    return {
      fyLabel: prior.period?.fyLabel ?? prevFy ?? "prior year",
      periodLabel: prior.period?.label ?? "last year",
      sameMonth: false,
      snapshot: prior,
    };
  }

  return null;
}

/**
 * Prior-year values for the dashboard KPI cards, keyed by the controller's metric
 * keys. Same-month year-to-date, so it lines up with the default council-wide view.
 */
export function priorDashboardStats(prior: FinancialSnapshot): Record<string, number> {
  const it = prior.incomeTotals;
  const income = it?.totalIncome ?? prior.revenueLines.reduce((a, r) => a + r.ytd, 0);
  const expenses = it?.totalExpenses ?? prior.departments.reduce((a, d) => a + d.ytdActual, 0);
  const net = it?.netResult ?? income - expenses;
  return {
    "total-income": income,
    "total-expenses": expenses,
    "net-result": net,
    "grant-funding": prior.grants.reduce((a, g) => a + g.total, 0),
    "revenue-centres": prior.revenueLines.reduce((a, r) => a + r.ytd, 0),
    "ytd-spend": prior.departments.reduce((a, d) => a + d.ytdActual, 0),
  };
}
