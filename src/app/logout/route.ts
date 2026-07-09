import { redirect } from "next/navigation";
import { destroySession, getSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/auth/db";

export const dynamic = "force-dynamic";

/** Clears the session cookie and returns to the login page. */
export async function GET() {
  const session = await getSession();
  if (session) await logAudit(session, "logout");
  await destroySession();
  redirect("/login");
}
