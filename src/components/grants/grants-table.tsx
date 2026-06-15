import type { BrandColor, Grant } from "@/lib/types";
import { hex, textColor } from "@/lib/colors";
import { DeptIcon } from "@/lib/icons";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { AlertChip } from "@/components/kit/pills";
import { cn } from "@/lib/utils";

interface Props {
  grants: Grant[];
  /** departmentId → icon / brand colour. */
  deptIcon: Record<string, string>;
  deptColor: Record<string, BrandColor>;
}

export function GrantsTable({ grants, deptIcon, deptColor }: Props) {
  return (
    <Panel>
      <PanelHeader
        title="Grant Register — FY2025–26"
        subtitle="SPEND TRACKING · REPORT DEADLINES · ACQUITTAL STATUS"
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                { label: "Grant", align: "left" },
                { label: "Dept", align: "center" },
                { label: "Total", align: "right" },
                { label: "Spent", align: "right" },
                { label: "Remaining", align: "right" },
                { label: "Progress", align: "left" },
                { label: "Next Report", align: "left" },
                { label: "Acquittal", align: "left" },
                { label: "Status", align: "left" },
              ].map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    "border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3.5 py-[11px] font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#dce8f0]",
                    h.align === "right" && "text-right",
                    h.align === "center" && "text-center",
                    h.align === "left" && "text-left",
                  )}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => {
              const remaining = g.total - g.spent;
              const progress = g.total > 0 ? g.spent / g.total : 0;
              const color = deptColor[g.departmentId] ?? "teal";
              return (
                <tr key={g.id} className="align-middle hover:bg-[rgba(255,255,255,0.025)]">
                  <Cell>
                    <div className="text-[13px] font-bold text-white">{g.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                      {g.funder}
                    </div>
                  </Cell>
                  <Cell className="text-center">
                    <DeptIcon
                      name={deptIcon[g.departmentId]}
                      className={cn("mx-auto h-[18px] w-[18px]", textColor[color])}
                    />
                  </Cell>
                  <Cell className="text-right">
                    <span className="font-mono text-xs tabular-nums text-foreground">
                      {formatCurrency(g.total)}
                    </span>
                  </Cell>
                  <Cell className="text-right">
                    <span className="font-mono text-xs tabular-nums text-foreground">
                      {formatCurrency(g.spent)}
                    </span>
                  </Cell>
                  <Cell className="text-right">
                    <span
                      className={cn(
                        "font-mono text-xs font-bold tabular-nums",
                        remaining > 0 ? "text-green" : "text-red",
                      )}
                    >
                      {remaining > 0 ? formatCurrency(remaining) : "−$0"}
                    </span>
                  </Cell>
                  <Cell className="min-w-[110px]">
                    <div className="mb-1 font-mono text-[10px] font-semibold text-subtle">
                      {formatPercent(progress)}
                    </div>
                    <div className="h-[5px] w-full overflow-hidden rounded-[3px] bg-elevated">
                      <div
                        className="h-full rounded-[3px]"
                        style={{ width: `${progress * 100}%`, background: hex[color] }}
                      />
                    </div>
                  </Cell>
                  <Cell>
                    <AlertChip level={g.reportDue.level}>{g.reportDue.label}</AlertChip>
                  </Cell>
                  <Cell>
                    <AlertChip level={g.acquittal.level}>{g.acquittal.label}</AlertChip>
                  </Cell>
                  <Cell>
                    <AlertChip level={g.statusChip.level}>{g.statusChip.label}</AlertChip>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Cell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3.5 align-middle",
        className,
      )}
    >
      {children}
    </td>
  );
}
