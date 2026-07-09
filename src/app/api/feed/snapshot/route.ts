import { revalidatePath, revalidateTag } from "next/cache";
import type { FinancialSnapshot } from "@/lib/types";
import { writeRuntimeSnapshot, storeKind } from "@/lib/feed/store";
import { clearSnapshotCache } from "@/lib/data";
import { saveSnapshot } from "@/lib/history";
import { saveTransactions, type IncomingTransaction } from "@/lib/ledger";

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

  // Transactions go into their own Postgres table (upserted on GLTRN.KY) rather
  // than riding inside the snapshot forever — by June that payload would be
  // megabytes and every sync would re-send the whole year. Only strip them from
  // the snapshot once they're safely stored, so nothing can be lost.
  const incoming = (snapshot.transactions ?? []) as IncomingTransaction[];
  const ingested = await saveTransactions(snapshot.period?.fyLabel ?? "", incoming);
  const persisted: FinancialSnapshot =
    ingested > 0 ? { ...snapshot, transactions: [] } : snapshot;

  let location: string;
  try {
    location = await writeRuntimeSnapshot(persisted);
  } catch (err) {
    return Response.json(
      { ok: false, error: `Couldn't save snapshot: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Archive this period to Postgres so history accumulates. The Blob store only
  // ever holds the latest snapshot; without this, each sync destroys the last one.
  // Best-effort: a history failure must never fail the push.
  const archived = await saveSnapshot(persisted);

  clearSnapshotCache();
  revalidateTag("snapshot", "max");
  revalidatePath("/", "layout");

  const totalSpend = snapshot.departments.reduce((a, d) => a + (d.ytdActual ?? 0), 0);
  return Response.json({
    ok: true,
    store: storeKind(),
    location,
    archived,
    transactionsIngested: ingested,
    summary: {
      period: snapshot.period?.label,
      departments: snapshot.departments.length,
      grants: snapshot.grants.length,
      revenueLines: snapshot.revenueLines.length,
      transactions: incoming.length,
      jobCosts: snapshot.jobCosts?.length ?? 0,
      totalYtdSpend: totalSpend,
      source: snapshot.meta?.source,
    },
  });
}
