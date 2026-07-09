import type { FinancialSnapshot } from "@/lib/types";
import type { CashBreakdown } from "@/lib/liquidity";
import type { GrantSummary } from "@/lib/grants";
import type { JobBudgetSummary } from "@/lib/job-budgets";
import type { IntegrityReport } from "@/lib/integrity";

/**
 * Data-quality issues, gathered per page.
 *
 * These used to be inline banners scattered through the UI. Two problems with
 * that: the dashboard became a wall of caveats, and a permanent banner is a
 * banner nobody reads. So each page now collects its caveats into one indicator
 * that shows a count and opens on demand.
 *
 * What must NOT move into here: anything that changes how a NUMBER should be
 * read. The "at least / at most" markers on restricted cash stay on the figures
 * themselves, because a reader who never opens the panel would otherwise take a
 * bound for an exact amount.
 */

export type IssueLevel = "warn" | "info";

export interface DataIssue {
  id: string;
  level: IssueLevel;
  title: string;
  detail: string;
  /** Who unblocks it, when it isn't us. */
  owner?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Early in a financial year the figures are genuinely tiny. Say so once. */
function earlyYearIssue(snapshot: FinancialSnapshot): DataIssue | null {
  const m = snapshot.period?.monthOfYear ?? 0;
  if (m > 2) return null;
  return {
    id: "early-year",
    level: "info",
    title: `Month ${m} of the financial year`,
    detail:
      "Year-to-date figures cover only the first few weeks of the year, so totals look small and monthly comparisons aren't meaningful yet. This is the data, not a fault.",
  };
}

export function dashboardIssues(
  snapshot: FinancialSnapshot,
  cash: CashBreakdown,
  integrity: IntegrityReport,
): DataIssue[] {
  const issues: DataIssue[] = [];
  const early = earlyYearIssue(snapshot);
  if (early) issues.push(early);

  const failed = integrity.checks.filter((c) => c.status === "fail");
  const notChecked = integrity.checks.filter((c) => c.status === "not-checked");
  if (failed.length) {
    issues.push({
      id: "integrity-fail",
      level: "warn",
      title: `${plural(failed.length, "reconciliation check")} failed`,
      detail: failed.map((c) => `${c.label}: ${c.reason ?? c.detail ?? ""}`).join(" · "),
    });
  }
  if (notChecked.length) {
    issues.push({
      id: "integrity-pending",
      level: "info",
      title: `${plural(notChecked.length, "check")} awaiting data`,
      detail: `${notChecked.map((c) => c.label).join(", ")}. The Cash Flow checks need Practical's FR tables, which Civica hasn't unlocked yet.`,
      owner: "Civica",
    });
  }

  if (!cash.exact) {
    issues.push({
      id: "restricted-cash-bounds",
      level: "warn",
      title: "Restricted cash is a bound, not an exact figure",
      detail: `The grant register has no opening balance for ${cash.unmeasured.missingOpeningBalance} restricted grants and no job code for ${cash.unmeasured.missingJobCodes}. Unmeasured restrictions make restricted cash a floor, and unrestricted cash and months of cover a ceiling. Needs opening balances at 30 Jun 26 and the remaining job codes.`,
      owner: "Council",
    });
  }

  const unmapped = snapshot.meta?.unmappedAccounts ?? 0;
  if (unmapped > 0) {
    issues.push({
      id: "unmapped-accounts",
      level: "warn",
      title: `${plural(unmapped, "account")} not assigned to a department`,
      detail:
        "These carry money but sit outside all three departments, so department totals understate. Mostly on-cost recovery accounts (16xx-2000) and Consultants. Needs a decision on whether they belong to Corporate Services or are contras to exclude.",
      owner: "Council",
    });
  }

  return issues;
}

export function grantIssues(summary: GrantSummary): DataIssue[] {
  const issues: DataIssue[] = [];
  if (summary.needsAttention > 0) {
    issues.push({
      id: "grant-codes",
      level: "warn",
      title: `${plural(summary.needsAttention, "grant")} with codes we couldn't resolve`,
      detail:
        "The register lists wildcards or free text where a GL or job code should be. Their figures are partial, and are flagged in the table rather than shown as a confident $0.",
      owner: "Council",
    });
  }
  if (summary.closedCount > 0) {
    issues.push({
      id: "grant-closed",
      level: "info",
      title: `${plural(summary.closedCount, "closed grant")} excluded from totals`,
      detail:
        'Rows flagged "remove from FY27" or "closed out" in the register. Including them would overstate every total. Use "Show closed" to see them.',
    });
  }
  return issues;
}

export function jobIssues(summary: JobBudgetSummary): DataIssue[] {
  const issues: DataIssue[] = [];
  if (summary.noBudget > 0) {
    issues.push({
      id: "jobs-no-budget",
      level: "warn",
      title: `${plural(summary.noBudget, "GL account")} with spend but no budget`,
      detail: "Nothing to track these against until a budget is loaded in Practical.",
      owner: "Council",
    });
  }
  if (summary.unmappedJobs > 0) {
    issues.push({
      id: "jobs-unmapped",
      level: "warn",
      title: `${plural(summary.unmappedJobs, "job")} with no GL account`,
      detail: 'The job register has no GL account against them. Grouped under "Jobs with no GL account".',
      owner: "Council",
    });
  }
  if (!summary.hasCommitments) {
    issues.push({
      id: "jobs-no-commitments",
      level: "info",
      title: "Commitments are not recorded",
      detail:
        "Practical's Committed column is empty on every job, so committed-but-unspent amounts can't be shown. This is a data-entry practice, not a system limitation.",
      owner: "Council",
    });
  }
  if (summary.totalUnjobbed !== 0) {
    issues.push({
      id: "jobs-unjobbed",
      level: "info",
      title: "Some spend carries no job code",
      detail:
        "Actual is the GL account's full balance; job-costed is only the part carrying a job code. The difference posted straight to the account.",
    });
  }
  return issues;
}
