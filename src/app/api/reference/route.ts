import { revalidatePath } from "next/cache";
import { clearSnapshotCache } from "@/lib/data";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { can, type Capability } from "@/lib/auth/roles";
import { logAudit } from "@/lib/auth/db";
import { validate, putReference, type ReferenceKind } from "@/lib/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload the department map or the grant register.
 *
 * These files decide how every dollar is classified, so:
 *   - the upload is capability-gated (not merely login-gated)
 *   - the payload is validated BEFORE it replaces anything, and a failure
 *     changes nothing
 *   - the previous version is archived, so a bad upload is reversible
 *   - every upload is written to the audit log
 *
 * Validation is not a formality here. A department id typo would quietly drop an
 * account's spend out of every departmental total, and nothing downstream would
 * flag it — the numbers would still balance, against the wrong departments.
 */

const REQUIRED: Record<ReferenceKind, Capability> = {
  "department-map": "mapping.edit",
  "grant-register": "grants.edit",
};

function isKind(v: unknown): v is ReferenceKind {
  return v === "department-map" || v === "grant-register";
}

export async function POST(request: Request) {
  let body: { kind?: unknown; filename?: unknown; payload?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const { kind } = body;
  if (!isKind(kind)) {
    return Response.json(
      { ok: false, error: 'kind must be "department-map" or "grant-register".' },
      { status: 400 },
    );
  }

  const session = isAuthConfigured() ? await getSession() : null;
  if (isAuthConfigured() && !can(session?.role, REQUIRED[kind])) {
    return Response.json({ ok: false, error: "Not permitted." }, { status: 403 });
  }

  // Validate before touching anything. A rejected upload leaves the live data alone.
  const result = validate(kind, body.payload);
  if (!result.ok) {
    return Response.json(
      { ...result, ok: false, error: "The file didn't validate. Nothing was changed." },
      { status: 422 },
    );
  }

  try {
    await putReference(kind, body.payload, {
      filename: typeof body.filename === "string" ? body.filename : undefined,
      uploadedBy: session?.username,
      itemCount: result.itemCount,
      note: typeof body.note === "string" ? body.note : undefined,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: `Couldn't save: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  clearSnapshotCache();
  revalidatePath("/", "layout");

  await logAudit(
    session,
    `reference.${kind}.uploaded`,
    `${result.itemCount} item(s)${body.filename ? ` from ${String(body.filename)}` : ""}`,
  );

  return Response.json({ ...result, ok: true });
}
