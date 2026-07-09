import { cache } from "react";
import type { FinancialSnapshot } from "@/lib/types";
import { seedSnapshot } from "@/data/seed";
import { loadSnapshotFromCsv } from "./csv-adapter";
import { loadSnapshotFromFeed } from "./feed";
import { clearDbSnapshotCache } from "./db-source";

/**
 * Data-access layer.
 *
 * The rest of the app calls `getSnapshot()` and never cares where the data
 * comes from. The default is the "feed" — the committed snapshot.json built
 * from the Practical exports (see scripts/build-snapshot.mjs) plus any live
 * snapshot pushed to the runtime store. Flip `DATA_SOURCE` to switch without
 * touching any view code.
 *
 * Source is chosen by the `DATA_SOURCE` env var:
 *   - "feed" (default) → runtime store → bundled snapshot.json fallback
 *   - "seed"           → illustrative demo figures
 *   - "csv"            → parse exports from the Sands Reports network share
 *   - "odbc"           → live Firebird read (pushed to the runtime store by
 *                        scripts/odbc/05-build-snapshot.ps1 → /api/feed/snapshot)
 */
export type DataSource = "feed" | "seed" | "csv" | "odbc";

export function getDataSource(): DataSource {
  const raw = (process.env.DATA_SOURCE ?? "feed").toLowerCase();
  if (raw === "seed" || raw === "csv" || raw === "odbc") return raw;
  return "feed";
}

/**
 * Resolve the snapshot for a source. Wrapped in React `cache()` so a single
 * render reads it once, but it is NOT pinned across requests — freshness comes
 * from the runtime store's own cache (Next data cache, revalidated on push via
 * the "snapshot" tag). This avoids the stale-on-warm-instance bug a module-level
 * cache would cause after a nightly feed update.
 */
const resolveSnapshot = cache(async (source: DataSource): Promise<FinancialSnapshot> => {
  switch (source) {
    case "feed":
      try {
        return await loadSnapshotFromFeed();
      } catch (err) {
        console.error("[data] Feed source failed, falling back to seed data:", err);
        return seedSnapshot;
      }

    case "csv":
      try {
        return await loadSnapshotFromCsv();
      } catch (err) {
        console.error("[data] CSV source failed, falling back to seed data:", err);
        return seedSnapshot;
      }

    case "odbc":
      // The ODBC feed writes into the same runtime store the "feed" source
      // reads, so resolve it the same way (runtime → bundled fallback).
      try {
        return await loadSnapshotFromFeed();
      } catch (err) {
        console.error("[data] ODBC/feed source failed, falling back to seed data:", err);
        return seedSnapshot;
      }

    case "seed":
    default:
      return seedSnapshot;
  }
});

export async function getSnapshot(): Promise<FinancialSnapshot> {
  return resolveSnapshot(getDataSource());
}

/**
 * A specific archived period ("FY2025-26", 11), from the Postgres snapshot
 * history. Falls back to the live snapshot when that period isn't stored (or
 * when history isn't configured), so callers always get something to render.
 */
export async function getSnapshotForPeriod(
  fyLabel: string,
  periodMonth: number,
): Promise<FinancialSnapshot> {
  const { loadSnapshot } = await import("@/lib/history");
  const stored = await loadSnapshot(fyLabel, periodMonth);
  return stored ?? (await getSnapshot());
}

/**
 * Called by the write routes after a push or a mapping edit.
 *
 * Per-request memoization is handled by React `cache()`, and cross-request
 * invalidation by `revalidateTag("snapshot")`. But the database source keeps its
 * own 60-second TTL memo in module scope, and that has to be dropped explicitly,
 * or a fresh sync wouldn't appear for up to a minute.
 */
export function clearSnapshotCache(): void {
  clearDbSnapshotCache();
}
