"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { generateSecret, otpauthUri, verifyTotp, generateRecoveryCodes } from "@/lib/auth/totp";
import { stageMfaSecret, enableMfa, disableMfa, getMfa, logAudit } from "@/lib/auth/db";

/**
 * MFA enrolment — done BY the user, never FOR them.
 *
 * An administrator cannot turn MFA on for someone else, and the code enforces that
 * rather than merely discouraging it: the secret has to reach that person's phone
 * and nowhere else. A secret an admin has seen is a second factor the admin also
 * holds, which is not a second factor at all.
 *
 * Two steps, deliberately:
 *   1. `beginMfa`  — generate a secret, store it, show the QR. NOT yet enabled.
 *   2. `confirmMfa` — they type a code from the app, proving the scan worked. Only
 *      then does MFA become required.
 *
 * Enabling in one step would let a mis-scanned QR lock someone out of their own
 * account with no way back in.
 */

export interface MfaSetupState {
  error: string;
  /** The `otpauth://` URI to render as a QR code. */
  uri?: string;
  /** The base32 secret, for manual entry when a camera won't cooperate. */
  secret?: string;
  /** Shown ONCE, after MFA is enabled. */
  recoveryCodes?: string[];
  done?: boolean;
}

export async function beginMfa(): Promise<MfaSetupState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const secret = generateSecret();
  await stageMfaSecret(session.id, secret);

  return {
    error: "",
    secret,
    uri: otpauthUri(session.username, secret),
  };
}

export async function confirmMfa(_prev: MfaSetupState, form: FormData): Promise<MfaSetupState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const code = String(form.get("code") ?? "").trim();
  const mfa = await getMfa(session.id);
  if (!mfa?.secret) {
    return { error: "Start again — no setup is in progress." };
  }

  if (!verifyTotp(mfa.secret, code)) {
    // Re-show the QR so they aren't stranded on a dead form.
    return {
      error: "That code isn't right. Check your phone's clock is correct, and try the next code.",
      secret: mfa.secret,
      uri: otpauthUri(session.username, mfa.secret),
    };
  }

  /*
    RECOVERY CODES, GENERATED AT THE MOMENT MFA BECOMES REQUIRED.

    Without them, "I lost my phone" means an administrator has to clear MFA — which
    is a support call, at month end, from the CFO. Each code is single-use and stored
    HASHED, exactly like a password, because that is exactly what it is.
  */
  const codes = generateRecoveryCodes();
  await enableMfa(session.id, codes.map((c) => hashPassword(c)));
  await logAudit(session, "mfa.enabled");
  revalidatePath("/account");

  return { error: "", done: true, recoveryCodes: codes };
}

export async function turnOffMfa(): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in.");
  await disableMfa(session.id);
  await logAudit(session, "mfa.disabled");
  revalidatePath("/account");
}
