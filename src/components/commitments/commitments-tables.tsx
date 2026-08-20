"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { TablePager, usePagination, STICKY_HEAD } from "@/components/kit/table-pager";
import { formatCurrency } from "@/lib/format";
import type { AgeingInsight } from "@/lib/working-capital";
import { cn } from "@/lib/utils";

/**
 * The Commitments & Debtors tables, as client components so they get the same
 * paged, sticky-header treatment as every other data table (Aug 2026 review) —
 * the debtor list alone runs to 200+ accounts and used to be capped at 20.
 */

export function CapitalWipTable({
  rows,
  total,
}: {
  rows: { code: string; project: string; amount: number }[];
  total: number;
}) {
  const paged = usePagination(rows, { size: 50 });
  return (
    <Panel className="mb-4">
      <PanelHeader
        title="Capital works in progress"
        subtitle="Spend accumulating on projects not yet complete"
        right={<span className="font-mono text-[12px] tabular-nums text-foreground">{formatCurrency(total)}</span>}
      />
      <TablePager total={paged.total} page={paged.page} pageSize={paged.pageSize} pages={paged.pages} onPage={paged.setPage} onPageSize={paged.setPageSize} label="projects" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className={cn("pb-2 text-left font-normal", STICKY_HEAD)}>Project</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>Spend to date</th>
            </tr>
          </thead>
          <tbody>
            {paged.pageItems.map((w) => (
              <tr key={w.code} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-4">
                  <div className="text-foreground">{w.project}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{w.code}</div>
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-foreground">{formatCurrency(w.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function SupplierCommitmentsTable({
  rows,
  total,
}: {
  rows: { supplier: string; amount: number; count: number }[];
  total: number;
}) {
  const paged = usePagination(rows, { size: 50 });
  return (
    <Panel className="mb-4">
      <PanelHeader
        title="Outstanding purchase orders, by supplier"
        subtitle="Ordered, not yet invoiced"
        right={<span className="font-mono text-[12px] tabular-nums text-foreground">{formatCurrency(total)}</span>}
      />
      <TablePager total={paged.total} page={paged.page} pageSize={paged.pageSize} pages={paged.pages} onPage={paged.setPage} onPageSize={paged.setPageSize} label="suppliers" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className={cn("pb-2 text-left font-normal", STICKY_HEAD)}>Supplier</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>Orders</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>Committed</th>
            </tr>
          </thead>
          <tbody>
            {paged.pageItems.map((s) => (
              <tr key={s.supplier} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-4 text-foreground">{s.supplier}</td>
                <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{s.count}</td>
                <td className="py-2 text-right font-mono tabular-nums text-foreground">{formatCurrency(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function AgeingPanel({
  title,
  subtitle,
  insight,
  direction,
}: {
  title: string;
  subtitle: string;
  insight: AgeingInsight;
  direction: "in" | "out";
}) {
  const s = insight.schedule;
  const Icon = direction === "in" ? ArrowDownLeft : ArrowUpRight;
  const paged = usePagination(s.accounts, { size: 50 });

  const buckets = [
    { label: "Current", value: s.current, tone: "text-foreground" },
    { label: "30 days", value: s.days30, tone: "text-foreground" },
    { label: "60 days", value: s.days60, tone: "text-amber" },
    { label: "90+ days", value: s.days90, tone: insight.alarming ? "text-red" : "text-amber" },
  ];

  return (
    <Panel className="mb-4">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
            {title}
          </span>
        }
        subtitle={`${subtitle} · ${s.count} accounts`}
        right={<span className="font-mono text-[12px] tabular-nums text-foreground">{formatCurrency(s.total)}</span>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-md border border-border bg-elevated/30 px-3 py-2.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{b.label}</div>
            <div className={cn("mt-1 font-mono text-[13px] font-semibold tabular-nums", b.tone)}>{formatCurrency(b.value)}</div>
          </div>
        ))}
      </div>

      <TablePager total={paged.total} page={paged.page} pageSize={paged.pageSize} pages={paged.pages} onPage={paged.setPage} onPageSize={paged.setPageSize} label="accounts" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[12px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className={cn("pb-2 text-left font-normal", STICKY_HEAD)}>Account</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>Current</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>30</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>60</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>90+</th>
              <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>Total</th>
            </tr>
          </thead>
          <tbody>
            {paged.pageItems.map((a) => {
              // A balance that is ENTIRELY 90+ days old is the one to chase first.
              const allOverdue = a.total > 0 && a.days90 >= a.total - 0.005;
              return (
                <tr key={a.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4">
                    <div className="text-foreground">{a.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{a.id}</div>
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{a.current ? formatCurrency(a.current) : "—"}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{a.days30 ? formatCurrency(a.days30) : "—"}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{a.days60 ? formatCurrency(a.days60) : "—"}</td>
                  <td className={cn("py-2 text-right font-mono tabular-nums", a.days90 > 0 ? (allOverdue ? "text-red" : "text-amber") : "text-muted-foreground")}>
                    {a.days90 ? formatCurrency(a.days90) : "—"}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-foreground">{formatCurrency(a.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
