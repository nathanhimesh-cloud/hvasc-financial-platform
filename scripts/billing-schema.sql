-- Invoices and supplier bills (Build Brief B4).
--
-- One statement, so the Neon SQL editor accepts it. Paste and run.
-- Safe to re-run: everything is IF NOT EXISTS.
--
-- ---------------------------------------------------------------------------
-- WHY THESE ARE POSTGRES TABLES AND NOT PART OF THE SNAPSHOT
--
-- CRTRN has 205,597 rows and DRTRAN has 123,755. Even one year is ~10,000 rows
-- each. Riding inside the snapshot payload, that would be re-sent in full on every
-- sync, three times a day, forever -- exactly the mistake the GL transactions used
-- to make before they were moved out.
--
-- So they follow the gl_transactions pattern: an incremental cursor on Practical's
-- own primary key (KY), and an upsert. Each sync ships only what is new.
-- ---------------------------------------------------------------------------

DO $$
BEGIN

  -- ---- Customer invoices (Practical: DRTRAN) --------------------------------
  --
  -- The money the Council is OWED. `outstanding` is the important column: it is
  -- Practical's CURRENTDR/CURRENTCR, i.e. what is still unpaid on this invoice --
  -- not what was originally billed. An invoice raised for $10,000 and paid down to
  -- $500 is a $500 problem, not a $10,000 one, and reporting the original amount
  -- would overstate what the Council is owed by an order of magnitude.

  CREATE TABLE IF NOT EXISTS ar_invoices (
    ky            INTEGER PRIMARY KEY,          -- Practical's DRTRAN.KY
    debtor        TEXT        NOT NULL,         -- customer code
    debtor_name   TEXT,                         -- resolved from DRMST
    reference     TEXT,                         -- invoice number
    trantype      TEXT,                         -- I = invoice, etc.
    txn_date      DATE        NOT NULL,
    due_date      DATE,
    summary       TEXT,
    order_no      TEXT,
    invoiced      NUMERIC(14,2) NOT NULL DEFAULT 0,   -- ORIGINALDR - ORIGINALCR
    outstanding   NUMERIC(14,2) NOT NULL DEFAULT 0,   -- CURRENTDR  - CURRENTCR
    fy_label      TEXT,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS ar_invoices_date_idx  ON ar_invoices (txn_date DESC);
  CREATE INDEX IF NOT EXISTS ar_invoices_debtor_idx ON ar_invoices (debtor);
  -- The hot query is "what is still owed" -- a small slice of a large table.
  CREATE INDEX IF NOT EXISTS ar_invoices_open_idx
    ON ar_invoices (due_date) WHERE outstanding <> 0;


  -- ---- Supplier bills (Practical: CRTRN) ------------------------------------
  --
  -- The money the Council OWES. `status` carries Practical's HOLDPAYMENT:
  --   PAID (156,116)  blank (47,690)  CANC (1,634)  PAY (143)  HOLD (14)
  --
  -- CANC matters. A report that doesn't know what it means will present 1,634
  -- cancelled cheques as outstanding liabilities.

  CREATE TABLE IF NOT EXISTS ap_bills (
    ky            INTEGER PRIMARY KEY,          -- Practical's CRTRN.KY
    creditor      TEXT        NOT NULL,         -- supplier code
    creditor_name TEXT,                         -- resolved from CRMST
    reference     TEXT,                         -- supplier's invoice number
    trnt          TEXT,                         -- I = invoice, P = payment, ...
    txn_date      DATE        NOT NULL,
    due_date      DATE,
    pay_date      DATE,
    summary       TEXT,
    order_no      TEXT,                         -- links the bill to its purchase order
    cheque_no     TEXT,
    status        TEXT,                         -- HOLDPAYMENT: PAID / CANC / HOLD / blank
    debit         NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit        NUMERIC(14,2) NOT NULL DEFAULT 0,
    gst           NUMERIC(14,2) NOT NULL DEFAULT 0,
    fy_label      TEXT,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS ap_bills_date_idx     ON ap_bills (txn_date DESC);
  CREATE INDEX IF NOT EXISTS ap_bills_creditor_idx ON ap_bills (creditor);
  CREATE INDEX IF NOT EXISTS ap_bills_order_idx    ON ap_bills (order_no) WHERE order_no <> '';

END $$;
