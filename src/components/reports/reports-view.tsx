"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Scale,
  Banknote,
  TrendingUp,
  TrendingDown,
  Wallet,
  Lock,
  Table,
  Receipt,
  ArrowRight,
  AlertOctagon,
} from "lucide-react";
import type { BrandColor, BalanceSheet, CashFlow, Transaction, DailySpendPoint, PriorYear } from "@/lib/types";
import type { IntegrityReport } from "@/lib/integrity";
import type { BudgetReportData } from "@/lib/budget-report";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { IntegrityBanner } from "@/components/kit/integrity-banner";
import { DataStamp } from "@/components/kit/data-stamp";
import { PrintButton } from "@/components/kit/print-button";
import { TrendBars } from "@/components/kit/trend-bars";
import { DrillLink } from "@/components/kit/drill-link";
import { MultiPeriod } from "./multi-period";
import { RevenueVsBudget } from "./revenue-vs-budget";
import { RevenueMixTrend } from "./revenue-mix-trend";
import { OperatingResultTrend } from "./operating-result-trend";
import type { RevenueTrend } from "@/lib/revenue-trend";
import type { SpendTrend } from "@/lib/trend";
import { BudgetVsActual } from "./budget-vs-actual";
import { TransactionsView, type TransactionFilters } from "./transactions-view";
import { bgDim, textColor } from "@/lib/colors";
import { DeptIcon } from "@/lib/icons";
import {
  formatCompact,
  formatCurrency,
  formatPercent,
  formatSignedCompact,
  financialYearOf,
} from "@/lib/format";
import { budgetRag, ragText } from "@/lib/rag";
import { cn } from "@/lib/utils";

export interface ReportPeriod {
  idx: number;
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
  revenueLines: { id: string; label: string; ytd: number }[];
}

export interface ReportDept {
  id: string;
  name: string;
  color: BrandColor;
  icon: string;
  ytdActual: number;
  ytdBudget: number;
  annualBudget: number;
  /** What this department ACTUALLY spent last year, in full. */
  priorYearActual?: number;
}

type Statement = "pnl" | "budget" | "balance" | "cashflow" | "transactions";
type Mode = "cumulative" | "monthly" | "quarter" | "year";

