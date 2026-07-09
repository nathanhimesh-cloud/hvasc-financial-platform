-- Vantage (HVASC platform) — auth users + audit log, seed admin.
-- Run once against the Neon (Postgres) database (Vercel -> Storage -> Neon -> SQL editor).
--
-- NOTE: Neon's SQL editor sends the whole box as ONE prepared statement and will
-- fail with "cannot insert multiple commands into a prepared statement" if you
-- paste several ";"-separated commands. Either:
--   (a) run each statement below ONE AT A TIME, or
--   (b) paste the single DO block at the bottom of this file (one command).
-- Via psql / any normal client, the whole file runs fine as-is.
--
-- Login-only: users are created here by an admin, there is NO public sign-up.
-- To add a user:
--     node scripts/hash-password.mjs "<their password>"
-- then INSERT a row like the admin one below. New users get must_change_password = true,
-- so they are forced to set their own password on first login.
--
-- ROLES (see src/lib/auth/roles.ts):
--   admin          SandS support - everything, incl. the audit log and user access
--   finance        CFO / Finance - all reports + account-mapping admin
--   ceo            Executive view (read-only)
--   manager        Department head (read-only)
--   grant-manager  Grants - may edit grant metadata, never GL figures
--
-- Financial actuals are read-only from the General Ledger for EVERY role.
-- Only reporting metadata (names, department assignment, grant milestones) is editable.
--
-- To give Micah his own admin account (per the 9 Jul review), generate a hash and run:
--     INSERT INTO users (username, password_hash, role, must_change_password)
--     VALUES ('micah', '<hash from hash-password.mjs>', 'admin', TRUE)
--     ON CONFLICT (username) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  username             TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'admin',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- If the table already existed from an earlier run, add the new column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

-- Immutable-by-convention audit trail: logins, password changes, exports.
-- Visible only to admins (enforced in the app, /audit).
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER,
  username   TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

-- Seed admin - username: admin - password: Pass@123
-- Forced to change the password on first login. CHANGE IT.
INSERT INTO users (username, password_hash, role, must_change_password)
VALUES (
  'admin',
  'b6d2ad44775ef63bb96598e48d4af831:c796a422401b87123c8f5752f566dd7d1dcdc7cd1da0122bb8d48e7b42679b139a5572318747e8d8005d8946ed4832680638f426f0b192714e8fdcb793a4c872',
  'admin',
  TRUE
)
ON CONFLICT (username) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- ONE-SHOT version for Neon's SQL editor: a DO block is a SINGLE command, so it
-- runs where the statements above would be rejected. Paste ONLY this block.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- DO $$
-- BEGIN
--   CREATE TABLE IF NOT EXISTS users (
--     id SERIAL PRIMARY KEY,
--     username TEXT UNIQUE NOT NULL,
--     password_hash TEXT NOT NULL,
--     role TEXT NOT NULL DEFAULT 'admin',
--     must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
--   );
--   CREATE TABLE IF NOT EXISTS audit_log (
--     id BIGSERIAL PRIMARY KEY,
--     user_id INTEGER,
--     username TEXT,
--     action TEXT NOT NULL,
--     detail TEXT,
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
--   );
--   CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
--   INSERT INTO users (username, password_hash, role, must_change_password)
--   VALUES ('admin', 'b6d2ad44775ef63bb96598e48d4af831:c796a422401b87123c8f5752f566dd7d1dcdc7cd1da0122bb8d48e7b42679b139a5572318747e8d8005d8946ed4832680638f426f0b192714e8fdcb793a4c872', 'admin', TRUE)
--   ON CONFLICT (username) DO NOTHING;
-- END $$;
