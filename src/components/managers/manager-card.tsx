import type { DepartmentDerived, ReportingPeriod } from "@/lib/types";
import { bgDim, hex, statusToColor, textColor } from "@/lib/colors";
import { DeptIcon } from "@/lib/icons";
import { formatCompact, formatCurrency, formatPercent, formatSignedCompact } from "@/lib/format";
import { AlertChip, StatusPill } from "@/components/kit/pills";
import { YoY } from "@/components/kit/yoy";
import { cn } from "@/lib/utils";

interface Props {
  department: DepartmentDerived;
  period: ReportingPeriod;
  /** Same-month spend last year, when the archive holds it — for a fair YTD delta. */
  priorYtd?: number;
  /** Label of the prior period, e.g. "July 2025". */
  priorLabel?: string;
}

export function ManagerCard({ department: d, period, priorYtd, priorLabel }: Props) {
  const ytdTone =
    d.status === "over-budget"
      ? "text-red"
      : d.status === "at-risk"
        ? "text-amber"
        : "text-white";
  const kindLabel =
    d.kind === "cost-revenue" ? "COST & REVENUE CENTRE" : "COST CENTRE";
  const ragColor = statusToColor[d.status];

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card p-5 transition-colors duration-200 hover:border-[rgba(255,255,255,0.16)]">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3.5">
        <span className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border", bgDim[d.color])}>
          <DeptIcon name={d.icon} className={cn("h-5 w-5", textColor[d.color])} />
        </span>
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            {d.name}
          </div>
          <div className="mt-[3px] font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
            {kindLabel} · {period.fyLabel}
          </div>
        </div>
        <div className="ml-auto flex-shrink-0">
          <StatusPill status={d.status} />
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-[18px] grid grid-cols-3 gap-2.5">
        <Metric label="Annual Budget" value={formatCompact(d.annualBudget)} />
        <Metric
          label="YTD Spent"
          value={formatCompact(d.ytdActual)}
          tone={ytdTone}
          sub={<YoY now={d.ytdActual} then={priorYtd} good="neutral" suffix={priorLabel ?? "last year"} />}
        />
        <Metric
          label="Variance"
          value={formatSignedCompact(d.variance)}
          tone={d.variance >= 0 ? "text-green" : "text-red"}
        />
      </div>

      {/* Spend bar (RAG status colour) */}
      <div className="mb-[7px] h-[7px] overflow-hidden rounded-[4px] bg-elevated">
        <div
          className="h-full rounded-[4px]"
          style={{ width: `${Math.min(d.pctSpent, 1) * 100}%`, background: hex[ragColor] }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] font-medium text-subtle tabular-nums">
        <span className={d.status === "over-budget" ? "text-red" : undefined}>
          {d.status === "over-budget"
            ? `⚠ ${formatPercent(d.pctSpent)} of budget — over annual limit`
            : `${formatPercent(d.pctSpent)} of budget used`}
        </span>
        <span>
          Month {period.monthOfYear} of {period.monthsInYear}
        </span>
      </div>

      {/* GL lines */}
      <div className="mt-4 flex flex-col gap-[7px]">
        {d.glLines.map((gl) => (
          <div
            key={gl.code}
            className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[rgba(255,255,255,0.04)] bg-elevated px-3 py-[9px] text-xs transition-colors hover:border-[rgba(255,255,255,0.1)]"
          >
            <span className="mr-3 rounded bg-[rgba(255,255,255,0.07)] px-[7px] py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              {gl.code}
            </span>
            <span className="flex-1 font-medium text-foreground">{gl.account}</span>
            <span
              className={cn(
                "min-w-[82px] text-right font-mono text-xs font-bold tabular-nums",
                gl.flagged ? "text-red" : "text-foreground",
              )}
            >
              {formatCurrency(gl.amount)}
            </span>
          </div>
        ))}
      </div>

      {/* Active grants */}
      {d.grants.length > 0 && (
        <div className="mt-3.5 border-t border-border pt-3.5">
          <div className="mb-[7px] font-mono text-[9px] font-semibold tracking-[0.12em] text-subtle">
            ACTIVE GRANTS
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.grants.map((g) => (
              <AlertChip key={g.id} level={g.statusChip.level}>
                {shortGrant(g.name)} — {g.statusChip.label.replace("✓ ", "")}
              </AlertChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "text-white",
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[rgba(255,255,255,0.05)] bg-elevated p-3">
      <div className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8aa0b8]">
        {label}
      </div>
      <div className={cn("font-heading text-[18px] font-extrabold tabular-nums tracking-[-0.02em]", tone)}>
        {value}
      </div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

/** First two words of a grant name for the compact chip. */
function shortGrant(name: string): string {
  return name.split(" ").slice(0, 2).join(" ");
}