export function ReportsView({
  fyLabel,
  monthOfYear,
  monthsInYear,
  comparisonLabel,
  periods,
  departments,
  trend,
  revenue,
  priorYear,
  balanceSheet,
  cashFlow,
  integrity,
  generatedAt,
  source,
  budgetData,
  transactions,
  transactionTotal,
  dailySpend,
  ledger,
}: {
  fyLabel: string;
  monthOfYear: number;
  monthsInYear: number;
  comparisonLabel: string;
  periods: ReportPeriod[];
  departments: ReportDept[];
  /** What to plot: months once there are enough, days before that. */
  trend: SpendTrend | null;
  /** B6 — cumulative revenue against the (straight-lined) budget. */
  revenue?: RevenueTrend;
  /** Last COMPLETE financial year, for the year-on-year comparison. */
  priorYear?: PriorYear;
  balanceSheet?: BalanceSheet;
  cashFlow?: CashFlow;
  integrity: IntegrityReport;
  generatedAt?: string;
  source?: string;
  budgetData?: BudgetReportData;
  transactions: Transaction[];
  /** Total rows in the ledger for this FY (may exceed the page we loaded). */
  transactionTotal?: number;
  dailySpend: DailySpendPoint[];
  /** Present when the Postgres ledger filtered these rows server-side (B1). */
  ledger?: {
    serverFiltered: boolean;
    filters: TransactionFilters;
    totals?: { debit: number; credit: number };
    preservedParams: Record<string, string>;
  };
}) {
  const latestIdx = periods.length ? periods[periods.length - 1].idx : monthOfYear;
  const [statement, setStatement] = useState<Statement>("pnl");
  const [selectedIdx, setSelectedIdx] = useState<number>(latestIdx);
  const [mode, setMode] = useState<Mode>("cumulative");

  const byIdx = useMemo(() => new Map(periods.map((p) => [p.idx, p])), [periods]);
  const current = byIdx.get(selectedIdx) ?? periods[periods.length - 1];
  const priorIdxs = periods.filter((p) => p.idx < selectedIdx).map((p) => p.idx);
  const prior = priorIdxs.length ? byIdx.get(Math.max(...priorIdxs)) : undefined;

  const isLatestYtd = selectedIdx === latestIdx && mode === "cumulative";
  const totalDeptYtd = departments.reduce((a, d) => a + d.ytdActual, 0);

  /*
    EVERY PERIOD TYPE IS A SUBTRACTION (Build Brief B1: "a month, a quarter,
    year-to-date, or a custom from–to range").

    The snapshot stores CUMULATIVE year-to-date checkpoints, one per month. So any
    period is the difference between two of them — pick the right baseline and the
    arithmetic is the same every time:

        Year to date   baseline = nothing (the year's start)
        This month     baseline = the month before
        This quarter   baseline = the month before the quarter began
        Full year      baseline = nothing, and jump to the last month posted

    The Australian FY starts in July, so quarters are months 1–3, 4–6, 7–9, 10–12 —
    NOT calendar quarters. Q1 is Jul–Sep. Getting that wrong would silently report
    the wrong three months, and every figure would still look plausible.
  */
  const baseline = useMemo(() => {
    if (mode === "cumulative" || mode === "year") return undefined;
    if (mode === "monthly") return prior;
    // quarter: the checkpoint at the month before this quarter started.
    const qStart = Math.floor((selectedIdx - 1) / 3) * 3 + 1;
    if (qStart <= 1) return undefined; // Q1 starts at the year's start — nothing to subtract
    return byIdx.get(qStart - 1);
  }, [mode, prior, selectedIdx, byIdx]);

  const figures = useMemo(() => {
    if (!baseline) {
      return {
        totalIncome: current.totalIncome,
        totalExpenses: current.totalExpenses,
        netResult: current.netResult,
        revenueLines: current.revenueLines.map((r) => ({ ...r, value: r.ytd })),
      };
    }
    const was = (id: string) => baseline.revenueLines.find((r) => r.id === id)?.ytd ?? 0;
    return {
      totalIncome: current.totalIncome - baseline.totalIncome,
      totalExpenses: current.totalExpenses - baseline.totalExpenses,
      netResult: current.netResult - baseline.netResult,
      revenueLines: current.revenueLines.map((r) => ({ ...r, value: r.ytd - was(r.id) })),
    };
  }, [current, baseline]);

  // Prior-period figures (for the KPI deltas) in the same mode.
  const priorFigures = useMemo(() => {
    if (!prior) return null;
    if (mode === "cumulative") {
      return { totalIncome: prior.totalIncome, totalExpenses: prior.totalExpenses, netResult: prior.netResult };
    }
    const before = periods.filter((p) => p.idx < prior.idx).map((p) => p.idx);
    const beforeP = before.length ? byIdx.get(Math.max(...before)) : undefined;
    if (!beforeP) return { totalIncome: prior.totalIncome, totalExpenses: prior.totalExpenses, netResult: prior.netResult };
    return {
      totalIncome: prior.totalIncome - beforeP.totalIncome,
      totalExpenses: prior.totalExpenses - beforeP.totalExpenses,
      netResult: prior.netResult - beforeP.netResult,
    };
  }, [prior, mode, periods, byIdx]);

  // Per-department expense breakdown. Real at latest-YTD; otherwise allocated
  // from the council expense total by each department's YTD share (estimated).
  // How many months this view actually spans — the department comparison is
  // pro-rated on it, so getting it wrong makes every department look wrong.
  const monthsCovered =
    mode === "monthly" ? 1
    : mode === "quarter" ? selectedIdx - (Math.floor((selectedIdx - 1) / 3) * 3)
    : selectedIdx;
  const deptRows = useMemo(() => {
    return departments
      .map((d) => {
        const share = totalDeptYtd > 0 ? d.ytdActual / totalDeptYtd : 0;
        const actual = isLatestYtd ? d.ytdActual : figures.totalExpenses * share;
        const fy25 = (d.annualBudget * monthsCovered) / monthsInYear; // pro-rata comparison
        return {
          ...d,
          actual,
          comparison: fy25,
          variance: fy25 - actual,
          pct: fy25 > 0 ? actual / fy25 : 0,
        };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [departments, figures.totalExpenses, isLatestYtd, totalDeptYtd, monthsCovered, monthsInYear]);

  const estimated = !isLatestYtd; // breakdown is allocated, not real, for past periods

  // Full-year budgeted operating result (revenue budget − expense budget), summed
  // from the loaded budget. Undefined when no budget is loaded, so the operating-
  // result chart simply omits its budget-pace line rather than inventing one.
  const annualBudgetNet = useMemo(() => {
    if (!budgetData) return undefined;
    let rev = 0, exp = 0;
    for (const g of budgetData.groups) {
      for (const leaf of g.leaves) {
        if (leaf.kind === "revenue") rev += leaf.budget;
        else exp += leaf.budget;
      }
    }
    return rev - exp;
  }, [budgetData]);

  const QUARTER = ["Q1 (Jul-Sep)", "Q2 (Oct-Dec)", "Q3 (Jan-Mar)", "Q4 (Apr-Jun)"];
  const periodName =
    mode === "monthly" ? current.month
    : mode === "quarter" ? `${QUARTER[Math.floor((selectedIdx - 1) / 3)]} to ${current.month}`
    : mode === "year" ? `${fyLabel} full year`
    : `YTD to ${current.month}`;
  const deltaPct = (now: number, was: number) => (was !== 0 ? (now - was) / Math.abs(was) : 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/*
        THE ONE LINE THAT CANNOT BE HIDDEN.

        The build brief is unambiguous about this: "If any check fails, show a clear
        red banner ('This report did not pass its accuracy checks') and a short
        reason, and don't present it as final. This single feature is the most
        important thing in the whole build — it is what makes the client trust us."

        Nathan asked for the checks to move into an icon, and he was right: four
        items of red across the top of every report is a lecture, and people stop
        reading lectures. But hiding the failure ENTIRELY would mean a statement
        that doesn't reconcile could be read, printed and believed with nothing
        saying otherwise. That is the exact failure the brief exists to prevent.

        So: the DETAIL lives behind the icon. The VERDICT stays on the page — one
        line, unmissable, and it says the figures are a draft. When everything
        passes, this renders nothing at all.
      */}
      {integrity.status === "fail" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-red/40 bg-red/[0.07] px-3.5 py-2.5">
          <AlertOctagon className="h-4 w-4 flex-shrink-0 text-red" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-red">
            This report did not pass its accuracy checks
          </span>
          <span className="text-[12px] text-muted-foreground">
            — {integrity.failedCount} of {integrity.checkedCount} failed. Figures are a{" "}
            <span className="text-red">draft, not reconciled</span>. Open the{" "}
            <span className="text-foreground">ⓘ</span> above for the reason.
          </span>
        </div>
      )}

      {/* The full detail is still PRINTED, so a statement that failed its checks can
          never leave the building looking clean. */}
      <div className="hidden print:block">
        <IntegrityBanner report={integrity} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <DataStamp generatedAt={generatedAt} periodLabel={periodName} fyLabel={fyLabel} source={source} />
        <PrintButton />
      </div>

      {/* Statement tabs */}
      <div className="no-print flex flex-wrap items-center gap-1 border-b border-border pb-px">
        <StatementTab active={statement === "pnl"} onClick={() => setStatement("pnl")} icon={FileText} label="Profit & Loss" />
        <StatementTab active={statement === "budget"} onClick={() => setStatement("budget")} icon={Table} label="Budget vs Actual" soon={!budgetData} />
        <StatementTab active={statement === "balance"} onClick={() => setStatement("balance")} icon={Scale} label="Balance Sheet" soon={!balanceSheet} />
        <StatementTab active={statement === "cashflow"} onClick={() => setStatement("cashflow")} icon={Banknote} label="Cashflow" soon={!cashFlow} />
        {/* With the ledger on, an empty result may just mean the filter matched nothing. */}
        <StatementTab active={statement === "transactions"} onClick={() => setStatement("transactions")} icon={Receipt} label="Transactions" soon={!transactions.length && !ledger?.serverFiltered} />
      </div>

      {statement === "budget" ? (
        budgetData ? <BudgetVsActual data={budgetData} /> : <ComingSoon statement="balance" />
      ) : statement === "balance" ? (
        balanceSheet ? <BalanceSheetView bs={balanceSheet} fyLabel={fyLabel} generatedAt={generatedAt} /> : <ComingSoon statement="balance" />
      ) : statement === "cashflow" ? (
        cashFlow ? <CashFlowView cf={cashFlow} fyLabel={fyLabel} /> : <ComingSoon statement="cashflow" />
      ) : statement === "transactions" ? (
        <TransactionsView
          transactions={transactions}
          transactionTotal={transactionTotal}
          dailySpend={dailySpend}
          fyLabel={fyLabel}
          serverFiltered={ledger?.serverFiltered}
          filters={ledger?.filters}
          ledgerTotals={ledger?.totals}
          preservedParams={ledger?.preservedParams}
        />
      ) : (
        <>
          {/* Filter bar */}
          <Panel className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Period">
                <select
                  value={selectedIdx}
                  onChange={(e) => setSelectedIdx(Number(e.target.value))}
                  className="rounded-md border border-border bg-elevated px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-gold/40"
                >
                  {periods.map((p) => (
                    <option key={p.idx} value={p.idx}>
                      {p.month}
                      {p.idx === latestIdx ? "  (latest)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="View">
                <div className="flex rounded-md border border-border bg-elevated/40 p-0.5">
                  {(["cumulative", "monthly", "quarter", "year"] as Mode[]).map((m) => {
                    // A period type you cannot compute is offered disabled, not hidden:
                    // a control that vanishes reads as a missing feature.
                    const noPrior = !prior;
                    const disabled =
                      (m === "monthly" && noPrior) ||
                      (m === "quarter" && noPrior);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m);
                          // "Full year" means the whole year, so go to the last month posted.
                          if (m === "year") setSelectedIdx(latestIdx);
                        }}
                        disabled={disabled}
                        title={disabled ? "Needs more than one month of data" : undefined}
                        className={cn(
                          "rounded px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m === "cumulative" ? "YTD"
                          : m === "monthly" ? "Month"
                          : m === "quarter" ? "Quarter"
                          : "Full year"}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {fyLabel} · {periodName}
            </div>
          </Panel>

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              color="teal"
              icon={TrendingUp}
              label="Total Income"
              value={formatCompact(figures.totalIncome)}
              meta={
                priorFigures ? (
                  <DeltaMeta pct={deltaPct(figures.totalIncome, priorFigures.totalIncome)} good="up" priorName={prior?.month} mode={mode} />
                ) : (
                  periodName
                )
              }
            />
            <KpiCard
              color="amber"
              icon={TrendingDown}
              label="Total Expenses"
              value={formatCompact(figures.totalExpenses)}
              meta={
                priorFigures ? (
                  <DeltaMeta pct={deltaPct(figures.totalExpenses, priorFigures.totalExpenses)} good="down" priorName={prior?.month} mode={mode} />
                ) : (
                  periodName
                )
              }
            />
            <KpiCard
              color={figures.netResult >= 0 ? "green" : "red"}
              icon={Wallet}
              label="Net Result"
              value={formatSignedCompact(figures.netResult)}
              meta={`${formatPercent(figures.totalIncome > 0 ? figures.netResult / figures.totalIncome : 0)} of income`}
            />
          </div>

          {/* P&L statement */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
            {/* Income */}
            <Panel>
              <PanelHeader title="Income" subtitle={`Revenue lines · ${periodName}`} />
              <StatementRows
                rows={figures.revenueLines
                  .filter((r) => Math.abs(r.value) > 0.5)
                  .sort((a, b) => b.value - a.value)
                  .map((r) => ({ label: r.label, value: r.value }))}
                total={{ label: "Total Income", value: figures.totalIncome }}
                tone="pos"
              />
            </Panel>

            {/*
              YEAR ON YEAR — replacing a panel that said nothing.

              This slot used to hold a "Result" card showing Total Income, Total
              Expenses and Net Result. Those are the three KPI cards directly above
              it. The same three numbers, twice, in the same viewport — the second
              time adding no information at all, just taking up the space where a
              comparison should have been.

              A budget is a plan. Last year is EVIDENCE. Comparing the Council to
              what it actually did is the question a CFO asks first, and it was the
              one thing this page couldn't answer.
            */}
            <Panel className="flex flex-col">
              <PanelHeader
                title="Year on year"
                subtitle={priorYear ? `${fyLabel} vs ${priorYear.fyLabel} · full year` : "Prior year"}
              />
              {priorYear ? (
                <div className="flex flex-1 flex-col justify-center">
                  <YoYRow
                    label="Income"
                    now={figures.totalIncome}
                    then={priorYear.income}
                    good="up"
                  />
                  <YoYRow
                    label="Expenses"
                    now={figures.totalExpenses}
                    then={priorYear.expenses}
                    good="down"
                  />
                  <div className="my-1.5 border-t border-border" />
                  <YoYRow
                    label="Net result"
                    now={figures.netResult}
                    then={priorYear.netResult}
                    good="up"
                    big
                  />
                  <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {priorYear.fyLabel} is a FULL year; {fyLabel} is {periodName}. Early in a year the
                    gap is the year itself, not a change in performance.
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-[12px] text-muted-foreground">
                  No prior year in this snapshot yet.
                </p>
              )}
            </Panel>
          </div>

          {/* Expenses by department */}
          <Panel>
            <PanelHeader
              title="Expenses by Department"
              subtitle={estimated ? "Estimated allocation" : "Analysis by function (Note 3a)"}
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {[
                      { label: "Department", align: "left" },
                      { label: estimated ? "Allocated *" : "Actual", align: "right" },
                      { label: comparisonLabel === "FY25" ? "FY25 (pro-rata)" : "Budget", align: "right" },
                      { label: "Variance", align: "right" },
                      { label: "% of comp.", align: "right" },
                      // A budget is a plan. Last year is evidence. Micah asked for both.
                      { label: "Last year (full)", align: "right" },
                    ].map((h, i) => (
                      <th
                        key={i}
                        className={cn(
                          "border-b border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-3.5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#dce8f0]",
                          h.align === "right" ? "text-right" : "text-left",
                        )}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map((d) => (
                    <tr key={d.id} className="hover:bg-[rgba(255,255,255,0.03)]">
                      <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3 text-[13px]">
                        <div className="flex items-center gap-2.5 font-medium text-foreground">
                          <span className={cn("flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-border", bgDim[d.color])}>
                            <DeptIcon name={d.icon} className={cn("h-3.5 w-3.5", textColor[d.color])} />
                          </span>
                          {d.name}
                        </div>
                      </td>
                      <Num>{formatCurrency(d.actual)}</Num>
                      <Num muted>{formatCurrency(d.comparison)}</Num>
                      <Num tone={d.variance >= 0 ? "pos" : "neg"}>{formatSignedCompact(d.variance)}</Num>
                      <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3 text-right">
                        <span className={cn("font-mono text-[13px] font-bold tabular-nums", ragText[budgetRag(d.pct)])}>
                          {formatPercent(d.pct)}
                        </span>
                      </td>
                      <Num muted>{d.priorYearActual ? formatCurrency(d.priorYearActual) : "—"}</Num>
                    </tr>
                  ))}
                  {/* Expenses not yet mapped to a department, so the Actual column
                      ties to the Total Expenses headline (same as the dashboard). */}
                  {(() => {
                    const deptActualSum = deptRows.reduce((a, d) => a + d.actual, 0);
                    const unassigned = figures.totalExpenses - deptActualSum;
                    return Math.abs(unassigned) >= 1 ? (
                      <tr className="hover:bg-[rgba(255,255,255,0.03)]">
                        <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3 text-[13px]">
                          <span className="flex items-center gap-2.5 text-muted-foreground">
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-border text-[11px]">
                              —
                            </span>
                            Unassigned
                            <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground/70">
                              not yet mapped
                            </span>
                          </span>
                        </td>
                        <Num>{formatCurrency(unassigned)}</Num>
                        <Num muted>—</Num>
                        <Num muted>—</Num>
                        <td />
                        <Num muted>—</Num>
                      </tr>
                    ) : null;
                  })()}
                  <tr className="font-semibold">
                    <td className="px-3.5 py-3 text-[13px] text-foreground">Total Expenses</td>
                    <Num>{formatCurrency(figures.totalExpenses)}</Num>
                    <Num muted>{formatCurrency(deptRows.reduce((a, d) => a + d.comparison, 0))}</Num>
                    <Num tone={deptRows.reduce((a, d) => a + d.variance, 0) >= 0 ? "pos" : "neg"}>
                      {formatSignedCompact(deptRows.reduce((a, d) => a + d.variance, 0))}
                    </Num>
                    <td />
                    <Num muted>
                      {deptRows.some((d) => d.priorYearActual)
                        ? formatCurrency(deptRows.reduce((a, d) => a + (d.priorYearActual ?? 0), 0))
                        : "—"}
                    </Num>
                  </tr>
                </tbody>
              </table>
            </div>
            {estimated && (
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                * Estimated — allocated from the council total by YTD share.
              </p>
            )}
          </Panel>

          {/* Spend trend. Falls back to a DAILY series early in the year, when
              a monthly chart would be a single bar and not a trend at all. */}
          {trend && (
            <Panel>
              <PanelHeader
                title={trend.granularity === "day" ? "Daily Expense Trend" : "Monthly Expense Trend"}
                subtitle={trend.subtitle}
              />
              <TrendBars
                data={trend.points}
                highlight={trend.highlight}
                labelEvery={trend.labelEvery}
              />
            </Panel>
          )}

          {/* B6 — the other half of the trend: what came IN, against what was meant to. */}
          {revenue && (
            <RevenueVsBudget points={revenue.points} annualBudget={revenue.annualBudget} />
          )}

          {/* B6 (#51) — the operating result itself, month by month vs budget pace. */}
          <OperatingResultTrend
            periods={periods.map((p) => ({ idx: p.idx, month: p.month, netResult: p.netResult }))}
            annualBudgetNet={annualBudgetNet}
            monthsInYear={monthsInYear}
          />

          {/* B6 (#53) — grants vs own-source revenue over time. */}
          <RevenueMixTrend
            periods={periods.map((p) => ({ month: p.month, totalIncome: p.totalIncome, revenueLines: p.revenueLines }))}
          />

          {/* B1 — months side by side. The shape of the year, which no single-period
              view can show. */}
          <MultiPeriod periods={periods} />
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function StatementTab({
  active,
  onClick,
  icon: Icon,
  label,
  soon,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soon}
      className={cn(
        "relative inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
        active
          ? "border-gold text-foreground"
          : soon
            ? "cursor-not-allowed border-transparent text-muted-foreground/50"
            : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {label}
      {soon && (
        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-elevated px-1.5 py-px font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Lock className="h-2.5 w-2.5" strokeWidth={2} />
          Soon
        </span>
      )}
    </button>
  );
}

function ComingSoon({ statement }: { statement: Statement }) {
  const label = statement === "balance" ? "Balance Sheet" : "Statement of Cash Flows";
  const source = statement === "balance" ? "Statement of Financial Position" : "Statement of Cash Flows";
  return (
    <Panel className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-elevated">
        {statement === "balance" ? <Scale className="h-6 w-6 text-muted-foreground" /> : <Banknote className="h-6 w-6 text-muted-foreground" />}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{label} — coming soon</p>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          This statement isn&apos;t built yet because the data isn&apos;t captured. Upload the Practical{" "}
          <span className="text-foreground">{source}</span> export on the Data tab — once it&apos;s parsed,
          this view turns on automatically and joins the full statement pack.
        </p>
      </div>
    </Panel>
  );
}

// ── Balance Sheet ────────────────────────────────────────────────────────────
function StatementBlock({
  label,
  lines,
  totalLabel,
  total,
}: {
  label?: string;
  /** `code` and `priorYear` are optional — a cash-flow line has neither. */
  lines: { label: string; amount: number; code?: string; priorYear?: number }[];
  totalLabel: string;
  total: number;
}) {
  // A balance sheet is supposed to have a prior-year column. Now that the feed
  // carries last year's close per line, show it — but only when it's actually
  // there, so a cash-flow statement (which has no such thing) doesn't grow an
  // empty column.
  const hasPrior = lines.some((l) => l.priorYear !== undefined);

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </span>
          {hasPrior && (
            <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
              last year
            </span>
          )}
        </div>
      )}
      {lines.map((l, i) => (
        <div key={i} className="flex items-center justify-between gap-3 border-b border-border py-2 text-[13px] last:border-0">
          {/* Click the line, see the postings behind it (B3). Only where we have a
              GL code — a rolled-up cash-flow line has no single account to drill to. */}
          {l.code ? (
            <DrillLink code={l.code} className="text-foreground">
              {l.label}
            </DrillLink>
          ) : (
            <span className="text-foreground">{l.label}</span>
          )}
          <span className="flex items-baseline gap-4">
            {hasPrior && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {l.priorYear !== undefined ? formatCompact(l.priorYear) : "—"}
              </span>
            )}
            <span className={cn("font-mono tabular-nums", l.amount < 0 ? "text-red" : "text-foreground")}>
              {formatCurrency(l.amount)}
            </span>
          </span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
        <span className="text-[13px] font-medium text-foreground">{totalLabel}</span>
        <span className={cn("font-mono text-[13px] font-semibold tabular-nums", total < 0 ? "text-red" : "text-foreground")}>
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

function GrandTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-3 flex items-center justify-between border-t-2 border-[rgba(255,255,255,0.16)] pt-3">
      <span className="text-[14px] font-semibold text-foreground">{label}</span>
      <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{formatCurrency(value)}</span>
    </div>
  );
}

/** Returns the statement's own FY if it doesn't match the reporting year (else null). */
function fyMismatch(asAt: string | undefined, currentFy: string): string | null {
  const stmtFy = financialYearOf(asAt);
  if (!stmtFy) return null;
  const norm = (s: string) => s.replace(/[–—]/g, "-").toUpperCase();
  return norm(stmtFy) === norm(currentFy) ? null : stmtFy;
}

/** Amber note when a statement belongs to a different financial year than the report. */
function StatementYearNote({ statementFy, currentFy, kind }: { statementFy: string; currentFy: string; kind: string }) {
  return (
    <div className="rounded-lg border border-amber/40 bg-amber/10 px-4 py-2.5 text-[12px] text-amber">
      This {kind} is from <span className="font-semibold">{statementFy}</span> (prior year). A current-year
      {" "}(<span className="font-semibold">{currentFy}</span>) statement hasn&apos;t been loaded yet — the
      figures below are last year&apos;s, shown for reference only.
    </div>
  );
}

function BalanceSheetView({
  bs,
  fyLabel,
  generatedAt,
}: {
  bs: BalanceSheet;
  fyLabel: string;
  generatedAt?: string;
}) {
  const mismatch = fyMismatch(bs.asAt, fyLabel);
  const syncedAt = generatedAt
    ? new Date(generatedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <>
      {mismatch && <StatementYearNote statementFy={mismatch} currentFy={fyLabel} kind="Balance Sheet" />}

      {/*
        POINT-IN-TIME, AND HONEST ABOUT IT.

        An independent reviewer compared this balance sheet to live Practical and found
        variances on high-churn control accounts (payables, payroll). The cause wasn't a
        fault — it was that the balance sheet is a snapshot as at the last sync, while
        those accounts move by millions within a month. Rather than let that be
        rediscovered as a "bug" each time, the page states it. The line-by-line check
        that Practical's balances actually tie to its transactions runs every sync and
        shows on the accuracy banner above.
      */}
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-elevated/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <Scale className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span>
          Point-in-time{syncedAt ? <> — as at <span className="text-foreground">{syncedAt}</span></> : ""}. Control
          accounts move within the month, so a line checked against Practical at another moment can
          differ — timing, not error.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard color="teal" icon={Scale} label="Total Assets" value={formatCompact(bs.totalAssets)} meta={bs.asAt ? `as at ${bs.asAt}` : fyLabel} />
        <KpiCard color="amber" icon={TrendingDown} label="Total Liabilities" value={formatCompact(bs.totalLiabilities)} meta="owed by council" />
        <KpiCard color="green" icon={Wallet} label="Net Community Assets" value={formatCompact(bs.netCommunityAssets)} meta="assets − liabilities" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Assets" subtitle="What the council owns" />
          <StatementBlock label={bs.currentAssets.label} lines={bs.currentAssets.lines} totalLabel="Total current assets" total={bs.currentAssets.total} />
          <div className="h-4" />
          <StatementBlock label={bs.nonCurrentAssets.label} lines={bs.nonCurrentAssets.lines} totalLabel="Total non-current assets" total={bs.nonCurrentAssets.total} />
          <GrandTotal label="Total Assets" value={bs.totalAssets} />
        </Panel>
        <Panel>
          <PanelHeader title="Liabilities & Equity" subtitle="What it owes + community equity" />
          <StatementBlock label={bs.currentLiabilities.label} lines={bs.currentLiabilities.lines} totalLabel="Total current liabilities" total={bs.currentLiabilities.total} />
          <div className="h-4" />
          <StatementBlock label={bs.nonCurrentLiabilities.label} lines={bs.nonCurrentLiabilities.lines} totalLabel="Total non-current liabilities" total={bs.nonCurrentLiabilities.total} />
          <GrandTotal label="Total Liabilities" value={bs.totalLiabilities} />
          <div className="h-5" />
          <StatementBlock label={bs.equity.label} lines={bs.equity.lines} totalLabel="Total community equity" total={bs.totalEquity} />
        </Panel>
      </div>
    </>
  );
}

// ── Cash Flow ──────────────────────────────────────────────────────────────
function CashFlowView({ cf, fyLabel }: { cf: CashFlow; fyLabel: string }) {
  const mismatch = fyMismatch(cf.asAt, fyLabel);
  return (
    <>
      {mismatch && <StatementYearNote statementFy={mismatch} currentFy={fyLabel} kind="Cash Flow" />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard color={cf.operating.net >= 0 ? "green" : "red"} icon={TrendingUp} label="Operating Cash" value={formatSignedCompact(cf.operating.net)} meta="from operations" />
        <KpiCard color="blue" icon={Banknote} label="Investing Cash" value={formatSignedCompact(cf.investing.net)} meta="capital movement" />
        <KpiCard color={cf.cashEnd >= 0 ? "teal" : "red"} icon={Wallet} label="Cash at Period End" value={formatCompact(cf.cashEnd)} meta={`net change ${formatSignedCompact(cf.netChange)}`} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Operating" subtitle={`Activities · ${fyLabel}`} />
          <StatementBlock lines={cf.operating.lines} totalLabel="Net operating cash" total={cf.operating.net} />
        </Panel>
        <Panel>
          <PanelHeader title="Investing" subtitle="Activities" />
          <StatementBlock lines={cf.investing.lines} totalLabel="Net investing cash" total={cf.investing.net} />
        </Panel>
        <Panel>
          <PanelHeader title="Financing" subtitle="Activities" />
          <StatementBlock lines={cf.financing.lines.length ? cf.financing.lines : [{ label: "No financing activity", amount: 0 }]} totalLabel="Net financing cash" total={cf.financing.net} />
        </Panel>
      </div>
      <Panel>
        <PanelHeader title="Cash Position" subtitle="Movement over the period" />
        <div className="flex flex-col gap-3">
          <SummaryLine label="Net increase/(decrease) in cash" value={formatSignedCompact(cf.netChange)} tone={cf.netChange >= 0 ? "pos" : "neg"} />
          <SummaryLine label="Cash at beginning of period" value={formatCurrency(cf.cashStart)} tone="pos" />
          <div className="my-1 border-t border-border" />
          <SummaryLine label="Cash at end of period" value={formatCurrency(cf.cashEnd)} tone="pos" big />
        </div>
      </Panel>
    </>
  );
}

function DeltaMeta({
  pct,
  good,
  priorName,
  mode,
}: {
  pct: number;
  good: "up" | "down";
  priorName?: string;
  mode: Mode;
}) {
  const positive = pct >= 0;
  const isGood = good === "up" ? positive : !positive;
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("font-mono text-[11px] font-semibold", isGood ? "text-green" : "text-red")}>
        {positive ? "▲" : "▼"} {formatPercent(Math.abs(pct))}
      </span>
      <span className="text-[11px] text-muted-foreground">
        vs {mode === "monthly" ? priorName : `YTD ${priorName}`}
      </span>
    </span>
  );
}

function StatementRows({
  rows,
  total,
  tone,
}: {
  rows: { label: string; value: number }[];
  total: { label: string; value: number };
  tone: "pos" | "neg";
}) {
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between border-b border-border py-2.5 text-[13px] last:border-0">
          <span className="text-foreground">{r.label}</span>
          <span className={cn("font-mono tabular-nums", tone === "pos" ? "text-green" : "text-foreground")}>
            {formatCurrency(r.value)}
          </span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
        <span className="text-[13px] font-semibold text-foreground">{total.label}</span>
        <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground">
          {formatCurrency(total.value)}
        </span>
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg";
  big?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-foreground", big ? "text-[15px] font-semibold" : "text-[13px]")}>{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          big ? "text-[22px] font-semibold" : "text-[14px]",
          tone === "pos" ? "text-green" : "text-red",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Num({
  children,
  tone,
  muted,
}: {
  children: React.ReactNode;
  tone?: "pos" | "neg";
  muted?: boolean;
}) {
  return (
    <td className="border-b border-[rgba(255,255,255,0.04)] px-3.5 py-3 text-right">
      <span
        className={cn(
          "font-mono text-[13px] tabular-nums",
          tone === "pos" && "font-semibold text-green",
          tone === "neg" && "font-semibold text-red",
          !tone && (muted ? "text-muted-foreground" : "text-foreground"),
        )}
      >
        {children}
      </span>
    </td>
  );
}


/**
 * One year-on-year line: this year, last year, and the change.
 *
 * `good` says which direction is the good one, because "expenses up 8%" and
 * "income up 8%" are not the same news and a chart that colours them the same is
 * lying by omission.
 */
function YoYRow({
  label,
  now,
  then,
  good,
  big,
}: {
  label: string;
  now: number;
  then: number;
  good: "up" | "down";
  big?: boolean;
}) {
  // A percentage change off a near-zero base is noise, not information.
  const pct = Math.abs(then) > 1 ? ((now - then) / Math.abs(then)) * 100 : null;
  const up = now >= then;
  const isGood = good === "up" ? up : !up;

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={cn("text-muted-foreground", big ? "text-[13px] font-medium" : "text-[12px]")}>
        {label}
      </span>
      <span className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatCompact(then)}
        </span>
        <ArrowRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
        <span
          className={cn(
            "font-mono tabular-nums",
            big ? "text-[16px] font-semibold" : "text-[13px]",
            "text-foreground",
          )}
        >
          {formatSignedCompact(now)}
        </span>
        <span
          className={cn(
            "w-[4.5rem] text-right font-mono text-[11px] tabular-nums",
            pct === null ? "text-muted-foreground" : isGood ? "text-green" : "text-red",
          )}
        >
          {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}
        </span>
      </span>
    </div>
  );
}
