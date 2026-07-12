"use server";

import { redirect } from "next/navigation";
import {
  getUserByUsername,
  getUserById,
  logAudit,
  noteLogin,
  getMfa,
  useRecoveryCode,
} from "@/lib/auth/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import {
  createSession,
  createMfaTicket,
  readMfaTicket,
  clearMfaTicket,
} from "@/lib/auth/session";
import { verifyTotp } from "@/lib/auth/totp";

export interface LoginState {
  error: string;
  /** True when the password was right but a second factor is still needed. */
  needsCode?: boolean;
}

/** Step 1: username + password. */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState | never> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password." };
  }

  const user = await getUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    await logAudit({ username }, "login.failed");
    // The same message for an unknown user as for a wrong password — telling them
    // apart tells an attacker which usernames are real.
    return { error: "Invalid username or password." };
  }

  /*
    SUSPENDED ACCOUNTS ARE REFUSED HERE — AFTER the password, never before.

    Refusing first would turn the login form into a user directory: type a username,
    read "this account is suspended", and you have confirmed the account exists
    without ever knowing its password. Verify the password, THEN refuse.

    This check is also what makes "admins can remove anyone instantly" instant. It
    runs on every login attempt, so a suspension bites on the very next one.
  */
  if (user.suspendedAt) {
    await logAudit(user, "login.suspended", "A suspended account attempted to sign in.");
    return { error: "This account has been suspended. Contact your administrator." };
  }

  if (user.mfaEnabled) {
    // Password accepted, but not signed in. The ticket grants nothing except the
    // right to be asked for a code, and it expires in five minutes.
    await createMfaTicket(user.id);
    return { error: "", needsCode: true };
  }

  // finishLogin() ends in redirect(), which throws. TypeScript cannot see through
  // the call, so it needs a terminator it can prove. This line never runs.
  return await finishLogin(user.id, user.username, user.role, user.mustChangePassword);
}

/** Step 2: the six-digit code (or a recovery code). */
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState | never> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the code from your authenticator app.", needsCode: true };

  // The ONLY thing that proves step one happened. Not a hidden field, not the
  // client's word for it.
  const userId = await readMfaTicket();
  if (!userId) {
    return { error: "That took too long. Please sign in again.", needsCode: false };
  }

  const user = await getUserById(userId);
  if (!user || user.suspendedAt) {
    await clearMfaTicket();
    return { error: "Please sign in again.", needsCode: false };
  }

  const mfa = await getMfa(user.id);
  const okCode = !!mfa?.secret && verifyTotp(mfa.secret, code);

  // A recovery code is the answer to "I lost my phone". Single-use, hashed at rest,
  // consumed on success. Without it, MFA turns a lost phone into a locked-out CFO
  // and a support call at month end.
  const okRecovery =
    !okCode && (await useRecoveryCode(user.id, hashPassword(code.toUpperCase())));

  if (!okCode && !okRecovery) {
    await logAudit(user, "login.mfa_failed");
    return { error: "That code isn't right. Try again.", needsCode: true };
  }
  if (okRecovery) {
    await logAudit(user, "login.recovery_code_used", "A single-use recovery code was consumed.");
  }

  await clearMfaTicket();
  return await finishLogin(user.id, user.username, user.role, user.mustChangePassword);
}

async function finishLogin(
  id: number,
  username: string,
  role: string,
  mustChangePassword?: boolean,
): Promise<never> {
  await createSession({ id, username, role, mustChangePassword });
  await logAudit({ id, username }, "login.success");
  await noteLogin(id);
  // First login on a default password → force them to set their own.
  redirect(mustChangePassword ? "/change-password" : "/");
}
