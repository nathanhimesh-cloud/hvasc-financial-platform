"use client";

import { useMemo, useState } from "react";
import { Search, Download, ChevronRight, AlertTriangle } from "lucide-react";
import type { JobBudgetView } from "@/lib/job-budgets";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { formatCurrency, formatPercent, formatSignedCompact } from "@/lib/format";
import { budgetRag, ragText } from "@/lib/rag";
import { DEPARTMENTS } from "@/lib/departments";
import { cn } from "@/lib/utils";

/**
 * Job-wise budget vs actual, laid out like Practical's own "Jobs Budget" report:
 * one row per GL account (which carries the budget), expandable to the jobs that
 * post against it.
 */
export function JobBudgetTable({ groups }: { groups: JobBudgetView[] }) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [onlyOver, setOnlyOver] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (dept !== "all" && g.departmentId !== dept) return false;
      if (onlyOver && !(g.hasBudget && g.glActual > g.budget)) return false;
      if (!needle) return true;
      const hay = `${g.glAccount} ${g.glName} ${g.jobs.map((j) => `${j.code} ${j.name}`).join(" ")}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [groups, q, dept, onlyOver]);

  const toggle = (gl: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(gl)) next.delete(gl);
      else next.add(gl);
      return next;
    });

  const exportCsv = () => {
    const header = [
      "GL account", "GL name", "Department", "Budget", "GL actual", "Job actual",
      "Not job-costed", "Variance", "% used", "Job code", "Job name", "Job actual",
    ];
    const lines: (string | number)[][] = [];
    for (const g of rows) {
      lines.push([
        g.glAccount, g.glName, g.departmentId ?? "", g.budget, g.glActual, g.jobActual,
        g.unjobbed, g.variance, g.hasBudget ? (g.utilisation * 100).toFixed(1) : "", "", "", "",
      ]);
      for (const j of g.jobs) {
        lines.push([g.glAccount, g.glName, g.departmentId ?? "", "", "", "", "", "", "", j.code, j.name, j.actual]);
      }
    }
    const csv = [header, ...lines]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hvasc-job-budgets.csv";
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
                placeholder="account or job…"
                className="w-64 rounded-md border border-border bg-elevated py-2 pl-8 pr-3 text-[13px] text-foreground outline-none focus:border-gold/40"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Department</span>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="h-[38px] rounded-md border border-border bg-elevated px-3 text-[13px] text-foreground outline-none focus:border-gold/40"
            >
              <option value="all">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setOnlyOver((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors",
              onlyOver ? "border-red/40 bg-red/10 text-red" : "border-border bg-elevated text-muted-foreground hover:text-foreground",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
            Over budget only
          </button>
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

      <Panel className="overflow-hidden">
        <PanelHeader title="Budget vs Actual by Job" subtitle={`${rows.length} of ${groups.length} GL accounts`} />
        {rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">No accounts match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr>
                  <Th className="text-left">GL account</Th>
                  <Th>Budget</Th>
                  <Th>Actual</Th>
                  <Th>of which job-costed</Th>
                  <Th>Variance</Th>
                  <Th>% used</Th>
                  <Th>Jobs</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const isOpen = open.has(g.glAccount);
                  return (
                    <FragmentRow
                      key={g.glAccount}
                      g={g}
                      isOpen={isOpen}
                      onToggle={() => toggle(g.glAccount)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Budget sits on the GL account, not the job — that&apos;s how Practical stores it.
          <span className="text-foreground"> Actual</span> is the account&apos;s full balance;
          <span className="text-foreground"> job-costed</span> is the part carrying a job code. The
          difference is spend posted without a job.
        </p>
      </Panel>
    </div>
  );
}

function FragmentRow({ g, isOpen, onToggle }: { g: JobBudgetView; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-[rgba(255,255,255,0.03)]" onClick={onToggle}>
        <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <ChevronRight
              className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
              strokeWidth={2}
            />
            <span className="flex flex-col">
              <span className="text-[13px] font-medium text-foreground">
                {g.glName || (g.glAccount === "unmapped" ? "Jobs with no GL account" : g.glAccount)}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{g.glAccount}</span>
            </span>
          </div>
        </td>
        <Money v={g.budget} strong dash={!g.hasBudget} />
        <Money v={g.glActual} />
        <Money v={g.jobActual} muted />
        <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5 text-right">
          <span className={cn("font-mono text-[12px] tabular-nums", g.variance < 0 ? "text-red" : "text-foreground")}>
            {g.hasBudget ? formatSignedCompact(g.variance) : "—"}
          </span>
        </td>
        <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5 text-right">
          {g.hasBudget ? (
            <span className={cn("font-mono text-[12px] font-semibold tabular-nums", ragText[budgetRag(g.utilisation)])}>
              {formatPercent(g.utilisation)}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground" title="No budget on this account">
              no budget
            </span>
          )}
        </td>
        <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
          {g.jobs.length}
        </td>
      </tr>

      {isOpen &&
        g.jobs.map((j) => (
          <tr key={j.code} className="bg-[rgba(255,255,255,0.015)]">
            <td className="border-b border-[rgba(255,255,255,0.04)] py-2 pl-10 pr-3">
              <span className="flex flex-col">
                <span className="text-[12px] text-foreground">{j.name || j.code}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {j.code}
                  {!j.active && " · inactive"}
                </span>
              </span>
            </td>
            <Money v={j.budget} muted dash={j.budget === 0} small />
            <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2" />
            <Money v={j.actual} small />
            <td className="border-b border-[rgba(255,255,255,0.04)] px-3 py-2" colSpan={3} />
          </tr>
        ))}
    </>
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

function Money({
  v, strong, muted, dash, small,
}: { v: number; strong?: boolean; muted?: boolean; dash?: boolean; small?: boolean }) {
  return (
    <td className={cn("border-b border-[rgba(255,255,255,0.04)] px-3 text-right", small ? "py-2" : "py-2.5")}>
      <span
        className={cn(
          "font-mono tabular-nums",
          small ? "text-[11px]" : "text-[12px]",
          strong && "font-semibold text-foreground",
          !strong && (muted || v === 0 ? "text-muted-foreground" : "text-foreground"),
        )}
      >
        {dash || v === 0 ? "—" : formatCurrency(v)}
      </span>
    </td>
  );
}
