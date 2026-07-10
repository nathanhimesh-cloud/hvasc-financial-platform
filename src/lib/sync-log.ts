import "server-only";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/auth/session";

/**
 * Sync log — one row per push.
 *
 * "Data as at 9 Jul 2026" can't tell you whether you're looking at the 06:00 or
 * the 18:00 sync, nor whether the ledger actually accepted the transactions that
 * came with it. This records both, so "is the dashboard current?" has an answer
 * that isn't a guess.
 *
 * Best-effort throughout: a logging failure must never fail a push.
 */

function sql() {
  const url = databaseUrl();
  return url ? neon(url) : null;
}

export interface SyncLogEntry {
  generatedAt: string | null;
  fyLabel: string | null;
  periodMonth: number | null;
  periodLabel: string | null;
  txnsSent: number;
  txnsIngested: number;
  archived: boolean;
  store: string | null;
  maxKy: number | null;
  source: string | null;
}

export interface SyncLogRow extends SyncLogEntry {
  id: number;
  receivedAt: string;
}

export async function recordSync(entry: SyncLogEntry): Promise<boolean> {
  try {
    const db = sql();
    if (!db) return false;
    await db`
      INSERT INTO sync_log
        (generated_at, fy_label, period_month, period_label,
         txns_sent, txns_ingested, archived, store, max_ky, source)
      VALUES
        (${entry.generatedAt}, ${entry.fyLabel}, ${entry.periodMonth}, ${entry.periodLabel},
         ${entry.txnsSent}, ${entry.txnsIngested}, ${entry.archived}, ${entry.store},
         ${entry.maxKy}, ${entry.source})
    `;
    return true;
  } catch (err) {
    console.error("[sync-log] recordSync failed (push continues):", err);
    return false;
  }
}

/** Most recent syncs, newest first. */
export async function listSyncs(limit = 50): Promise<SyncLogRow[]> {
  try {
    const db = sql();
    if (!db) return [];
    const rows = (await db`
      SELECT id, received_at, generated_at, fy_label, period_month, period_label,
             txns_sent, txns_ingested, archived, store, max_ky, source
      FROM sync_log ORDER BY received_at DESC LIMIT ${limit}
    `) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      receivedAt: String(r.received_at),
      generatedAt: r.generated_at ? String(r.generated_at) : null,
      fyLabel: r.fy_label ? String(r.fy_label) : null,
      periodMonth: r.period_month === null ? null : Number(r.period_month),
      periodLabel: r.period_label ? String(r.period_label) : null,
      txnsSent: Number(r.txns_sent ?? 0),
      txnsIngested: Number(r.txns_ingested ?? 0),
      archived: Boolean(r.archived),
      store: r.store ? String(r.store) : null,
      maxKy: r.max_ky === null ? null : Number(r.max_ky),
      source: r.source ? String(r.source) : null,
    }));
  } catch (err) {
    console.error("[sync-log] listSyncs failed:", err);
    return [];
  }
}

/** The most recent sync, for the "last updated" indicator. */
export async function lastSync(): Promise<SyncLogRow | null> {
  const rows = await listSyncs(1);
  return rows[0] ?? null;
}
