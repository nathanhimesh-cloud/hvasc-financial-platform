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
}: {
  departments: DepartmentDerived[];
  periodLabel: string;
  /** What the comparator columns represent: "Budget" or "FY25". */
  comparisonLabel?: string;
}) {
  const isFy25 = comparisonLabel === "FY25";
  return (
    <Panel>
      <PanelHeader title={`Department Summary — ${periodLabel}`} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                { label: "Department", align: "left" },
                { label: isFy25 ? "FY25 Actual" : "Annual Budget", align: "right" },
                { label: isFy25 ? "FY26 YTD" : "YTD Actual", align: "right" },
                { label: isFy25 ? "FY25 (pro-rata)" : "YTD Budget", align: "right" },
                { label: isFy25 ? "Δ vs FY25" : "Variance", align: "right" },
                { label: isFy25 ? "% of FY25" : "% Spent", align: "right" },
                { label: isFy25 ? "Pace" : "Status", align: "left" },
                { label: "", align: "right" },
              ].map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    "border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3.5 py-[11px] font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#dce8f0]",
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
              <tr key={d.id} className="hover:bg-[rgba(255,255,255,0.03)]">
                <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3.5 text-[13px]">
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
                <Num>{formatCurrency(d.ytdBudget)}</Num>
                <Num tone={d.variance >= 0 ? "pos" : "neg"}>
                  {formatSignedCompact(d.variance)}
                </Num>
                <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3.5 text-right">
                  <span
                    className={cn(
                      "font-mono text-[13px] font-bold tabular-nums",
                      textColor[statusToColor[d.status]],
                    )}
                  >
                    {formatPercent(d.pctSpent)}
                  </span>
                </td>
                <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3.5">
                  <StatusPill status={d.status} />
                </td>
                <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3.5">
                  <Link
                    href={`/departments/${d.slug}`}
                    className="rounded-[7px] border border-[rgba(255,255,255,0.16)] px-3 py-[5px] text-[11px] font-bold text-subtle transition-colors hover:border-[rgba(212,168,76,0.35)] hover:bg-gold-dim hover:text-gold-light"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
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
    <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3.5 text-right">
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
