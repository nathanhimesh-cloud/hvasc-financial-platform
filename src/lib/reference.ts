import "server-only";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/auth/session";
import bundledMap from "@/data/department-map.json";
import bundledRegister from "@/data/grant-register.json";

/**
 * Uploaded reference data: the department map and the grant register.
 *
 * These aren't transactional data — they're the rules by which transactional
 * data is interpreted. The department map decides which department every dollar
 * of spend belongs to; the grant register decides what a grant is worth and
 * which codes carry its income and expenditure. Get one wrong and every figure
 * downstream is wrong in a way no reconciliation check will catch, because the
 * numbers still add up. They just add up to the wrong thing.
 *
 * So: validate hard before storing, keep the previous version, and always fall
 * back to the version committed in the repo if the database has nothing.
 */

export type ReferenceKind = "department-map" | "grant-register";

function sql() {
  const url = databaseUrl();
  return url ? neon(url) : null;
}

export interface ReferenceMeta {
  kind: ReferenceKind;
  filename: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
  itemCount: number;
  note: string | null;
}

/** Validation result. `errors` empty ⇒ safe to store. */
export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  itemCount: number;
}

const CODE = /^\d{4}-\d{4}$/;

/**
 * A department map must resolve every account to a department that exists.
 * A typo'd department id would silently drop that account's spend from all
 * totals — the A7 "unmapped accounts" count would rise, but only if anyone looked.
 */
export function validateDepartmentMap(v: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const m = v as { departments?: unknown; accounts?: unknown; programs?: unknown };

  if (!m || typeof m !== "object") return { ok: false, errors: ["Not a JSON object."], warnings, itemCount: 0 };

  const depts = m.departments;
  if (!Array.isArray(depts) || depts.length === 0) {
    errors.push("`departments` must be a non-empty array.");
    return { ok: false, errors, warnings, itemCount: 0 };
  }

  const ids = new Set<string>();
  depts.forEach((d, i) => {
    const dd = d as Record<string, unknown>;
    for (const field of ["id", "slug", "name", "icon", "color"]) {
      if (typeof dd[field] !== "string" || !dd[field]) errors.push(`departments[${i}].${field} is missing.`);
    }
    if (typeof dd.id === "string") {
      if (ids.has(dd.id)) errors.push(`Duplicate department id "${dd.id}".`);
      ids.add(dd.id);
    }
  });

  const accounts = m.accounts;
  if (!accounts || typeof accounts !== "object") {
    errors.push("`accounts` must be an object of { \"1234-5678\": \"department-id\" }.");
    return { ok: false, errors, warnings, itemCount: 0 };
  }

  let count = 0;
  const badCodes: string[] = [];
  const badDepts: string[] = [];
  for (const [code, dept] of Object.entries(accounts as Record<string, unknown>)) {
    count++;
    if (!CODE.test(code)) badCodes.push(code);
    if (typeof dept !== "string" || !ids.has(dept)) badDepts.push(`${code} → ${String(dept)}`);
  }
  // Report a few, not all 171, but say how many there were.
  if (badCodes.length) {
    errors.push(`${badCodes.length} account key(s) are not in "1234-5678" form, e.g. ${badCodes.slice(0, 3).join(", ")}.`);
  }
  if (badDepts.length) {
    errors.push(`${badDepts.length} account(s) point at a department that doesn't exist, e.g. ${badDepts.slice(0, 3).join(", ")}.`);
  }
  if (count === 0) errors.push("`accounts` is empty — every account would be unmapped.");

  // A sharp drop in account count usually means a truncated file.
  const bundledCount = Object.keys((bundledMap as { accounts: Record<string, string> }).accounts).length;
  if (count > 0 && count < bundledCount * 0.5) {
    warnings.push(`Only ${count} accounts, versus ${bundledCount} currently. Is the file complete?`);
  }

  return { ok: errors.length === 0, errors, warnings, itemCount: count };
}

