import "server-only";
import { neon } from "@neondatabase/serverless";

/**
 * Invoices and supplier bills (Build Brief B4).
 *
 * Two tables, two directions:
 *   ar_invoices  (Practical DRTRAN) - money the Council is OWED
 *   ap_bills     (Practical CRTRN)  - money the Council OWES
 *
 * Both are stored in Postgres rather than carried in the snapshot: a year is ~10,000
 * rows on each side, and re-sending them three times a day would put megabytes on the
 * wire for no reason. They arrive incrementally, keyed on Practical's own KY.
 */

function db() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

// ── what the feed sends ─────────────────────────────────────────────────────

export interface IncomingInvoice {
  ky: number;
  debtor: string;
  debtorName: string;
  reference: string;
  tranType: string;
  date: string;
  dueDate: string;
  summary: string;
  orderNo: string;
  invoiced: number;
  outstanding: number;
}

export interface IncomingBill {
  ky: number;
  creditor: string;
  creditorName: string;
  reference: string;
  trnt: string;
  date: string;
  dueDate: string;
  payDate: string;
  summary: string;
  orderNo: string;
  chequeNo: string;
  status: string;
  debit: number;
  credit: number;
  gst: number;
}

// ── what the pages read ─────────────────────────────────────────────────────

export interface Invoice {
  ky: number;
  debtor: string;
  debtorName: string;
  reference: string;
  date: string;
  dueDate: string;
  summary: string;
  orderNo: string;
  invoiced: number;
  /** Still unpaid on this invoice. THE number — not what was originally billed. */
  outstanding: number;
  /** Days past due. Negative = not due yet. Null = no due date. */
  daysOverdue: number | null;
}

export interface Bill {
  ky: number;
  creditor: string;
  creditorName: string;
  reference: string;
  date: string;
  dueDate: string;
  payDate: string;
  summary: string;
  orderNo: string;
  chequeNo: string;
  status: string;
  amount: number;
  gst: number;
  paid: boolean;
  cancelled: boolean;
}

const d = (s: string) => (s && s.trim() ? s.slice(0, 10) : null);

/** Upsert invoices. Returns how many landed. Never throws — a DB hiccup must not fail a sync. */
export async function saveInvoices(fyLabel: string, rows: IncomingInvoice[]): Promise<number> {
  const sql = db();
  if (!sql || !rows.length) return 0;
  try {
    let n = 0;
    // Chunked: a single statement with 4,000 rows of parameters is a good way to
    // discover a driver's parameter limit in production.
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250).filter((r) => r.ky && d(r.date));
      if (!chunk.length) continue;
      await sql.transaction(
        chunk.map(
          (r) => sql`
            INSERT INTO ar_invoices
              (ky, debtor, debtor_name, reference, trantype, txn_date, due_date,
               summary, order_no, invoiced, outstanding, fy_label)
            VALUES (${r.ky}, ${r.debtor}, ${r.debtorName}, ${r.reference}, ${r.tranType},
                    ${d(r.date)}, ${d(r.dueDate)}, ${r.summary}, ${r.orderNo},
                    ${r.invoiced}, ${r.outstanding}, ${fyLabel})
            ON CONFLICT (ky) DO UPDATE SET
              debtor      = EXCLUDED.debtor,
              debtor_name = EXCLUDED.debtor_name,
              reference   = EXCLUDED.reference,
              txn_date    = EXCLUDED.txn_date,
              due_date    = EXCLUDED.due_date,
              summary     = EXCLUDED.summary,
              order_no    = EXCLUDED.order_no,
              invoiced    = EXCLUDED.invoiced,
              -- outstanding CHANGES as an invoice is paid down. Practical re-states it
              -- on the existing row, so the upsert must too, or the platform would show
              -- every invoice as permanently unpaid at its original value.
              outstanding = EXCLUDED.outstanding,
              synced_at   = now()
          `,
        ),
      );
      n += chunk.length;
    }
    return n;
  } catch (err) {
    console.error("saveInvoices failed", err);
    return 0;
  }
}

