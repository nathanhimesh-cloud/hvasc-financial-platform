"use server";

import { redirect } from "next/navigation";
import { getUserByUsername, logAudit } from "@/lib/auth/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export interface LoginState {
  error: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { error: "Enter your username and password." };
  }

  const user = await getUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    await logAudit({ username }, "login.failed");
    // Same message for unknown user vs wrong password (don't leak which).
    return { error: "Invalid username or password." };
  }

  await createSession({
    id: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
  await logAudit(user, "login.success");

  // First login on a default password -> force them to set their own.
  redirect(user.mustChangePassword ? "/change-password" : "/");
}
