import "server-only";
import type { FinancialSnapshot } from "@/lib/types";
import { readRuntimeSnapshot } from "@/lib/feed/store";
import { readOverrides, applyOverrides } from "@/lib/feed/overrides";
import { loadSnapshotFromDb } from "./db-source";
import bundled from "@/data/snapshot.json";

/**
 * Feed adapter. Order of precedence:
 *   1. Postgres `snapshots` — the source of truth. Every sync archives here, so
 *      what the dashboard serves is exactly what's kept, and history accumulates
 *      year over year. Cached with a short TTL (see db-source.ts), and the
 *      payload excludes transactions, so a read is ~30 KB not ~3 MB.
 *   2. Runtime store — Vercel Blob in prod, a local file in dev. Still written on
 *      every push, so the platform keeps working when Postgres is unreachable or
 *      DATABASE_URL isn't set (which is the case for local development).
 *   3. Bundled snapshot.json — build-time fallback of last resort.
 *
 * Mapping overrides (renames / department reassignments curated on the Mapping
 * tab) are then layered on top, so they survive every re-upload.
 */
export async function loadSnapshotFromFeed(): Promise<FinancialSnapshot> {
  const overrides = await readOverrides();
  const snapshot = applyOverrides(await loadRawSnapshotFromFeed(), overrides);

  // Live statements only. The Balance Sheet is now built live in the ODBC feed
  // (05-build-snapshot.ps1). We deliberately do NOT fall back to the legacy
  // statements store: it held a one-off PRIOR-YEAR upload, and overlaying it made
  // a stale FY24-25 Cash Flow / Balance Sheet appear under the current year. Cash
  // Flow simply isn't shown until a current one exists (FR module still locked),
  // rather than mixing in last year's numbers.
  return snapshot;
}

/**
 * The feed snapshot BEFORE mapping overrides are applied. Used by the Mapping
 * tab to show the original (imported) names/assignments alongside edits.
 */
export async function loadRawSnapshotFromFeed(): Promise<FinancialSnapshot> {
  // Database first. Never let a database problem take the dashboard down — fall
  // through to Blob, which every push writes to as well.
  const fromDb = await loadSnapshotFromDb();
  if (fromDb) return fromDb;

  const runtime = await readRuntimeSnapshot();
  return runtime ?? (bundled as unknown as FinancialSnapshot);
}