/** Upsert supplier bills. Same contract as saveInvoices. */
export async function saveBills(fyLabel: string, rows: IncomingBill[]): Promise<number> {
  const sql = db();
  if (!sql || !rows.length) return 0;
  try {
    let n = 0;
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250).filter((r) => r.ky && d(r.date));
      if (!chunk.length) continue;
      await sql.transaction(
        chunk.map(
          (r) => sql`
            INSERT INTO ap_bills
              (ky, creditor, creditor_name, reference, trnt, txn_date, due_date, pay_date,
               summary, order_no, cheque_no, status, debit, credit, gst, fy_label)
            VALUES (${r.ky}, ${r.creditor}, ${r.creditorName}, ${r.reference}, ${r.trnt},
                    ${d(r.date)}, ${d(r.dueDate)}, ${d(r.payDate)}, ${r.summary}, ${r.orderNo},
                    ${r.chequeNo}, ${r.status}, ${r.debit}, ${r.credit}, ${r.gst}, ${fyLabel})
            ON CONFLICT (ky) DO UPDATE SET
              creditor      = EXCLUDED.creditor,
              creditor_name = EXCLUDED.creditor_name,
              reference     = EXCLUDED.reference,
              txn_date      = EXCLUDED.txn_date,
              due_date      = EXCLUDED.due_date,
              -- pay_date and status change when a bill is paid or cancelled. Both must
              -- be re-stated, or a paid bill would sit on the page as outstanding forever.
              pay_date      = EXCLUDED.pay_date,
              status        = EXCLUDED.status,
              summary       = EXCLUDED.summary,
              order_no      = EXCLUDED.order_no,
              cheque_no     = EXCLUDED.cheque_no,
              debit         = EXCLUDED.debit,
              credit        = EXCLUDED.credit,
              gst           = EXCLUDED.gst,
              synced_at     = now()
          `,
        ),
      );
      n += chunk.length;
    }
    return n;
  } catch (err) {
    console.error("saveBills failed", err);
    return 0;
  }
}

// ── reading ────────────────────────────────────────────────────────────────

export interface BillingQuery {
  from?: string;
  to?: string;
  search?: string;
  /** Invoices: only those still unpaid. Bills: only those not paid and not cancelled. */
  openOnly?: boolean;
  limit?: number;
}

export interface InvoicePage {
  rows: Invoice[];
  total: number;
  totalInvoiced: number;
  totalOutstanding: number;
  /** True when the tables haven't been created yet — so the page can say so. */
  notReady: boolean;
  /** True when the table exists but holds NOTHING — the feed has never delivered. */
  neverLoaded: boolean;
}

export async function queryInvoices(q: BillingQuery = {}): Promise<InvoicePage> {
  const empty: InvoicePage = {
    rows: [],
    total: 0,
    totalInvoiced: 0,
    totalOutstanding: 0,
    notReady: true,
    neverLoaded: true,
  };
  const sql = db();
  if (!sql) return empty;

  const limit = Math.min(Math.max(q.limit ?? 200, 1), 1000);
  const from = q.from ?? null;
  const to = q.to ?? null;
  const search = q.search?.trim() ? `%${q.search.trim()}%` : null;
  const openOnly = q.openOnly ?? false;

  try {
    const rows = (await sql`
      SELECT ky, debtor, debtor_name, reference, txn_date, due_date, summary,
             order_no, invoiced, outstanding,
             CASE WHEN due_date IS NULL THEN NULL
                  ELSE (CURRENT_DATE - due_date) END AS days_overdue
      FROM ar_invoices
      WHERE (${from}::date  IS NULL OR txn_date >= ${from}::date)
        AND (${to}::date    IS NULL OR txn_date <= ${to}::date)
        AND (${search}::text IS NULL OR debtor_name ILIKE ${search}
                                     OR summary     ILIKE ${search}
                                     OR reference   ILIKE ${search})
        AND (${openOnly}::boolean = FALSE OR outstanding <> 0)
      ORDER BY txn_date DESC, ky DESC
      LIMIT ${limit}
    `) as Record<string, unknown>[];

    const [totals] = (await sql`
      SELECT COUNT(*)::int AS n,
             COALESCE(SUM(invoiced), 0)::float    AS inv,
             COALESCE(SUM(outstanding), 0)::float AS out
      FROM ar_invoices
      WHERE (${from}::date  IS NULL OR txn_date >= ${from}::date)
        AND (${to}::date    IS NULL OR txn_date <= ${to}::date)
        AND (${search}::text IS NULL OR debtor_name ILIKE ${search}
                                     OR summary     ILIKE ${search}
                                     OR reference   ILIKE ${search})
        AND (${openOnly}::boolean = FALSE OR outstanding <> 0)
    `) as Record<string, number>[];

    const [all] = (await sql`SELECT COUNT(*)::int AS n FROM ar_invoices`) as Record<string, number>[];

    return {
      notReady: false,
      neverLoaded: Number(all?.n ?? 0) === 0,
      rows: rows.map((r) => ({
        ky: Number(r.ky),
        debtor: String(r.debtor ?? ""),
        debtorName: String(r.debtor_name ?? "").trim() || String(r.debtor ?? ""),
        reference: String(r.reference ?? ""),
        date: String(r.txn_date ?? "").slice(0, 10),
        dueDate: r.due_date ? String(r.due_date).slice(0, 10) : "",
        summary: String(r.summary ?? ""),
        orderNo: String(r.order_no ?? ""),
        invoiced: Number(r.invoiced ?? 0),
        outstanding: Number(r.outstanding ?? 0),
        daysOverdue: r.days_overdue === null ? null : Number(r.days_overdue),
      })),
      total: Number(totals?.n ?? 0),
      totalInvoiced: Number(totals?.inv ?? 0),
      totalOutstanding: Number(totals?.out ?? 0),
    };
  } catch {
    // The table may not exist yet (the migration hasn't run). An honest "not ready"
    // beats a 500 — and beats an empty page that looks like "no invoices".
    return empty;
  }
}

