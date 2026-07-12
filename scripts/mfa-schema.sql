-- Vantage (HVASC) — MFA + user administration (Build Brief B9)
--
-- Run once against Neon:
--     psql "$DATABASE_URL" -f scripts/mfa-schema.sql
--
-- The brief asks for two things this adds:
--   "each password-protected with MFA"
--   "Admins can remove anyone instantly"
--
-- SUSPEND, don't DELETE. A deleted user takes their audit trail's foreign key with
-- them, and the audit log is the thing that makes this platform safe to give a CEO
-- — it must survive the departure of the person it describes. `suspended_at` locks
-- an account out instantly (the session check reads it on every request) while
-- every action they ever took stays on the record.

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes  TEXT[];      -- hashed, single-use
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at    TIMESTAMPTZ; -- NULL = active
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by      TEXT;

-- Finding the active users is the hot path (every request checks the session).
CREATE INDEX IF NOT EXISTS users_active_idx ON users (username) WHERE suspended_at IS NULL;