/** The grant register, as produced by scripts/import-grant-register.mjs. */
export function validateGrantRegister(v: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const r = v as { grants?: unknown; source?: unknown };

  if (!r || typeof r !== "object") return { ok: false, errors: ["Not a JSON object."], warnings, itemCount: 0 };
  if (!Array.isArray(r.grants) || r.grants.length === 0) {
    return { ok: false, errors: ["`grants` must be a non-empty array."], warnings, itemCount: 0 };
  }

  const seen = new Set<string>();
  let missingTotals = 0;
  r.grants.forEach((g, i) => {
    const gg = g as Record<string, unknown>;
    if (typeof gg.id !== "string" || !gg.id) errors.push(`grants[${i}].id is missing.`);
    else if (seen.has(gg.id)) errors.push(`Duplicate grant id "${gg.id}".`);
    else seen.add(gg.id);

    if (typeof gg.name !== "string" || !gg.name) errors.push(`grants[${i}].name is missing.`);
    if (typeof gg.active !== "boolean") errors.push(`grants[${i}].active must be true/false.`);
    for (const arr of ["revenueCodes", "jobCodes", "expenditureCodes", "issues"]) {
      if (!Array.isArray(gg[arr])) errors.push(`grants[${i}].${arr} must be an array.`);
    }
    if (typeof gg.totalFunded !== "number") errors.push(`grants[${i}].totalFunded must be a number.`);
    else if (gg.totalFunded === 0) missingTotals++;
  });

  if (missingTotals > 0) {
    warnings.push(`${missingTotals} grant(s) have a total of $0 — their utilisation can't be computed.`);
  }

  const bundledCount = (bundledRegister as { grants: unknown[] }).grants.length;
  if (r.grants.length < bundledCount * 0.5) {
    warnings.push(`Only ${r.grants.length} grants, versus ${bundledCount} currently. Is the file complete?`);
  }

  return { ok: errors.length === 0, errors, warnings, itemCount: r.grants.length };
}

export function validate(kind: ReferenceKind, payload: unknown): Validation {
  return kind === "department-map" ? validateDepartmentMap(payload) : validateGrantRegister(payload);
}

/** Store a new version, archiving the one it replaces. */
export async function putReference(
  kind: ReferenceKind,
  payload: unknown,
  meta: { filename?: string; uploadedBy?: string; itemCount: number; note?: string },
): Promise<boolean> {
  const db = sql();
  if (!db) throw new Error("No database configured — cannot store reference data.");

  const json = JSON.stringify(payload);

  // Archive the outgoing version first, so a rollback is always possible.
  await db`
    INSERT INTO reference_data_history (kind, payload, filename, uploaded_by, uploaded_at, item_count, note)
    SELECT kind, payload, filename, uploaded_by, uploaded_at, item_count, note
    FROM reference_data WHERE kind = ${kind}
  `;

  await db`
    INSERT INTO reference_data (kind, payload, filename, uploaded_by, uploaded_at, item_count, note)
    VALUES (${kind}, ${json}::jsonb, ${meta.filename ?? null}, ${meta.uploadedBy ?? null}, now(),
            ${meta.itemCount}, ${meta.note ?? null})
    ON CONFLICT (kind) DO UPDATE
      SET payload = EXCLUDED.payload, filename = EXCLUDED.filename,
          uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now(),
          item_count = EXCLUDED.item_count, note = EXCLUDED.note
  `;
  return true;
}

async function readReference<T>(kind: ReferenceKind, fallback: T): Promise<T> {
  try {
    const db = sql();
    if (!db) return fallback;
    const rows = (await db`SELECT payload FROM reference_data WHERE kind = ${kind} LIMIT 1`) as Array<{ payload: T }>;
    return rows.length ? rows[0].payload : fallback;
  } catch (err) {
    // Never let a reference-data problem take the dashboard down.
    console.error(`[reference] read ${kind} failed, using the bundled copy:`, err);
    return fallback;
  }
}

export async function getDepartmentMap() {
  return readReference("department-map", bundledMap as unknown);
}

export async function getGrantRegister() {
  return readReference("grant-register", bundledRegister as unknown);
}

/** Provenance for the UI: where each file came from and when. */
export async function referenceMeta(): Promise<Record<ReferenceKind, ReferenceMeta | null>> {
  const out: Record<string, ReferenceMeta | null> = { "department-map": null, "grant-register": null };
  try {
    const db = sql();
    if (!db) return out as Record<ReferenceKind, ReferenceMeta | null>;
    const rows = (await db`
      SELECT kind, filename, uploaded_by, uploaded_at, item_count, note FROM reference_data
    `) as Array<Record<string, unknown>>;
    for (const r of rows) {
      out[String(r.kind)] = {
        kind: String(r.kind) as ReferenceKind,
        filename: r.filename ? String(r.filename) : null,
        uploadedBy: r.uploaded_by ? String(r.uploaded_by) : null,
        uploadedAt: String(r.uploaded_at),
        itemCount: Number(r.item_count ?? 0),
        note: r.note ? String(r.note) : null,
      };
    }
  } catch (err) {
    console.error("[reference] meta failed:", err);
  }
  return out as Record<ReferenceKind, ReferenceMeta | null>;
}
