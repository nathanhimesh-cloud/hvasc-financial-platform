/**
 * Reconciliation / integrity engine (Build Brief A4).
 *
 * Accountants have rules that must always be true. If the platform shows numbers
 * that break these rules, the data or the mapping is wrong — and a CFO cannot
 * sign it. This module runs those rules against a snapshot and reports, in plain
 * language, which ones pass, which fail (and by how much), and which could not
 * be checked because the underlying data isn't loaded yet.
 *
 * The four tie-out checks (brief A1–A3 + the equity tie-out):
 *   1. Balance Sheet balances:  Assets = Liabilities + Equity   (and Net
 *      Community Assets = Total Community Equity, which is the same identity).
 *   2. Cash Flow reconciles:    opening cash + net movement = closing cash.
 *   3. Cash agrees across reports: Cash Flow closing cash = Balance Sheet cash.
 *   4. Result ties to equity:   P&L net result = movement in retained surplus
 *      (needs the prior-period equity close — flagged "awaiting data" until we
 *      have FY25 closing equity).
 *
 * Nothing here changes a figure. It only reads and reports. That is deliberate:
 * the platform never edits Practical's data (engagement letter cl. 3.2).
 */

import type {
  FinancialSnapshot,
  BalanceSheet,
  CashFlow,
  IncomeStatement,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";

/** A difference below this (in dollars) is rounding, not a real break. */
export const INTEGRITY_TOLERANCE = 1;

export type CheckStatus = "pass" | "fail" | "not-checked";

export interface IntegrityCheck {
  id: string;
  /** Short name for chips/rows. */
  label: string;
  /** Plain-language description of what the rule verifies. */
  description: string;
  status: CheckStatus;
  /** Signed difference in dollars when it fails (0 when it passes). */
  gap: number;
  /** The two sides of the identity, for display. */
  detail?: string;
  /** One-line reason shown when failing or when it couldn't be checked. */
  reason?: string;
}

export interface IntegrityReport {
  checks: IntegrityCheck[];
  /** Overall: any failure → "fail"; else any un-runnable check → "partial"; else "pass". */
  status: "pass" | "fail" | "partial";
  failedCount: number;
  /** Checks that actually ran (pass or fail). */
  checkedCount: number;
  /** Checks that couldn't run because data is missing. */
  skippedCount: number;
  generatedAt?: string;
}

/**
 * Total cash & cash equivalents on the balance sheet.
 *
 * Councils split cash across many named accounts — Bank QTC, Maxi-Direct, ANZ,
 * floats — and several don't contain the literal word "cash" (e.g. "Bank QTC").
 * The old version returned the FIRST line matching /cash/, which grabbed a single
 * $1.5M ANZ line and reported a $59M "mismatch" against the ~$65M cash flow.
 * Sum every cash/bank/investment line instead, with the same pattern the
 * liquidity panel uses, so the two statements are compared like for like.
 */
const BS_CASH_LINE = /cash|bank|qtc|maxi[\s-]?direct|petty|float/i;
function findBalanceSheetCash(bs: BalanceSheet): number | undefined {
  const lines = bs.currentAssets.lines.filter((l) => BS_CASH_LINE.test(l.label));
  if (!lines.length) return undefined;
  return lines.reduce((a, l) => a + l.amount, 0);
}

function pass(
  id: string,
  label: string,
  description: string,
  detail: string,
): IntegrityCheck {
  return { id, label, description, status: "pass", gap: 0, detail };
}

function fail(
  id: string,
  label: string,
  description: string,
  gap: number,
  detail: string,
  reason: string,
): IntegrityCheck {
  return { id, label, description, status: "fail", gap, detail, reason };
}

function skip(
  id: string,
  label: string,
  description: string,
  reason: string,
): IntegrityCheck {
  return { id, label, description, status: "not-checked", gap: 0, reason };
}

/** Check 1 — Balance Sheet balances (Assets = Liabilities + Equity). */
function checkBalanceSheet(bs?: BalanceSheet): IntegrityCheck {
  const id = "bs-balances";
  const label = "Balance Sheet balances";
  const description = "Total Assets must equal Total Liabilities plus Total Community Equity.";
  if (!bs) return skip(id, label, description, "Balance Sheet not loaded for this period.");

  const rhs = bs.totalLiabilities + bs.totalEquity;
  const gap = bs.totalAssets - rhs;
  const detail = `Assets ${formatCurrency(bs.totalAssets)} vs Liabilities + Equity ${formatCurrency(rhs)}`;
  if (Math.abs(gap) <= INTEGRITY_TOLERANCE) return pass(id, label, description, detail);
  return fail(
    id,
    label,
    description,
    gap,
    detail,
    `Balance sheet is out by ${formatCurrency(Math.abs(gap))}. Likely an unmapped GL account (see Account Mapping).`,
  );
}

/** Check 2 — Cash Flow reconciles (opening + movement = closing). */
function checkCashFlowReconciles(cf?: CashFlow): IntegrityCheck {
  const id = "cf-reconciles";
  const label = "Cash Flow adds up";
  const description = "Opening cash plus the net movement for the period must equal closing cash.";
  if (!cf) return skip(id, label, description, "Cash Flow not loaded for this period.");

  const expectedEnd = cf.cashStart + cf.netChange;
  const gap = cf.cashEnd - expectedEnd;
  const detail = `Opening ${formatCurrency(cf.cashStart)} + movement ${formatCurrency(cf.netChange)} = ${formatCurrency(expectedEnd)}, but closing shows ${formatCurrency(cf.cashEnd)}`;
  if (Math.abs(gap) <= INTEGRITY_TOLERANCE) return pass(id, label, description, detail);
  return fail(
    id,
    label,
    description,
    gap,
    detail,
    `Closing cash is out by ${formatCurrency(Math.abs(gap))} from opening + movement.`,
  );
}

/** Check 3 — Cash agrees across reports (Cash Flow close = Balance Sheet cash). */
function checkCashAgrees(bs?: BalanceSheet, cf?: CashFlow): IntegrityCheck {
  const id = "cash-agrees";
  const label = "Cash matches across reports";
  const description = "Closing cash on the Cash Flow must equal the cash line on the Balance Sheet for the same period.";
  if (!bs || !cf) return skip(id, label, description, "Needs both Balance Sheet and Cash Flow for the same period.");

  const bsCash = findBalanceSheetCash(bs);
  if (bsCash === undefined) {
    return skip(id, label, description, "Couldn't find a cash line on the Balance Sheet to compare.");
  }
  const gap = cf.cashEnd - bsCash;
  const detail = `Cash Flow close ${formatCurrency(cf.cashEnd)} vs Balance Sheet cash ${formatCurrency(bsCash)}`;
  if (Math.abs(gap) <= INTEGRITY_TOLERANCE) return pass(id, label, description, detail);
  return fail(
    id,
    label,
    description,
    gap,
    detail,
    `Cash differs by ${formatCurrency(Math.abs(gap))} between the two statements.`,
  );
}

/** Check 4 — Result ties to equity movement (needs prior-period equity close). */
function checkResultTiesToEquity(
  income?: IncomeStatement,
  priorEquity?: number,
  currentEquity?: number,
): IntegrityCheck {
  const id = "result-ties-equity";
  const label = "Result ties to equity";
  const description = "The P&L net result for the period should equal the movement in retained surplus/equity (after reserve transfers).";
  if (!income || priorEquity === undefined || currentEquity === undefined) {
    return skip(
      id,
      label,
      description,
      "Awaiting prior-period closing equity (FY25) to compute the movement.",
    );
  }
  const movement = currentEquity - priorEquity;
  const gap = income.netResult - movement;
  const detail = `Net result ${formatCurrency(income.netResult)} vs equity movement ${formatCurrency(movement)}`;
  if (Math.abs(gap) <= INTEGRITY_TOLERANCE) return pass(id, label, description, detail);
  return fail(
    id,
    label,
    description,
    gap,
    detail,
    `Net result and equity movement differ by ${formatCurrency(Math.abs(gap))} (after reserve transfers).`,
  );
}

/**
 * Run every tie-out check against a snapshot and roll them up into one report.
 * Safe on partial data: missing statements produce "not-checked", never a crash.
 */
export function assessIntegrity(snapshot: FinancialSnapshot): IntegrityReport {
  const { balanceSheet, cashFlow, incomeTotals, meta } = snapshot;

  const checks: IntegrityCheck[] = [
    checkBalanceSheet(balanceSheet),
    checkCashFlowReconciles(cashFlow),
    checkCashAgrees(balanceSheet, cashFlow),
    // Movement = current equity − prior-year closing equity (from GLBAL.LASTYEAR).
    checkResultTiesToEquity(incomeTotals, snapshot.priorYear?.closingEquity, balanceSheet?.totalEquity),
  ];

  const failedCount = checks.filter((c) => c.status === "fail").length;
  const skippedCount = checks.filter((c) => c.status === "not-checked").length;
  const checkedCount = checks.length - skippedCount;

  const status: IntegrityReport["status"] =
    failedCount > 0 ? "fail" : skippedCount > 0 ? "partial" : "pass";

  return {
    checks,
    status,
    failedCount,
    checkedCount,
    skippedCount,
    generatedAt: meta?.generatedAt,
  };
}

/** One-line summary for compact places (dashboard pill, tooltips). */
export function integritySummary(report: IntegrityReport): string {
  if (report.status === "pass") return "All statements reconcile";
  if (report.status === "fail") {
    return `${report.failedCount} accuracy check${report.failedCount === 1 ? "" : "s"} failed`;
  }
  return report.checkedCount > 0
    ? "Some checks passed; others await data"
    : "Accuracy checks pending data";
}
