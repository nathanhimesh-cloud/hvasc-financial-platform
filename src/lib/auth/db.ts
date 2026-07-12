import "server-only";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./session";
import type { SessionUser } from "./session";

/**
 * User lookup + audit trail against the Neon (Postgres) database. Login-only:
 * users are created by an admin (seed SQL / hash-password script), no self sign-up.
 */

export interface DbUser extends SessionUser {
  passwordHash: string;
  mfaEnabled?: boolean;
  /** Non-null = locked out. Checked on every login. */
  suspendedAt?: string | null;
}

function sqlClient() {
  const url = databaseUrl();
  if (!url) return null;
  return neon(url);
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const sql = sqlClient();
  if (!sql) return null;
  const rows = (await sql`
    SELECT id, username, role, password_hash, must_change_password,
           totp_enabled, suspended_at
    FROM users WHERE username = ${username} LIMIT 1
  `) as Array<{
    id: number;
    username: string;
    role: string;
    password_hash: string;
    must_change_password: boolean;
    totp_enabled: boolean | null;
    suspended_at: string | null;
  }>;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    mustChangePassword: r.must_change_password,
    passwordHash: r.password_hash,
    mfaEnabled: !!r.totp_enabled,
    // "Admins can remove anyone instantly." This is what makes it instant: the
    // login path reads it, so a suspension bites on the very next attempt — no
    // session to expire, no cache to wait out.
    suspendedAt: r.suspended_at ? String(r.suspended_at) : null,
  };
}

/** Set a new password and clear the forced-change flag. */
export async function updatePassword(userId: number, passwordHash: string): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`
    UPDATE users SET password_hash = ${passwordHash}, must_change_password = FALSE
    WHERE id = ${userId}
  `;
}

/** Append to the audit trail. Never throws — auditing must not break the app. */
export async function logAudit(
  user: { id?: number; username?: string } | null,
  action: string,
  detail = "",
): Promise<void> {
  try {
    const sql = sqlClient();
    if (!sql) return;
    await sql`
      INSERT INTO audit_log (user_id, username, action, detail)
      VALUES (${user?.id ?? null}, ${user?.username ?? null}, ${action}, ${detail})
    `;
  } catch {
    /* auditing is best-effort */
  }
}

export interface AuditRow {
  id: number;
  username: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}

/** Most recent audit entries (admin-only view). */
export async function listAudit(limit = 200): Promise<AuditRow[]> {
  const sql = sqlClient();
  if (!sql) return [];
  const rows = (await sql`
    SELECT id, username, action, detail, created_at
    FROM audit_log ORDER BY created_at DESC LIMIT ${limit}
  `) as Array<{ id: number; username: string | null; action: string; detail: string | null; created_at: string }>;
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    action: r.action,
    detail: r.detail,
    createdAt: String(r.created_at),
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
   MFA + user administration (Build Brief B9)

   Two things the brief asks for that this file didn't have:
     "each password-protected with MFA"
     "Admins can remove anyone instantly"

   SUSPEND, NEVER DELETE. Deleting a user takes their audit trail with them, and
   the audit trail is the thing that makes this platform safe to hand a CEO: it
   must outlive the person it describes. `suspended_at` locks the account out on
   the next request while every action they took stays on the record.
   ──────────────────────────────────────────────────────────────────────────── */

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  suspendedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export async function listUsers(): Promise<AdminUser[]> {
  const sql = sqlClient();
  if (!sql) return [];
  const rows = (await sql`
    SELECT id, username, role, must_change_password, totp_enabled,
           suspended_at, last_login_at, created_at, created_by
    FROM users ORDER BY suspended_at NULLS FIRST, username
  `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    username: String(r.username),
    role: String(r.role),
    mustChangePassword: !!r.must_change_password,
    mfaEnabled: !!r.totp_enabled,
    suspendedAt: r.suspended_at ? String(r.suspended_at) : null,
    lastLoginAt: r.last_login_at ? String(r.last_login_at) : null,
    createdAt: String(r.created_at),
    createdBy: r.created_by ? String(r.created_by) : null,
  }));
}

