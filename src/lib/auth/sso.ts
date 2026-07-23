import "server-only";
import crypto from "node:crypto";

/**
 * Microsoft (Azure AD / Entra ID) single sign-on (Developer Checklist item 4:
 * "individual logins via each staff member's existing official email").
 *
 * OpenID Connect authorization-code flow, confidential client. No auth library —
 * the same principle as the rest of this app's auth: a small amount of standard,
 * auditable code beats a dependency you must keep trusting forever.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TURNS ON ONLY WHEN CONFIGURED. Like every other integration here, SSO is dark
 * until its credentials are set in the deployment environment. The three env vars
 * must be created in the Council's Microsoft tenant (Azure Portal → App
 * registrations) — Vantage cannot create them, exactly as it cannot create the
 * Anthropic key. Until they exist, password login is the only path and the
 * "Sign in with Microsoft" button does not appear.
 *
 *   AZURE_AD_TENANT_ID       the Council's Microsoft tenant (directory) ID
 *   AZURE_AD_CLIENT_ID       this app's registration in that tenant
 *   AZURE_AD_CLIENT_SECRET   the registration's client secret
 *
 * Optional:
 *   SSO_ALLOWED_DOMAIN   e.g. "hopevale.qld.gov.au". If set, ANY email in that
 *                        domain may sign in and is auto-provisioned read-only on
 *                        first arrival. If unset, only emails already on a user
 *                        record may sign in (an admin provisions them first).
 *   SSO_DEFAULT_ROLE     role for auto-provisioned users. Default "ceo" (read-only).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SsoConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  allowedDomain: string | null;
  defaultRole: string;
}

/** Present config only when ALL three required vars are set. Never returns the secret to a client. */
export function ssoConfig(): SsoConfig | null {
  const tenantId = process.env.AZURE_AD_TENANT_ID?.trim();
  const clientId = process.env.AZURE_AD_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) return null;
  return {
    tenantId,
    clientId,
    clientSecret,
    allowedDomain: process.env.SSO_ALLOWED_DOMAIN?.trim().toLowerCase() || null,
    defaultRole: process.env.SSO_DEFAULT_ROLE?.trim() || "ceo",
  };
}

/** Cheap boolean for the UI — is the button shown? */
export function ssoEnabled(): boolean {
  return ssoConfig() !== null;
}

const authority = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}`;

/**
 * The public origin of this deployment, as the browser sees it.
 *
 * Behind Vercel's proxy `request.url` can carry an internal host, so we trust the
 * forwarded headers first — they're what the redirect_uri registered in Azure must
 * match. The redirect_uri MUST be byte-identical between /start and /callback, so
 * both call this.
 */
export function originOf(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

/** The redirect URI must EXACTLY match one registered on the Azure app. Built from the request origin. */
export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/sso/callback`;
}

/** A random URL-safe token, for state and nonce. */
export function randomToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Where to send the browser to start sign-in. */
export function authorizeUrl(
  cfg: SsoConfig,
  origin: string,
  state: string,
  nonce: string,
): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri(origin),
    response_mode: "query",
    // openid+email+profile is all we need: who they are, nothing more.
    scope: "openid email profile",
    state,
    nonce,
  });
  return `${authority(cfg.tenantId)}/oauth2/v2.0/authorize?${p.toString()}`;
}

interface TokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

export interface SsoIdentity {
  email: string;
  name: string;
}

/**
 * Exchange the authorization code for tokens, then read the identity out of the
 * id_token.
 *
 * WHY DECODING THE id_token HERE IS SAFE. We do this exchange SERVER-TO-SERVER,
 * straight to Microsoft's token endpoint over TLS, authenticated with our client
 * secret. The id_token in that response never passed through the user's browser, so
 * it cannot have been tampered with in transit. We still check the claims that matter
 * — audience is us, issuer is the right tenant, the nonce we sent came back, and it
 * hasn't expired — as defence in depth. (Full JWKS signature verification is the
 * gold standard; for a confidential-client code exchange it adds little over these
 * checks and a lot of moving parts.)
 */
export async function exchangeCode(
  cfg: SsoConfig,
  origin: string,
  code: string,
  expectedNonce: string,
): Promise<SsoIdentity | { error: string }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
    scope: "openid email profile",
  });

  let res: Response;
  try {
    res = await fetch(`${authority(cfg.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    return { error: "Could not reach Microsoft to complete sign-in." };
  }

  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.id_token) {
    return { error: json.error_description || json.error || "Microsoft rejected the sign-in." };
  }

  const claims = decodeJwtPayload(json.id_token);
  if (!claims) return { error: "The token from Microsoft was unreadable." };

  // Defence-in-depth claim checks.
  if (claims.aud !== cfg.clientId) return { error: "The sign-in was issued for a different application." };
  if (typeof claims.iss === "string" && !claims.iss.includes(cfg.tenantId)) {
    return { error: "The sign-in came from an unexpected directory." };
  }
  if (claims.nonce !== expectedNonce) return { error: "The sign-in could not be verified (nonce mismatch)." };
  if (typeof claims.exp === "number" && Date.now() / 1000 > claims.exp) {
    return { error: "The sign-in has expired. Please try again." };
  }

  // Microsoft puts the email in `email`, or falls back to `preferred_username` /`upn`.
  const email =
    firstString(claims.email) ??
    firstString(claims.preferred_username) ??
    firstString(claims.upn);
  if (!email || !email.includes("@")) {
    return { error: "Microsoft did not return an email address for this account." };
  }

  return { email: email.toLowerCase(), name: firstString(claims.name) ?? email };
}

function firstString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Decode a JWT payload (base64url middle segment) — no verification, see exchangeCode. */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
