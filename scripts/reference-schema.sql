-- Vantage - uploaded reference data (department map, grant register).
--
-- WHY THIS EXISTS
-- Both files were baked into the repo, so changing a department mapping or
-- loading a new grant register meant a developer, a commit and a deploy. The
-- Council's finance team should be able to do it themselves.
--
-- One row per kind, replaced on upload. The previous version is kept in
-- reference_data_history so a bad upload can be rolled back - these files decide
-- which department every dollar lands in, and a silent overwrite with no undo is
-- how a month of reporting gets quietly wrong.
--
-- Neon's SQL editor sends the whole box as ONE prepared statement, so this is a
-- single DO block. Paste the whole thing and run it once.

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS reference_data (
    kind        TEXT PRIMARY KEY,          -- 'department-map' | 'grant-register'
    payload     JSONB       NOT NULL,
    -- What the uploader sent, for provenance.
    filename    TEXT,
    uploaded_by TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Cheap sanity figures, shown in the UI without parsing the payload.
    item_count  INTEGER     NOT NULL DEFAULT 0,
    note        TEXT
  );

  CREATE TABLE IF NOT EXISTS reference_data_history (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT        NOT NULL,
    payload     JSONB       NOT NULL,
    filename    TEXT,
    uploaded_by TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_count  INTEGER     NOT NULL DEFAULT 0,
    note        TEXT
  );

  CREATE INDEX IF NOT EXISTS reference_history_kind_idx
    ON reference_data_history (kind, uploaded_at DESC);
END $$;
