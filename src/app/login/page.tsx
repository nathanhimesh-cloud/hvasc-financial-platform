import { redirect } from "next/navigation";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { SITE_NAME } from "@/lib/site";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in (or auth not configured) → go to the app.
  if (!isAuthConfigured() || (await getSession())) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-border bg-card p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-foreground font-heading text-[15px] font-bold text-background">
            HV
          </span>
          <div>
            <h1 className="text-[16px] font-semibold text-foreground">Hope Vale ASC</h1>
            <p className="text-[12px] text-muted-foreground">{SITE_NAME}</p>
          </div>
        </div>
        <LoginForm />
        <p className="text-center font-mono text-[10px] text-muted-foreground">
          Access is by invitation. Contact SandS to be added.
        </p>
      </div>
    </main>
  );
}
