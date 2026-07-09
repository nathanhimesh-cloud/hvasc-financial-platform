-- Vantage — snapshot history.
--
-- Every sync currently OVERWRITES the single snapshot in Blob storage, so nothing
-- is retained month to month. This table keeps one row per (financial year, period),
-- upserted on each push. History then accumulates automatically, giving us
-- year-over-year comparatives, back/forward period navigation, and the data
-- retention the engagement letter expects.
--
-- Neon's SQL editor sends the whole box as ONE prepared statement, so this is
-- written as a single DO block. Paste the whole thing and run it once.

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS snapshots (
    fy_label     TEXT        NOT NULL,          -- 'FY2026-27'
    period_month INTEGER     NOT NULL,          -- 1 = Jul .. 12 = Jun
    period_label TEXT,                          -- 'Jul 2026'
    generated_at DATE,                          -- snapshot.meta.generatedAt
    payload      JSONB       NOT NULL,          -- the whole FinancialSnapshot
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fy_label, period_month)
  );
  CREATE INDEX IF NOT EXISTS snapshots_fy_idx ON snapshots (fy_label, period_month DESC);
END $$;