export interface BillPage {
  rows: Bill[];
  total: number;
  totalAmount: number;
  /** Bills that are neither paid nor cancelled — what the Council actually still owes. */
  totalOpen: number;
  cancelledCount: number;
  notReady: boolean;
  /** True when the table exists but holds NOTHING — the feed has never delivered. */
  neverLoaded: boolean;
}

export async function queryBills(q: BillingQuery = {}): Promise<BillPage> {
  const empty: BillPage = {
    rows: [],
    total: 0,
    totalAmount: 0,
    totalOpen: 0,
    cancelledCount: 0,
    notReady: true,
    neverLoaded: true,
  };
  const sql = db();
  if (!sql) return empty;

  const limit = Math.min(Math.max(q.limit ?? 200, 1), 1000);
  const from = q.from ?? null;
  const to = q.to ?? null;
  const search = q.search?.trim() ? `%${q.search.trim()}%` : null;
  const openOnly = q.openOnly ?? false;

  /*
    "Open" means NOT PAID and NOT CANCELLED.

    The cancelled test is the one that matters. Practical carries 1,634 rows with
    HOLDPAYMENT = 'CANC' — cancelled cheques. They are not liabilities. A report that
    treats status <> 'PAID' as "still owed" would present every one of them as money
    the Council still has to find.
  */
  try {
    const rows = (await sql`
      SELECT ky, creditor, creditor_name, reference, txn_date, due_date, pay_date,
             summary, order_no, cheque_no, status, debit, credit, gst
      FROM ap_bills
      WHERE trnt = 'I'                       -- invoices only; P/D/W/C/X are payments and journals
        AND (${from}::date  IS NULL OR txn_date >= ${from}::date)
        AND (${to}::date    IS NULL OR txn_date <= ${to}::date)
        AND (${search}::text IS NULL OR creditor_name ILIKE ${search}
                                     OR summary       ILIKE ${search}
                                     OR reference     ILIKE ${search})
        AND (${openOnly}::boolean = FALSE
             OR (COALESCE(status, '') NOT IN ('PAID', 'CANC') AND pay_date IS NULL))
      ORDER BY txn_date DESC, ky DESC
      LIMIT ${limit}
    `) as Record<string, unknown>[];

    const [totals] = (await sql`
      SELECT COUNT(*)::int AS n,
             COALESCE(SUM(debit - credit), 0)::float AS amt,
             COALESCE(SUM(CASE WHEN COALESCE(status,'') NOT IN ('PAID','CANC') AND pay_date IS NULL
                               THEN debit - credit ELSE 0 END), 0)::float AS open_amt,
             COUNT(*) FILTER (WHERE status = 'CANC')::int AS canc
      FROM ap_bills
      WHERE trnt = 'I'
        AND (${from}::date  IS NULL OR txn_date >= ${from}::date)
        AND (${to}::date    IS NULL OR txn_date <= ${to}::date)
        AND (${search}::text IS NULL OR creditor_name ILIKE ${search}
                                     OR summary       ILIKE ${search}
                                     OR reference     ILIKE ${search})
    `) as Record<string, number>[];

    const [all] = (await sql`SELECT COUNT(*)::int AS n FROM ap_bills`) as Record<string, number>[];

    return {
      notReady: false,
      neverLoaded: Number(all?.n ?? 0) === 0,
      rows: rows.map((r) => {
        const status = String(r.status ?? "").trim();
        return {
          ky: Number(r.ky),
          creditor: String(r.creditor ?? ""),
          creditorName: String(r.creditor_name ?? "").trim() || String(r.creditor ?? ""),
          reference: String(r.reference ?? ""),
          date: String(r.txn_date ?? "").slice(0, 10),
          dueDate: r.due_date ? String(r.due_date).slice(0, 10) : "",
          payDate: r.pay_date ? String(r.pay_date).slice(0, 10) : "",
          summary: String(r.summary ?? ""),
          orderNo: String(r.order_no ?? ""),
          chequeNo: String(r.cheque_no ?? ""),
          status,
          amount: Number(r.debit ?? 0) - Number(r.credit ?? 0),
          gst: Number(r.gst ?? 0),
          paid: status === "PAID" || !!r.pay_date,
          cancelled: status === "CANC",
        };
      }),
      total: Number(totals?.n ?? 0),
      totalAmount: Number(totals?.amt ?? 0),
      totalOpen: Number(totals?.open_amt ?? 0),
      cancelledCount: Number(totals?.canc ?? 0),
    };
  } catch {
    return empty;
  }
}
