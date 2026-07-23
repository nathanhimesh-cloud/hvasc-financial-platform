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
  BsReconciliation,
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

/**
 * Check — every balance-sheet LINE ties to the transactions.
 *
 * The other checks test the TOTALS (Assets = Liabilities + Equity, equity ties to
 * the audited close). They cannot see a line whose balance-table figure disagrees
 * with the transactions that produced it — the exact gap an independent reviewer
 * found on the Council's high-churn control accounts. This closes it: the feed
 * compares each account's GLBAL.BALANCE against opening + GLTRN movement, and this
 * check reports the result.
 *
 * A word on why this can pass while a reviewer still sees a variance: the balance
 * sheet is a point-in-time snapshot. A control account that moves millions within a
 * month will differ from live Practical checked at a different minute — that is
 * staleness, not a data fault, and it is NOT what this check is for. This check fires
 * only when the balance table and the ledger genuinely disagree AT THE SAME MOMENT.
 */
function checkBalanceSheetLines(recon?: BsReconciliation): IntegrityCheck {
  const id = "bs-lines-tie";
  const label = "Every balance-sheet line ties to the ledger";
  const description =
    "Each account's balance must equal its opening balance plus the transactions posted this year.";
  if (!recon || recon.checked === 0) {
    return skip(id, label, description, "Line reconciliation not available for this period.");
  }
  if (recon.mismatchCount === 0) {
    const rollups = recon.calculated
      ? ` (${recon.calculated} calculated roll-up${recon.calculated === 1 ? "" : "s"}, e.g. Current Surplus, validated by the total checks)`
      : "";
    return pass(id, label, description, `All ${recon.checked} accounts tie to the transactions${rollups}.`);
  }
  const worst = recon.mismatches[0];
  const detail = recon.mismatches
    .slice(0, 4)
    .map((m) => `${m.account}: shows ${formatCurrency(m.glbal)}, ledger implies ${formatCurrency(m.expected)}`)
    .join(" · ");
  return fail(
    id,
    label,
    description,
    worst.diff,
    detail,
    `${recon.mismatchCount} account${recon.mismatchCount === 1 ? "" : "s"} disagree with the transactions — the biggest is ${worst.account} by ${formatCurrency(Math.abs(worst.diff))}. This means Practical's balance table and its ledger don't match for these accounts; it is not a rounding or timing issue. Re-sync and, if it persists, raise it with Fourier.`,
  );
}

/**
 * Check — every stated total equals the sum of its own lines.
 *
 * The reviewer's reconciliation (action item 8) found a section whose displayed
 * TOTAL exceeded the sum of its displayed LINES by $3, and asked for this to be a
 * standing check. A card that doesn't equal its own detail is the most corrosive
 * kind of error — it makes a reader distrust every other number on the page — so it
 * gets its own tie-out, on the balance sheet's five sections.
 */
function checkTotalsTieToLines(bs?: BalanceSheet): IntegrityCheck {
  const id = "bs-totals-tie";
  const label = "Every total equals its detail";
  const description = "Each section's stated total must equal the sum of the lines shown beneath it.";
  if (!bs) return skip(id, label, description, "Balance Sheet not loaded for this period.");

  const sections: { name: string; section: { lines: { amount: number }[]; total: number } }[] = [
    { name: "Current assets", section: bs.currentAssets },
    { name: "Non-current assets", section: bs.nonCurrentAssets },
    { name: "Current liabilities", section: bs.currentLiabilities },
    { name: "Non-current liabilities", section: bs.nonCurrentLiabilities },
    { name: "Community equity", section: bs.equity },
  ];

  let worstName = "";
  let worstGap = 0;
  for (const { name, section } of sections) {
    const sum = section.lines.reduce((a, l) => a + l.amount, 0);
    const gap = section.total - sum;
    if (Math.abs(gap) > Math.abs(worstGap)) {
      worstGap = gap;
      worstName = name;
    }
  }

  if (Math.abs(worstGap) <= INTEGRITY_TOLERANCE) {
    return pass(id, label, description, `All ${sections.length} sections match their line detail.`);
  }
  return fail(
    id,
    label,
    description,
    worstGap,
    `${worstName}: total is out from the sum of its lines by ${formatCurrency(Math.abs(worstGap))}`,
    `The ${worstName} card doesn't equal the sum of the lines shown under it (by ${formatCurrency(Math.abs(worstGap))}). A total that disagrees with its own detail must be fixed before the report is presented.`,
  );
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
  return fail(id, label, description, gap, detail, explainEquityGap(gap, equity));
}

/**
 * WHY THE YEAR-END ROLL MAKES THIS HARD, AND HOW TO SEE PAST IT.
 *
 * You cannot find the anomaly by looking at which equity account moved the most,
 * because at the start of a financial year the two biggest movements are an
 * illusion: last year's surplus rolls out of "Current Surplus" and into
 * "Accumulated Surplus". At Hope Vale that is ±$9.6M — a hundred times the gap
 * we're actually hunting — and it nets to exactly zero. Naming those two accounts
 * would be true, and useless.
 *
 * But the roll gives us the lever. Whatever leaves the surplus account must arrive
 * in the accumulated one. So:
 *
 *     gap = (what accumulated GAINED) − (what the surplus account HELD last year)
 *
 * Anything over that is money posted straight to equity, bypassing the P&L. At
 * Hope Vale: Accumulated received $9,678,500 while only $9,608,749 rolled out of
 * Current Surplus — $69,752 more went in than came out. That is a sentence Micah
 * can answer. "$69,752 difference" is not.
 */
function explainEquityGap(gap: number, equity?: BalanceSheet["equity"]): string {
  const generic = `Net result and equity movement differ by ${formatCurrency(Math.abs(gap))} (after reserve transfers).`;

  const lines = (equity?.lines ?? []).filter((l) => l.priorYear !== undefined);
  if (lines.length < 2) return generic;

  const moves = lines.map((l) => ({
    label: l.label,
    prior: l.priorYear ?? 0,
    moved: l.amount - (l.priorYear ?? 0),
  }));

  const rose = [...moves].sort((a, b) => b.moved - a.moved)[0];
  const fell = [...moves].sort((a, b) => a.moved - b.moved)[0];
  if (!rose || !fell || rose.label === fell.label) return generic;

  // Does the roll actually explain the gap? If the arithmetic doesn't hold, say
  // nothing clever — a confident wrong explanation is worse than a vague true one.
  const excess = rose.moved - fell.prior;
  if (Math.abs(excess - gap * -1) > INTEGRITY_TOLERANCE * 5) return generic;

  return (
    `${formatCurrency(Math.abs(gap))} was posted straight to equity, bypassing the P&L. ` +
    `At year-end ${formatCurrency(fell.prior)} rolled out of ${fell.label} into ${rose.label} — ` +
    `but ${rose.label} received ${formatCurrency(rose.moved)}, which is ${formatCurrency(Math.abs(excess))} more than came out. ` +
    `That is normally a reserve transfer or a prior-period adjustment: legitimate, but worth confirming rather than assuming.`
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
    checkTotalsTieToLines(balanceSheet),
    checkBalanceSheetLines(snapshot.bsReconciliation),
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
