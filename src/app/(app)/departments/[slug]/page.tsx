import Link from "next/link";
import { DrillLink } from "@/components/kit/drill-link";
import { notFound } from "next/navigation";
import { ArrowLeft, Landmark, Scale, TrendingUp, Wallet } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { deriveDepartments, grantNeedsAction } from "@/lib/derive";
import { bgDim, hex, statusToColor, textColor } from "@/lib/colors";
import { DeptIcon } from "@/lib/icons";
import {
  formatCompact,
  formatCurrency,
  formatPercent,
  formatSignedCompact,
} from "@/lib/format";
import { Content, Panel, PanelHeader } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { AlertChip, StatusPill } from "@/components/kit/pills";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  const snapshot = await getSnapshot();
  return snapshot.departments.map((d) => ({ slug: d.slug }));
}

export default async function DepartmentPage(
  props: PageProps<"/departments/[slug]">,
) {
  const { slug } = await props.params;
  const snapshot = await getSnapshot();
  const d = deriveDepartments(snapshot).find((dep) => dep.slug === slug);
  if (!d) notFound();

  const rag = statusToColor[d.status];
  const glTotal = d.glLines.reduce((acc, gl) => acc + gl.amount, 0);
  const revenue = snapshot.revenueLines.filter((r) => r.departmentId === d.id);
  const totalRevenue = revenue.reduce((acc, r) => acc + r.ytd, 0);
  const grantsNeedingAction = d.grants.filter(grantNeedsAction).length;
  const kindLabel =
    d.kind === "cost-revenue" ? "Cost & Revenue Centre" : "Cost Centre";

  return (
    <Content>
      <Link
        href="/departments"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All Departments
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border",
            bgDim[d.color],
          )}
        >
          <DeptIcon name={d.icon} className={cn("h-5 w-5", textColor[d.color])} />
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {d.name}
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {kindLabel} · {snapshot.period.fyLabel}
          </p>
        </div>
        <StatusPill status={d.status} />
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          color="gold"
          icon={Wallet}
          label="Annual Budget"
          value={formatCompact(d.annualBudget)}
          meta={`${kindLabel}`}
        />
        <KpiCard
          color="gold"
          icon={TrendingUp}
          label="YTD Actual Spend"
          value={formatCompact(d.ytdActual)}
          meta={`${formatPercent(d.pctSpent)} of annual budget`}
        />
        <KpiCard
          color={d.variance >= 0 ? "green" : "red"}
          icon={Scale}
          label="Variance vs YTD Budget"
          value={formatSignedCompact(d.variance)}
          meta={`YTD budget ${formatCompact(d.ytdBudget)}`}
        />
        <KpiCard
          color={grantsNeedingAction > 0 ? "red" : "gold"}
          icon={Landmark}
          label="Active Grants"
          value={d.grants.length}
          meta={
            grantsNeedingAction > 0
              ? `${grantsNeedingAction} requiring action`
              : "All on track"
          }
        />
      </div>

      {/* Spend progress */}
      <Panel className="mb-6">
        <div className="mb-2.5 flex items-center justify-between text-[13px]">
          <span className="font-medium text-foreground">Budget Utilisation</span>
          <span className={cn("font-mono font-semibold tabular-nums", textColor[rag])}>
            {formatPercent(d.pctSpent)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(d.pctSpent, 1) * 100}%`, background: hex[rag] }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>
            {formatCurrency(d.ytdActual)} spent of {formatCurrency(d.annualBudget)}
          </span>
          <span>
            Month {snapshot.period.monthOfYear} of {snapshot.period.monthsInYear}
          </span>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* GL breakdown */}
        <Panel>
          <PanelHeader
            title="Expenditure by Account"
            subtitle="GENERAL LEDGER · YTD"
          />
          <div className="flex flex-col">
            {d.glLines.map((gl) => (
              <div
                key={gl.code}
                className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
              >
                {/* Click the account, see the postings behind it (B3). */}
                <DrillLink code={gl.code} className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground no-underline hover:text-gold-light">
                  {gl.code}
                </DrillLink>
                <DrillLink code={gl.code} className="flex-1 text-[13px] text-foreground">
                  {gl.account}
                </DrillLink>
                <span
                  className={cn(
                    "font-mono text-[13px] font-medium tabular-nums",
                    gl.flagged ? "text-red" : "text-foreground",
                  )}
                >
                  {formatCurrency(gl.amount)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3">
              <span className="text-[13px] font-semibold text-foreground">
                Total Expenditure YTD
              </span>
              <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                {formatCurrency(glTotal)}
              </span>
            </div>
          </div>
        </Panel>

        {/* Right column: grants + revenue */}
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Active Grants" subtitle="LINKED TO THIS CENTRE" />
            {d.grants.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No grants linked to this department.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {d.grants.map((g) => {
                  const progress = g.total > 0 ? g.spent / g.total : 0;
                  return (
                    <div key={g.id} className="rounded-md border border-border p-3">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="text-[13px] font-medium text-foreground">
                          {g.name}
                        </span>
                        <AlertChip level={g.statusChip.level}>
                          {g.statusChip.label.replace("✓ ", "")}
                        </AlertChip>
                      </div>
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        {g.funder}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${progress * 100}%`,
                            background: hex[d.color],
                          }}
                        />
                      </div>
                      <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
                        <span>{formatCurrency(g.spent)} spent</span>
                        <span>{formatCurrency(g.total)} total</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {d.kind === "cost-revenue" && revenue.length > 0 && (
            <Panel>
              <PanelHeader title="Revenue" subtitle="YTD" />
              <div className="flex flex-col gap-2">
                {revenue.map((r) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground">{r.label}</span>
                    <span className="font-mono text-[13px] font-medium tabular-nums text-green">
                      {formatCurrency(r.ytd)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-[13px] font-semibold text-foreground">
                    Total Revenue YTD
                  </span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-green">
                    {formatCurrency(totalRevenue)}
                  </span>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </Content>
  );
}
