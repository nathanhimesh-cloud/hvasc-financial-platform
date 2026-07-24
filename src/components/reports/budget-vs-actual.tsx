"use client";

import { useMemo, useState } from "react";
import { Building2, Info } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { DataStamp } from "@/components/kit/data-stamp";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  buildGroupTree,
  nodeSurplus,
  type BudgetReportData,
  type BudgetNode,
  type BudgetGroupTree,
} from "@/lib/budget-report";
import { cn } from "@/lib/utils";

/**
 * Budget vs Actual — by Report Group / directorate (Shaun's "job-wise budget
 * tracking"). Mirrors Practical's Revenue & Expenditure Report: Program →
 * Sub-program → Account, with Revenue / Expense / Surplus(Deficiency) shown as
 * Actual vs full-year Budget, subtotals at every level and a grand total.
 */

type RenderRow =
  | { type: "header"; node: BudgetNode }
  | { type: "leaf"; node: BudgetNode }
  | { type: "subtotal"; node: BudgetNode };

/** Flatten the tree into PDF-style ordering: header, children…, subtotal. */
function toRows(nodes: BudgetNode[]): RenderRow[] {
  const rows: RenderRow[] = [];
  const walk = (node: BudgetNode) => {
    if (node.isLeaf) {
      rows.push({ type: "leaf", node });
      return;
    }
    rows.push({ type: "header", node });
    node.children.forEach(walk);
    rows.push({ type: "subtotal", node });
  };
  nodes.forEach(walk);
  return rows;
}

export function BudgetVsActual({ data }: { data: BudgetReportData }) {
  const trees = useMemo<BudgetGroupTree[]>(() => data.groups.map(buildGroupTree), [data]);
  const [groupId, setGroupId] = useState(trees[0]?.id ?? "");
  const active = trees.find((t) => t.id === groupId) ?? trees[0];

  const rows = useMemo(() => (active ? toRows(active.nodes) : []), [active]);
  if (!active) return null;

  const { totals } = active;
  const pctYear = formatPercent(data.yearElapsedPct);

  return (
    <div className="flex flex-col gap-4">
      <DataStamp
        generatedAt={undefined}
        periodLabel={`As at ${data.asAt} · ${pctYear} of year elapsed`}
        fyLabel={data.fyLabel}
        source={data.source}
      />

      {/* Directorate selector */}
      <div className="flex flex-wrap gap-1.5">
        {trees.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setGroupId(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors",
              t.id === active.id
                ? "border-gold/40 bg-gold-dim text-foreground"
                : "border-border bg-elevated/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t.name}
          </button>
        ))}
      </div>

      {/* Full-year surplus summary for the directorate */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Revenue budget" value={totals.revenueBudget} tone="pos" sub={`${formatCurrency(totals.revenueActual)} actual`} />
        <SummaryCard label="Expenditure budget" value={totals.expenseBudget} tone="neg" sub={`${formatCurrency(totals.expenseActual)} actual`} />
        <SummaryCard
          label="Budgeted surplus / (deficiency)"
          value={totals.surplusBudget}
          tone={totals.surplusBudget >= 0 ? "pos" : "neg"}
          sub={`${formatCurrency(totals.surplusActual)} actual`}
          signed
        />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader
          title={`${active.name} — Budget vs Actual`}
          subtitle={`Report group: ${active.manager} · ${data.fyLabel}`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <Th className="text-left">Program / Account</Th>
                <Th>Rev — Actual</Th>
                <Th>Rev — Budget</Th>
                <Th>Exp — Actual</Th>
                <Th>Exp — Budget</Th>
                <Th>Surplus / (Def.)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Row key={`${r.type}-${r.node.code}-${i}`} row={r} />
              ))}
              <tr className="border-t-2 border-[var(--hairline)] bg-[var(--hairline-soft)] font-semibold">
                <td className="px-3 py-3 text-[13px] text-foreground">TOTAL REVENUE &amp; EXPENDITURE</td>
                <Money value={totals.revenueActual} />
                <Money value={totals.revenueBudget} />
                <Money value={totals.expenseActual} />
                <Money value={totals.expenseBudget} />
                <Money value={totals.surplusBudget} signed tone={totals.surplusBudget >= 0 ? "pos" : "neg"} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          <Info className="mt-px h-3 w-3 flex-shrink-0" strokeWidth={1.75} />
          Actuals are as at {data.asAt} ({pctYear} of the year elapsed), so low spend this early is expected — not
          under-budget. Budget is the adopted full-year figure. Straight-line pace would be ~{pctYear} of budget.
        </p>
      </Panel>
    </div>
  );
}

