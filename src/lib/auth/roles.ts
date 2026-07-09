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

export type Role = "admin" | "finance" | "ceo" | "manager" | "grant-manager";

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: "admin", label: "Administrator", description: "SandS support — everything, plus the audit log and user access" },
  { id: "finance", label: "CFO / Finance", description: "All reports, plus admin of account mappings" },
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
  admin: ["audit.view", "mapping.edit", "grants.edit", "users.manage"],
  finance: ["mapping.edit", "grants.edit"],
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
