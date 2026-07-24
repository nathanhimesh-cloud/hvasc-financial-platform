"use client";

import { useMemo, useState } from "react";
import { Search, AlertTriangle, Lock, Unlock, Download, LifeBuoy, type LucideIcon } from "lucide-react";
import type { GrantFigures } from "@/lib/grants";
import { Panel } from "@/components/kit/panel";
import { formatCurrency, formatPercent } from "@/lib/format";
import { grantUtilisationRag, ragText } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Kind = "all" | "operating" | "capital";

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
  const [showClosed, setShowClosed] = useState(false);
  const [kind, setKind] = useState<Kind>("all");
  const [onlyDisaster, setOnlyDisaster] = useState(false);

  const closedCount = figures.filter((f) => !f.entry.active).length;
  const disasterCount = figures.filter((f) => f.entry.active && f.disasterRecovery).length;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return figures.filter((f) => {
      if (!showClosed && !f.entry.active) return false;
      if (onlyIssues && !f.hasUnresolvedCodes) return false;
      if (onlyDisaster && !f.disasterRecovery) return false;
      if (kind !== "all" && f.entry.operatingOrCapital !== kind) return false;
      if (!needle) return true;
      return `${f.entry.name} ${f.entry.funder}`.toLowerCase().includes(needle);
    });
  }, [figures, q, onlyIssues, showClosed, kind, onlyDisaster]);

  const exportCsv = () => {
    const header = [
      "Grant", "Funder", "Total grant income", "Opening income", "Current income",
      "Income to date", "Income remaining", "Budgeted expense", "Opening expense",
      "Current expense", "Expense to date", "Expense remaining", "% used",
      "Restricted", "Operating/Capital", "Disaster recovery", "Start", "End", "Report due", "Issues",
    ];
    const data = rows.map((f) => [
      f.entry.name, f.entry.funder, f.totalGrantIncome, f.openingIncome, f.currentIncome,
      f.incomeToDate, f.incomeRemaining, f.budgetedExpense, f.openingExpense,
      f.currentExpense, f.expenseToDate, f.expenseRemaining, (f.utilisation * 100).toFixed(1),
      f.entry.restricted ? "Restricted" : "Unrestricted", f.entry.operatingOrCapital,
      f.disasterRecovery ? "Yes" : "No",
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
    <Panel className="overflow-hidden">
      {/* Header + search on one line — one cohesive card instead of a floating filter bar */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-[15px] font-semibold text-foreground">Grant Register</h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {rows.length} of {figures.length} grants
          </p>
        </div>
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search grant or funder…"
            className="h-9 w-64 rounded-md border border-border bg-elevated pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors focus:border-gold/40"
          />
        </span>
      </div>

      {/* Filter toolbar — uniform 36px controls, Export pinned right */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-4">
        {/* Operating vs capital (C2): capital grants leave the Council an asset to maintain. */}
        <div className="flex h-9 items-center rounded-md border border-border bg-elevated/40 p-1">
          {(["all", "operating", "capital"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "h-full rounded px-3 text-[12px] font-medium capitalize transition-colors",
                kind === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        {/* Disaster recovery (C6): one-off, reimbursement-based, must not read as base income. */}
        <FilterChip active={onlyDisaster} onClick={() => setOnlyDisaster((v) => !v)} icon={LifeBuoy} tone="amber">
          Disaster recovery ({disasterCount})
        </FilterChip>
        <FilterChip active={showClosed} onClick={() => setShowClosed((v) => !v)} tone="gold">
          {showClosed ? "Hide" : "Show"} closed ({closedCount})
        </FilterChip>
        <FilterChip active={onlyIssues} onClick={() => setOnlyIssues((v) => !v)} icon={AlertTriangle} tone="amber">
          Needs codes fixed
        </FilterChip>
        <button
          type="button"
          onClick={exportCsv}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-gold/30 hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
          <table className="w-full min-w-[1560px] border-collapse">
            <thead>
              <tr>
                <Th className="text-left">Grant</Th>
                <Th>Total grant</Th>
                <Th>Opening income</Th>
                <Th>Current income</Th>
                <Th>Income to date</Th>
                <Th>Income remaining</Th>
                {/* The expense side used to show only two of the four columns the
                    income side had, so a grant could not be read symmetrically:
                    you could see what had come IN this period but not what had gone
                    OUT. A grant is meant to be fully spent — budgeted expense IS the
                    grant total — so the two sides should line up. */}
                <Th>Budgeted expense</Th>
                <Th>Opening expense</Th>
                <Th>Current expense</Th>
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
                        {f.disasterRecovery && (
                          <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-amber">
                            <LifeBuoy className="h-2.5 w-2.5" strokeWidth={2} />
                            disaster recovery
                          </span>
                        )}
                        {!f.entry.active && (
                          <span className="mt-0.5 inline-flex w-fit items-center rounded-full border border-border bg-elevated px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                            closed — excluded from totals
                          </span>
                        )}
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
                  <Money v={f.budgetedExpense} strong />
                  <Money v={f.openingExpense} muted />
                  <Money v={f.currentExpense} />
                  <Money v={f.expenseToDate} />
                  <Money v={f.expenseRemaining} tone={f.expenseRemaining < 0 ? "bad" : undefined} />
                  <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5 text-right">
                    <span
                      className={cn(
                        "font-mono text-[12px] font-semibold tabular-nums",
                        ragText[grantUtilisationRag(f.utilisation)],
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
  );
}

/** A filter toggle in the register toolbar — uniform height, tone-coded when active. */
function FilterChip({
  active,
  onClick,
  icon: Icon,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  tone: "amber" | "gold";
  children: React.ReactNode;
}) {
  const activeCls =
    tone === "amber" ? "border-amber/40 bg-amber/10 text-amber" : "border-gold/40 bg-gold-dim text-gold-light";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors",
        active ? activeCls : "border-border bg-elevated text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
      {children}
    </button>
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
