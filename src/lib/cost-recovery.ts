import type { Department } from "@/lib/types";

/**
 * Department cost recovery (Build Brief B7).
 *
 * THE QUESTION: "for every dollar this department spends, how many come back?"
 *
 * Hope Vale runs trading operations that are meant to pay for themselves. Nothing in
 * the platform showed whether they do.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TRAP, AND WHY THIS FUNCTION REFUSES TO ANSWER SOMETIMES
 *
 * At the start of a financial year, a department's year-to-date expense can be
 * NEGATIVE. Last year's accruals reverse in July before this year's invoices land,
 * so the ledger genuinely shows less than zero spent. In the live July 2026 snapshot
 * every department is negative: Operations sits at −$3,413.
 *
 * Divide revenue by that and you get:
 *
 *     $46,697 / −$3,413  =  −1,368% cost recovery
 *
 * — a number that is not merely wrong but *confidently* wrong, and would sit on a
 * CEO's dashboard looking like a finding. The same shape of bug produced the −8,815%
 * statutory ratio and the chart that scaled to a maximum of 1.
 *
 * So: a ratio is only computed where the denominator is a real, positive cost. Below
 * that, the department is reported as NOT YET MEASURABLE, with the reason stated. An
 * honest "too early to tell" outranks a precise lie.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Below this, a year-to-date cost is noise, not a denominator. */
const MEANINGFUL_COST = 10_000;

export interface Recovery {
  id: string;
  slug: string;
  name: string;
  color: Department["color"];
  icon: string;
  revenue: number;
  cost: number;
  /** Revenue ÷ cost as a percentage. NULL when the cost isn't a usable denominator. */
  ratio: number | null;
  /** What the Council funds itself. Negative = the department contributes. */
  subsidy: number;
  level: "good" | "warn" | "bad" | "unmeasurable";
  /** Present only when `ratio` is null — says why in plain words. */
  why?: string;
}

export interface CostRecovery {
  trading: Recovery[];
  /** True when NO trading department could be scored — the page should say so, loudly. */
  tooEarly: boolean;
  totalSubsidy: number;
  totalRevenue: number;
  totalCost: number;
  /** Departments not expected to recover cost. Named, so nobody thinks they're missing. */
  costCentres: { name: string; cost: number }[];
}

export function costRecovery(departments: Department[]): CostRecovery {
  const trading: Recovery[] = departments
    .filter((d) => d.kind === "cost-revenue")
    .map((d) => {
      const revenue = d.revenue ?? 0;
      const cost = d.ytdActual;
      const base = {
        id: d.id,
        slug: d.slug,
        name: d.name,
        color: d.color,
        icon: d.icon,
        revenue,
        cost,
        subsidy: cost - revenue,
      };

      if (cost < MEANINGFUL_COST) {
        return {
          ...base,
          ratio: null,
          level: "unmeasurable" as const,
          why:
            cost <= 0
              ? "Year-to-date cost is below zero — last year's accruals have reversed but this year's invoices haven't landed. A ratio here would be meaningless."
              : "Too little spent so far this year to compute a meaningful ratio.",
        };
      }

      const ratio = (revenue / cost) * 100;
      return {
        ...base,
        ratio,
        level: ratio >= 100 ? ("good" as const) : ratio >= 75 ? ("warn" as const) : ("bad" as const),
      };
    })
    // Worst recovery first — that's the one to act on. Unmeasurable rows sink.
    .sort((a, b) => {
      if (a.ratio === null && b.ratio === null) return 0;
      if (a.ratio === null) return 1;
      if (b.ratio === null) return -1;
      return a.ratio - b.ratio;
    });

  const scored = trading.filter((r) => r.ratio !== null);

  return {
    trading,
    tooEarly: trading.length > 0 && scored.length === 0,
    // Only sum what we can actually stand behind.
    totalSubsidy: scored.reduce((a, r) => a + r.subsidy, 0),
    totalRevenue: scored.reduce((a, r) => a + r.revenue, 0),
    totalCost: scored.reduce((a, r) => a + r.cost, 0),
    costCentres: departments
      .filter((d) => d.kind !== "cost-revenue")
      .map((d) => ({ name: d.name, cost: d.ytdActual }))
      .sort((a, b) => b.cost - a.cost),
  };
}
