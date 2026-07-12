import crypto from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238) — the second factor (Build Brief B9).
 *
 * Written here rather than pulled from a package, because TOTP is about forty
 * lines of standard library and an auth dependency is a thing you have to keep
 * trusting forever. Works with Google Authenticator, Microsoft Authenticator, 1Password,
 * Authy — anything that scans an `otpauth://` URI.
 *
 * Two details that matter, and that naive implementations get wrong:
 *
 *   1. **The window.** Phone clocks drift, and a user typing six digits takes a few
 *      seconds. We accept the previous and next 30-second step as well as the
 *      current one — ±1 step, no more. A wider window is a weaker factor.
 *
 *   2. **Constant-time comparison.** Comparing codes with `===` leaks, through
 *      timing, how many leading digits were right. `timingSafeEqual` doesn't.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the code from one step before and after — clock drift, and human typing speed. */
const WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** A new random secret, base32-encoded, ready for an authenticator app. */
export function generateSecret(): string {
  const bytes = crypto.randomBytes(20); // 160 bits — the RFC's recommendation
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += B32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** The 6-digit code for a given secret at a given time step. */
function codeAt(secret: string, step: number): string {
  const key = base32Decode(secret);

  // The counter is an 8-byte big-endian integer. `writeBigUInt64BE` rather than
  // bit-shifting: JavaScript's bitwise operators are 32-bit, and a step counter
  // will not fit in 32 bits forever.
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const hmac = crypto.createHmac("sha1", key).update(counter).digest();

  // Dynamic truncation (RFC 4226 §5.4).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/**
 * Is this code valid for this secret, right now?
 *
 * Accepts ±1 time step. Compares in constant time — a `===` on the code would leak,
 * through response timing, how many leading digits an attacker got right, which is
 * exactly the kind of small hole that turns six digits into far fewer.
 */
export function verifyTotp(secret: string, code: string): boolean {
  const clean = (code ?? "").replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;

  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const expected = codeAt(secret, now + i);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * The issuer appears in BOTH the label and the query string. That looks redundant
 * and isn't: some apps read one, some the other, and a user with three council
 * accounts needs to see which is which.
 */
export function otpauthUri(username: string, secret: string, issuer = "Vantage — Hope Vale ASC"): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Recovery codes — the answer to "I lost my phone".
 *
 * Without these, MFA turns a lost phone into a locked-out CFO and a support call at
 * month end. Each is single-use; we store them hashed, like passwords, because a
 * recovery code IS a password.
 */
export function generateRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"),
  );
}
