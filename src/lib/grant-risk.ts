import type { GrantFigures } from "@/lib/grants";

/**
 * Grants unacquitted / clawback risk (Build Brief B8).
 *
 * THE QUESTION: "which of these grants is going to cost us money?"
 *
 * The exposure is NOT `total funding − spent`. Money the Council has been promised but
 * not yet received cannot be clawed back — there is nothing to return. The exposure is
 * cash **actually received** and **not yet spent**:
 *
 *     at risk = incomeToDate − expenseToDate
 *
 * That is money sitting in the Council's bank account that belongs, conditionally, to
 * somebody else. If it isn't spent on what it was given for, the funder can ask for it
 * back — and unlike a budget overrun, that is a debt, not a variance.
 *
 * TIME is the other half. A grant 40% spent is healthy in its first year and a crisis
 * in its last month. So the tiers below weigh the unspent proportion AGAINST how much
 * of the grant's term is left, using the register's end date. A ratio alone cannot
 * tell you which of those two situations you are in.
 */

export type RiskLevel = "high" | "medium" | "low" | "none" | "unknown";

export interface GrantRisk {
  id: string;
  name: string;
  funder: string;
  restricted: boolean;
  endDate: string;
  /** Cash received and not yet spent — what could be clawed back. */
  atRisk: number;
  /** Share of received cash that has been spent, 0–1+. */
  acquitted: number;
  /** Days until the grant's end date. Negative = already past. */
  daysLeft: number | null;
  level: RiskLevel;
  /** Why, in one sentence, written for a CEO. */
  reason: string;
}

export interface RiskSummary {
  rows: GrantRisk[];
  /** Total cash received and unspent across every grant. */
  totalAtRisk: number;
  highCount: number;
  /** Cash received on grants that are past their end date and still unspent. */
  overdue: number;
  overdueCount: number;
  /** Grants we CANNOT assess, because the register's codes don't resolve. */
  unknownCount: number;
  /**
   * FALSE when not one active grant carries an end date.
   *
   * Without this the panel reports "zero dollars past its end date" — which reads as
   * good news and means the opposite: we have no end dates, so we cannot tell. Hope
   * Vale's register is exactly this case today (endDate is empty on all 89 rows), so
   * the time-based tiers never fire and the ranking falls back to spend ratio alone.
   * The panel has to say so rather than quietly show a reassuring zero.
   */
  datesKnown: boolean;
}

const DAY = 86_400_000;

function daysUntil(iso: string, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.round((t - now) / DAY);
}

function assess(f: GrantFigures, now: number): GrantRisk {
  const e = f.entry;
  const atRisk = Math.max(0, f.incomeToDate - f.expenseToDate);
  const acquitted = f.incomeToDate > 0 ? f.expenseToDate / f.incomeToDate : 0;
  const daysLeft = daysUntil(e.endDate, now);

  const base = {
    id: e.id,
    name: e.name,
    funder: e.funder,
    restricted: e.restricted,
    endDate: e.endDate,
    atRisk,
    acquitted,
    daysLeft,
  };

  /*
    HONESTY FIRST. If the register's codes didn't resolve, this grant's spend is not
    measured — it is UNKNOWN, not zero. Scoring it "high risk, nothing spent" would be
    a fabrication, and a loud one: it would put a real grant at the top of a red list
    on the strength of a missing code.
  */
  if (f.hasUnresolvedCodes) {
    return {
      ...base,
      atRisk: 0,
      level: "unknown",
      reason: "Cannot be assessed — the register's codes don't resolve, so spend is not measured.",
    };
  }

  // No cash received yet = no exposure. A promise cannot be clawed back.
  if (f.incomeToDate <= 0) {
    return { ...base, atRisk: 0, level: "none", reason: "No funding received yet — nothing to acquit." };
  }

  // Effectively spent. Small rounding tails are not a risk.
  if (atRisk < 1000) {
    return { ...base, level: "none", reason: "Fully acquitted." };
  }

  // Past the end date with cash still unspent. This is the one that costs money.
  if (daysLeft !== null && daysLeft < 0) {
    return {
      ...base,
      level: "high",
      reason: `Term ended ${Math.abs(daysLeft)} days ago with funding unspent. This is the clawback case — acquit or seek a variation.`,
    };
  }

  // Under six months left and less than half of the received cash spent.
  if (daysLeft !== null && daysLeft < 180 && acquitted < 0.5) {
    return {
      ...base,
      level: "high",
      reason: `Only ${daysLeft} days left and under half the funding spent. It will not be acquitted at this rate.`,
    };
  }

  if (acquitted < 0.25) {
    return {
      ...base,
      level: "medium",
      reason: "Funding received but barely spent. Confirm the work has actually started.",
    };
  }
  if (acquitted < 0.7) {
    return { ...base, level: "medium", reason: "Behind. Worth raising before the next report." };
  }
  return { ...base, level: "low", reason: "Tracking — the remainder is small enough to acquit normally." };
}

const ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2, unknown: 3, none: 4 };

export function grantRisk(figures: GrantFigures[], now = Date.now()): RiskSummary {
  const rows = figures
    // Closed grants are history. They cannot be acquitted and they cannot be clawed back.
    .filter((f) => f.entry.active)
    .map((f) => assess(f, now))
    .sort((a, b) =>
      ORDER[a.level] !== ORDER[b.level] ? ORDER[a.level] - ORDER[b.level] : b.atRisk - a.atRisk,
    );

  const overdueRows = rows.filter(
    (r) => r.level !== "unknown" && r.daysLeft !== null && r.daysLeft < 0 && r.atRisk >= 1000,
  );

  return {
    rows,
    datesKnown: rows.some((r) => r.daysLeft !== null),
    totalAtRisk: rows.reduce((a, r) => a + r.atRisk, 0),
    highCount: rows.filter((r) => r.level === "high").length,
    overdue: overdueRows.reduce((a, r) => a + r.atRisk, 0),
    overdueCount: overdueRows.length,
    unknownCount: rows.filter((r) => r.level === "unknown").length,
  };
}
