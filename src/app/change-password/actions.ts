"use server";

import { redirect } from "next/navigation";
import { logAudit, updatePassword } from "@/lib/auth/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getSession } from "@/lib/auth/session";

export interface ChangeState {
  error: string;
}

const MIN_LEN = 10;

export async function changePassword(_prev: ChangeState, formData: FormData): Promise<ChangeState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < MIN_LEN) return { error: `Use at least ${MIN_LEN} characters.` };
  if (next !== confirm) return { error: "The two passwords don't match." };
  if (next.toLowerCase() === "pass@123") return { error: "Choose a password other than the default." };

  await updatePassword(session.id, hashPassword(next));
  await logAudit(session, "password.changed");

  // Refresh the cookie so the forced-change flag is cleared.
  await createSession({ ...session, mustChangePassword: false });
  redirect("/");
}
