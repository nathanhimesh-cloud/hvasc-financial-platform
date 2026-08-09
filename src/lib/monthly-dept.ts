import type { FinancialSnapshot } from "@/lib/types";
import { monthlyMapFromSnapshot } from "@/lib/budget-report";

/**
 * "This month" for a DEPARTMENT (Aug 2026 review: managers see monthly AND
 * year-to-date, not just YTD). The feed ships per-ACCOUNT cumulative series;
 * a department's month is the sum of its accounts' month movements —
 * cumulative[m] − cumulative[m−1], joined through each account's department
 * mapping. Returns available:false until the extended feed has run, so the UI
 * can simply not render rather than show zeros that mean "no data".
 */
export interface DeptMonthFigures {
  available: boolean;
  /** Financial-year month (1 = July). */
  month: number;
  expenseMonth: number;
  expenseBudgetMonth: number;
  revenueMonth: number;
}

export function departmentMonthFigures(snapshot: FinancialSnapshot, deptId: string): DeptMonthFigures {
  const month = snapshot.period?.monthOfYear ?? 1;
  const none: DeptMonthFigures = { available: false, month, expenseMonth: 0, expenseBudgetMonth: 0, revenueMonth: 0 };

  const map = monthlyMapFromSnapshot(snapshot.accountMonthly);
  if (map.size === 0) return none;

  let expenseMonth = 0;
  let expenseBudgetMonth = 0;
  let revenueMonth = 0;
  let hit = false;

  for (const a of snapshot.accounts ?? []) {
    if (a.departmentId !== deptId) continue;
    const fig = map.get(a.code.trim().slice(0, 9));
    if (!fig) continue;
    const cur = fig.bal[month];
    if (cur === undefined) continue;
    hit = true;
    const prev = (month > 1 ? fig.bal[month - 1] : 0) ?? 0;
    const move = cur - prev;
    if (a.kind === "expense") {
      expenseMonth += move;
      const budCur = fig.bud[month];
      if (budCur !== undefined) {
        const budPrev = (month > 1 ? fig.bud[month - 1] : 0) ?? 0;
        expenseBudgetMonth += budCur - budPrev;
      }
    } else if (a.kind === "revenue") {
      revenueMonth += move;
    }
  }

  if (!hit) return none;
  return { available: true, month, expenseMonth, expenseBudgetMonth, revenueMonth };
}
