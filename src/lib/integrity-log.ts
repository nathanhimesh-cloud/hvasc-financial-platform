import "server-only";
import { neon } from "@neondatabase/serverless";
import type { IntegrityReport } from "@/lib/integrity";
import type { FinancialSnapshot } from "@/lib/types";

/**
 * The integrity log (Build Brief A4b: "log check results over time").
 *
 * A4 answers "is TODAY'S report trustworthy?". This answers the question an auditor
 * actually asks — "has it ever not been?" — which nobody could answer, because each
 * run overwrote the last.
 *
 * Append-only. Rows are never updated and never deleted. The whole value of the
 * record is that it cannot be tidied up after the fact: a month where the balance
 * sheet didn't balance stays on the record even after it's fixed, and that is the
 * point.
 */

export interface IntegrityRun {
  id: number;
  checkedAt: string;
  fyLabel: string;
  periodLabel: string;
  passed: boolean;
  checksTotal: number;
  checksFailed: number;
  failures: { id: string; label: string; detail: string }[];
}

function db() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

/**
 * Record one run. Called by the sync receiver, after the snapshot lands.
 *
 * Never throws. A logging failure must not be able to take down the data feed — the
 * ledger arriving matters more than the note that it arrived, and an exception here
 * would roll back a good snapshot for the sake of an audit row.
 */
export async function recordIntegrity(
  snapshot: FinancialSnapshot,
  report: IntegrityReport,
): Promise<boolean> {
  const sql = db();
  if (!sql) return false;

  const failures = report.checks
    .filter((c) => c.status === "fail")
    .map((c) => ({
      id: c.id,
      label: c.label,
      detail: c.reason ?? c.detail ?? "",
    }));

  try {
    await sql`
      INSERT INTO integrity_log
        (fy_label, period_label, passed, checks_total, checks_failed, failures)
      VALUES (
        ${snapshot.period.fyLabel},
        ${snapshot.period.label},
        ${report.status !== "fail"},
        ${report.checkedCount + report.skippedCount},
        ${report.failedCount},
        ${JSON.stringify(failures)}
      )
    `;
    return true;
  } catch (err) {
    console.error("integrity log write failed", err);
    return false;
  }
}

/** Newest first. */
export async function listIntegrityRuns(limit = 60): Promise<IntegrityRun[]> {
  const sql = db();
  if (!sql) return [];
  try {
    const rows = (await sql`
      SELECT id, checked_at, fy_label, period_label, passed,
             checks_total, checks_failed, failures
      FROM integrity_log
      ORDER BY checked_at DESC
      LIMIT ${limit}
    `) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: Number(r.id),
      checkedAt: new Date(r.checked_at as string).toISOString(),
      fyLabel: String(r.fy_label),
      periodLabel: String(r.period_label),
      passed: Boolean(r.passed),
      checksTotal: Number(r.checks_total),
      checksFailed: Number(r.checks_failed),
      failures: (r.failures as IntegrityRun["failures"]) ?? [],
    }));
  } catch {
    // The table may not exist yet. An empty history is the honest answer — better
    // than a 500 on the Data Status page because a migration hasn't run.
    return [];
  }
}

export interface IntegrityHistory {
  runs: IntegrityRun[];
  /** Consecutive passing runs, counting back from the most recent. */
  cleanStreak: number;
  /** Runs that failed, across the whole window. */
  failedRuns: number;
  /** The most recent failure, if any — the one worth explaining. */
  lastFailure: IntegrityRun | null;
}

export function summariseHistory(runs: IntegrityRun[]): IntegrityHistory {
  let cleanStreak = 0;
  for (const r of runs) {
    if (!r.passed) break;
    cleanStreak++;
  }
  return {
    runs,
    cleanStreak,
    failedRuns: runs.filter((r) => !r.passed).length,
    lastFailure: runs.find((r) => !r.passed) ?? null,
  };
}
