-- Vantage - sync log.
--
-- WHY THIS EXISTS
-- "Data as at 9 Jul 2026" is not enough when the feed runs three times a day.
-- This records every push: when it landed, which period it carried, how many
-- transactions the ledger took, and whether the archive succeeded. It's the
-- answer to "is the dashboard actually current, and where did this number come
-- from" - and the first thing to look at when a figure looks stale.
--
-- Rows are small and append-only. At 3 syncs/day that's ~1,100 rows a year.
--
-- Neon's SQL editor sends the whole box as ONE prepared statement, so this is a
-- single DO block. Paste the whole thing and run it once.

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS sync_log (
    id             BIGSERIAL PRIMARY KEY,
    -- When the dashboard received it.
    received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- When 05-build-snapshot.ps1 read Practical (snapshot.meta.generatedAtUtc).
    generated_at   TIMESTAMPTZ,
    fy_label       TEXT,
    period_month   INTEGER,
    period_label   TEXT,
    -- Transactions in the pushed batch, and how many the ledger actually stored.
    txns_sent      INTEGER NOT NULL DEFAULT 0,
    txns_ingested  INTEGER NOT NULL DEFAULT 0,
    -- Did the period archive (snapshots table) succeed?
    archived       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Where the snapshot was written: 'vercel-blob' | 'local-file'.
    store          TEXT,
    -- GLTRN.KY high-water mark carried by this push.
    max_ky         BIGINT,
    source         TEXT
  );

  CREATE INDEX IF NOT EXISTS sync_log_received_idx ON sync_log (received_at DESC);
END $$;
