import "server-only";
import type { FinancialSnapshot } from "@/lib/types";
import { readRuntimeSnapshot } from "@/lib/feed/store";
import { readOverrides, applyOverrides } from "@/lib/feed/overrides";
import bundled from "@/data/snapshot.json";

/**
 * Feed adapter. Order of precedence:
 *   1. Runtime store — the latest data uploaded via /data (Vercel Blob in prod,
 *      a local file in dev). This is what makes in-app uploads update the site.
 *   2. Bundled snapshot.json — the build-time fallback produced by
 *      `scripts/build-snapshot.mjs`.
 *
 * Mapping overrides (renames / department reassignments curated on the Mapping
 * tab) are then layered on top, so they survive every re-upload.
 *
 * Same FinancialSnapshot shape regardless of source; a future ODBC reader would
 * write into the same runtime store.
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
  const runtime = await readRuntimeSnapshot();
  return runtime ?? (bundled as unknown as FinancialSnapshot);
}
