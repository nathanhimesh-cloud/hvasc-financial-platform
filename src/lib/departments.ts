import map from "@/data/department-map.json";

/**
 * The Council's THREE management departments (confirmed at the 9 Jul 2026 review):
 * Corporate Services · Operations · Social Services.
 *
 * These replace the 9 GL-native "functions" the platform previously rolled up by.
 * They correspond to Practical's Report Groups (Finance Director / Operations
 * Manager / Social Services Director) — the same grouping Micah's own Revenue &
 * Expenditure reports use.
 *
 * Mapping sources, in precedence order (see department-map.json `_provenance`):
 *   1. `accounts` — account → department, transcribed from Practical's Revenue &
 *      Expenditure reports by Report Group. This is the SOURCE OF TRUTH and is
 *      verified to the dollar against those reports.
 *   2. `programs` — sub-program → department, from the Working Budget Workpaper's
 *      "Team" column. A fallback for accounts with no budget line.
 *
 * Where the two disagreed (1215-1500, 1215-1501 — utility charges and rates),
 * Practical's Report Group wins: they belong to Operations, not Corporate Services.
 *
 * Anything this can't resolve returns null and is counted as an UNMAPPED account
 * (brief A7) rather than being silently dropped from a department total.
 */

export interface DepartmentDef {
  id: string;
  slug: string;
  name: string;
  /** Practical's Report Group filter name. */
  reportGroup: string;
  icon: string;
  color: string;
}

export const DEPARTMENTS: DepartmentDef[] = map.departments as DepartmentDef[];

const ACCOUNTS = map.accounts as Record<string, string>;
const PROGRAMS = map.programs as Record<string, string>;

/** GL accounts are "1215-1500-0000"; the map keys on the "1215-1500" prefix. */
function accountKey(glAccount: string): string {
  return glAccount.trim().slice(0, 9);
}

/**
 * Resolve a GL account to one of the three departments.
 * Returns null when unmapped — the caller should count it (A7), not drop it.
 */
export function resolveDepartment(glAccount: string): string | null {
  return ACCOUNTS[accountKey(glAccount)] ?? null;
}

/** Fallback: resolve by sub-program code (e.g. "1200-0002") from the workpaper. */
export function resolveDepartmentByProgram(programCode: string): string | null {
  return PROGRAMS[accountKey(programCode)] ?? null;
}

export function departmentById(id: string): DepartmentDef | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}

/** How many accounts the exact (Practical-sourced) map covers. */
export const MAPPED_ACCOUNT_COUNT = Object.keys(ACCOUNTS).length;
