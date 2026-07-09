import register from "@/data/grant-register.json";
import type { FinancialSnapshot } from "@/lib/types";

/**
 * Grant tracking — joins the Council's Grant Register to the live GL.
 *
 * Rules confirmed with Shaun (9 Jul 2026 review):
 *   - Opening balance      = grant cash already received (prior years), from the register.
 *   - Income to date       = opening balance + current-period income.
 *   - Current income       = live GL balance on the grant's REVENUE code(s).
 *   - Total grant income   = the grant amount (what we expect to receive in total).
 *   - Budgeted expense     = total grant income ("as a grant, you should spend all of it").
 *   - Current expense      = live spend on the grant's JOB code(s) (JCTRN).
 *   - Income remaining     = total grant income - income to date.
 *   - Expense remaining    = budgeted expense - expense to date.
 *
 * Rows whose codes the importer couldn't resolve carry `issues[]` — those grants
 * are still listed, but their figures are marked incomplete rather than shown as
 * a confident $0 (see `hasUnresolvedCodes`).
 */

export type CodeMatcher =
  | { type: "single"; code: string }
  | { type: "range"; from: string; to: string };

export interface GrantRegisterEntry {
  id: string;
  number: number;
  name: string;
  funder: string;
  /** False for rows the register flags as closed / "remove from FY27". */
  active: boolean;
  /** The register's Scope/Notes text — carries the closure reason. */
  scopeNote: string;
  revenueCodes: CodeMatcher[];
  expenditureCodes: CodeMatcher[];
  jobCodes: CodeMatcher[];
  openingBalance: number;
  cashReceived: number;
  operationalExpense: number;
  capitalExpense: number;
  unspent: number;
  totalFunded: number;
  restricted: boolean;
  operatingOrCapital: "operating" | "capital";
  reportDue: string;
  startDate: string;
  endDate: string;
  milestones: { name: string; start: string; end: string; done?: boolean }[];
  issues: string[];
}

export interface GrantRegister {
  source: string;
  sheet: string;
  importedAt: string;
  grants: GrantRegisterEntry[];
}

export const GRANT_REGISTER = register as unknown as GrantRegister;

/** "3435-2000" → 34352000, for range comparisons. */
function codeValue(code: string): number | null {
  const m = code.match(/^(\d{4})-(\d{4})$/);
  return m ? Number(m[1]) * 10000 + Number(m[2]) : null;
}

/** Does a GL/job account (any sub-segment) fall inside these matchers? */
export function matchesCode(matchers: CodeMatcher[], account: string): boolean {
  if (!matchers.length) return false;
  const key = account.trim().slice(0, 9);
  const v = codeValue(key);
  if (v === null) return false;
  return matchers.some((m) => {
    if (m.type === "single") return m.code === key;
    const lo = codeValue(m.from);
    const hi = codeValue(m.to);
    return lo !== null && hi !== null && v >= Math.min(lo, hi) && v <= Math.max(lo, hi);
  });
}

/**
 * Disaster-recovery funding (CFO recommendation C6). Hope Vale carries a large
 * QRA/NDRRA/DRFA program that behaves nothing like recurrent grant income — it is
 * lumpy, reimbursement-based, and tied to specific damaged assets. The register
 * has no flag for it, so we derive one from the funder and the grant name.
 */
const DISASTER = /\b(QRA|QRRRF|NDRRA|NDDRA|DRFA|LGGR|disaster|betterment|cyclone|flood|reconstruction)\b/i;

export function isDisasterRecovery(entry: GrantRegisterEntry): boolean {
  return DISASTER.test(entry.name) || DISASTER.test(entry.funder);
}

export interface GrantFigures {
  entry: GrantRegisterEntry;
  /** Total the grant is worth (what should ultimately be received AND spent). */
  totalGrantIncome: number;
  openingIncome: number;
  currentIncome: number;
  incomeToDate: number;
  incomeRemaining: number;
  /** Budgeted expense == total grant income. */
  budgetedExpense: number;
  openingExpense: number;
  currentExpense: number;
  expenseToDate: number;
  expenseRemaining: number;
  /** 0–1+ share of the grant spent. */
  utilisation: number;
  /** True when the register's codes couldn't be resolved — figures are partial. */
  hasUnresolvedCodes: boolean;
  /** Derived QRA/NDRRA/DRFA classification (C6). */
  disasterRecovery: boolean;
}

