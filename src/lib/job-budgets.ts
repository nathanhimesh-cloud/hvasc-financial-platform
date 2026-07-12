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
  /** YTD budget less the account's real spend. Negative = over budget to date. */
  variance: number;
  /** glActual ÷ ANNUAL budget — progress through the year's money. */
  utilisation: number;
  /** glActual ÷ YTD budget — the figure that says "over budget" or not. */
  utilisationYtd: number;
  /** True when a YTD budget exists to judge against. */
  hasBudgetYtd: boolean;
  /**
   * Spend on this account that carried no job code. Only meaningful when the
   * account is in the operating chart AND its balance covers the job spend —
   * see `glKnown` and `nonOperating`.
   */
  unjobbed: number;
  /** True when the account has a budget we can measure against. */
  hasBudget: boolean;
  /**
   * True when the job's GL account appears in the operating chart of accounts
   * (income/expense). Capital jobs post to asset accounts, which never appear
   * there, so budget and glActual are both 0 and comparing them is nonsense.
   */
  glKnown: boolean;
  /**
   * Job spend that never reached an operating expense account — capital work in
   * progress, or a job whose GL account is outside the income/expense chart.
   * Reported separately rather than netted against "not job-costed".
   */
  nonOperatingSpend: number;
}

export interface JobBudgetSummary {
  groups: number;
  jobs: number;
  /** Annual budget across all groups. */
  totalBudget: number;
  /** Budget to date — what actual should be compared with. */
  totalBudgetYtd: number;
  totalGlActual: number;
  totalJobActual: number;
  /** Spend with no job code attached. Never negative. */
  totalUnjobbed: number;
  /** Job spend that never reached an operating expense account (capital, mostly). */
  totalNonOperating: number;
  /** Accounts whose spend exceeds their budget. */
  overBudget: number;
  /** Accounts carrying spend but no budget — can't be tracked. */
  noBudget: number;
  /** Groups whose GL account isn't in the operating chart of accounts. */
  nonOperatingGroups: number;
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

  /**
   * Committed spend per job — from OPEN PURCHASE ORDERS, not from JCMST.COMTOT.
   *
   * COMTOT is the field Practical provides for exactly this, and at Hope Vale it
   * is zero on every one of the 4,118 job rows: the site doesn't maintain it. The
   * real commitment lives in the purchase-order module (value ordered, less value
   * invoiced), which the feed now computes. Overlay it here so a job shows budget,
   * actual AND what's already been ordered against it — the last of which is
   * invisible in the general ledger and is exactly how an account quietly goes
   * over budget without anyone seeing it coming.
   */
  const committedByJob = new Map<string, number>();
  for (const c of snapshot.commitments?.byJob ?? []) {
    committedByJob.set(c.code, c.amount);
  }

  return list
    .map((g) => {
      const rawJobs = Array.isArray(g.jobs) ? g.jobs : g.jobs ? [g.jobs] : [];
      const jobs = rawJobs.map((j) => ({
        ...j,
        committed: committedByJob.get(j.code) ?? j.committed ?? 0,
      }));
      const hasBudget = g.budget > 0;

      // Judge spend against the budget TO DATE, not the whole year's. Nine days
      // into a year, every account looks gloriously under its annual budget.
      // Older snapshots have no budgetYtd; straight-line it rather than falling
      // back to the annual figure, which would flag nothing as over budget.
      const budgetYtd = g.budgetYtd ?? 0;

      // The feed only knows budgets and balances for INCOME/EXPENSE accounts.
      // A group with job spend but neither a budget nor a balance is a job
      // posting somewhere outside that chart — almost always capital work.
      const glKnown = g.glAccount !== "unmapped" && (g.budget !== 0 || g.glActual !== 0);

      // Job costs can exceed an operating account's balance (capital portions
      // post to assets). Subtracting them would produce a negative "not
      // job-costed" figure, which is meaningless. Split the two ideas apart.
      const unjobbed = glKnown ? Math.max(g.glActual - g.jobActual, 0) : 0;
      const nonOperatingSpend = glKnown ? Math.max(g.jobActual - g.glActual, 0) : g.jobActual;

      return {
        ...g,
        jobs,
        budgetYtd,
        variance: budgetYtd - g.glActual,
        utilisation: hasBudget ? g.glActual / g.budget : 0,
        utilisationYtd: budgetYtd > 0 ? g.glActual / budgetYtd : 0,
        unjobbed,
        hasBudget,
        hasBudgetYtd: budgetYtd > 0,
        glKnown,
        nonOperatingSpend,
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
    totalNonOperating: sum((g) => g.nonOperatingSpend),
    totalBudgetYtd: sum((g) => g.budgetYtd),
    // Over budget means over the budget TO DATE. Against the annual figure,
    // nothing is ever over budget until December.
    overBudget: groups.filter((g) => g.hasBudgetYtd && g.glActual > g.budgetYtd).length,
    noBudget: groups.filter((g) => !g.hasBudget && g.glActual !== 0).length,
    nonOperatingGroups: groups.filter((g) => !g.glKnown && g.glAccount !== "unmapped").length,
    unmappedJobs: groups.find((g) => g.glAccount === "unmapped")?.jobs.length ?? 0,
    hasCommitments: groups.some((g) => g.jobs.some((j) => j.committed !== 0)),
  };
}
