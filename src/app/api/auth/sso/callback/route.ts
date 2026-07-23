import { createSession, readSsoState, clearSsoState } from "@/lib/auth/session";
import { getUserByEmail, provisionSsoUser, logAudit, noteLogin } from "@/lib/auth/db";
import { ssoConfig, originOf, exchangeCode } from "@/lib/auth/sso";

/**
 * The return leg of "Sign in with Microsoft".
 *
 * Microsoft sends the browser back here with `?code=…&state=…`. Every step below is
 * a gate; failing any of them lands the user back on the login page with a short,
 * honest reason and no session. Only a fully-verified identity that maps to a
 * permitted, non-suspended user gets a session cookie.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(origin: string, reason: string): Response {
  const url = new URL(`${origin}/login`);
  url.searchParams.set("sso_error", reason);
  return Response.redirect(url.toString(), 302);
}

export async function GET(request: Request) {
  const origin = originOf(request);
  const url = new URL(request.url);

  const cfg = ssoConfig();
  if (!cfg) return fail(origin, "Single sign-on is not configured.");

  // Microsoft can bounce back with its own error (user cancelled, consent denied…).
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) return fail(origin, providerError);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail(origin, "The sign-in response was incomplete.");

  // CSRF gate: this callback must answer a flow WE started in THIS browser. The
  // cookie is the only trustworthy record of that — the URL's state is attacker-set.
  const started = await readSsoState();
  await clearSsoState(); // one-shot, whatever the outcome
  if (!started || started.state !== state) {
    return fail(origin, "The sign-in could not be verified. Please try again.");
  }

  const identity = await exchangeCode(cfg, origin, code, started.nonce);
  if ("error" in identity) return fail(origin, identity.error);

  // Map the verified email to a Vantage user.
  let user = await getUserByEmail(identity.email);

  if (!user) {
    // Unknown email. Auto-provision ONLY if an allowed domain is set and matches —
    // otherwise a stranger in the tenant could mint themselves an account.
    const domain = identity.email.split("@")[1]?.toLowerCase();
    if (cfg.allowedDomain && domain === cfg.allowedDomain) {
      user = await provisionSsoUser(identity.email, cfg.defaultRole);
      if (user) {
        await logAudit(
          { id: user.id, username: user.username },
          "login.sso_provisioned",
          `Auto-provisioned from Microsoft SSO (${identity.email}) as ${cfg.defaultRole}.`,
        );
      }
    }
    if (!user) {
      await logAudit(null, "login.sso_unknown", `No Vantage account for ${identity.email}.`);
      return fail(
        origin,
        "That Microsoft account isn't linked to a Vantage user. Ask an administrator to add you.",
      );
    }
  }

  // Same suspension gate as password login — checked AFTER identity is proven.
  if (user.suspendedAt) {
    await logAudit({ id: user.id, username: user.username }, "login.suspended", "Suspended account via SSO.");
    return fail(origin, "This account has been suspended. Contact your administrator.");
  }

  await createSession({ id: user.id, username: user.username, role: user.role });
  await logAudit({ id: user.id, username: user.username }, "login.success", "Signed in with Microsoft.");
  await noteLogin(user.id);

  return Response.redirect(`${origin}/`, 302);
}