/** Compute one grant's figures from the register + the live snapshot. */
export function grantFigures(entry: GrantRegisterEntry, snapshot: FinancialSnapshot): GrantFigures {
  // Current-year income: live GL balance on the grant's revenue account(s).
  const currentIncome = (snapshot.grants ?? [])
    .filter((g) => matchesCode(entry.revenueCodes, g.id))
    .reduce((a, g) => a + g.total, 0);

  // Current-year expenditure: live job-costing spend on the grant's job code(s).
  const currentExpense = (snapshot.jobCosts ?? [])
    .filter((j) => matchesCode(entry.jobCodes, j.code))
    .reduce((a, j) => a + j.amount, 0);

  const openingIncome = entry.openingBalance || entry.cashReceived || 0;
  const openingExpense = (entry.operationalExpense || 0) + (entry.capitalExpense || 0);

  // The grant's total value. Prefer the register's project-funded figure; fall
  // back to what's been received so far if the register hasn't got a total.
  const totalGrantIncome = entry.totalFunded || openingIncome + currentIncome;

  const incomeToDate = openingIncome + currentIncome;
  const expenseToDate = openingExpense + currentExpense;
  const budgetedExpense = totalGrantIncome; // "as a grant, you should spend all of it"

  return {
    entry,
    totalGrantIncome,
    openingIncome,
    currentIncome,
    incomeToDate,
    incomeRemaining: Math.max(totalGrantIncome - incomeToDate, 0),
    budgetedExpense,
    openingExpense,
    currentExpense,
    expenseToDate,
    expenseRemaining: budgetedExpense - expenseToDate,
    utilisation: budgetedExpense > 0 ? expenseToDate / budgetedExpense : 0,
    hasUnresolvedCodes: entry.issues.length > 0,
    disasterRecovery: isDisasterRecovery(entry),
  };
}

/** Every grant in the register, active and closed, biggest first. */
export function allGrantFigures(snapshot: FinancialSnapshot): GrantFigures[] {
  return GRANT_REGISTER.grants
    .map((g) => grantFigures(g, snapshot))
    .sort((a, b) => b.totalGrantIncome - a.totalGrantIncome);
}

/** One slice of the grant portfolio — used for the operating/capital and disaster splits. */
export interface GrantSlice {
  count: number;
  totalGrantIncome: number;
  incomeToDate: number;
  expenseToDate: number;
  /** Unspent money still held for this slice. */
  unspent: number;
}

export interface GrantSummary {
  count: number;
  closedCount: number;
  totalGrantIncome: number;
  incomeToDate: number;
  incomeRemaining: number;
  totalBudgetedExpense: number;
  expenseToDate: number;
  restrictedUnspent: number;
  needsAttention: number;
  /** C2 — grants funding day-to-day services vs grants funding assets. */
  operating: GrantSlice;
  capital: GrantSlice;
  /** C6 — the QRA/NDRRA/DRFA disaster-recovery program, carved out. */
  disaster: GrantSlice;
  /** Everything that isn't disaster recovery — the "business as usual" grant base. */
  business: GrantSlice;
}

function slice(figures: GrantFigures[]): GrantSlice {
  const sum = (pick: (f: GrantFigures) => number) => figures.reduce((a, f) => a + pick(f), 0);
  return {
    count: figures.length,
    totalGrantIncome: sum((f) => f.totalGrantIncome),
    incomeToDate: sum((f) => f.incomeToDate),
    expenseToDate: sum((f) => f.expenseToDate),
    unspent: sum((f) => Math.max(f.incomeToDate - f.expenseToDate, 0)),
  };
}

/**
 * Dashboard headline. Counts ACTIVE grants only — the register still carries rows
 * flagged "remove from FY27 / closed out", and including them overstates every total.
 */
export function grantSummary(figures: GrantFigures[]): GrantSummary {
  const live = figures.filter((f) => f.entry.active);
  const sum = (pick: (f: GrantFigures) => number) => live.reduce((a, f) => a + pick(f), 0);
  return {
    count: live.length,
    closedCount: figures.length - live.length,
    totalGrantIncome: sum((f) => f.totalGrantIncome),
    incomeToDate: sum((f) => f.incomeToDate),
    incomeRemaining: sum((f) => f.incomeRemaining),
    totalBudgetedExpense: sum((f) => f.budgetedExpense),
    expenseToDate: sum((f) => f.expenseToDate),
    restrictedUnspent: live.filter((f) => f.entry.restricted).reduce((a, f) => a + Math.max(f.incomeToDate - f.expenseToDate, 0), 0),
    needsAttention: live.filter((f) => f.hasUnresolvedCodes).length,
    operating: slice(live.filter((f) => f.entry.operatingOrCapital === "operating")),
    capital: slice(live.filter((f) => f.entry.operatingOrCapital === "capital")),
    disaster: slice(live.filter((f) => f.disasterRecovery)),
    business: slice(live.filter((f) => !f.disasterRecovery)),
  };
}
