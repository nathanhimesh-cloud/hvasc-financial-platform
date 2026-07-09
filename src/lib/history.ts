import "server-only";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/auth/session";
import type { FinancialSnapshot, PeriodRef } from "@/lib/types";

export type { PeriodRef };

/**
 * Snapshot history (Postgres).
 *
 * The Blob store holds only the LATEST snapshot — each push overwrites it. This
 * keeps one row per (financial year, period), upserted on every push, so history
 * accumulates month by month and year over year. That's what powers period
 * navigation and FY-over-FY comparatives.
 *
 * Every function degrades to a no-op / empty result when no database is
 * configured, so the platform keeps working exactly as before without Postgres.
 */

function sql() {
  const url = databaseUrl();
  return url ? neon(url) : null;
}

export function isHistoryEnabled(): boolean {
  return !!databaseUrl();
}

/** Upsert the snapshot for its own period. Best-effort: never breaks a push. */
export async function saveSnapshot(snapshot: FinancialSnapshot): Promise<boolean> {
  try {
    const db = sql();
    if (!db) return false;
    const fy = snapshot.period?.fyLabel;
    const month = snapshot.period?.monthOfYear;
    if (!fy || !month) return false;

    await db`
      INSERT INTO snapshots (fy_label, period_month, period_label, generated_at, payload, updated_at)
      VALUES (
        ${fy},
        ${month},
        ${snapshot.period.label ?? null},
        ${snapshot.meta?.generatedAt ?? null},
        ${JSON.stringify(snapshot)}::jsonb,
        now()
      )
      ON CONFLICT (fy_label, period_month) DO UPDATE
        SET period_label = EXCLUDED.period_label,
            generated_at = EXCLUDED.generated_at,
            payload      = EXCLUDED.payload,
            updated_at   = now()
    `;
    return true;
  } catch (err) {
    console.error("[history] saveSnapshot failed (push continues):", err);
    return false;
  }
}

/** Every stored period, newest first. Cheap: doesn't read the payloads. */
export async function listPeriods(): Promise<PeriodRef[]> {
  try {
    const db = sql();
    if (!db) return [];
    const rows = (await db`
      SELECT fy_label, period_month, period_label, generated_at
      FROM snapshots
      ORDER BY fy_label DESC, period_month DESC
    `) as Array<{ fy_label: string; period_month: number; period_label: string | null; generated_at: string | null }>;
    return rows.map((r) => ({
      fyLabel: r.fy_label,
      periodMonth: r.period_month,
      periodLabel: r.period_label ?? `Month ${r.period_month}`,
      generatedAt: r.generated_at ? String(r.generated_at).slice(0, 10) : null,
    }));
  } catch (err) {
    console.error("[history] listPeriods failed:", err);
    return [];
  }
}

/**
 * The most recent stored period — the snapshot the dashboard should serve.
 *
 * Reads only `payload`, which is ~30 KB: transactions live in `gl_transactions`,
 * not in here. A whole-payload read per page request would be wasteful, so this
 * sits behind the TTL cache in lib/data/db-source.ts.
 */
export async function loadLatestSnapshot(): Promise<FinancialSnapshot | null> {
  try {
    const db = sql();
    if (!db) return null;
    const rows = (await db`
      SELECT payload FROM snapshots
      ORDER BY fy_label DESC, period_month DESC
      LIMIT 1
    `) as Array<{ payload: FinancialSnapshot }>;
    return rows.length ? rows[0].payload : null;
  } catch (err) {
    console.error("[history] loadLatestSnapshot failed:", err);
    return null;
  }
}

/** Load one stored period's snapshot, or null if we don't have it. */
export async function loadSnapshot(fyLabel: string, periodMonth: number): Promise<FinancialSnapshot | null> {
  try {
    const db = sql();
    if (!db) return null;
    const rows = (await db`
      SELECT payload FROM snapshots
      WHERE fy_label = ${fyLabel} AND period_month = ${periodMonth}
      LIMIT 1
    `) as Array<{ payload: FinancialSnapshot }>;
    return rows.length ? rows[0].payload : null;
  } catch (err) {
    console.error("[history] loadSnapshot failed:", err);
    return null;
  }
}

/** The most recent stored period of the FY immediately before `fyLabel`. */
export async function loadPriorYearSnapshot(fyLabel: string): Promise<FinancialSnapshot | null> {
  try {
    const db = sql();
    if (!db) return null;
    const rows = (await db`
      SELECT payload FROM snapshots
      WHERE fy_label < ${fyLabel}
      ORDER BY fy_label DESC, period_month DESC
      LIMIT 1
    `) as Array<{ payload: FinancialSnapshot }>;
    return rows.length ? rows[0].payload : null;
  } catch (err) {
    console.error("[history] loadPriorYearSnapshot failed:", err);
    return null;
  }
}
