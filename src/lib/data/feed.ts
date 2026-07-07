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

  // Formal statements (Balance Sheet / Cash Flow). A LIVE statement built into
  // the pushed snapshot (e.g. the ODBC Balance Sheet from 05b-balance-sheet.ps1)
  // wins; the separate statements store is only a fallback for statements the
  // live feed doesn't yet build (e.g. Cash Flow, still a month-end upload). This
  // ordering means the live Balance Sheet is never hidden behind a stale one.
  const statements = await readRuntimeStatements();
  if (snapshot.balanceSheet || snapshot.cashFlow || statements?.balanceSheet || statements?.cashFlow) {
    return {
      ...snapshot,
      balanceSheet: snapshot.balanceSheet ?? statements?.balanceSheet,
      cashFlow: snapshot.cashFlow ?? statements?.cashFlow,
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
