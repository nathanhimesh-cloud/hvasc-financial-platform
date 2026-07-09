import type { FinancialSnapshot, JobBudgetGroup } from "@/lib/types";

/**
 * Job-wise budget tracking (Shaun's request, 12 Jun: "Pls build job wise budget
 * tracking as well. see the reports.").
 *
 * The report he pointed at is Practical's "Jobs Budget", which nests jobs under
 * their GL account's budget rather than budgeting each job. That's not a display
 * choice — it's where the data lives. In the FY26 job-costing export only **12 of
 * 384 jobs** carried an estimate of their own, and the FY27 Jobs Budget report
 * shows every job row at 0.00 with the money held on the account above it.
 *
 * So: budget from the GL account, actuals from the jobs beneath it.
 *
 * Two figures are deliberately kept apart:
 *   glActual  — everything posted to the account
 *   jobActual — only the part that carried a job code
 * The gap between them is spend that was never job-costed. Collapsing them into
 * one "actual" would quietly hide that.
 */

export interface JobBudgetView extends JobBudgetGroup {
  /** Budget less the account's real spend. Negative = over budget. */
  variance: number;
  /** glActual ÷ budget. 0 when there is no budget to measure against. */
  utilisation: number;
  /** Spend on this account that carried no job code. */
  unjobbed: number;
  /** True when the account has a budget we can measure against. */
  hasBudget: boolean;
}

export interface JobBudgetSummary {
  groups: number;
  jobs: number;
  totalBudget: number;
  totalGlActual: number;
  totalJobActual: number;
  /** Spend with no job code attached, across every account. */
  totalUnjobbed: number;
  /** Accounts whose spend exceeds their budget. */
  overBudget: number;
  /** Accounts carrying spend but no budget — can't be tracked. */
  noBudget: number;
  /** Jobs that couldn't be matched to a GL account. */
  unmappedJobs: number;
  /** True when Practical records commitments (it currently doesn't). */
  hasCommitments: boolean;
}

/** Snapshot → view rows. Tolerates a single-object payload from ConvertTo-Json. */
export function jobBudgetGroups(snapshot: FinancialSnapshot): JobBudgetView[] {
  const raw = snapshot.jobBudgets;
  // PowerShell's ConvertTo-Json emits a bare object, not an array, for one item.
  const list: JobBudgetGroup[] = Array.isArray(raw) ? raw : raw ? [raw as JobBudgetGroup] : [];

  return list
    .map((g) => {
      const jobs = Array.isArray(g.jobs) ? g.jobs : g.jobs ? [g.jobs] : [];
      const hasBudget = g.budget > 0;
      return {
        ...g,
        jobs,
        variance: g.budget - g.glActual,
        utilisation: hasBudget ? g.glActual / g.budget : 0,
        unjobbed: g.glActual - g.jobActual,
        hasBudget,
      };
    })
    .sort((a, b) => b.budget - a.budget || b.glActual - a.glActual);
}

export function jobBudgetSummary(groups: JobBudgetView[]): JobBudgetSummary {
  const sum = (pick: (g: JobBudgetView) => number) => groups.reduce((a, g) => a + pick(g), 0);
  return {
    groups: groups.length,
    jobs: sum((g) => g.jobs.length),
    totalBudget: sum((g) => g.budget),
    totalGlActual: sum((g) => g.glActual),
    totalJobActual: sum((g) => g.jobActual),
    totalUnjobbed: sum((g) => g.unjobbed),
    overBudget: groups.filter((g) => g.hasBudget && g.glActual > g.budget).length,
    noBudget: groups.filter((g) => !g.hasBudget && g.glActual !== 0).length,
    unmappedJobs: groups.find((g) => g.glAccount === "unmapped")?.jobs.length ?? 0,
    hasCommitments: groups.some((g) => g.jobs.some((j) => j.committed !== 0)),
  };
}
