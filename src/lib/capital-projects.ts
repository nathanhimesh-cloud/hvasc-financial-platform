import type { FinancialSnapshot } from "@/lib/types";
import {
  CAPITAL_CATEGORY_ORDER,
  CAPITAL_JOBS_FY27,
  CAPITAL_BUDGET_PRINTED,
  type CapitalCategoryName,
  type CapitalJobSeed,
} from "@/data/capital-budget-fy27";

/**
 * The FY27 capital programme: per-job budget vs actual vs committed (Aug 2026
 * dashboard review — Micah: $33M total capital across years, ~$13M live
 * portfolio, and "granular, year-to-date tracking for all capital projects").
 *
 * Budgets come from the transcribed printed report (see the seed file); the
 * live parts join in from the snapshot:
 *
 *   actual     — JCTRN job-costed spend (`snapshot.jobCosts`, falling back to
 *                the job register's own actuals when that block is absent).
 *                Capital spend posts to WIP ASSET accounts, so it never shows
 *                in operating expenses — this page is where it's visible.
 *   committed  — open purchase-order value by job (`commitments.byJob`).
 *
 * Columns deliberately mirror the printed report: Orig Bud · Curr Bud ·
 * Act Exp · Comm Exp · Tot Act + Comm · Bud Remain · % Spent — so Micah can
 * hold the page against the paper and see the same shape.
 */

export interface CapitalProjectRow extends CapitalJobSeed {
  actual: number;
  committed: number;
  totalActPlusComm: number;
  /** Current budget less actual + committed. Negative = over-committed. */
  remaining: number;
  /** Actual ÷ current budget. */
  pctSpent: number;
}

export interface CapitalCategory {
  name: CapitalCategoryName;
  rows: CapitalProjectRow[];
  origBudget: number;
  currBudget: number;
  actual: number;
  committed: number;
  remaining: number;
}

export interface CapitalProgramme {
  categories: CapitalCategory[];
  totals: {
    origBudget: number;
    currBudget: number;
    actual: number;
    committed: number;
    totalActPlusComm: number;
    remaining: number;
    pctSpent: number;
  };
  jobCount: number;
  /** False when the snapshot carries no job-cost or commitment data at all —
   * the page then says plainly the live columns are awaiting a sync. */
  hasLiveData: boolean;
  asAt: string;
  source: string;
}

export function buildCapitalProgramme(snapshot: FinancialSnapshot): CapitalProgramme {
  // Job-costed spend by code. JCTRN is the primary source; the job register's
  // own per-job actuals are the fallback when the cost-ledger block is absent.
  const actualBy = new Map<string, number>();
  for (const jc of snapshot.jobCosts ?? []) {
    const key = jc.code.trim();
    actualBy.set(key, (actualBy.get(key) ?? 0) + jc.amount);
  }
  if (actualBy.size === 0) {
    for (const g of snapshot.jobBudgets ?? []) {
      for (const j of g.jobs) {
        if (!j.actual) continue;
        const key = j.code.trim();
        actualBy.set(key, (actualBy.get(key) ?? 0) + j.actual);
      }
    }
  }

  const commitBy = new Map<string, number>();
  for (const c of snapshot.commitments?.byJob ?? []) {
    const key = c.code.trim();
    commitBy.set(key, (commitBy.get(key) ?? 0) + c.amount);
  }

  const rows: CapitalProjectRow[] = CAPITAL_JOBS_FY27.map((seed) => {
    const actual = actualBy.get(seed.code) ?? 0;
    const committed = commitBy.get(seed.code) ?? 0;
    const totalActPlusComm = actual + committed;
    return {
      ...seed,
      actual,
      committed,
      totalActPlusComm,
      remaining: seed.currBudget - totalActPlusComm,
      pctSpent: seed.currBudget > 0 ? actual / seed.currBudget : 0,
    };
  });

  const categories: CapitalCategory[] = CAPITAL_CATEGORY_ORDER.map((name) => {
    const catRows = rows.filter((r) => r.category === name);
    const sum = (pick: (r: CapitalProjectRow) => number) => catRows.reduce((a, r) => a + pick(r), 0);
    return {
      name,
      rows: catRows,
      origBudget: sum((r) => r.origBudget),
      currBudget: sum((r) => r.currBudget),
      actual: sum((r) => r.actual),
      committed: sum((r) => r.committed),
      remaining: sum((r) => r.remaining),
    };
  });

  const sumAll = (pick: (r: CapitalProjectRow) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const currBudget = sumAll((r) => r.currBudget);
  const actual = sumAll((r) => r.actual);
  const committed = sumAll((r) => r.committed);

  return {
    categories,
    totals: {
      origBudget: sumAll((r) => r.origBudget),
      currBudget,
      actual,
      committed,
      totalActPlusComm: actual + committed,
      remaining: currBudget - actual - committed,
      pctSpent: currBudget > 0 ? actual / currBudget : 0,
    },
    jobCount: rows.length,
    hasLiveData:
      (snapshot.jobCosts?.length ?? 0) > 0 ||
      (snapshot.jobBudgets?.length ?? 0) > 0 ||
      (snapshot.commitments?.byJob?.length ?? 0) > 0,
    asAt: CAPITAL_BUDGET_PRINTED.asAt,
    source: CAPITAL_BUDGET_PRINTED.source,
  };
}
