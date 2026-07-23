/**
 * Roles and what each can do (brief B9).
 *
 * The rule that matters: **financial actuals are read-only from the GL for
 * everyone.** No role can edit a number sourced from Practical. What a role can
 * change is reporting *metadata* — account display names, department
 * assignments, grant milestones. That separation is the anti-fraud control.
 *
 * Capabilities are named after what the user is trying to do, not after roles,
 * so adding a role never means hunting for scattered `role === "admin"` checks.
 */

/*
  FOUR ACCESS TIERS (Developer Checklist item 62, confirmed by Shaun).

  The build brief once described a separate "admin" role for SandS support. The
  agreed model is four client tiers, with CFO / Finance as the full-access role —
  "full + mapping admin" in the checklist's words. So `finance` now carries user
  management and the audit log too; there is no longer a distinct `admin` tier.

  SandS support simply uses a CFO / Finance account: "full" is full. (If a
  visibly-separate SandS admin login is ever wanted — checklist item 66 mentions
  one for audit visibility — it is a one-line addition back.)
*/
export type Role = "finance" | "ceo" | "manager" | "grant-manager";

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: "finance", label: "CFO / Finance", description: "Full access — all reports, account mapping, user management and the audit log" },
  { id: "ceo", label: "CEO", description: "Executive view — dashboard, KPIs, statements" },
  { id: "manager", label: "Department head", description: "Their department, plus whole-of-council read" },
  { id: "grant-manager", label: "Grant manager", description: "Grants — may edit grant metadata, never the GL figures" },
];

export type Capability =
  /** See the immutable audit trail. */
  | "audit.view"
  /** Rename accounts / reassign them to departments (reporting metadata only). */
  | "mapping.edit"
  /** Edit grant milestones, dates, documents (never GL-sourced actuals). */
  | "grants.edit"
  /** Create, suspend and remove users. */
  | "users.manage";

const CAPABILITIES: Record<Role, Capability[]> = {
  // CFO / Finance is the full-access tier — mapping, grants, users AND the audit log.
  finance: ["audit.view", "mapping.edit", "grants.edit", "users.manage"],
  ceo: [],
  manager: [],
  "grant-manager": ["grants.edit"],
};

export function isRole(value: string): value is Role {
  return value in CAPABILITIES;
}

/** Can this role do this? Unknown roles get nothing. */
export function can(role: string | undefined, capability: Capability): boolean {
  if (!role || !isRole(role)) return false;
  return CAPABILITIES[role].includes(capability);
}

/** Everything read-only is open to any signed-in user; this names that explicitly. */
export function canViewReports(role: string | undefined): boolean {
  return !!role && isRole(role);
}
