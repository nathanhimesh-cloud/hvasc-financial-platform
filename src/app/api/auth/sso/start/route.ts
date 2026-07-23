import { getSession } from "@/lib/auth/session";
import { createSsoState } from "@/lib/auth/session";
import { ssoConfig, originOf, authorizeUrl, randomToken } from "@/lib/auth/sso";

/**
 * Begin "Sign in with Microsoft".
 *
 * A GET so a plain link/button starts it — no form, no CSRF token to thread through
 * the client, because the flow's own `state`/`nonce` (stashed in a signed cookie
 * here) is the CSRF protection. See createSsoState in session.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = originOf(request);

  const cfg = ssoConfig();
  if (!cfg) {
    // SSO isn't configured on this deployment — send them back to the password form.
    return Response.redirect(`${origin}/login?sso=unconfigured`, 302);
  }

  // Already signed in → nothing to do.
  if (await getSession()) return Response.redirect(`${origin}/`, 302);

  const state = randomToken();
  const nonce = randomToken();
  await createSsoState(state, nonce);

  return Response.redirect(authorizeUrl(cfg, origin, state, nonce), 302);
}
