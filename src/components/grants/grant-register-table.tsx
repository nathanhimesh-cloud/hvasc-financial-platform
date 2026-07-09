"use client";

import { useMemo, useState } from "react";
import { Search, AlertTriangle, Lock, Unlock, Download } from "lucide-react";
import type { GrantFigures } from "@/lib/grants";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Grant register table — the columns Shaun specified: total grant income, income
 * to date, current-period income, income remaining; the same on the expense side;
 * plus start/end dates and restricted/operating flags.
 *
 * Grants whose register codes couldn't be resolved are flagged, so a partial
 * figure is never mistaken for a confident zero.
 */
export function GrantRegisterTable({ figures }: { figures: GrantFigures[] }) {
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return figures.filter((f) => {
      if (onlyIssues && !f.hasUnresolvedCodes) return false;
      if (!needle) return true;
      return `${f.entry.name} ${f.entry.funder}`.toLowerCase().includes(needle);
    });
  }, [figures, q, onlyIssues]);

  const exportCsv = () => {
    const header = [
      "Grant", "Funder", "Total grant income", "Opening income", "Current income",
      "Income to date", "Income remaining", "Budgeted expense", "Opening expense",
      "Current expense", "Expense to date", "Expense remaining", "% used",
      "Restricted", "Operating/Capital", "Start", "End", "Report due", "Issues",
    ];
    const data = rows.map((f) => [
      f.entry.name, f.entry.funder, f.totalGrantIncome, f.openingIncome, f.currentIncome,
      f.incomeToDate, f.incomeRemaining, f.budgetedExpense, f.openingExpense,
      f.currentExpense, f.expenseToDate, f.expenseRemaining, (f.utilisation * 100).toFixed(1),
      f.entry.restricted ? "Restricted" : "Unrestricted", f.entry.operatingOrCapital,
      f.entry.startDate, f.entry.endDate, f.entry.reportDue, f.entry.issues.join("; "),
    ]);
    const csv = [header, ...data]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hvasc-grant-register.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel className="no-print flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Search</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="grant or funder…"
              className="w-72 rounded-md border border-border bg-elevated py-2 pl-8 pr-3 text-[13px] text-foreground outline-none focus:border-gold/40"
            />
          </span>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyIssues((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors",
              onlyIssues ? "border-amber/40 bg-amber/10 text-amber" : "border-border bg-elevated text-muted-foreground hover:text-foreground",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
            Needs codes fixed
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            Export CSV
          </button>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title="Grant Register" subtitle={`${rows.length} of ${figures.length} grants`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead>
              <tr>
                <Th className="text-left">Grant</Th>
                <Th>Total grant</Th>
                <Th>Opening income</Th>
                <Th>Current income</Th>
                <Th>Income to date</Th>
                <Th>Income remaining</Th>
                <Th>Expense to date</Th>
                <Th>Expense remaining</Th>
                <Th>% used</Th>
                <Th className="text-left">Period</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.entry.id} className="hover:bg-[rgba(255,255,255,0.03)]">
                  <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      {f.entry.restricted ? (
                        <Lock className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber" strokeWidth={2} />
                      ) : (
                        <Unlock className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
                      )}
                      <span className="flex flex-col">
                        <span className="text-[13px] font-medium text-foreground">{f.entry.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {f.entry.funder || "—"} · {f.entry.operatingOrCapital}
                        </span>
                        {f.hasUnresolvedCodes && (
                          <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-amber">
                            <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                            codes need fixing — figures partial
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <Money v={f.totalGrantIncome} strong />
                  <Money v={f.openingIncome} muted />
                  <Money v={f.currentIncome} />
                  <Money v={f.incomeToDate} />
                  <Money v={f.incomeRemaining} tone={f.incomeRemaining > 0 ? "warn" : undefined} />
                  <Money v={f.expenseToDate} />
                  <Money v={f.expenseRemaining} tone={f.expenseRemaining < 0 ? "bad" : undefined} />
                  <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5 text-right">
                    <span
                      className={cn(
                        "font-mono text-[12px] font-semibold tabular-nums",
                        f.utilisation > 1.001 ? "text-red" : f.utilisation > 0.9 ? "text-amber" : "text-green",
                      )}
                    >
                      {f.budgetedExpense > 0 ? formatPercent(f.utilisation) : "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {f.entry.startDate || "—"} → {f.entry.endDate || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Income = live GL revenue codes. Expense = live job-costing spend on the grant&apos;s job codes.
          Budgeted expense = total grant income (a grant should be fully spent). Opening balances come from the register.
        </p>
      </Panel>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#dce8f0]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Money({ v, strong, muted, tone }: { v: number; strong?: boolean; muted?: boolean; tone?: "warn" | "bad" }) {
  return (
    <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5 text-right">
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums",
          strong && "font-semibold text-foreground",
          tone === "warn" && "text-amber",
          tone === "bad" && "text-red",
          !strong && !tone && (muted || v === 0 ? "text-muted-foreground" : "text-foreground"),
        )}
      >
        {v === 0 ? "—" : formatCurrency(v)}
      </span>
    </td>
  );
}
