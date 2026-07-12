import type { BudgetReportData } from "@/lib/budget-report";
import type { MonthlyStatement } from "@/lib/types";

/**
 * Revenue: actual against budget, cumulatively (Build Brief B6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUDGET LINE IS A STRAIGHT LINE, AND THAT IS NOT OUR CHOICE.
 *
 * Practical stores `GLBAL.BUDGET` as the budget cumulative-to-period, STRAIGHT-LINED
 * across the year — one twelfth per month. It is not phased to when the money is
 * actually expected.
 *
 * That matters enormously for REVENUE, and it is the reason this chart carries a
 * caveat instead of a verdict. Council revenue is lumpy: rates are levied in a
 * couple of hits, grant instalments land on the funder's schedule, not the
 * Council's. Against a flat twelfth-per-month line, real revenue will look
 * catastrophically behind for months and then leap ahead in a single period —
 * neither of which means anything.
 *
 * So the chart shows the gap, and says plainly what the gap is made of. Colouring
 * "behind budget" red in September would be reporting an artefact of straight-lining
 * as if it were a finding.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface RevenuePoint {
  month: string;
  /** Cumulative income actually posted, year to date. */
  actual: number;
  /** Cumulative budget: the annual figure, straight-lined. */
  budget: number;
}

export interface RevenueTrend {
  points: RevenuePoint[];
  annualBudget: number;
}

/** Sum every revenue leaf's full-year budget across every group. */
export function annualRevenueBudget(budget?: BudgetReportData): number {
  if (!budget) return 0;
  return budget.groups.reduce(
    (total, g) =>
      total +
      g.leaves.filter((l) => l.kind === "revenue").reduce((a, l) => a + l.budget, 0),
    0,
  );
}

export function revenueTrend(
  statements: MonthlyStatement[] | undefined,
  budget: BudgetReportData | undefined,
  monthsInYear = 12,
): RevenueTrend {
  const annual = annualRevenueBudget(budget);
  const sorted = [...(statements ?? [])].sort((a, b) => a.idx - b.idx);

  return {
    annualBudget: annual,
    points: sorted.map((s) => ({
      month: s.month,
      // Already cumulative — monthlyStatements are year-to-date checkpoints.
      actual: s.totalIncome,
      // Straight-lined, because that is how Practical holds it. Do not "improve"
      // this by inventing a phasing curve: a made-up curve would make the variance
      // look explainable when it isn't.
      budget: (annual * s.idx) / monthsInYear,
    })),
  };
}
