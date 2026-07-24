"use client";

import Link from "next/link";
import type { DepartmentDerived } from "@/lib/types";
import { bgDim, statusToColor, textColor } from "@/lib/colors";
import { DeptIcon } from "@/lib/icons";
import { formatCurrency, formatPercent, formatSignedCompact } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { StatusPill } from "@/components/kit/pills";
import { cn } from "@/lib/utils";

export function DepartmentTable({
  departments,
  periodLabel,
  comparisonLabel = "Budget",
  totalExpenses,
}: {
  departments: DepartmentDerived[];
  periodLabel: string;
  /** What the comparator columns represent: "Budget" or "FY25". */
  comparisonLabel?: string;
  /**
   * Council-wide Total Expenses headline. When given, the table adds an
   * "Unassigned" row for expenses not yet mapped to a department and a totals row,
   * so the YTD Actual column ties to the headline rather than sitting short.
   */
  totalExpenses?: number;
}) {
  const isFy25 = comparisonLabel === "FY25";

  // Column sums, and the unmapped remainder that reconciles YTD Actual to the headline.
  const sumAnnual = departments.reduce((a, d) => a + d.annualBudget, 0);
  const sumYtdActual = departments.reduce((a, d) => a + d.ytdActual, 0);
  const sumYtdBudget = departments.reduce((a, d) => a + d.ytdBudget, 0);
  const sumRevenue = departments.reduce((a, d) => a + (d.revenue ?? 0), 0);
  const reconcile = !isFy25 && totalExpenses !== undefined;
  const unassigned = reconcile ? (totalExpenses as number) - sumYtdActual : 0;
  // Show the reconciling row for a remainder in EITHER direction — usually a small
  // positive (unmapped expenses), but it can be negative (contra/adjustment accounts).
  const showUnassigned = reconcile && Math.abs(unassigned) >= 1;
  const totalActual = reconcile ? (totalExpenses as number) : sumYtdActual;
  // Variance foots to the visible per-department variance cells (each is
  // ytdBudget − ytdActual). Unassigned expenses have no budget, so they're not
  // part of a budget variance — kept out of this total, and out of "% Spent".
  const totalVariance = sumYtdBudget - sumYtdActual;

  return (
    <Panel>
      <PanelHeader
        title={`Department Summary — ${periodLabel}`}
        subtitle={reconcile ? `YTD Actual totals to Total Expenses (YTD) · ${formatCurrency(totalActual)}` : undefined}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                { label: "Department", align: "left" },
                { label: isFy25 ? "FY25 Actual" : "Annual Budget", align: "right" },
                { label: isFy25 ? "FY26 YTD" : "YTD Actual", align: "right" },
                { label: "Revenue", align: "right" },
                { label: isFy25 ? "FY25 (pro-rata)" : "YTD Budget", align: "right" },
                { label: isFy25 ? "Δ vs FY25" : "Variance", align: "right" },
                { label: isFy25 ? "% of FY25" : "% Spent", align: "right" },
                { label: isFy25 ? "Pace" : "Status", align: "left" },
                { label: "", align: "right" },
              ].map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    "border-b border-[var(--hairline)] bg-[var(--hairline-soft)] px-3.5 py-[11px] font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--th-fg)]",
                    h.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id} className="hover:bg-[var(--hairline-hover)]">
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-[13px]">
                  <div className="flex items-center gap-2.5 font-medium text-foreground">
                    <span
                      className={cn(
                        "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border",
                        bgDim[d.color],
                      )}
                    >
                      <DeptIcon name={d.icon} className={cn("h-4 w-4", textColor[d.color])} />
                    </span>
                    {d.name}
                  </div>
                </td>
                <Num>{formatCurrency(d.annualBudget)}</Num>
                <Num>{formatCurrency(d.ytdActual)}</Num>
                <Num tone={(d.revenue ?? 0) > 0 ? "pos" : undefined}>
                  {(d.revenue ?? 0) > 0 ? formatCurrency(d.revenue ?? 0) : "—"}
                </Num>
                <Num>{formatCurrency(d.ytdBudget)}</Num>
                <Num tone={d.variance >= 0 ? "pos" : "neg"}>
                  {formatSignedCompact(d.variance)}
                </Num>
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-right">
                  <span
                    className={cn(
                      "font-mono text-[13px] font-bold tabular-nums",
                      textColor[statusToColor[d.status]],
                    )}
                  >
                    {formatPercent(d.pctSpent)}
                  </span>
                </td>
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5">
                  <StatusPill status={d.status} />
                </td>
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5">
                  <Link
                    href={`/departments/${d.slug}`}
                    className="rounded-[7px] border border-[var(--hairline)] px-3 py-[5px] text-[11px] font-bold text-subtle transition-colors hover:border-[rgba(212,168,76,0.35)] hover:bg-gold-dim hover:text-gold-light"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}

            {/* Expenses not yet assigned to a department — shown so the column ties
                to the Total Expenses headline instead of falling silently short. */}
            {showUnassigned && (
              <tr className="hover:bg-[var(--hairline-hover)]">
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-[13px]">
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border text-[11px]">
                      —
                    </span>
                    Unassigned
                    <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
                      not yet mapped
                    </span>
                  </div>
                </td>
                <Num>—</Num>
                <Num>{formatCurrency(unassigned)}</Num>
                <Num>—</Num>
                <Num>—</Num>
                <Num>—</Num>
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-right text-muted-foreground">—</td>
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5" />
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5">
                  <Link
                    href="/mapping"
                    className="rounded-[7px] border border-[var(--hairline)] px-3 py-[5px] text-[11px] font-bold text-subtle transition-colors hover:border-[rgba(212,168,76,0.35)] hover:bg-gold-dim hover:text-gold-light"
                    title="See which accounts aren't assigned to a department yet"
                  >
                    Map →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>

          {/* Totals — YTD Actual ties to the Total Expenses headline. */}
          <tfoot>
            <tr>
              <TotalCell align="left">Total</TotalCell>
              <TotalCell>{formatCurrency(sumAnnual)}</TotalCell>
              <TotalCell>{formatCurrency(totalActual)}</TotalCell>
              <TotalCell tone={sumRevenue > 0 ? "pos" : undefined}>
                {sumRevenue > 0 ? formatCurrency(sumRevenue) : "—"}
              </TotalCell>
              <TotalCell>{formatCurrency(sumYtdBudget)}</TotalCell>
              <TotalCell tone={totalVariance >= 0 ? "pos" : "neg"}>{formatSignedCompact(totalVariance)}</TotalCell>
              <TotalCell muted>{sumAnnual > 0 ? formatPercent(totalActual / sumAnnual) : "—"}</TotalCell>
              <td className="border-t border-[var(--hairline)] px-3.5 py-3.5" />
              <td className="border-t border-[var(--hairline)] px-3.5 py-3.5" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

/** A cell in the totals footer — clean top border, bold, no stray underlines. */
function TotalCell({
  children,
  tone,
  muted,
  align = "right",
}: {
  children: React.ReactNode;
  tone?: "pos" | "neg";
  muted?: boolean;
  align?: "left" | "right";
}) {
  return (
    <td
      className={cn(
        "border-t border-[var(--hairline)] px-3.5 py-3.5",
        align === "right" ? "text-right font-mono tabular-nums" : "text-left",
      )}
    >
      <span
        className={cn(
          "text-[13px] font-bold",
          tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {children}
      </span>
    </td>
  );
}

function Num({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "pos" | "neg";
}) {
  return (
    <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-right">
      <span
        className={cn(
          "font-mono text-[13px] tabular-nums",
          tone === "pos" && "font-bold text-green",
          tone === "neg" && "font-bold text-red",
          !tone && "text-foreground",
        )}
      >
        {children}
      </span>
    </td>
  );
}
