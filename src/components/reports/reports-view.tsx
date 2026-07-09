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
} from "lucide-react";
import type { BrandColor, BalanceSheet, CashFlow, Transaction, DailySpendPoint } from "@/lib/types";
import type { IntegrityReport } from "@/lib/integrity";
import type { BudgetReportData } from "@/lib/budget-report";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { KpiCard } from "@/components/kit/kpi-card";
import { IntegrityBanner } from "@/components/kit/integrity-banner";
import { DataStamp } from "@/components/kit/data-stamp";
import { PrintButton } from "@/components/kit/print-button";
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
}

type Statement = "pnl" | "budget" | "balance" | "cashflow" | "transactions";
type Mode = "cumulative" | "monthly";

export function ReportsView({
  fyLabel,
  monthOfYear,
  monthsInYear,
  comparisonLabel,
  periods,
  departments,
  monthlySpend,
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
  monthlySpend: { month: string; amount: number }[];
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

  // Figures for the selected period + mode. In "monthly" mode we difference the
  // cumulative checkpoint against the previous one to isolate that month.
  const diffLine = (line: { id: string; label: string; ytd: number }) => {
    if (mode === "cumulative" || !prior) return line.ytd;
    const was = prior.revenueLines.find((r) => r.id === line.id)?.ytd ?? 0;
    return line.ytd - was;
  };
  const figures = useMemo(() => {
    if (mode === "cumulative" || !prior) {
      return {
        totalIncome: current.totalIncome,
        totalExpenses: current.totalExpenses,
        netResult: current.netResult,
        revenueLines: current.revenueLines.map((r) => ({ ...r, value: r.ytd })),
      };
    }
    return {
      totalIncome: current.totalIncome - prior.totalIncome,
      totalExpenses: current.totalExpenses - prior.totalExpenses,
      netResult: current.netResult - prior.netResult,
      revenueLines: current.revenueLines.map((r) => ({ ...r, value: diffLine(r) })),
    };
  }, [current, prior, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const monthsCovered = mode === "monthly" ? 1 : selectedIdx;
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

  const periodName = mode === "monthly" ? current.month : `YTD to ${current.month}`;
  const deltaPct = (now: number, was: number) => (was !== 0 ? (now - was) / Math.abs(was) : 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* Provenance stamp + reconciliation status (Brief A1 + A4) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <DataStamp generatedAt={generatedAt} periodLabel={periodName} fyLabel={fyLabel} source={source} />
          <PrintButton />
        </div>
        <IntegrityBanner report={integrity} />
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
        balanceSheet ? <BalanceSheetView bs={balanceSheet} fyLabel={fyLabel} /> : <ComingSoon statement="balance" />
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
                  {(["cumulative", "monthly"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      disabled={m === "monthly" && !prior}
                      className={cn(
                        "rounded px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m === "cumulative" ? "Cumulative (YTD)" : "This month only"}
                    </button>
                  ))}
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

            {/* Net result summary */}
            <Panel className="flex flex-col">
              <PanelHeader title="Result" subtitle={`Council P&L · ${periodName}`} />
              <div className="flex flex-1 flex-col justify-center gap-3">
                <SummaryLine label="Total Income" value={formatCurrency(figures.totalIncome)} tone="pos" />
                <SummaryLine label="Total Expenses" value={`(${formatCurrency(figures.totalExpenses)})`} tone="neg" />
                <div className="my-1 border-t border-border" />
                <SummaryLine
                  label="Net Result"
                  value={formatSignedCompact(figures.netResult)}
                  tone={figures.netResult >= 0 ? "pos" : "neg"}
                  big
                />
              </div>
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
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="px-3.5 py-3 text-[13px] text-foreground">Total Expenses</td>
                    <Num>{formatCurrency(deptRows.reduce((a, d) => a + d.actual, 0))}</Num>
                    <Num muted>{formatCurrency(deptRows.reduce((a, d) => a + d.comparison, 0))}</Num>
                    <Num tone={deptRows.reduce((a, d) => a + d.variance, 0) >= 0 ? "pos" : "neg"}>
                      {formatSignedCompact(deptRows.reduce((a, d) => a + d.variance, 0))}
                    </Num>
                    <td />
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

          {/* Monthly expense trend */}
          <Panel>
            <PanelHeader title="Monthly Expense Trend" subtitle="COUNCIL-WIDE · PER MONTH" />
            <TrendBars data={monthlySpend} highlight={current.month} />
          </Panel>
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
  lines: { label: string; amount: number }[];
  totalLabel: string;
  total: number;
}) {
  return (
    <div>
      {label && (
        <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </div>
      )}
      {lines.map((l, i) => (
        <div key={i} className="flex items-center justify-between border-b border-border py-2 text-[13px] last:border-0">
          <span className="text-foreground">{l.label}</span>
          <span className={cn("font-mono tabular-nums", l.amount < 0 ? "text-red" : "text-foreground")}>
            {formatCurrency(l.amount)}
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

function BalanceSheetView({ bs, fyLabel }: { bs: BalanceSheet; fyLabel: string }) {
  const mismatch = fyMismatch(bs.asAt, fyLabel);
  return (
    <>
      {mismatch && <StatementYearNote statementFy={mismatch} currentFy={fyLabel} kind="Balance Sheet" />}
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

function TrendBars({ data, highlight }: { data: { month: string; amount: number }[]; highlight: string }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: 140 }}>
      {data.map((d) => {
        const h = Math.max((d.amount / max) * 100, 2);
        const isHi = d.month === highlight;
        return (
          <div key={d.month} className="group flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <div
                className={cn("w-full rounded-t transition-colors", isHi ? "bg-gold" : "bg-elevated group-hover:bg-[#2a2a2a]")}
                style={{ height: `${h}%` }}
                title={`${d.month}: ${formatCompact(d.amount)}`}
              />
            </div>
            <span className={cn("font-mono text-[9px]", isHi ? "text-gold-light" : "text-muted-foreground")}>{d.month}</span>
          </div>
        );
      })}
    </div>
  );
}
