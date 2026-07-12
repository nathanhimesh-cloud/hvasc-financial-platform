import { revalidatePath, revalidateTag } from "next/cache";
import type { FinancialSnapshot } from "@/lib/types";
import { writeRuntimeSnapshot, storeKind } from "@/lib/feed/store";
import { clearSnapshotCache } from "@/lib/data";
import { saveSnapshot } from "@/lib/history";
import { saveTransactions, type IncomingTransaction } from "@/lib/ledger";
import { recordSync } from "@/lib/sync-log";

/**
 * Direct snapshot push — for the ODBC live feed.
 *
 * The build script on HVASC-APP02 (scripts/odbc/05-build-snapshot.ps1) reads
 * Civica Practical over ODBC and assembles a complete FinancialSnapshot, then
 * PUTs it here. We persist it to the runtime store (Vercel Blob in prod) — the
 * same place /api/feed/upload writes — so the dashboard serves it immediately,
 * with no redeploy.
 *
 * This differs from /api/feed/upload, which takes raw spreadsheet *files* and
 * builds the snapshot server-side. Here the snapshot is already built, so the
 * blob token never has to leave Vercel and APP02 only needs the upload password.
 *
 * Auth: shared secret in UPLOAD_PASSWORD (header `x-upload-password` or JSON
 * field `password`). If unset, the route is open (dev only) but logs a warning.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal structural check so we never persist obviously-broken payloads. */
function looksLikeSnapshot(v: unknown): v is FinancialSnapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.period === "object" &&
    s.period !== null &&
    Array.isArray(s.departments) &&
    Array.isArray(s.grants) &&
    Array.isArray(s.revenueLines)
  );
}

/**
 * Reject a snapshot that is structurally valid but carries no data.
 *
 * A failed ODBC connection once produced exactly that: `fyLabel: null`, month
 * 11, every figure zero. It passes `looksLikeSnapshot` and would overwrite the
 * Blob — replacing a working dashboard with an empty one. The build script now
 * refuses to write such a file, but the server must not depend on the client
 * being well-behaved.
 */
function emptyPayloadReason(s: FinancialSnapshot): string | null {
  const fy = s.period?.fyLabel;
  if (!fy || !/^FY\d{4}-\d{2}$/.test(fy)) return `period.fyLabel is ${JSON.stringify(fy)}`;
  const month = s.period?.monthOfYear;
  if (!month || month < 1 || month > 12) return `period.monthOfYear is ${JSON.stringify(month)}`;

  const bs = s.balanceSheet;
  const noBalanceSheet = !bs || ((bs.totalAssets ?? 0) === 0 && (bs.totalLiabilities ?? 0) === 0);
  const noAccounts = !s.accounts?.length && !s.departments.some((d) => d.glLines?.length);
  if (noBalanceSheet && noAccounts) return "no balance sheet and no GL accounts — the source read returned nothing";

  return null;
}

