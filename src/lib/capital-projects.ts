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
  /** True when Curr Bud comes live from Practical's JCMST estimate. */
  liveBudget?: boolean;
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
  /** How many rows carry a LIVE Practical (JCMST) current budget. */
  liveBudgets: number;
  /** False when the snapshot carries no job-cost or commitment data at all —
   * the page then says plainly the live columns are awaiting a sync. */
  hasLiveData: boolean;
  asAt: string;
  source: string;
}

/**
 * Practical keys jobs as "JOB-SUBJOB" (4-4, e.g. "1000-2000"); the printed
 * budget report shows a third, always-zero segment ("1000-2000-0000"). Join on
 * the 4-4 prefix so the ledger's codes match the transcribed budgets whichever
 * form a data block uses.
 */
const jobKey = (code: string) => code.trim().slice(0, 9);

/** Works category from the job-number series (1000-2xxx roads … 1000-6xxx buildings). */
function categoryOf(code: string): CapitalCategoryName {
  const series = code.charAt(5);
  if (series === "2") return "Roads & Civil Works";
  if (series === "3") return "Community Infrastructure & IT";
  if (series === "4") return "Plant & Fleet";
  if (series === "5") return "Water & Sewerage";
  return "Buildings & Housing";
}

export function buildCapitalProgramme(snapshot: FinancialSnapshot): CapitalProgramme {
  // Job-costed spend by code. JCTRN is the primary source; the job register's
  // own per-job actuals are the fallback when the cost-ledger block is absent.
  const actualBy = new Map<string, number>();
  for (const jc of snapshot.jobCosts ?? []) {
    const key = jobKey(jc.code);
    actualBy.set(key, (actualBy.get(key) ?? 0) + jc.amount);
  }
  if (actualBy.size === 0) {
    for (const g of snapshot.jobBudgets ?? []) {
      for (const j of g.jobs) {
        if (!j.actual) continue;
        const key = jobKey(j.code);
        actualBy.set(key, (actualBy.get(key) ?? 0) + j.actual);
      }
    }
  }

  const commitBy = new Map<string, number>();
  for (const c of snapshot.commitments?.byJob ?? []) {
    const key = jobKey(c.code);
    commitBy.set(key, (commitBy.get(key) ?? 0) + c.amount);
  }

  // LIVE current budgets. The feed already ships JCMST's per-job estimate
  // (NEWEST, falling back to ESTIMATE) inside jobBudgets — every capital job
  // carries one. So the two budget columns now mean exactly what the printed
  // report means: Orig = the adopted figure as printed 23 Jul; Curr = whatever
  // Practical says TODAY. When they differ, that's a real budget movement.
  const liveBy = new Map<string, { budget: number; name: string }>();
  for (const g of snapshot.jobBudgets ?? []) {
    for (const j of g.jobs) {
      const key = jobKey(j.code);
      if (key.startsWith("1000-") && j.budget > 0) liveBy.set(key, { budget: j.budget, name: j.name });
    }
  }

  const rows: CapitalProjectRow[] = CAPITAL_JOBS_FY27.map((seed) => {
    const key = jobKey(seed.code);
    const live = liveBy.get(key);
    const currBudget = live ? live.budget : seed.currBudget;
    const actual = actualBy.get(key) ?? 0;
    const committed = commitBy.get(key) ?? 0;
    const totalActPlusComm = actual + committed;
    return {
      ...seed,
      currBudget,
      liveBudget: !!live,
      actual,
      committed,
      totalActPlusComm,
      remaining: currBudget - totalActPlusComm,
      pctSpent: currBudget > 0 ? actual / currBudget : 0,
    };
  });

  // Capital jobs Practical knows about that the printed report DOESN'T —
  // e.g. 1000-2010 Reservoir Road and 1000-2021 R2R Program. Show them with a
  // zero Original (nothing was printed) and the live Current, rather than
  // hiding money the register is tracking.
  for (const [key, v] of liveBy) {
    if (rows.some((r) => jobKey(r.code) === key)) continue;
    const actual = actualBy.get(key) ?? 0;
    const committed = commitBy.get(key) ?? 0;
    rows.push({
      code: key,
      name: v.name,
      category: categoryOf(key),
      origBudget: 0,
      currBudget: v.budget,
      liveBudget: true,
      actual,
      committed,
      totalActPlusComm: actual + committed,
      remaining: v.budget - actual - committed,
      pctSpent: v.budget > 0 ? actual / v.budget : 0,
    });
  }

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
    liveBudgets: rows.filter((r) => r.liveBudget).length,
    hasLiveData:
      (snapshot.jobCosts?.length ?? 0) > 0 ||
      (snapshot.jobBudgets?.length ?? 0) > 0 ||
      (snapshot.commitments?.byJob?.length ?? 0) > 0,
    asAt: CAPITAL_BUDGET_PRINTED.asAt,
    source: CAPITAL_BUDGET_PRINTED.source,
  };
}
