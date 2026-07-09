import "server-only";
import { neon } from "@neondatabase/serverless";
import type { SessionUser } from "./session";

/**
 * User lookup + audit trail against the Neon (Postgres) database. Login-only:
 * users are created by an admin (seed SQL / hash-password script), no self sign-up.
 */

export interface DbUser extends SessionUser {
  passwordHash: string;
}

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const sql = sqlClient();
  if (!sql) return null;
  const rows = (await sql`
    SELECT id, username, role, password_hash, must_change_password
    FROM users WHERE username = ${username} LIMIT 1
  `) as Array<{
    id: number;
    username: string;
    role: string;
    password_hash: string;
    must_change_password: boolean;
  }>;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    mustChangePassword: r.must_change_password,
    passwordHash: r.password_hash,
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
