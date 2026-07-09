-- Vantage (HVASC platform) — auth users + audit log, seed admin.
-- Run once against the Neon (Postgres) database (Vercel -> Storage -> Neon -> SQL editor).
--
-- Login-only: users are created here by an admin, there is NO public sign-up.
-- To add a user:
--     node scripts/hash-password.mjs "<their password>"
-- then INSERT a row like the admin one below. New users get must_change_password = true,
-- so they are forced to set their own password on first login.

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
