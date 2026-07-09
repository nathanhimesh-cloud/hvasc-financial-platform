import "server-only";
import type { FinancialSnapshot } from "@/lib/types";
import { loadLatestSnapshot, isHistoryEnabled } from "@/lib/history";

/**
 * Postgres as the source of truth for the dashboard.
 *
 * Every sync writes the snapshot to three places: the `snapshots` table (one row
 * per financial year + period), the `gl_transactions` table, and Vercel Blob.
 * Reading from Postgres rather than Blob means the platform serves the same
 * store it archives into — no divergence between "what's live" and "what's kept",
 * and year-over-year navigation is a query rather than a file.
 *
 * COST. The pages are `force-dynamic`, so without care every request would read
 * a ~30 KB payload out of Neon. Three guards:
 *
 *   1. Transactions do NOT live in the payload. They're in `gl_transactions`,
 *      queried with LIMIT + indexes only when a transaction view asks for them.
 *      That keeps the payload at ~30 KB instead of ~3 MB by June.
 *   2. A short TTL memo in module scope. Serverless instances are short-lived and
 *      syncs run 3x/day, so 60s of staleness costs nothing and collapses a burst
 *      of page views into a single query.
 *   3. `clearSnapshotCache()` drops the memo on push, so a sync is visible at once
 *      rather than up to a minute later.
 *
 * A previous version cached at module scope with no expiry and went stale on warm
 * instances after a nightly feed update. The TTL is what makes this safe.
 */

const TTL_MS = 60_000;

let cached: { at: number; snapshot: FinancialSnapshot } | null = null;
/** In-flight read, so a burst of concurrent renders issues one query, not N. */
let inflight: Promise<FinancialSnapshot | null> | null = null;

export function isDbSourceEnabled(): boolean {
  return isHistoryEnabled();
}

/** Drop the memo. Called by the push route so a sync appears immediately. */
export function clearDbSnapshotCache(): void {
  cached = null;
  inflight = null;
}

export async function loadSnapshotFromDb(): Promise<FinancialSnapshot | null> {
  if (!isHistoryEnabled()) return null;

  if (cached && Date.now() - cached.at < TTL_MS) return cached.snapshot;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const snapshot = await loadLatestSnapshot();
      if (snapshot) cached = { at: Date.now(), snapshot };
      return snapshot;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
