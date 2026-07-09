/**
 * Print a scrypt password hash for a new user, to paste into an INSERT.
 * Usage:  node scripts/hash-password.mjs "their password"
 * Then:   INSERT INTO users (username, password_hash, role)
 *         VALUES ('jsmith', '<the hash>', 'finance');
 * Roles: admin | finance | ceo | manager | grant-manager
 */
import crypto from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: node scripts/hash-password.mjs "<password>"');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
console.log(`${salt}:${hash}`);
