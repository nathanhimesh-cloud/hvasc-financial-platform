import "server-only";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/auth/session";
import type { Transaction } from "@/lib/types";

/**
 * GL transaction ledger (Postgres).
 *
 * Each sync UPSERTs its transactions here, keyed on GLTRN's own primary key, so
 * the ledger accumulates across the year without duplicates and the snapshot
 * payload stays small. Queries are filtered + paginated in the database rather
 * than by loading the whole year into memory.
 *
 * Everything degrades gracefully when no database is configured: ingest is a
 * no-op and queries return empty, so callers fall back to the snapshot.
 */

function sql() {
  const url = databaseUrl();
  return url ? neon(url) : null;
}

export function isLedgerEnabled(): boolean {
  return !!databaseUrl();
}

/** A transaction as it arrives from the feed (carries GLTRN's key). */
export interface IncomingTransaction extends Transaction {
  ky?: number;
}

/**
 * Upsert a batch of transactions. Rows without a `ky` are skipped — without a
 * stable key we'd duplicate them on every sync.
 * Returns how many were written. Best-effort: never throws.
 */
export async function saveTransactions(
  fyLabel: string,
  transactions: IncomingTransaction[],
): Promise<number> {
  try {
    const db = sql();
    if (!db || !transactions.length) return 0;

    const rows = transactions.filter((t) => typeof t.ky === "number" && t.date);
    if (!rows.length) return 0;

    // Insert in chunks so one oversized statement can't blow the query limit.
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      // synced_at is left to its column DEFAULT on insert, and set explicitly on update.
      await db`
        INSERT INTO gl_transactions (ky, fy_label, txn_date, code, account, description, ref, debit, credit)
        SELECT * FROM UNNEST(
          ${chunk.map((t) => t.ky!)}::bigint[],
          ${chunk.map(() => fyLabel)}::text[],
          ${chunk.map((t) => t.date)}::date[],
          ${chunk.map((t) => t.code)}::text[],
          ${chunk.map((t) => t.account ?? "")}::text[],
          ${chunk.map((t) => t.description ?? "")}::text[],
          ${chunk.map((t) => t.ref ?? "")}::text[],
          ${chunk.map((t) => t.debit ?? 0)}::numeric[],
          ${chunk.map((t) => t.credit ?? 0)}::numeric[]
        ) AS t(ky, fy_label, txn_date, code, account, description, ref, debit, credit)
        ON CONFLICT (ky) DO UPDATE
          SET fy_label = EXCLUDED.fy_label,
              txn_date = EXCLUDED.txn_date,
              code = EXCLUDED.code,
              account = EXCLUDED.account,
              description = EXCLUDED.description,
              ref = EXCLUDED.ref,
              debit = EXCLUDED.debit,
              credit = EXCLUDED.credit,
              synced_at = now()
      `;
      written += chunk.length;
    }
    return written;
  } catch (err) {
    console.error("[ledger] saveTransactions failed (push continues):", err);
    return 0;
  }
}

export interface TransactionQuery {
  fyLabel?: string;
  /** ISO dates, inclusive. */
  from?: string;
  to?: string;
  /** Free-text across account / description / code / ref. */
  search?: string;
  /** Exact GL account code prefix — used by the drill-down. */
  code?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionPage {
  rows: Transaction[];
  total: number;
  totalDebit: number;
  totalCredit: number;
}

/** Filtered, paginated transactions straight from the database. */
export async function queryTransactions(q: TransactionQuery = {}): Promise<TransactionPage> {
  const empty: TransactionPage = { rows: [], total: 0, totalDebit: 0, totalCredit: 0 };
  try {
    const db = sql();
    if (!db) return empty;

    const limit = Math.min(Math.max(q.limit ?? 200, 1), 1000);
    const offset = Math.max(q.offset ?? 0, 0);
    // Null means "no filter" — each predicate is written to short-circuit on null.
    const fy = q.fyLabel ?? null;
    const from = q.from || null;
    const to = q.to || null;
    const search = q.search?.trim() ? `%${q.search.trim()}%` : null;
    const code = q.code?.trim() ? `${q.code.trim()}%` : null;

    const rows = (await db`
      SELECT ky, txn_date, code, account, description, ref, debit, credit
      FROM gl_transactions
      WHERE (${fy}::text IS NULL OR fy_label = ${fy})
        AND (${from}::date IS NULL OR txn_date >= ${from}::date)
        AND (${to}::date   IS NULL OR txn_date <= ${to}::date)
        AND (${code}::text IS NULL OR code LIKE ${code})
        AND (${search}::text IS NULL OR
             account ILIKE ${search} OR description ILIKE ${search} OR
             code ILIKE ${search} OR ref ILIKE ${search})
      ORDER BY txn_date DESC, ky DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Array<Record<string, unknown>>;

    const agg = (await db`
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(debit), 0)::float8  AS total_debit,
             COALESCE(SUM(credit), 0)::float8 AS total_credit
      FROM gl_transactions
      WHERE (${fy}::text IS NULL OR fy_label = ${fy})
        AND (${from}::date IS NULL OR txn_date >= ${from}::date)
        AND (${to}::date   IS NULL OR txn_date <= ${to}::date)
        AND (${code}::text IS NULL OR code LIKE ${code})
        AND (${search}::text IS NULL OR
             account ILIKE ${search} OR description ILIKE ${search} OR
             code ILIKE ${search} OR ref ILIKE ${search})
    `) as Array<{ total: number; total_debit: number; total_credit: number }>;

    return {
      rows: rows.map((r) => ({
        date: String(r.txn_date).slice(0, 10),
        code: String(r.code ?? ""),
        account: String(r.account ?? ""),
        description: String(r.description ?? ""),
        ref: String(r.ref ?? ""),
        debit: Number(r.debit ?? 0),
        credit: Number(r.credit ?? 0),
      })),
      total: agg[0]?.total ?? 0,
      totalDebit: agg[0]?.total_debit ?? 0,
      totalCredit: agg[0]?.total_credit ?? 0,
    };
  } catch (err) {
    console.error("[ledger] queryTransactions failed:", err);
    return empty;
  }
}
