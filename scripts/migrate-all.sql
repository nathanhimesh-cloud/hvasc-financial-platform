-- ============================================================================
-- Vantage — all pending migrations, as ONE statement.
--
-- WHY THIS FILE EXISTS
--
-- The Neon SQL editor sends whatever you paste as a single prepared statement,
-- and Postgres refuses a prepared statement that contains more than one command:
--
--     cannot insert multiple commands into a prepared statement
--
-- Wrapping everything in a DO $$ ... $$ block makes it ONE command as far as the
-- driver is concerned — Postgres parses the body itself. So this whole file can be
-- pasted and run in one go.
--
-- Safe to run more than once. Every step is IF NOT EXISTS; running it twice changes
-- nothing. Nothing here drops, renames, or rewrites an existing column.
--
-- Covers:
--   1. MFA + user administration   (scripts/mfa-schema.sql)
--   2. The integrity log           (scripts/integrity-log-schema.sql)
-- ============================================================================

DO $$
BEGIN

  -- ── 1. MFA and user administration (Build Brief B9) ──────────────────────
  --
  -- SUSPEND, NEVER DELETE. A deleted user takes the meaning of their audit trail
  -- with them: "who approved this?" becomes unanswerable the moment they leave.
  -- `suspended_at` is what makes instant removal possible without destroying the
  -- record — which is what makes this platform safe to hand a CEO.

  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret    TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled   BOOLEAN NOT NULL DEFAULT FALSE;
  -- Recovery codes are stored HASHED, exactly like passwords — because that is
  -- exactly what they are: something that signs you in.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes TEXT[];
  ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at   TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by     TEXT;

  -- Every request checks the session, and every session check filters on active
  -- users. Partial index: suspended users are the rare rows.
  CREATE INDEX IF NOT EXISTS users_active_idx
    ON users (username) WHERE suspended_at IS NULL;


  -- ── 2. The integrity log (Build Brief A4b) ───────────────────────────────
  --
  -- The accuracy checks give a verdict for the CURRENT snapshot: "is today's report
  -- trustworthy?" This answers the question an auditor actually asks — "has it ever
  -- not been?" — which nobody could answer, because each sync overwrote the last.
  --
  -- Append-only. Rows are never updated and never deleted. A month where the balance
  -- sheet didn't balance stays on the record after it's fixed; that is the point.

  CREATE TABLE IF NOT EXISTS integrity_log (
    id            BIGSERIAL PRIMARY KEY,
    checked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The period the snapshot covered, so a failure can be tied to a month.
    fy_label      TEXT        NOT NULL,
    period_label  TEXT        NOT NULL,
    passed        BOOLEAN     NOT NULL,
    checks_total  INTEGER     NOT NULL,
    checks_failed INTEGER     NOT NULL,
    -- The failures themselves. JSON because the shape of a check may change without
    -- a migration; what must NOT change is that a failure was recorded on a given day.
    failures      JSONB       NOT NULL DEFAULT '[]'::jsonb
  );

  CREATE INDEX IF NOT EXISTS integrity_log_checked_idx
    ON integrity_log (checked_at DESC);

  -- Finding the failures is the auditor's query, and failures are the rare rows.
  CREATE INDEX IF NOT EXISTS integrity_log_failed_idx
    ON integrity_log (checked_at DESC) WHERE passed = FALSE;

END $$;
