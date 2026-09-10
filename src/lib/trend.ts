import type { FinancialSnapshot } from "@/lib/types";
import type { TrendPoint } from "@/components/kit/trend-bars";

/**
 * What to plot on a spend trend: ALWAYS the daily series when the feed carries
 * one, whatever month it is.
 *
 * This used to switch — daily below three months, monthly above — and the panel
 * switched again at two. So July drew daily bars, August drew a monthly line, and
 * the same card looked like a different report month to month with nothing on
 * screen explaining why. "Why does the graph look different?" is the correct
 * reaction to that, and the honest answer was "because of a threshold you can't
 * see", which is not a good enough reason to change the shape of a chart under
 * someone.
 *
 * Daily is the series that works at both ends of the year: it has real movement
 * in July and ~250 points by June, and `labelEvery` keeps the axis readable
 * either way. Monthly remains only as a fallback for a snapshot that carries no
 * daily detail at all — a genuine absence of data, not a threshold.
 */

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

export function spendTrend(
  snapshot: FinancialSnapshot,
  /**
   * "YYYY-MM" keys of the selected months, so the chart follows the checkbox
   * selection. A set, not a from/to window: the months picked need not be
   * contiguous, and a date range could not express Jul + Sep without Aug.
   */
  keys?: Set<string>,
): SpendTrend | null {
  let months = snapshot.monthlySpend ?? [];
  let daily = snapshot.dailySpend ?? [];
  if (keys && keys.size) {
    daily = daily.filter((d) => keys.has(d.date.slice(0, 7)));
    // Keep the avg/high/low summary on the same months as the chart.
    const names = new Set([...keys].map((k) => MONTHS[Number(k.split("-")[1]) - 1]));
    months = months.filter((m) => names.has(m.month));
  }

  if (daily.length >= 2) {
    const span =
      monthNameOf(daily[0].date) === monthNameOf(daily[daily.length - 1].date)
        ? monthNameOf(daily[0].date)
        : `${monthNameOf(daily[0].date)} – ${monthNameOf(daily[daily.length - 1].date)}`;
    return {
      points: daily.map((d) => ({
        // "2026-07-08" → "8 Jul". Dates are already ISO from the feed.
        label: formatDayLabel(d.date),
        amount: d.amount,
      })),
      granularity: "day",
      subtitle: `Council-wide · per day · ${span}`,
      labelEvery: daily.length > 14 ? Math.ceil(daily.length / 10) : 1,
    };
  }

  // No daily detail in this window — fall back to months. A real gap in the
  // data, not a threshold.
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