export async function createUser(
  username: string,
  passwordHash: string,
  role: string,
  createdBy: string,
): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`
    INSERT INTO users (username, password_hash, role, must_change_password, created_by)
    VALUES (${username}, ${passwordHash}, ${role}, TRUE, ${createdBy})
  `;
}

/** Lock an account out. Takes effect on their next request — no waiting. */
export async function suspendUser(userId: number): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`UPDATE users SET suspended_at = now() WHERE id = ${userId}`;
}

export async function restoreUser(userId: number): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`UPDATE users SET suspended_at = NULL WHERE id = ${userId}`;
}

export async function setRole(userId: number, role: string): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`;
}

/** Force a password reset: they must set a new one at next login. */
export async function resetPassword(userId: number, passwordHash: string): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`
    UPDATE users SET password_hash = ${passwordHash}, must_change_password = TRUE
    WHERE id = ${userId}
  `;
}

/* ── MFA ─────────────────────────────────────────────────────────────────── */

export interface MfaState {
  secret: string | null;
  enabled: boolean;
  suspendedAt: string | null;
}

export async function getMfa(userId: number): Promise<MfaState | null> {
  const sql = sqlClient();
  if (!sql) return null;
  const rows = (await sql`
    SELECT totp_secret, totp_enabled, suspended_at FROM users WHERE id = ${userId} LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  return {
    secret: rows[0].totp_secret ? String(rows[0].totp_secret) : null,
    enabled: !!rows[0].totp_enabled,
    suspendedAt: rows[0].suspended_at ? String(rows[0].suspended_at) : null,
  };
}

/**
 * Store a secret WITHOUT enabling MFA.
 *
 * Enrolment is two steps on purpose: we save the secret, then the user proves they
 * scanned it by entering a code, and only then does it become required. Enabling it
 * in one step would let a mis-scanned QR lock someone out of their own account with
 * no way back.
 */
export async function stageMfaSecret(userId: number, secret: string): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`UPDATE users SET totp_secret = ${secret}, totp_enabled = FALSE WHERE id = ${userId}`;
}

export async function enableMfa(userId: number, hashedRecoveryCodes: string[]): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`
    UPDATE users SET totp_enabled = TRUE, recovery_codes = ${hashedRecoveryCodes}
    WHERE id = ${userId}
  `;
}

export async function disableMfa(userId: number): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set.");
  await sql`
    UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, recovery_codes = NULL
    WHERE id = ${userId}
  `;
}

/** Consume a recovery code. Single-use: it is removed from the array on success. */
export async function useRecoveryCode(userId: number, hashed: string): Promise<boolean> {
  const sql = sqlClient();
  if (!sql) return false;
  const rows = (await sql`
    UPDATE users
       SET recovery_codes = array_remove(recovery_codes, ${hashed})
     WHERE id = ${userId} AND ${hashed} = ANY(recovery_codes)
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function noteLogin(userId: number): Promise<void> {
  try {
    const sql = sqlClient();
    if (!sql) return;
    await sql`UPDATE users SET last_login_at = now() WHERE id = ${userId}`;
  } catch {
    /* best-effort */
  }
}

/** Look a user up by id — used by the MFA second step, which has a ticket, not a name. */
export async function getUserById(id: number): Promise<DbUser | null> {
  const sql = sqlClient();
  if (!sql) return null;
  const rows = (await sql`
    SELECT id, username, role, password_hash, must_change_password,
           totp_enabled, suspended_at
    FROM users WHERE id = ${id} LIMIT 1
  `) as Array<{
    id: number;
    username: string;
    role: string;
    password_hash: string;
    must_change_password: boolean;
    totp_enabled: boolean | null;
    suspended_at: string | null;
  }>;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    mustChangePassword: r.must_change_password,
    passwordHash: r.password_hash,
    mfaEnabled: !!r.totp_enabled,
    suspendedAt: r.suspended_at ? String(r.suspended_at) : null,
  };
}
