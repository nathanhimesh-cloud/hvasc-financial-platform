-- Integrity log (Build Brief A4b: "log check results over time").
--
-- A4 gives you a verdict for the CURRENT snapshot. That answers "is today's report
-- trustworthy?" — but not "has it ever not been?", which is the question an auditor
-- actually asks, and the one nobody could answer.
--
-- One row per sync. Append-only: rows are never updated or deleted, because the
-- point of the record is that it cannot be tidied up after the fact.

CREATE TABLE IF NOT EXISTS integrity_log (
  id           BIGSERIAL PRIMARY KEY,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The period the snapshot covered, so a failure can be tied to a month.
  fy_label     TEXT        NOT NULL,
  period_label TEXT        NOT NULL,
  passed       BOOLEAN     NOT NULL,
  checks_total INTEGER     NOT NULL,
  checks_failed INTEGER    NOT NULL,
  -- The failures themselves: [{ id, label, detail, severity }]. Kept as JSON because
  -- the shape of a check is allowed to change without a migration; what must not
  -- change is the fact that a failure was recorded on a given day.
  failures     JSONB       NOT NULL DEFAULT '[]'::jsonb
);

-- The dashboard reads "the last N runs" and "have we failed lately" — both are
-- newest-first scans.
CREATE INDEX IF NOT EXISTS integrity_log_checked_idx ON integrity_log (checked_at DESC);

-- Finding the failures specifically is the auditor's query. Partial index: the
-- failures are the rare rows, and this keeps the scan proportional to them rather
-- than to the whole history.
CREATE INDEX IF NOT EXISTS integrity_log_failed_idx
  ON integrity_log (checked_at DESC) WHERE passed = FALSE;