function Row({ row }: { row: RenderRow }) {
  const { node } = row;
  const surplus = nodeSurplus(node);
  const indent = 12 + node.level * 16;

  if (row.type === "header") {
    return (
      <tr className="bg-[var(--hairline-soft)]">
        <td className="border-b border-[var(--hairline-soft)] py-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--th-fg)]" style={{ paddingLeft: indent, paddingRight: 12 }}>
          {node.code} {node.label}
        </td>
        <td colSpan={5} className="border-b border-[var(--hairline-soft)]" />
      </tr>
    );
  }

  if (row.type === "subtotal") {
    return (
      <tr className="border-y border-[var(--hairline)] font-semibold">
        <td className="py-2 text-[12px] text-foreground" style={{ paddingLeft: indent, paddingRight: 12 }}>
          Total {node.label}
        </td>
        <Money value={node.revenueActual} muted />
        <Money value={node.revenueBudget} />
        <Money value={node.expenseActual} muted />
        <Money value={node.expenseBudget} />
        <Money value={surplus.budget} signed tone={surplus.budget >= 0 ? "pos" : "neg"} />
      </tr>
    );
  }

  // Leaf account line
  return (
    <tr className="hover:bg-[var(--hairline-hover)]">
      <td className="border-b border-[var(--hairline-soft)] py-2 text-[13px] text-foreground" style={{ paddingLeft: indent, paddingRight: 12 }}>
        <span className="font-mono text-[11px] text-muted-foreground">{node.code}</span> {node.label}
      </td>
      <Money value={node.revenueActual} muted zeroDash />
      <Money value={node.revenueBudget} zeroDash />
      <Money value={node.expenseActual} muted zeroDash />
      <Money value={node.expenseBudget} zeroDash />
      <Money value={surplus.budget} signed zeroDash tone={surplus.budget >= 0 ? "pos" : "neg"} />
    </tr>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-[var(--hairline)] bg-[var(--hairline-soft)] px-3 py-2.5 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--th-fg)]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Money({
  value,
  tone,
  muted,
  signed,
  zeroDash,
}: {
  value: number;
  tone?: "pos" | "neg";
  muted?: boolean;
  signed?: boolean;
  zeroDash?: boolean;
}) {
  const isZero = Math.abs(value) < 0.005;
  const text = zeroDash && isZero ? "—" : signed ? formatSigned(value) : formatCurrency(value);
  return (
    <td className="border-b border-[var(--hairline-soft)] px-3 py-2 text-right">
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums",
          tone === "pos" && "text-green",
          tone === "neg" && "text-red",
          !tone && (muted || (zeroDash && isZero) ? "text-muted-foreground" : "text-foreground"),
        )}
      >
        {text}
      </span>
    </td>
  );
}

function formatSigned(value: number): string {
  if (value < 0) return `(${formatCurrency(Math.abs(value))})`;
  return formatCurrency(value);
}

function SummaryCard({
  label,
  value,
  tone,
  sub,
  signed,
}: {
  label: string;
  value: number;
  tone: "pos" | "neg";
  sub: string;
  signed?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-[20px] font-semibold tabular-nums", tone === "pos" ? "text-foreground" : "text-foreground")}>
        {signed ? formatSigned(value) : formatCurrency(value)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
