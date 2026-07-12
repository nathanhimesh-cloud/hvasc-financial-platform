import type { FinancialSnapshot } from "@/lib/types";
import type { TrendPoint } from "@/components/kit/trend-bars";

/**
 * What to plot on a spend trend.
 *
 * A "Monthly Expense Trend" in July has exactly ONE bar, which is not a trend —
 * it's a rectangle. But the feed also carries DAILY spend for the whole financial
 * year, so early in the year we plot that instead: nine days of real movement
 * says far more than one month-shaped block.
 *
 * The switch is automatic and the chart says which one it's showing, because a
 * reader who thinks they're looking at months and is actually looking at days
 * will draw exactly the wrong conclusion.
 */

/** Below this many months, a monthly chart isn't a trend yet. */
const MIN_MONTHS_FOR_MONTHLY = 3;

export interface SpendTrend {
  points: TrendPoint[];
  granularity: "month" | "day";
  /** What the axis represents, for the panel subtitle. */
  subtitle: string;
  /** Show every Nth label — daily series would otherwise be unreadable. */
  labelEvery: number;
  /** The current month, highlighted on a monthly chart. */
  highlight?: string;
}

export function spendTrend(snapshot: FinancialSnapshot): SpendTrend | null {
  const months = snapshot.monthlySpend ?? [];
  const daily = snapshot.dailySpend ?? [];

  if (months.length >= MIN_MONTHS_FOR_MONTHLY) {
    return {
      points: months.map((m) => ({ label: m.month, amount: m.amount })),
      granularity: "month",
      subtitle: "Council-wide · per month",
      labelEvery: 1,
      highlight: snapshot.period?.label?.split(" ")[0],
    };
  }

  // Too early in the year for a monthly trend — fall back to the daily series.
  if (daily.length >= 2) {
    return {
      points: daily.map((d) => ({
        // "2026-07-08" → "8 Jul". Dates are already ISO from the feed.
        label: formatDayLabel(d.date),
        amount: d.amount,
      })),
      granularity: "day",
      subtitle: `Council-wide · per day · ${monthNameOf(daily[0].date)} (month ${snapshot.period?.monthOfYear ?? 1} of 12 — too early for a monthly trend)`,
      labelEvery: daily.length > 14 ? Math.ceil(daily.length / 10) : 1,
    };
  }

  // One month and no daily detail: there is genuinely nothing to draw.
  if (months.length) {
    return {
      points: months.map((m) => ({ label: m.month, amount: m.amount })),
      granularity: "month",
      subtitle: "Council-wide · per month",
      labelEvery: 1,
      highlight: snapshot.period?.label?.split(" ")[0],
    };
  }

  return null;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  return `${Number(d)} ${MONTHS[mi] ?? ""}`.trim();
}

function monthNameOf(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}
