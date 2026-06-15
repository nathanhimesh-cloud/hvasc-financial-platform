import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FinancialSnapshot } from "@/lib/types";

/**
 * Mapping overrides — user-curated corrections applied ON TOP of the parsed
 * snapshot, so they survive every re-upload (they're applied at read time, not
 * baked into the snapshot). Two kinds:
 *
 *   - accounts: rename a GL account, and/or reassign it to a different
 *     department. Reassigning moves the line AND its amount, so the target
 *     department's YTD total changes — this intentionally overrides the
 *     imported Note 3a function grouping.
 *   - grants:   rename a grant, and/or correct which department it belongs to
 *     (Note 5 attribution defaults to "governance" when it can't be inferred).
 *
 * Stored like the runtime snapshot: Vercel Blob in production, a JSON file under
 * .data/ in dev. Missing store → no overrides (graceful).
 */

const BLOB_KEY = "feed/overrides.json";
const LOCAL_FILE = path.join(process.cwd(), ".data", "overrides.json");

export interface AccountOverride {
  /** Replacement display name. */
  name?: string;
  /** Department id to move this account (and its amount) into. */
  departmentId?: string;
}

export interface GrantOverride {
  name?: string;
  departmentId?: string;
}

export interface MappingOverrides {
  /** Keyed by GL account code, e.g. "1255-2000-0000". */
  accounts?: Record<string, AccountOverride>;
  /** Keyed by grant id. */
  grants?: Record<string, GrantOverride>;
}

function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function readOverrides(): Promise<MappingOverrides> {
  try {
    if (hasBlob()) {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
      if (!blobs.length) return {};
      const res = await fetch(blobs[0].url, { cache: "no-store" });
      if (!res.ok) return {};
      return (await res.json()) as MappingOverrides;
    }
    return JSON.parse(await fs.readFile(LOCAL_FILE, "utf8")) as MappingOverrides;
  } catch {
    return {};
  }
}

export async function writeOverrides(overrides: MappingOverrides): Promise<string> {
  const body = JSON.stringify(overrides, null, 2);
  if (hasBlob()) {
    const { put } = await import("@vercel/blob");
    const res = await put(BLOB_KEY, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.url;
  }
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, body, "utf8");
  return LOCAL_FILE;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Re-derive a department's RAG status after its YTD total changes. */
function statusFor(ytdActual: number, ytdBudget: number): FinancialSnapshot["departments"][number]["status"] {
  const ratio = ytdBudget > 0 ? ytdActual / ytdBudget : 0;
  return ratio > 1.05 ? "over-budget" : ratio > 1.0 ? "at-risk" : "on-track";
}

/**
 * Apply mapping overrides to a snapshot, returning a new snapshot. Pure — does
 * not mutate the input. Accounts that move department carry their amount with
 * them, so department YTD totals (and RAG status) are recomputed.
 */
export function applyOverrides(
  snapshot: FinancialSnapshot,
  overrides: MappingOverrides,
): FinancialSnapshot {
  const accOv = overrides.accounts ?? {};
  const grantOv = overrides.grants ?? {};
  if (!Object.keys(accOv).length && !Object.keys(grantOv).length) return snapshot;

  // Deep-ish clone of the parts we touch.
  const departments = snapshot.departments.map((d) => ({
    ...d,
    glLines: d.glLines.map((l) => ({ ...l })),
  }));
  const byId = new Map(departments.map((d) => [d.id, d]));

  // 1. Apply account renames in place, and collect lines that move department.
  type Move = { line: (typeof departments)[number]["glLines"][number]; to: string };
  const moves: Move[] = [];
  for (const dept of departments) {
    dept.glLines = dept.glLines.filter((line) => {
      const ov = accOv[line.code];
      if (!ov) return true;
      if (ov.name) line.account = ov.name;
      if (ov.departmentId && ov.departmentId !== dept.id && byId.has(ov.departmentId)) {
        moves.push({ line, to: ov.departmentId });
        dept.ytdActual = round(dept.ytdActual - line.amount);
        return false; // remove from source dept
      }
      return true;
    });
  }

  // 2. Land moved lines in their target departments and bump totals.
  for (const { line, to } of moves) {
    const target = byId.get(to)!;
    target.glLines.push(line);
    target.ytdActual = round(target.ytdActual + line.amount);
  }

  // 3. Re-sort affected GL lines, re-flag the dominant one, refresh status.
  const touched = new Set<string>();
  for (const m of moves) touched.add(m.to);
  for (const code of Object.keys(accOv)) {
    const o = accOv[code];
    if (o.departmentId) touched.add(o.departmentId);
  }
  for (const dept of departments) {
    dept.glLines.sort((a, b) => b.amount - a.amount);
    dept.glLines.forEach((l) => delete l.flagged);
    if (dept.glLines[0] && dept.glLines[0].amount > dept.ytdActual * 0.4)
      dept.glLines[0].flagged = true;
    if (touched.has(dept.id)) dept.status = statusFor(dept.ytdActual, dept.ytdBudget);
  }

  // 4. Apply grant overrides (rename + department reassignment).
  const grants = snapshot.grants.map((g) => {
    const ov = grantOv[g.id];
    if (!ov) return g;
    return {
      ...g,
      name: ov.name ?? g.name,
      departmentId: ov.departmentId && byId.has(ov.departmentId) ? ov.departmentId : g.departmentId,
    };
  });

  return { ...snapshot, departments, grants };
}
