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
  // SSO needs AUTH_SECRET too (to sign the state cookie). Without it, createSsoState
  // throws — so treat it as unconfigured and send them back rather than 500.
  if (!cfg || !process.env.AUTH_SECRET) {
    return Response.redirect(`${origin}/login?sso=unconfigured`, 302);
  }

  // Already signed in → nothing to do.
  if (await getSession()) return Response.redirect(`${origin}/`, 302);

  const state = randomToken();
  const nonce = randomToken();
  await createSsoState(state, nonce);

  return Response.redirect(authorizeUrl(cfg, origin, state, nonce), 302);
}
