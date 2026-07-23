-- Microsoft SSO — link users to their official email (Developer Checklist item 4).
--
-- One statement (DO block) so Neon's SQL editor accepts it. Safe to re-run.
--
-- WHY AN EMAIL COLUMN. SSO signs a person in by the email their identity provider
-- (Microsoft) vouches for. To turn that into a Vantage login we need to match that
-- email to a user row — so every account that may sign in with Microsoft carries the
-- email it will arrive as. Existing password logins are unaffected: email is optional,
-- and a user with no email simply can't use SSO (they still log in with a password).

DO $$
BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

  -- Case-insensitive uniqueness: two people must not claim the same email, and
  -- "Micah@…" and "micah@…" are the same person. Partial, so the many NULLs
  -- (password-only users) don't collide with each other.
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
    ON users (LOWER(email)) WHERE email IS NOT NULL;
END $$;
