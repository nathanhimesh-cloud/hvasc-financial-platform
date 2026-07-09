-- Vantage — GL transaction ledger.
--
-- WHY THIS EXISTS
-- Transactions were being shipped INSIDE the snapshot JSON. That works in July
-- (81 rows) but by June it's tens of thousands, the payload becomes megabytes,
-- and every sync re-sends the entire year. It also duplicates the whole ledger
-- into each period row of the snapshot history.
--
-- Instead, each sync UPSERTs its transactions here, keyed on GLTRN's own primary
-- key (ky). The ledger accumulates across the year with no duplicates, the
-- snapshot stays small, and drill-down across years becomes a query rather than
-- a download.
--
-- Neon's SQL editor sends the whole box as ONE prepared statement, so this is a
-- single DO block. Paste the whole thing and run it once.

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS gl_transactions (
    ky          BIGINT PRIMARY KEY,        -- GLTRN.KY - stable, lets us UPSERT
    fy_label    TEXT        NOT NULL,      -- 'FY2026-27'
    txn_date    DATE        NOT NULL,
    code        TEXT        NOT NULL,      -- GL account code
    account     TEXT,                      -- account name
    description TEXT,                      -- transaction narrative
    ref         TEXT,                      -- document / reference number
    debit       NUMERIC(16,2) NOT NULL DEFAULT 0,
    credit      NUMERIC(16,2) NOT NULL DEFAULT 0,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Drill-down and the transaction report filter on date, account and FY.
  CREATE INDEX IF NOT EXISTS gl_txn_date_idx    ON gl_transactions (txn_date DESC);
  CREATE INDEX IF NOT EXISTS gl_txn_fy_date_idx ON gl_transactions (fy_label, txn_date DESC);
  CREATE INDEX IF NOT EXISTS gl_txn_code_idx    ON gl_transactions (code);
END $$;
