"use client";

import Link from "next/link";
import { bgDim, hex, textColor } from "@/lib/colors";
import { DeptIcon } from "@/lib/icons";
import { formatCurrency, formatPercent } from "@/lib/format";
import { CardBadge, Panel, PanelHeader } from "@/components/kit/panel";
import type { DepartmentDerived, RevenueLine } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Revenue Composition — income broken down across the Council's three directorates
 * (Corporate Services · Operations · Social Services), in the same table shape as
 * the Department Summary (Hazel, 14 Aug: "make it match the department summary, show
 * the three departments as a breakdown").
 *
 * Most Council income — general-purpose grants, rates, interest — isn't owned by a
 * single directorate, and revenue-centre mapping in Practical is still in progress.
 * So a reconciling "Council-wide & unmapped" row carries the remainder and the rows
 * always add back to the Total Income headline, rather than the directorates
 * silently falling short. As Micah completes the revenue-centre mapping, income
 * moves out of that row and into the directorates on the next sync.
 */
export function RevenueComposition({
  departments,
  totalIncome,
  periodLabel,
}: {
  /** Kept for API compatibility; the breakdown is by directorate. */
  lines?: RevenueLine[];
  departments: DepartmentDerived[];
  totalIncome: number;
  periodLabel: string;
}) {
  // Revenue mapped to each directorate (same figure the Department Summary shows).
  const rows = departments
    .map((d) => ({ id: d.id, name: d.name, slug: d.slug, icon: d.icon, color: d.color, revenue: d.revenue ?? 0 }))
    .filter((r) => r.revenue !== 0)
    .sort((a, b) => b.revenue - a.revenue);

  const mapped = rows.reduce((a, r) => a + r.revenue, 0);
  const unmapped = totalIncome - mapped;
  const showUnmapped = Math.abs(unmapped) >= 1;
  const denom = totalIncome !== 0 ? totalIncome : mapped || 1;

  return (
    <Panel>
      <PanelHeader
        title="Revenue Composition"
        subtitle="Income by directorate · ties to Total Income"
        right={<CardBadge>{periodLabel}</CardBadge>}
      />

      {/* Slim composition bar — the directorate split at a glance. */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-[var(--track)]">
        {rows.map((r) =>
          r.revenue > 0 ? (
            <div
              key={r.id}
              className="h-full transition-[width] duration-700 ease-out"
              style={{ width: `${(r.revenue / denom) * 100}%`, background: hex[r.color] }}
              title={`${r.name} ${formatCurrency(r.revenue)}`}
            />
          ) : null,
        )}
        {showUnmapped && unmapped > 0 && (
          <div className="h-full bg-[var(--hairline)]" style={{ width: `${(unmapped / denom) * 100}%` }} title={`Council-wide & unmapped ${formatCurrency(unmapped)}`} />
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                { label: "Revenue centre", align: "left" },
                { label: "Revenue (YTD)", align: "right" },
                { label: "% of income", align: "right" },
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
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-[var(--hairline-hover)]">
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-[13px]">
                  <div className="flex items-center gap-2.5 font-medium text-foreground">
                    <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border", bgDim[r.color])}>
                      <DeptIcon name={r.icon} className={cn("h-4 w-4", textColor[r.color])} />
                    </span>
                    {r.name}
                  </div>
                </td>
                <Num tone="pos">{formatCurrency(r.revenue)}</Num>
                <Num muted>{formatPercent(r.revenue / denom, 1)}</Num>
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-right">
                  <Link
                    href={`/departments/${r.slug}`}
                    className="rounded-[7px] border border-[var(--hairline)] px-3 py-[5px] text-[11px] font-bold text-subtle transition-colors hover:border-[rgba(212,168,76,0.35)] hover:bg-gold-dim hover:text-gold-light"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}

            {/* Income not tied to a directorate — general-purpose grants, rates,
                interest, plus revenue centres Micah hasn't mapped yet. Reconciles
                the rows to the Total Income headline. */}
            {showUnmapped && (
              <tr className="hover:bg-[var(--hairline-hover)]">
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-[13px]">
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border text-[11px]">—</span>
                    Council-wide &amp; unmapped
                    <span className="hidden font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70 sm:inline">
                      grants · rates · interest
                    </span>
                  </div>
                </td>
                <Num>{formatCurrency(unmapped)}</Num>
                <Num muted>{formatPercent(unmapped / denom, 1)}</Num>
                <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-right">
                  <Link
                    href="/mapping"
                    className="rounded-[7px] border border-[var(--hairline)] px-3 py-[5px] text-[11px] font-bold text-subtle transition-colors hover:border-[rgba(212,168,76,0.35)] hover:bg-gold-dim hover:text-gold-light"
                    title="Assign revenue accounts to a directorate"
                  >
                    Map →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr>
              <TotalCell align="left">Total income</TotalCell>
              <TotalCell>{formatCurrency(totalIncome)}</TotalCell>
              <TotalCell muted>100%</TotalCell>
              <td className="border-t border-[var(--hairline)] px-3.5 py-3.5" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

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
    <td className={cn("border-t border-[var(--hairline)] px-3.5 py-3.5", align === "right" ? "text-right font-mono tabular-nums" : "text-left")}>
      <span className={cn("text-[13px] font-bold", tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : muted ? "text-muted-foreground" : "text-foreground")}>
        {children}
      </span>
    </td>
  );
}

function Num({ children, tone, muted }: { children: React.ReactNode; tone?: "pos" | "neg"; muted?: boolean }) {
  return (
    <td className="border-b border-[var(--hairline-soft)] px-3.5 py-3.5 text-right">
      <span
        className={cn(
          "font-mono text-[13px] tabular-nums",
          tone === "pos" && "font-bold text-green",
          tone === "neg" && "font-bold text-red",
          muted && "text-muted-foreground",
          !tone && !muted && "text-foreground",
        )}
      >
        {children}
      </span>
    </td>
  );
}
