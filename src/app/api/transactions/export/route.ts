import { queryTransactions, isLedgerEnabled } from "@/lib/ledger";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { logAudit } from "@/lib/auth/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV export of the transaction ledger for the current filter.
 *
 * The table on /reports only loads a page of rows, so exporting what's in the
 * browser would silently ship a truncated file. This pages through the whole
 * filtered set in the database instead.
 */

/** Hard ceiling, so a filterless export can't try to stream the entire ledger. */
const MAX_ROWS = 50_000;
const PAGE = 1000; // queryTransactions caps `limit` here

function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  if (isAuthConfigured()) {
    const session = await getSession();
    if (!session) return new Response("Not permitted.", { status: 401 });
    // Exports are audit-logged (brief B9).
    await logAudit(session, "transactions.exported", new URL(request.url).searchParams.toString());
  }

  if (!isLedgerEnabled()) {
    return new Response("The transaction ledger isn't configured.", { status: 503 });
  }

  const sp = new URL(request.url).searchParams;
  const filter = {
    fyLabel: sp.get("fy") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    search: sp.get("q") ?? undefined,
    code: sp.get("code") ?? undefined,
  };

  const header = ["Date", "Code", "Account", "Description", "Ref", "Debit", "Credit"];
  const lines = [header.join(",")];

  let offset = 0;
  let total = 0;
  for (;;) {
    const page = await queryTransactions({ ...filter, limit: PAGE, offset });
    total = page.total;
    if (!page.rows.length) break;
    for (const t of page.rows) {
      lines.push([t.date, t.code, t.account, t.description, t.ref, t.debit, t.credit].map(csvCell).join(","));
    }
    offset += page.rows.length;
    if (offset >= Math.min(total, MAX_ROWS)) break;
  }

  const truncated = total > MAX_ROWS;
  if (truncated) {
    lines.push(csvCell(`TRUNCATED: ${MAX_ROWS.toLocaleString()} of ${total.toLocaleString()} matching rows. Narrow the filter.`));
  }

  const stamp = filter.fyLabel ? `-${filter.fyLabel}` : "";
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="hvasc-transactions${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
