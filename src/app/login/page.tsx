import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { ssoEnabled } from "@/lib/auth/sso";
import { SITE_NAME } from "@/lib/site";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already signed in (or auth not configured) → go to the app.
  if (!isAuthConfigured() || (await getSession())) redirect("/");

  const sp = await searchParams;
  const ssoError = typeof sp.sso_error === "string" ? sp.sso_error : null;
  const sso = ssoEnabled();

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

        {/* A failed Microsoft round-trip lands here with a plain reason. */}
        {ssoError && (
          <div className="flex items-start gap-2.5 rounded-md border border-red/25 bg-red/[0.04] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red" strokeWidth={2} />
            <p className="text-[12px] leading-relaxed text-muted-foreground">{ssoError}</p>
          </div>
        )}

        <LoginForm />

        {/* Microsoft SSO appears only when the tenant is configured (AZURE_AD_* env).
            Until then the password form above is the only path. */}
        {sso && (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                or
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <a
              href="/api/auth/sso/start"
              className="inline-flex items-center justify-center gap-2.5 rounded-md border border-border bg-elevated px-4 py-2.5 text-[14px] font-semibold text-foreground transition-colors hover:border-gold/40"
            >
              <MicrosoftMark />
              Sign in with Microsoft
            </a>
          </>
        )}

        <p className="text-center font-mono text-[10px] text-muted-foreground">
          Access is by invitation. Contact SandS to be added.
        </p>
      </div>
    </main>
  );
}

/** The Microsoft four-square logo, inline so no external asset is fetched. */
function MicrosoftMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
