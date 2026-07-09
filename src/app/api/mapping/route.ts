import { revalidatePath } from "next/cache";
import { writeOverrides, type MappingOverrides } from "@/lib/feed/overrides";
import { clearSnapshotCache } from "@/lib/data";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { logAudit } from "@/lib/auth/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Strip empty entries so the store only keeps real overrides. */
function clean(overrides: MappingOverrides): MappingOverrides {
  const out: MappingOverrides = {};
  for (const kind of ["accounts", "grants"] as const) {
    const group = overrides[kind];
    if (!group) continue;
    const kept: Record<string, { name?: string; departmentId?: string }> = {};
    for (const [key, val] of Object.entries(group)) {
      const name = val?.name?.trim() || undefined;
      const departmentId = val?.departmentId?.trim() || undefined;
      if (name || departmentId) kept[key] = { name, departmentId };
    }
    if (Object.keys(kept).length) out[kind] = kept;
  }
  return out;
}

export async function POST(request: Request) {
  // Guard the route itself, not just the page — otherwise a read-only user could
  // POST here directly. Requires the `mapping.edit` capability when auth is on.
  const session = isAuthConfigured() ? await getSession() : null;
  if (isAuthConfigured() && !can(session?.role, "mapping.edit")) {
    return Response.json({ ok: false, error: "Not permitted." }, { status: 403 });
  }

  // Same shared-secret protection as the upload route, if configured.
  const required = process.env.UPLOAD_PASSWORD;

  let body: MappingOverrides & { password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (required) {
    const given = body.password ?? request.headers.get("x-upload-password") ?? "";
    if (given !== required) {
      return Response.json({ ok: false, error: "Invalid password." }, { status: 401 });
    }
  }

  const overrides = clean({ accounts: body.accounts, grants: body.grants });

  let location: string;
  try {
    location = await writeOverrides(overrides);
  } catch (err) {
    return Response.json(
      { ok: false, error: `Couldn't save mappings: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  clearSnapshotCache();
  revalidatePath("/", "layout");

  const accounts = Object.keys(overrides.accounts ?? {}).length;
  const grants = Object.keys(overrides.grants ?? {}).length;

  // Every metadata edit is recorded (B9). Best-effort; never fails the save.
  await logAudit(session, "mapping.updated", `${accounts} account(s), ${grants} grant(s)`);

  return Response.json({ ok: true, location, counts: { accounts, grants } });
}
