import type {
  Department,
  DepartmentDerived,
  FinancialSnapshot,
  Grant,
} from "@/lib/types";

/** Departments enriched with computed fields and their grants. */
export function deriveDepartments(
  snapshot: FinancialSnapshot,
): DepartmentDerived[] {
  return snapshot.departments.map((d) => ({
    ...d,
    pctSpent: d.annualBudget > 0 ? d.ytdActual / d.annualBudget : 0,
    variance: d.ytdBudget - d.ytdActual,
    grants: snapshot.grants.filter((g) => g.departmentId === d.id),
  }));
}

/** A grant requires action if its status chip is urgent or warning. */
export function grantNeedsAction(g: Grant): boolean {
  return g.statusChip.level === "urgent" || g.statusChip.level === "warning";
}

export interface CfoKpis {
  totalBudget: number;
  ytdActual: number;
  budgetRemaining: number;
  ytdSpentRatio: number;
  grantsNeedingAction: number;
  departmentCount: number;
}

export function cfoKpis(snapshot: FinancialSnapshot): CfoKpis {
  const totalBudget = sum(snapshot.departments, (d) => d.annualBudget);
  const ytdActual = sum(snapshot.departments, (d) => d.ytdActual);
  return {
    totalBudget,
    ytdActual,
    budgetRemaining: totalBudget - ytdActual,
    ytdSpentRatio: totalBudget > 0 ? ytdActual / totalBudget : 0,
    grantsNeedingAction: snapshot.grants.filter(grantNeedsAction).length,
    departmentCount: snapshot.departments.length,
  };
}

export interface GrantKpis {
  activeGrants: number;
  totalFunds: number;
  spent: number;
  utilisation: number;
  needingAction: number;
}

export function grantKpis(snapshot: FinancialSnapshot): GrantKpis {
  const totalFunds = sum(snapshot.grants, (g) => g.total);
  const spent = sum(snapshot.grants, (g) => g.spent);
  return {
    activeGrants: snapshot.grants.length,
    totalFunds,
    spent,
    utilisation: totalFunds > 0 ? spent / totalFunds : 0,
    needingAction: snapshot.grants.filter(grantNeedsAction).length,
  };
}

/** Total revenue collected YTD across all revenue centres. */
export function totalRevenue(snapshot: FinancialSnapshot): number {
  return sum(snapshot.revenueLines, (r) => r.ytd);
}

/** Budget-allocation share per department (for the donut). */
export function budgetAllocation(snapshot: FinancialSnapshot) {
  const total = sum(snapshot.departments, (d) => d.annualBudget);
  return snapshot.departments.map((d) => ({
    department: d,
    share: total > 0 ? d.annualBudget / total : 0,
  }));
}

export function findDepartment(
  snapshot: FinancialSnapshot,
  slug: string,
): Department | undefined {
  return snapshot.departments.find((d) => d.slug === slug);
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}
