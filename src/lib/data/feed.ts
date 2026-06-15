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
  return applyOverrides(await loadRawSnapshotFromFeed(), overrides);
}

/**
 * The feed snapshot BEFORE mapping overrides are applied. Used by the Mapping
 * tab to show the original (imported) names/assignments alongside edits.
 */
export async function loadRawSnapshotFromFeed(): Promise<FinancialSnapshot> {
  const runtime = await readRuntimeSnapshot();
  return runtime ?? (bundled as unknown as FinancialSnapshot);
}
