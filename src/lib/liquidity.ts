import type { FinancialSnapshot } from "@/lib/types";
import type { GrantFigures } from "@/lib/grants";

/**
 * Restricted vs unrestricted cash, and the liquidity rule (CFO recommendation C1).
 *
 * Of Hope Vale's ~$65M cash, much is **unspent grant money that can only be used
 * for its funded purpose**. Total cash alone badly overstates what the Council can
 * actually choose to spend. So:
 *
 *   restricted cash   = unspent money on grants the register flags "Restricted"
 *                       (income received to date - spent to date, floored at 0)
 *   unrestricted cash = total cash - restricted cash
 *   runway            = months of operating expenditure the unrestricted cash covers
 *
 * Sector guidance is to hold at least three months' operating expenditure.
 *
 * IMPORTANT — these are BOUNDS, not exact figures. The Grant Register does not
 * carry an opening cash balance for every restricted grant, and 21 restricted
 * grants have no job code so their spend-to-date is unknowable. Every unmeasurable
 * restricted dollar makes restricted cash too LOW and therefore unrestricted cash
 * and the runway too HIGH. We report restricted as a floor and unrestricted as a
 * ceiling, and say so. This resolves once the Council supplies opening balances at
 * 30 Jun 26 and job codes for the remaining grants.
 */

/**
 * The Unrestricted Cash Expense Cover benchmark for Hope Vale.
 *
 * NOT the generic 3-month sector rule of thumb. Hope Vale is a **Tier 8** council
 * under the Financial Management (Sustainability) Guideline 2024, and Tier 8's
 * published target is "greater than 4 months" — confirmed from the Council's own
 * audited FY2025 Financial Sustainability Statement, where they reported 46.11
 * months against that target.
 */
export const MIN_MONTHS_COVER = 4;

/** Current-asset lines that represent cash or a bank account. */
const CASH_LINE = /cash|bank|qtc|maxi[\s-]?direct/i;

export interface CashBreakdown {
  totalCash: number;
  /** Known restricted cash. A LOWER bound — see `unmeasured`. */
  restrictedCash: number;
  /** Total less known restrictions. An UPPER bound. */
  unrestrictedCash: number;
  /** Monthly operating expenditure used as the runway denominator. */
  monthlyOpex: number;
  /** Months of opex covered by unrestricted cash. An UPPER bound. null when opex is unknown. */
  monthsCover: number | null;
  /** True when even the optimistic cover is below the sector minimum — unambiguously bad. */
  belowMinimum: boolean;
  /** True when every restricted grant could be measured, so the figures are exact. */
  exact: boolean;
  /** Restricted grants we could not fully measure, and why. */
  unmeasured: { missingOpeningBalance: number; missingJobCodes: number; count: number };
  /** The individual cash/bank lines we summed, for transparency. */
  cashLines: { label: string; amount: number }[];
}

/**
 * Sum every cash/bank line on the balance sheet. The Balance Sheet lists these as
 * separate raw accounts (Bank QTC, Maxi-Direct, ANZ...) because Practical's FR
 * module — which would roll them into one "Cash and cash equivalents" line — isn't
 * readable yet.
 */
export function totalCash(snapshot: FinancialSnapshot): { total: number; lines: { label: string; amount: number }[] } {
  const lines = (snapshot.balanceSheet?.currentAssets.lines ?? []).filter((l) => CASH_LINE.test(l.label));
  return { total: lines.reduce((a, l) => a + l.amount, 0), lines };
}

/**
 * Monthly CASH operating expenditure — the runway denominator.
 *
 * Two things this must get right, and the first version got both wrong:
 *
 * 1. DEPRECIATION IS NOT CASH. It consumes no bank balance, so it cannot shorten
 *    a cash runway. The expense totals in the snapshot INCLUDE it (Practical posts
 *    it to 1282-2000-0100 / -0001, which sit inside the ISCONTROL='Y' expense sum),
 *    so it has to be subtracted here. Leaving it in inflated the denominator by
 *    ~37% and understated the runway: it reported 36 months where the Council's own
 *    audited FY2025 statement reports 46.11.
 *
 * 2. Early in a financial year the year-to-date figure is near zero — at month 1 it
 *    is actually NEGATIVE, because June's accruals are reversing — and dividing by
 *    it gives a meaningless runway. So we fall back to the prior year's average
 *    cash month.
 */
function monthlyOpexOf(snapshot: FinancialSnapshot): number {
  const month = snapshot.period?.monthOfYear ?? 0;
  const ytdCash =
    (snapshot.incomeTotals?.totalExpenses ?? 0) - (snapshot.statutory?.ytd?.depreciation ?? 0);
  if (ytdCash > 0 && month > 0) {
    const perMonth = ytdCash / month;
    // Guard against one tiny opening month distorting the run rate.
    if (perMonth > 1000) return perMonth;
  }
  const prior = snapshot.priorYear;
  const priorCash = (prior?.expenses ?? 0) - (prior?.depreciation ?? 0);
  return priorCash > 0 ? priorCash / 12 : 0;
}

export function cashBreakdown(snapshot: FinancialSnapshot, grants: GrantFigures[]): CashBreakdown {
  const { total, lines } = totalCash(snapshot);
  const restrictedGrants = grants.filter((g) => g.entry.active && g.entry.restricted);

  // Unspent money on restricted grants is not the Council's to spend freely.
  const restrictedCash = restrictedGrants.reduce((a, g) => a + Math.max(g.incomeToDate - g.expenseToDate, 0), 0);

  // A grant we can't measure on either side silently understates the restriction.
  const missingOpeningBalance = restrictedGrants.filter((g) => g.openingIncome === 0).length;
  const missingJobCodes = restrictedGrants.filter((g) => g.entry.jobCodes.length === 0).length;
  const unmeasuredCount = restrictedGrants.filter(
    (g) => g.openingIncome === 0 || g.entry.jobCodes.length === 0,
  ).length;

  const unrestrictedCash = total - restrictedCash;
  const monthlyOpex = monthlyOpexOf(snapshot);
  const monthsCover = monthlyOpex > 0 ? unrestrictedCash / monthlyOpex : null;

  return {
    totalCash: total,
    restrictedCash,
    unrestrictedCash,
    monthlyOpex,
    monthsCover,
    // monthsCover is an upper bound, so falling short of the minimum is a real breach.
    belowMinimum: monthsCover !== null && monthsCover < MIN_MONTHS_COVER,
    exact: unmeasuredCount === 0,
    unmeasured: { missingOpeningBalance, missingJobCodes, count: unmeasuredCount },
    cashLines: lines,
  };
}
