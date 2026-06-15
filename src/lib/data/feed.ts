import "server-only";
import type { FinancialSnapshot } from "@/lib/types";
import { readRuntimeSnapshot, readRuntimeStatements } from "@/lib/feed/store";
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

  // Overlay the formal statements (Balance Sheet / Cash Flow). They live in a
  // separate store so the twice-daily ODBC push can't wipe them, so they're
  // layered on here regardless of the main snapshot's source.
  const statements = await readRuntimeStatements();
  if (statements?.balanceSheet || statements?.cashFlow) {
    return {
      ...snapshot,
      balanceSheet: statements.balanceSheet ?? snapshot.balanceSheet,
      cashFlow: statements.cashFlow ?? snapshot.cashFlow,
    };
  }
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
