"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { can, ROLES, type Role } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  createUser,
  suspendUser,
  restoreUser,
  setRole,
  resetPassword,
  disableMfa,
  logAudit,
  getUserByUsername,
} from "@/lib/auth/db";

/**
 * User administration (Build Brief B9: "Admins can remove anyone instantly").
 *
 * Every action here is gated on `users.manage` and written to the audit log. The
 * gate is checked SERVER-SIDE, on every call — hiding a button is a courtesy, not a
 * control, and a server action is a public HTTP endpoint whatever the UI does.
 */

export interface UserActionState {
  error: string;
  ok?: string;
  /** A freshly generated password, shown ONCE. */
  tempPassword?: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || !can(session.role, "users.manage")) {
    throw new Error("Not permitted.");
  }
  return session;
}

/** A readable temporary password. Ambiguous characters left out on purpose. */
function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function addUser(_prev: UserActionState, form: FormData): Promise<UserActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "You don't have permission to manage users." };
  }

  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "") as Role;

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { error: "Username: 3–32 characters, letters/numbers/. _ - only." };
  }
  if (!ROLES.some((r) => r.id === role)) {
    return { error: "Pick a role." };
  }
  if (await getUserByUsername(username)) {
    return { error: `"${username}" already exists.` };
  }

  const pw = tempPassword();
  await createUser(username, hashPassword(pw), role, admin.username);
  await logAudit(admin, "user.created", `${username} (${role})`);
  revalidatePath("/users");

  // Shown once, never stored in the clear. They must change it at first login.
  return { error: "", ok: `Created ${username}.`, tempPassword: pw };
}

export async function suspend(userId: number): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("You cannot suspend yourself.");
  await suspendUser(userId);
  await logAudit(admin, "user.suspended", `user id ${userId}`);
  revalidatePath("/users");
}

export async function restore(userId: number): Promise<void> {
  const admin = await requireAdmin();
  await restoreUser(userId);
  await logAudit(admin, "user.restored", `user id ${userId}`);
  revalidatePath("/users");
}

export async function changeRole(userId: number, role: string): Promise<void> {
  const admin = await requireAdmin();
  if (!ROLES.some((r) => r.id === role)) throw new Error("Unknown role.");
  /*
    An admin must not be able to demote themselves.

    Not because it's rude — because it's a one-way door. Demote the only admin and
    nobody can promote anyone back, and the platform needs a database edit to
    recover. The rule is cheap; the failure isn't.
  */
  if (admin.id === userId && role !== "admin") {
    throw new Error("You cannot remove your own admin role — you would lock yourself out.");
  }
  await setRole(userId, role);
  await logAudit(admin, "user.role_changed", `user id ${userId} → ${role}`);
  revalidatePath("/users");
}

/** Issue a new temporary password. They must change it at next login. */
export async function resetUserPassword(userId: number): Promise<string> {
  const admin = await requireAdmin();
  const pw = tempPassword();
  await resetPassword(userId, hashPassword(pw));
  await logAudit(admin, "user.password_reset", `user id ${userId}`);
  revalidatePath("/users");
  return pw;
}

/** Turn MFA off for someone who lost their phone AND their recovery codes. */
export async function clearMfa(userId: number): Promise<void> {
  const admin = await requireAdmin();
  await disableMfa(userId);
  await logAudit(admin, "user.mfa_reset", `user id ${userId} — MFA cleared by an administrator`);
  revalidatePath("/users");
}