export async function PUT(request: Request) {
  const required = process.env.UPLOAD_PASSWORD;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  // Accept either the bare snapshot or { password, snapshot }.
  const wrapped = body as { password?: string; snapshot?: unknown };
  const hasWrapper =
    wrapped && typeof wrapped === "object" && "snapshot" in wrapped;
  const snapshot = hasWrapper ? wrapped.snapshot : body;

  /**
   * Archive-only: store this period in `snapshots` and nowhere else.
   *
   * Backfilling FY2025-26 pushes twelve historical periods. Each is a valid
   * snapshot, and each would otherwise overwrite the Blob and become "the latest
   * data" — leaving the dashboard showing June 2026 until the next live sync.
   * With this flag the period joins the archive and the live view is untouched.
   */
  const archiveOnly = new URL(request.url).searchParams.get("mode") === "archive";

  if (required) {
    const given =
      request.headers.get("x-upload-password") ??
      (hasWrapper ? wrapped.password : undefined) ??
      "";
    if (given !== required) {
      return Response.json({ ok: false, error: "Invalid upload password." }, { status: 401 });
    }
  } else {
    console.warn("[feed/snapshot] UPLOAD_PASSWORD is not set; accepting unauthenticated push.");
  }

  if (!looksLikeSnapshot(snapshot)) {
    return Response.json(
      { ok: false, error: "Payload is not a FinancialSnapshot (need period, departments[], grants[], revenueLines[])." },
      { status: 422 },
    );
  }

  const empty = emptyPayloadReason(snapshot);
  if (empty) {
    return Response.json(
      { ok: false, error: `Refusing to store an empty snapshot: ${empty}. The live data is unchanged.` },
      { status: 422 },
    );
  }

  // Transactions go into their own Postgres table (upserted on GLTRN.KY) rather
  // than riding inside the snapshot forever — by June that payload would be
  // megabytes and every sync would re-send the whole year. Only strip them from
  // the snapshot once they're safely stored, so nothing can be lost.
  const incoming = (snapshot.transactions ?? []) as IncomingTransaction[];
  const ingested = await saveTransactions(snapshot.period?.fyLabel ?? "", incoming);
  const persisted: FinancialSnapshot =
    ingested > 0 ? { ...snapshot, transactions: [] } : snapshot;

  // A backfilled period must never become "the latest data".
  let location = "(archive only — runtime store untouched)";
  if (!archiveOnly) {
    try {
      location = await writeRuntimeSnapshot(persisted);
    } catch (err) {
      return Response.json(
        { ok: false, error: `Couldn't save snapshot: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  }

  // Archive this period to Postgres so history accumulates. The Blob store only
  // ever holds the latest snapshot; without this, each sync destroys the last one.
  // Best-effort: a history failure must never fail the push.
  const archived = await saveSnapshot(persisted);

  // One row per push. This is what "last updated" reads, and what tells you
  // whether the ledger accepted the batch — the push script holds its cursor
  // back when it didn't.
  const meta = snapshot.meta as { generatedAtUtc?: string; maxKy?: number; source?: string } | undefined;
  await recordSync({
    generatedAt: meta?.generatedAtUtc ?? null,
    fyLabel: snapshot.period?.fyLabel ?? null,
    periodMonth: snapshot.period?.monthOfYear ?? null,
    periodLabel: snapshot.period?.label ?? null,
    txnsSent: incoming.length,
    txnsIngested: ingested,
    archived,
    store: storeKind(),
    maxKy: meta?.maxKy ?? null,
    source: meta?.source ?? null,
  });

  clearSnapshotCache();
  revalidateTag("snapshot", "max");
  revalidatePath("/", "layout");

  const totalSpend = snapshot.departments.reduce((a, d) => a + (d.ytdActual ?? 0), 0);

  /**
   * THE RECEIPT MUST NAME WHAT ARRIVED.
   *
   * This used to report a fixed handful of counts — departments, grants,
   * transactions — chosen when those were the only things in a snapshot. So when
   * the feed started carrying commitments, debtor ageing, the asset base and the
   * statutory ratio inputs, the push still answered `PUSH OK (HTTP 200)` and said
   * nothing about any of them. The data was there; you simply had to take it on
   * faith, and "did my push actually land?" became a question only the developer
   * could answer.
   *
   * So the receipt now lists every block, and whether it came through. If a block
   * reads `null` or `0`, that push didn't carry it — which is exactly what you
   * want a receipt to tell you.
   */
  const blocks = {
    balanceSheet: snapshot.balanceSheet ? "ok" : null,
    cashFlow: snapshot.cashFlow ? "ok" : null,
    statutoryRatios: snapshot.statutory
      ? `tier ${snapshot.statutory.tier}, ${snapshot.statutory.priorYear?.fyLabel ?? "prior year"} basis`
      : null,
    commitments: snapshot.commitments
      ? `${snapshot.commitments.orderCount} open orders, ${Math.round(snapshot.commitments.total).toLocaleString()} committed`
      : null,
    ageing: snapshot.ageing
      ? `${snapshot.ageing.receivables.count} debtors, ${snapshot.ageing.payables.count} creditors`
      : null,
    assets: snapshot.assets
      ? `consumption ${snapshot.assets.consumptionRatio ?? "?"}%, ${snapshot.assets.workInProgress?.length ?? 0} projects in progress`
      : null,
    jobBudgets: snapshot.jobBudgets?.length ?? 0,
    accounts: snapshot.accounts?.length ?? 0,
  };

  return Response.json({
    ok: true,
    store: archiveOnly ? "archive-only" : storeKind(),
    archiveOnly,
    location,
    archived,
    transactionsIngested: ingested,
    summary: {
      period: snapshot.period?.label,
      departments: snapshot.departments.length,
      grants: snapshot.grants.length,
      transactions: incoming.length,
      jobCosts: snapshot.jobCosts?.length ?? 0,
      totalYtdSpend: totalSpend,
      source: snapshot.meta?.source,
    },
    blocks,
  });
}
