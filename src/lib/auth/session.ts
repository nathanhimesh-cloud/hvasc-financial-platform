import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";

/**
 * Minimal signed-cookie sessions (HMAC-SHA256 over a JSON payload) — a tiny JWT,
 * no external auth library. Auth turns ON only when AUTH_SECRET (and a users DB,
 * DATABASE_URL) are set, so the app keeps working before login is configured.
 */

const COOKIE = "hv_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

export interface SessionUser {
  id: number;
  username: string;
  role: string;
  /** True until the user sets their own password (forced on first login). */
  mustChangePassword?: boolean;
}

/**
 * The Neon/Vercel integration names the connection string differently depending
 * on how it's installed (and on any "custom prefix" chosen). Accept the common
 * ones so setup can't silently fail on a naming mismatch.
 */
export function databaseUrl(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.STORAGE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    null
  );
}

/** Auth turns on only once BOTH a database and a signing secret are present. */
export function isAuthConfigured(): boolean {
  return !!process.env.AUTH_SECRET && !!databaseUrl();
}

function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsign(token: string, secret: string): Record<string, unknown> | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(user: SessionUser): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const token = sign(
    { id: user.id, username: user.username, role: user.role, mcp: !!user.mustChangePassword, exp },
    secret,
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const payload = unsign(token, secret);
  if (!payload) return null;
  return {
    id: Number(payload.id),
    username: String(payload.username),
    role: String(payload.role),
    mustChangePassword: payload.mcp === true,
  };
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/* ────────────────────────────────────────────────────────────────────────────
   THE MFA TICKET — the bit between "password accepted" and "signed in".

   Two-step login has an obvious trap: how does step two know step one passed?

   The naive answer is to re-post the password in a hidden field. That works until a
   password manager declines to refill it, and then the second step fails with no
   visible reason. It also means the password crosses the wire twice for one login.

   So: when the password is right but MFA is outstanding, we issue a SEPARATE signed
   cookie that says nothing except "user 7 passed a password check, and this expires
   in five minutes". It is not a session — it grants no access to anything. It only
   entitles you to be asked for a code.

   Short life (5 min), single purpose, and it is cleared the moment a real session
   is created.
   ──────────────────────────────────────────────────────────────────────────── */

const MFA_COOKIE = "hv_mfa";
const MFA_MAX_AGE = 60 * 5; // five minutes to reach for your phone

export async function createMfaTicket(userId: number): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  const exp = Math.floor(Date.now() / 1000) + MFA_MAX_AGE;
  const token = sign({ uid: userId, exp, kind: "mfa" }, secret);
  const jar = await cookies();
  jar.set(MFA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MFA_MAX_AGE,
  });
}

/** The user id this ticket is for, or null if it's missing, expired or forged. */
export async function readMfaTicket(): Promise<number | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const jar = await cookies();
  const token = jar.get(MFA_COOKIE)?.value;
  if (!token) return null;
  const payload = unsign(token, secret);
  // `kind` is checked so a full session cookie can never be replayed as an MFA
  // ticket, or the reverse. Same signing key, different purposes — say which.
  if (!payload || payload.kind !== "mfa" || typeof payload.uid !== "number") return null;
  return payload.uid;
}

export async function clearMfaTicket(): Promise<void> {
  const jar = await cookies();
  jar.delete(MFA_COOKIE);
}
