"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ExportButton } from "@/components/kit/export-button";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCurrency, formatPercent } from "@/lib/format";
import { CAPITAL_CATEGORY_ORDER } from "@/data/capital-budget-fy27";
import type { CapitalCategory, CapitalProgramme, CapitalProjectRow } from "@/lib/capital-projects";
import { cn } from "@/lib/utils";

/**
 * The FY27 capital programme, grouped by works category, with the same columns
 * as Practical's printed "Job Cost Budget" report so the page can be held
 * against the paper: Orig Bud · Curr Bud · Actual · Committed · Act + Comm ·
 * Remaining · % Spent.
 */
export function CapitalProjectsTable({ programme }: { programme: CapitalProgramme }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  const categories = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return programme.categories
      .filter((c) => cat === "all" || c.name === cat)
      .map((c) => ({
        ...c,
        rows: needle
          ? c.rows.filter((r) => `${r.code} ${r.name}`.toLowerCase().includes(needle))
          : c.rows,
      }))
      .filter((c) => c.rows.length > 0);
  }, [programme, q, cat]);

  const shown = categories.reduce((a, c) => a + c.rows.length, 0);

  const allRows = useMemo(() => categories.flatMap((c) => c.rows), [categories]);

  const exportCsv = () => {
    const header = [
      "Job number", "Description", "Category", "Original budget", "Current budget",
      "Actual", "Committed", "Actual + committed", "Remaining", "% spent",
    ];
    const lines = allRows.map((r) => [
      r.code, r.name, r.category, r.origBudget, r.currBudget,
      r.actual, r.committed, r.totalActPlusComm, r.remaining, (r.pctSpent * 100).toFixed(1),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hvasc-capital-projects.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel className="no-print flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Search</span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="job number or name…"
                className="w-64 rounded-md border border-border bg-elevated py-2 pl-8 pr-3 text-[13px] text-foreground outline-none focus:border-gold/40"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Category</span>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-[38px] rounded-md border border-border bg-elevated px-3 text-[13px] text-foreground outline-none focus:border-gold/40"
            >
              <option value="all">All categories</option>
              {CAPITAL_CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <ExportButton
          filename="hvasc-capital-projects"
          csv={exportCsv}
          sheets={[
            {
              name: "Capital FY27",
              rows: allRows,
              columns: [
                { header: "Job number", value: (r: CapitalProjectRow) => r.code, width: 16 },
                { header: "Description", value: (r: CapitalProjectRow) => r.name, width: 34 },
                { header: "Category", value: (r: CapitalProjectRow) => r.category, width: 26 },
                { header: "Original budget", value: (r: CapitalProjectRow) => r.origBudget || null, type: "money", width: 16 },
                { header: "Current budget", value: (r: CapitalProjectRow) => r.currBudget || null, type: "money", width: 16 },
                { header: "Actual", value: (r: CapitalProjectRow) => r.actual || null, type: "money", width: 14 },
                { header: "Committed", value: (r: CapitalProjectRow) => r.committed || null, type: "money", width: 14 },
                { header: "Actual + committed", value: (r: CapitalProjectRow) => r.totalActPlusComm || null, type: "money", width: 18 },
                { header: "Remaining", value: (r: CapitalProjectRow) => r.remaining, type: "money", width: 16 },
                { header: "% spent", value: (r: CapitalProjectRow) => r.pctSpent, type: "percent", width: 10 },
              ],
            },
          ]}
        />
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Capital Programme by Category"
          subtitle={`${shown} of ${programme.jobCount} jobs`}
        />
        {shown === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">No jobs match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr>
                  <Th className="text-left">Job</Th>
                  <Th>Orig budget</Th>
                  <Th>Curr budget</Th>
                  <Th>Actual</Th>
                  <Th>Committed</Th>
                  <Th>Act + comm</Th>
                  <Th>Remaining</Th>
                  <Th>% spent</Th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <CategoryRows key={c.name} category={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Budgets as printed on Practical&apos;s Job Cost Budget report ({programme.asAt}); several job
          names are truncated on the source report. <span className="text-foreground">Actual</span> is
          job-costed spend from the ledger; <span className="text-foreground">committed</span> is open
          purchase-order value. Capital spend posts to work-in-progress asset accounts, so it appears
          here — not in operating expenses.
        </p>
      </Panel>
    </div>
  );
}

function CategoryRows({ category: c }: { category: CapitalCategory }) {
  return (
    <>
      <tr className="bg-elevated/60">
        <td className="border-b border-[var(--hairline-soft)] px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{c.name}</span>
        </td>
        <SubtotalCell v={c.origBudget} />
        <SubtotalCell v={c.currBudget} />
        <SubtotalCell v={c.actual} />
        <SubtotalCell v={c.committed} />
        <SubtotalCell v={c.actual + c.committed} />
        <SubtotalCell v={c.remaining} neg={c.remaining < 0} />
        <td className="border-b border-[var(--hairline-soft)] px-3 py-2 text-right">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {c.currBudget > 0 ? formatPercent(c.actual / c.currBudget, 1) : "—"}
          </span>
        </td>
      </tr>
      {c.rows.map((r) => (
        <tr key={r.code} className="hover:bg-[var(--hairline-hover)]">
          <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5">
            <span className="flex flex-col">
              <span className="text-[13px] font-medium text-foreground">{r.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
            </span>
          </td>
          <Money v={r.origBudget} muted />
          <Money v={r.currBudget} strong />
          <Money v={r.actual} />
          <Money v={r.committed} muted />
          <Money v={r.totalActPlusComm} />
          <Money v={r.remaining} neg={r.remaining < 0} />
          <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5 text-right">
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {formatPercent(r.pctSpent, 1)}
            </span>
          </td>
        </tr>
      ))}
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-[var(--hairline)] px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Money({ v, strong, muted, neg }: { v: number; strong?: boolean; muted?: boolean; neg?: boolean }) {
  return (
    <td className="border-b border-[var(--hairline-soft)] px-3 py-2.5 text-right">
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums",
          neg ? "text-red" : strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {formatCurrency(v)}
      </span>
    </td>
  );
}

function SubtotalCell({ v, neg }: { v: number; neg?: boolean }) {
  return (
    <td className="border-b border-[var(--hairline-soft)] px-3 py-2 text-right">
      <span className={cn("font-mono text-[11px] font-semibold tabular-nums", neg ? "text-red" : "text-foreground")}>
        {formatCurrency(v)}
      </span>
    </td>
  );
}
