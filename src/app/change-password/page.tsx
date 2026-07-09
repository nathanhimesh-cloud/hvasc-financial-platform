import { redirect } from "next/navigation";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { PLATFORM_NAME } from "@/lib/site";
import { ChangePasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  if (!isAuthConfigured()) redirect("/");
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-border bg-card p-8">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-[16px] font-semibold text-foreground">
            {session.mustChangePassword ? "Set your password" : "Change your password"}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {session.mustChangePassword
              ? `You're signed in with a default password. Choose your own to continue into ${PLATFORM_NAME}.`
              : `Signed in as ${session.username}.`}
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
