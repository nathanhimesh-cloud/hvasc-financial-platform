"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Download, Loader2, X } from "lucide-react";
import type { Transaction, DailySpendPoint } from "@/lib/types";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { ColumnChart } from "@/components/kit/column-chart";
import { ExportButton } from "@/components/kit/export-button";
import { TablePager, usePagination, STICKY_HEAD } from "@/components/kit/table-pager";
import { formatCurrency, formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Transaction report / drill-down (brief B1, B3). Lists individual GL
 * transactions (GLTRN) with search + date filtering and CSV export, plus a
 * daily spend trend.
 *
 * Two modes:
 *   - `serverFiltered` — the Postgres ledger is configured. Search and the date
 *     range are pushed into the URL and applied by the DATABASE, so filtering
 *     reaches the whole year (not just the page in memory) and the totals row is
 *     a true total over every matching row.
 *   - otherwise — we're rendering the transactions embedded in the snapshot, so
 *     filter them in the browser. Totals then cover only what's loaded, and we
 *     say so rather than labelling a partial sum "total".
 */


export interface TransactionFilters {
  q?: string;
  from?: string;
  to?: string;
}

export function TransactionsView({
  transactions,
  transactionTotal,
  dailySpend,
  fyLabel,
  serverFiltered = false,
  filters = {},
  ledgerTotals,
  preservedParams = {},
}: {
  transactions: Transaction[];
  /** Rows matching the current filter across the whole ledger. */
  transactionTotal?: number;
  dailySpend: DailySpendPoint[];
  /** The financial year on screen — scopes the server-side export. */
  fyLabel?: string;
  /** True when the database applied the filters (see the note above). */
  serverFiltered?: boolean;
  /** The filter values currently in the URL. */
  filters?: TransactionFilters;
  /** True debit/credit totals over every matching row, from the database. */
  ledgerTotals?: { debit: number; credit: number };
  /** Params to keep when we rewrite the URL (the selected period). */
  preservedParams?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // Local mirrors of the URL state so typing feels immediate.
  const [q, setQ] = useState(filters.q ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");

  // Re-sync when the server sends different filters (e.g. back button).
  useEffect(() => {
    setQ(filters.q ?? "");
    setFrom(filters.from ?? "");
    setTo(filters.to ?? "");
  }, [filters.q, filters.from, filters.to]);

  const push = useMemo(
    () => (next: TransactionFilters) => {
      const sp = new URLSearchParams(preservedParams);
      if (next.q) sp.set("q", next.q);
      if (next.from) sp.set("from", next.from);
      if (next.to) sp.set("to", next.to);
      const qs = sp.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [router, pathname, preservedParams],
  );

  // Debounce the search box so we don't hit the database on every keystroke.
  const first = useRef(true);
  useEffect(() => {
    if (!serverFiltered) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (q === (filters.q ?? "") && from === (filters.from ?? "") && to === (filters.to ?? "")) return;
    const t = setTimeout(() => push({ q, from, to }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to, serverFiltered]);

  // Client-side filtering only when the database isn't doing it for us.
  const filtered = useMemo(() => {
    if (serverFiltered) return transactions;
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (!needle) return true;
      return `${t.account} ${t.description} ${t.code} ${t.ref}`.toLowerCase().includes(needle);
    });
  }, [transactions, q, from, to, serverFiltered]);

  // Page the loaded rows instead of capping them at a fixed number.
  const paged = usePagination(filtered, { size: 50, resetKey: `${q}|${from}|${to}|${serverFiltered}` });
  const shown = paged.pageItems;
  const matching = serverFiltered ? (transactionTotal ?? filtered.length) : filtered.length;

  // Only the database can total rows it didn't send us.
  const totals = serverFiltered && ledgerTotals
    ? ledgerTotals
    : {
        debit: filtered.reduce((a, t) => a + t.debit, 0),
        credit: filtered.reduce((a, t) => a + t.credit, 0),
      };
  const totalsAreComplete = serverFiltered ? !!ledgerTotals : filtered.length === matching;

  const hasFilters = !!(q || from || to);
  const clear = () => {
    setQ("");
    setFrom("");
    setTo("");
    if (serverFiltered) push({});
  };

  const exportCsv = () => {
    // With the ledger on, only the database holds every matching row — exporting
    // what's in the browser would silently ship a truncated file.
    if (serverFiltered) {
      const sp = new URLSearchParams();
      if (fyLabel) sp.set("fy", fyLabel);
      if (q) sp.set("q", q);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      window.location.href = `/api/transactions/export?${sp.toString()}`;
      return;
    }

    const header = ["Date", "Code", "Account", "Description", "Ref", "Debit", "Credit"];
    const rows = filtered.map((t) => [t.date, t.code, t.account, t.description, t.ref, t.debit, t.credit]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hvasc-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!transactions.length && !hasFilters) {
    // This message used to say the transactions would arrive "once the live feed
    // includes GLTRN data (the next sync after this build ships)" — which stopped
    // being true weeks ago, and told a reader to wait for something that had
    // already happened. An empty state has to say what is actually wrong.
    return (
      <Panel className="py-12 text-center">
        <p className="text-[13px] text-muted-foreground">
          No transactions stored for {fyLabel ?? "this financial year"}.
        </p>
        <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          The feed sends transactions <span className="text-foreground">incrementally</span> — only
          what is new since the last successful sync. If the ledger was cleared, or this is a fresh
          financial year, ask SandS to run a full resync (
          <span className="font-mono">05-build-snapshot.ps1 -FullResync</span>) and the year is
          rebuilt from the start.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {dailySpend.length > 0 && (
        <Panel>
          <PanelHeader title="Daily Spend" subtitle="Operating spend by day · current FY" />
          {/* The SAME column chart used on the dashboard's Daily Spend — one
              component everywhere, so every daily-spend chart reads identically
              (y-axis, hover tooltip, credit bars below the line). */}
          <ColumnChart
            data={dailySpend.map((d) => ({ label: dayLabel(d.date), value: d.amount }))}
            barLabel="daily spend"
            labelEvery={dailySpend.length > 14 ? Math.ceil(dailySpend.length / 10) : 1}
          />
        </Panel>
      )}

      {/* Filter bar */}
      <Panel className="no-print flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Search</span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="account, description, code, ref…"
                className="w-64 rounded-md border border-border bg-elevated py-2 pl-8 pr-3 text-[13px] text-foreground outline-none transition-colors focus:border-gold/40"
              />
            </span>
          </label>
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
          {hasFilters && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              Clear
            </button>
          )}
          {pending && <Loader2 className="mb-2 h-3.5 w-3.5 animate-spin text-muted-foreground" strokeWidth={2} />}
        </div>
        {/* Excel AND CSV. The brief asks for Excel; CSV mangles GL codes ("0205-4147"
            becomes a date in an Australian locale) so it cannot be the only option. */}
        <ExportButton
          filename="hvasc-transactions"
          meta={{ period: fyLabel }}
          csv={exportCsv}
          sheets={[
            {
              name: "Transactions",
              rows: filtered,
              columns: [
                { header: "Date", value: (t) => t.date, width: 12 },
                { header: "GL code", value: (t) => t.code, width: 16 },
                { header: "Account", value: (t) => t.account, width: 34 },
                { header: "Description", value: (t) => t.description, width: 44 },
                { header: "Reference", value: (t) => t.ref, width: 14 },
                { header: "Debit", value: (t) => t.debit || null, type: "money", width: 14 },
                { header: "Credit", value: (t) => t.credit || null, type: "money", width: 14 },
              ],
            },
          ]}
        />

        <button
          type="button"
          onClick={exportCsv}
          className="hidden"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Export CSV
        </button>
      </Panel>

      {/* Table — no overflow-hidden here: it would make this Panel the scroll
          container and trap the pager's position:sticky. */}
      <Panel>
        <PanelHeader
          title="Transactions"
          subtitle={`${matching.toLocaleString()} matching`}
        />
        {matching > 0 && (
          <TablePager
            total={paged.total}
            page={paged.page}
            pageSize={paged.pageSize}
            pages={paged.pages}
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
            label="transactions"
          />
        )}
        {matching === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">
            No transactions match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  {["Date", "Account", "Description", "Ref", "Debit", "Credit"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "border-b border-[var(--hairline)] px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--th-fg)]",
                        STICKY_HEAD,
                        i >= 4 ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((t, i) => (
                  <tr key={i} className="hover:bg-[var(--hairline-hover)]">
                    <td className="whitespace-nowrap border-b border-[var(--hairline-soft)] px-3 py-2 font-mono text-[12px] text-muted-foreground">{t.date}</td>
                    <td className="border-b border-[var(--hairline-soft)] px-3 py-2 text-[13px] text-foreground">
                      <span className="font-mono text-[11px] text-muted-foreground">{t.code}</span> {t.account}
                    </td>
                    <td className="border-b border-[var(--hairline-soft)] px-3 py-2 text-[13px] text-foreground">{t.description}</td>
                    <td className="whitespace-nowrap border-b border-[var(--hairline-soft)] px-3 py-2 font-mono text-[11px] text-muted-foreground">{t.ref}</td>
                    <Amt value={t.debit} />
                    <Amt value={t.credit} />
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-3 py-2.5 text-[12px] text-foreground" colSpan={4}>
                    {totalsAreComplete
                      ? `Totals (all ${matching.toLocaleString()} matching)`
                      : `Totals (the ${shown.length.toLocaleString()} rows shown only)`}
                  </td>
                  <Amt value={totals.debit} bold />
                  <Amt value={totals.credit} bold />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {serverFiltered && matching > filtered.length && (
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            {filtered.length.toLocaleString()} of {matching.toLocaleString()} matching rows are loaded
            — narrow the search or date range, or export CSV for the full set.
          </p>
        )}
        {!serverFiltered && (
          <p className="mt-1 font-mono text-[10px] text-amber">
            Filtering these {transactions.length.toLocaleString()} rows in the browser. The Postgres
            ledger isn&apos;t configured, so older transactions and whole-year totals aren&apos;t available here.
          </p>
        )}
      </Panel>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-elevated px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-gold/40"
      />
    </label>
  );
}

function Amt({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <td className="border-b border-[var(--hairline-soft)] px-3 py-2 text-right">
      <span className={cn("font-mono text-[12px] tabular-nums", bold ? "font-semibold text-foreground" : value ? "text-foreground" : "text-muted-foreground")}>
        {value ? formatCurrency(value) : "—"}
      </span>
    </td>
  );
}


const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "2026-07-08" -> "8 Jul". */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`.trim();
}
