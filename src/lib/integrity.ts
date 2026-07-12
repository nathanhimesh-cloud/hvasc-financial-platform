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

/** Every account on the balance sheet that represents cash or a bank account. */
function balanceSheetCashLines(bs: BalanceSheet) {
  return bs.currentAssets.lines.filter((l) => BS_CASH_LINE.test(l.label));
}

/**
 * The cash accounts the Balance Sheet has but Practical's Cash Flow report (739)
 * does NOT count as cash.
 *
 * This is the whole point of the check. We already know report 739's account links
 * are stale — ~24 operating accounts move cash without being mapped to any line —
 * so it is entirely plausible its CASH list is stale too, and that the Cash Flow
 * is understating the Council's cash by a real bank account or three.
 *
 * Naming them turns an unactionable "$4,005,709 difference" into a question the
 * Council can actually answer: "is this a bank account? Then add it to report
 * 739's cash line in Practical." Comparing only the accounts the two statements
 * already agree on would make the discrepancy vanish, which is the opposite of
 * what a reconciliation is for.
 */
function cashLinesMissingFromCashFlow(bs: BalanceSheet, cashAccounts?: string[]) {
  const codes = new Set((cashAccounts ?? []).map((c) => c.trim()));
  if (!codes.size) return [];
  return balanceSheetCashLines(bs).filter((l) => !(l.code && codes.has(l.code.trim())));
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

  const lines = balanceSheetCashLines(bs);
  if (!lines.length) {
    return skip(id, label, description, "Couldn't find a cash line on the Balance Sheet to compare.");
  }
  const bsCash = lines.reduce((a, l) => a + l.amount, 0);
  const gap = cf.cashEnd - bsCash;
  const detail = `Cash Flow close ${formatCurrency(cf.cashEnd)} vs Balance Sheet cash ${formatCurrency(bsCash)}`;
  if (Math.abs(gap) <= INTEGRITY_TOLERANCE) return pass(id, label, description, detail);

  // Name the accounts that cause the difference, when the snapshot tells us which
  // accounts report 739 counts as cash.
  const orphans = cashLinesMissingFromCashFlow(bs, cf.cashAccounts);
  const orphanTotal = orphans.reduce((a, l) => a + l.amount, 0);
  const named = orphans
    .slice(0, 4)
    .map((l) => `${l.label} (${formatCurrency(l.amount)})`)
    .join(", ");

  const reason = orphans.length
    ? `Cash differs by ${formatCurrency(Math.abs(gap))}. ${orphans.length} bank account${orphans.length === 1 ? " is" : "s are"} on the Balance Sheet but not counted as cash by Practical's Cash Flow report (739): ${named}${orphans.length > 4 ? "…" : ""}${orphans.length > 1 ? ` — ${formatCurrency(orphanTotal)} in total` : ""}. If these are real bank accounts, they should be added to report 739's cash line in Practical.`
    : `Cash differs by ${formatCurrency(Math.abs(gap))} between the two statements.`;

  return fail(id, label, description, gap, detail, reason);
}

/** Check 4 — Result ties to equity movement (needs prior-period equity close). */
function checkResultTiesToEquity(
  income?: IncomeStatement,
  priorEquity?: number,
  currentEquity?: number,
  equity?: BalanceSheet["equity"],
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

  /*
    NAME THE ACCOUNT THAT MOVED.

    This check used to end at "net result and equity movement differ by $69,752
    (after reserve transfers)" — a number with no owner. Nobody can act on that,
    so everybody learns to ignore it, and an alert nobody acts on is worse than no
    alert at all: it teaches people that red means nothing.

    Now that balance-sheet lines carry last year's closing balance, we can say
    WHICH equity account moved without a corresponding entry in the P&L. That is a
    question Micah can answer in one sentence — "yes, that was a reserve transfer"
    — instead of a mystery that sits on the report forever.
  */
  const movers = (equity?.lines ?? [])
    .filter((l) => l.priorYear !== undefined)
    .map((l) => ({ label: l.label, code: l.code, moved: l.amount - (l.priorYear ?? 0) }))
    // The account holding this year's surplus SHOULD move by the net result —
    // that's the P&L doing its job, not an anomaly. Everything else is the gap.
    .filter((m) => Math.abs(m.moved) > INTEGRITY_TOLERANCE)
    .filter((m) => Math.abs(m.moved - income.netResult) > INTEGRITY_TOLERANCE)
    .sort((a, b) => Math.abs(b.moved) - Math.abs(a.moved));

  const named = movers
    .slice(0, 3)
    .map((m) => `${m.label} (${formatCurrency(m.moved)})`)
    .join(", ");

  const reason = movers.length
    ? `${formatCurrency(Math.abs(gap))} moved through equity without passing through the P&L: ${named}. That is normally a reserve transfer or a revaluation — legitimate, but it should be confirmed rather than assumed.`
    : `Net result and equity movement differ by ${formatCurrency(Math.abs(gap))} (after reserve transfers).`;

  return fail(id, label, description, gap, detail, reason);
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
    checkResultTiesToEquity(incomeTotals, snapshot.priorYear?.closingEquity, balanceSheet?.totalEquity, balanceSheet?.equity),
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
