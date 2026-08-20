"use client";

import { useState } from "react";
import { FileText, Receipt, Ban, CheckCircle2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { ExportButton } from "@/components/kit/export-button";
import { TablePager, usePagination, STICKY_HEAD } from "@/components/kit/table-pager";
import { formatCurrency } from "@/lib/format";
import type { InvoicePage, BillPage } from "@/lib/billing";
import { cn } from "@/lib/utils";

type Tab = "owed-to-us" | "owed-by-us";
type AgeFilter = "all" | "current" | "d30" | "d60" | "d90" | "d90plus";
type BillFilter = "all" | "open" | "paid" | "cancelled";

const AGE_OPTIONS: [AgeFilter, string, "default" | "amber" | "red"][] = [
  ["all", "All", "default"],
  ["current", "Not overdue", "default"],
  ["d30", "1–30 days", "default"],
  ["d60", "31–60 days", "amber"],
  ["d90", "61–90 days", "amber"],
  ["d90plus", "90+ days", "red"],
];
const BILL_OPTIONS: [BillFilter, string][] = [
  ["all", "All"],
  ["open", "Open"],
  ["paid", "Paid"],
  ["cancelled", "Cancelled"],
];

/** A filter pill for the invoice/bill list — tone-coded so "90+ days" reads red when active. */
function FilterPill({
  active,
  onClick,
  tone = "default",
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "default" | "amber" | "red";
  children: React.ReactNode;
}) {
  const activeCls =
    tone === "red"
      ? "border-red/40 bg-red/10 text-red"
      : tone === "amber"
        ? "border-amber/40 bg-amber/10 text-amber"
        : "border-gold/40 bg-gold-dim text-gold-light";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-2.5 text-[12px] font-medium transition-colors",
        active ? activeCls : "border-border bg-elevated text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Invoices and supplier bills (B4).
 *
 * The ageing panel on /commitments tells you the TOTAL in each bucket. This tells you
 * WHICH invoices make up it, and who owes them. "$1.25M is over 90 days" is a fact;
 * "QBuild owes $306K across these eleven invoices" is a phone call.
 */
export function BillingView({ invoices, bills }: { invoices: InvoicePage; bills: BillPage }) {
  const [tab, setTab] = useState<Tab>("owed-to-us");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [billFilter, setBillFilter] = useState<BillFilter>("all");

  // Age filter on the invoices (debtors), by days overdue. Client-side over the
  // loaded rows — the ageing summary above shows the authoritative bucket totals.
  const invoiceRows = invoices.rows.filter((r) => {
    if (ageFilter === "all") return true;
    const d = r.daysOverdue;
    if (ageFilter === "current") return r.outstanding !== 0 && (d === null || d <= 0);
    if (d === null || d <= 0) return false;
    if (ageFilter === "d30") return d <= 30;
    if (ageFilter === "d60") return d > 30 && d <= 60;
    if (ageFilter === "d90") return d > 60 && d <= 90;
    return d > 90; // d90plus
  });

  // Status filter on the supplier bills.
  const billRows = bills.rows.filter((r) => {
    if (billFilter === "all") return true;
    if (billFilter === "open") return !r.paid && !r.cancelled;
    if (billFilter === "paid") return r.paid;
    return r.cancelled; // cancelled
  });

  const shownCount = tab === "owed-to-us" ? invoiceRows.length : billRows.length;

  // Page each list; reset to page 1 when the tab or a filter changes.
  const pagedInvoices = usePagination(invoiceRows, { size: 50, resetKey: `${tab}|${ageFilter}` });
  const pagedBills = usePagination(billRows, { size: 50, resetKey: `${tab}|${billFilter}` });
  const paged = tab === "owed-to-us" ? pagedInvoices : pagedBills;

  return (
    <Panel>
      <PanelHeader
        title={tab === "owed-to-us" ? "Invoices" : "Supplier bills"}
        subtitle={
          tab === "owed-to-us"
            ? "Owed to the Council"
            : "Owed by the Council"
        }
        right={
          tab === "owed-to-us" ? (
            <ExportButton
              filename="invoices"
              sheets={[
                {
                  name: "Invoices",
                  rows: invoices.rows,
                  columns: [
                    { header: "Date", value: (r) => r.date, type: "date" },
                    { header: "Due", value: (r) => r.dueDate, type: "date" },
                    { header: "Customer", value: (r) => r.debtorName, width: 34 },
                    { header: "Reference", value: (r) => r.reference },
                    { header: "Description", value: (r) => r.summary, width: 40 },
                    { header: "Invoiced", value: (r) => r.invoiced, type: "money" },
                    { header: "Outstanding", value: (r) => r.outstanding, type: "money" },
                    { header: "Days overdue", value: (r) => r.daysOverdue, type: "number" },
                  ],
                  total: { Outstanding: invoices.totalOutstanding },
                },
              ]}
            />
          ) : (
            <ExportButton
              filename="supplier-bills"
              sheets={[
                {
                  name: "Supplier bills",
                  rows: bills.rows,
                  columns: [
                    { header: "Date", value: (r) => r.date, type: "date" },
                    { header: "Due", value: (r) => r.dueDate, type: "date" },
                    { header: "Paid", value: (r) => r.payDate, type: "date" },
                    { header: "Supplier", value: (r) => r.creditorName, width: 34 },
                    { header: "Reference", value: (r) => r.reference },
                    { header: "Description", value: (r) => r.summary, width: 40 },
                    { header: "Order no", value: (r) => r.orderNo },
                    { header: "Amount", value: (r) => r.amount, type: "money" },
                    { header: "GST", value: (r) => r.gst, type: "money" },
                    { header: "Status", value: (r) => (r.cancelled ? "CANCELLED" : r.paid ? "PAID" : "OPEN") },
                  ],
                  total: { Amount: bills.totalOpen },
                },
              ]}
            />
          )
        }
      />

      <div className="mb-4 flex rounded-md border border-border bg-elevated/40 p-0.5">
        {(
          [
            ["owed-to-us", "Owed to the Council", FileText, invoices.total],
            ["owed-by-us", "Owed by the Council", Receipt, bills.total],
          ] as const
        ).map(([id, label, Icon, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-[13px] font-medium transition-colors",
              tab === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {label}
            <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
          </button>
        ))}
      </div>

      {/* Filter the list — by age on the invoices, by status on the bills */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-1.5">
        {tab === "owed-to-us"
          ? AGE_OPTIONS.map(([id, label, tone]) => (
              <FilterPill key={id} active={ageFilter === id} onClick={() => setAgeFilter(id)} tone={tone}>
                {label}
              </FilterPill>
            ))
          : BILL_OPTIONS.map(([id, label]) => (
              <FilterPill key={id} active={billFilter === id} onClick={() => setBillFilter(id)}>
                {label}
              </FilterPill>
            ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {shownCount} shown
        </span>
      </div>

      <TablePager
        total={paged.total}
        page={paged.page}
        pageSize={paged.pageSize}
        pages={paged.pages}
        onPage={paged.setPage}
        onPageSize={paged.setPageSize}
        label={tab === "owed-to-us" ? "invoices" : "bills"}
      />

      {/* Wide tables scroll INSIDE their own container. The page body must never
          scroll sideways. */}
      <div className="overflow-x-auto">
        {tab === "owed-to-us" ? (
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className={cn("pb-2 pr-4 text-left font-normal", STICKY_HEAD)}>Date</th>
                <th className={cn("pb-2 pr-4 text-left font-normal", STICKY_HEAD)}>Customer</th>
                <th className={cn("pb-2 pr-4 text-left font-normal", STICKY_HEAD)}>Description</th>
                <th className={cn("pb-2 pr-4 text-right font-normal", STICKY_HEAD)}>Invoiced</th>
                <th className={cn("pb-2 pr-4 text-right font-normal", STICKY_HEAD)}>Outstanding</th>
                <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedInvoices.pageItems.map((r) => (
                <tr key={r.ky} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-muted-foreground">
                    {r.date}
                  </td>
                  <td className="py-2.5 pr-4 text-foreground">{r.debtorName}</td>
                  <td className="max-w-[280px] truncate py-2.5 pr-4 text-muted-foreground">
                    {r.summary}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-muted-foreground">
                    {formatCurrency(r.invoiced)}
                  </td>
                  {/* The one that matters: what is STILL unpaid, not what was billed. */}
                  <td
                    className={cn(
                      "py-2.5 pr-4 text-right font-mono font-medium tabular-nums",
                      r.outstanding !== 0 ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {r.outstanding === 0 ? "—" : formatCurrency(r.outstanding)}
                  </td>
                  {/* Status: received (money in) · N days overdue · or the due date
                      for anything not yet due — never a bare "not due". */}
                  <td className="py-2.5 text-right">
                    {r.outstanding === 0 ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-green">
                        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                        received
                      </span>
                    ) : r.daysOverdue !== null && r.daysOverdue > 0 ? (
                      <span className={cn("font-mono text-[11px] tabular-nums", r.daysOverdue > 90 ? "text-red" : "text-amber")}>
                        {r.daysOverdue}d overdue
                      </span>
                    ) : r.dueDate ? (
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">due {r.dueDate}</span>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className={cn("pb-2 pr-4 text-left font-normal", STICKY_HEAD)}>Date</th>
                <th className={cn("pb-2 pr-4 text-left font-normal", STICKY_HEAD)}>Supplier</th>
                <th className={cn("pb-2 pr-4 text-left font-normal", STICKY_HEAD)}>Description</th>
                <th className={cn("pb-2 pr-4 text-left font-normal", STICKY_HEAD)}>Order</th>
                <th className={cn("pb-2 pr-4 text-right font-normal", STICKY_HEAD)}>Amount</th>
                <th className={cn("pb-2 text-right font-normal", STICKY_HEAD)}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedBills.pageItems.map((r) => (
                <tr
                  key={r.ky}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    // A cancelled bill is not a debt. Dim it so it reads as history,
                    // not as something anyone has to act on.
                    r.cancelled && "opacity-50",
                  )}
                >
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-muted-foreground">
                    {r.date}
                  </td>
                  <td className="py-2.5 pr-4 text-foreground">{r.creditorName}</td>
                  <td className="max-w-[260px] truncate py-2.5 pr-4 text-muted-foreground">
                    {r.summary}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-muted-foreground">
                    {r.orderNo || "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-foreground">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="py-2.5 text-right">
                    {r.cancelled ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                        <Ban className="h-3 w-3" strokeWidth={2} />
                        cancelled
                      </span>
                    ) : r.paid ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-green">
                        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                        paid
                      </span>
                    ) : r.dueDate ? (
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">due {r.dueDate}</span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase text-amber">open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        {tab === "owed-to-us" ? (
          <>
            <span className="text-foreground">Outstanding</span> is what is still unpaid on each
            invoice, not what was originally billed. Showing the original would overstate what the
            Council is owed.
          </>
        ) : (
          <>
            Supplier <span className="text-foreground">invoices only</span> — payments and journals
            are excluded. <span className="text-foreground">Cancelled</span> bills are shown but not
            counted as owed; treating &quot;not paid&quot; as &quot;still owed&quot; would present{" "}
            {bills.cancelledCount} cancelled cheques as money the Council still has to find.
          </>
        )}
      </p>
    </Panel>
  );
}
