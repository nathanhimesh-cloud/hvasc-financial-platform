"use client";

import { useMemo, useState } from "react";
import { Search, Download } from "lucide-react";
import type { Transaction, DailySpendPoint } from "@/lib/types";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCurrency, formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Transaction report / drill-down (brief B3). Lists individual GL transactions
 * (from GLTRN) with search + date filtering and CSV export, plus a daily spend
 * trend. Data comes from the live feed's `transactions` / `dailySpend`.
 */

const ROW_CAP = 300; // keep the DOM light; filtered total is always shown

export function TransactionsView({
  transactions,
  dailySpend,
}: {
  transactions: Transaction[];
  dailySpend: DailySpendPoint[];
}) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (!needle) return true;
      return `${t.account} ${t.description} ${t.code} ${t.ref}`.toLowerCase().includes(needle);
    });
  }, [transactions, q, from, to]);

  const shown = filtered.slice(0, ROW_CAP);
  const totalDebit = filtered.reduce((a, t) => a + t.debit, 0);
  const totalCredit = filtered.reduce((a, t) => a + t.credit, 0);

  const exportCsv = () => {
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

  if (!transactions.length) {
    return (
      <Panel className="py-14 text-center text-[13px] text-muted-foreground">
        No transactions in the current feed yet. They appear once the live feed includes GLTRN data
        (the next sync after this build ships).
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {dailySpend.length > 0 && (
        <Panel>
          <PanelHeader title="Daily Spend" subtitle="Operating spend by day · current FY" />
          <DailyBars data={dailySpend} />
        </Panel>
      )}

      {/* Filter bar */}
      <Panel className="flex flex-wrap items-end justify-between gap-3">
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
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Export CSV
        </button>
      </Panel>

      {/* Table */}
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Transactions"
          subtitle={`${filtered.length.toLocaleString()} matching · showing ${shown.length.toLocaleString()}`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                {["Date", "Account", "Description", "Ref", "Debit", "Credit"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#dce8f0]",
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
                <tr key={i} className="hover:bg-[rgba(255,255,255,0.03)]">
                  <td className="whitespace-nowrap border-b border-[rgba(255,255,255,0.04)] px-3 py-2 font-mono text-[12px] text-muted-foreground">{t.date}</td>
                  <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2 text-[13px] text-foreground">
                    <span className="font-mono text-[11px] text-muted-foreground">{t.code}</span> {t.account}
                  </td>
                  <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2 text-[13px] text-foreground">{t.description}</td>
                  <td className="whitespace-nowrap border-b border-[rgba(255,255,255,0.04)] px-3 py-2 font-mono text-[11px] text-muted-foreground">{t.ref}</td>
                  <Amt value={t.debit} />
                  <Amt value={t.credit} />
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-3 py-2.5 text-[12px] text-foreground" colSpan={4}>Totals (all {filtered.length.toLocaleString()} matching)</td>
                <Amt value={totalDebit} bold />
                <Amt value={totalCredit} bold />
              </tr>
            </tbody>
          </table>
        </div>
        {filtered.length > ROW_CAP && (
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            Showing the first {ROW_CAP} of {filtered.length.toLocaleString()} — narrow the search or date range, or export CSV for the full set.
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
    <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2 text-right">
      <span className={cn("font-mono text-[12px] tabular-nums", bold ? "font-semibold text-foreground" : value ? "text-foreground" : "text-muted-foreground")}>
        {value ? formatCurrency(value) : "—"}
      </span>
    </td>
  );
}

function DailyBars({ data }: { data: DailySpendPoint[] }) {
  const max = Math.max(...data.map((d) => Math.abs(d.amount)), 1);
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto" style={{ height: 120 }}>
      {data.map((d) => {
        const h = Math.max((Math.abs(d.amount) / max) * 100, 1);
        return (
          <div key={d.date} className="group flex min-w-[6px] flex-1 flex-col items-center justify-end" title={`${d.date}: ${formatCompact(d.amount)}`}>
            <div className={cn("w-full rounded-t transition-colors", d.amount < 0 ? "bg-green/60" : "bg-gold/70 group-hover:bg-gold")} style={{ height: `${h}%` }} />
          </div>
        );
      })}
    </div>
  );
}
