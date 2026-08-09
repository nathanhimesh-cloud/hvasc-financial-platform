"use client";

import { useEffect, useMemo, useState } from "react";
import { spendTrend } from "@/lib/trend";
import {
  Settings2,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Check,
  Filter,
  LayoutGrid,
  BarChart3,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileText,
  Banknote,
  Coins,
  Gauge,
  Building2,
  Percent,
  PiggyBank,
  Activity,
  AlertTriangle,
  Lock,
  LockOpen,
  LifeBuoy,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import type { BrandColor, FinancialSnapshot } from "@/lib/types";
import { deriveDepartments, grantNeedsAction } from "@/lib/derive";
import { assessIntegrity } from "@/lib/integrity";
import { dashboardIssues } from "@/lib/data-quality";
import { DataQualityBadge } from "@/components/kit/data-quality-badge";
import { formatCompact } from "@/lib/format";
import { bgColor } from "@/lib/colors";
import { allGrantFigures, grantSummary } from "@/lib/grants";
import { cashBreakdown, MIN_MONTHS_COVER } from "@/lib/liquidity";
import { grantDependencyRag } from "@/lib/rag";
import { KpiCard } from "@/components/kit/kpi-card";
import { CountUp } from "@/components/kit/count-up";
import { YoY } from "@/components/kit/yoy";
import { OperatingPosition } from "./operating-position";
import { RevenueComposition } from "./revenue-composition";
import { revenueLinesFromAccounts } from "@/lib/revenue-mix";
import { BudgetBarChart } from "./budget-bar-chart";
import { AllocationDonut } from "./allocation-donut";
import { DepartmentTable } from "./department-table";
import { CashPosition } from "./cash-position";
import { GrantMix } from "./grant-mix";
import { cn } from "@/lib/utils";

type Fmt = "compact" | "percent" | "plain" | "decimal";
interface Metric {
  key: string;
  label: string;
  value: number;
  format: Fmt;
  color: BrandColor;
  icon: string;
  meta?: string;
}

const ICONS: Record<string, LucideIcon> = {
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  wallet: Wallet,
  "file-text": FileText,
  banknote: Banknote,
  coins: Coins,
  gauge: Gauge,
  "building-2": Building2,
  percent: Percent,
  "piggy-bank": PiggyBank,
  activity: Activity,
  "alert-triangle": AlertTriangle,
  lock: Lock,
  "lock-open": LockOpen,
  "life-buoy": LifeBuoy,
  hourglass: Hourglass,
};

const WIDGET_IDS = [
  "operating-position",
  "revenue-composition",
  "cash-position",
  "grant-mix",
  "budget-chart",
  "allocation-donut",
  "department-table",
] as const;
const WIDGET_LABELS: Record<string, string> = {
  "operating-position": "Operating Position",
  "revenue-composition": "Revenue Composition — grants, enterprise, interest",
  "cash-position": "Cash Position & Restrictions",
  "grant-mix": "Grant Mix — operating/capital & disaster",
  "budget-chart": "Budget vs Actual — by Department",
  "allocation-donut": "Allocation & Revenue Centres",
  "department-table": "Department Summary",
};
const WIDGET_SPAN: Record<string, string> = {
  "operating-position": "lg:col-span-12",
  "revenue-composition": "lg:col-span-12",
  "cash-position": "lg:col-span-6",
  "grant-mix": "lg:col-span-6",
  "budget-chart": "lg:col-span-7",
  "allocation-donut": "lg:col-span-5",
  "department-table": "lg:col-span-12",
};
const DEFAULT_STATS = ["total-income", "total-expenses", "net-result", "active-grants"];
// v4: adds the cash-position / grant-mix widgets, so old saved orders must re-reconcile.
const STORE = "hv:dashboard:v4";

type Mode = "cumulative" | "monthly";
interface Config {
  stats: string[];
  order: string[];
  hidden: string[];
  periodIdx: number;
  mode: Mode;
  depts: string[] | null; // null = all
}

interface PeriodPoint {
  idx: number;
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
}

/** Metrics that carry a "vs this time last year" line, and which way is good. */
const YOY_KEYS: Record<string, "up" | "down" | "neutral"> = {
  "total-income": "up",
  "total-expenses": "down",
  "net-result": "up",
  "grant-funding": "neutral",
  "revenue-centres": "up",
  "ytd-spend": "neutral",
};

export function DashboardController({
  snapshot,
  prior,
}: {
  snapshot: FinancialSnapshot;
  /** Same-month prior-year values keyed by metric key, + a label. Empty stats = not archived yet. */
  prior?: { label: string; stats: Record<string, number> };
}) {
  const allDepts = useMemo(() => deriveDepartments(snapshot), [snapshot]);
  const allDeptIds = useMemo(() => allDepts.map((d) => d.id), [allDepts]);
  const integrity = useMemo(() => assessIntegrity(snapshot), [snapshot]);

  // Entity-wide figures: the register and the balance sheet aren't department-scoped,
  // so these deliberately ignore the department filter.
  const grantFigs = useMemo(() => allGrantFigures(snapshot), [snapshot]);
  const grantMix = useMemo(() => grantSummary(grantFigs), [grantFigs]);
  const cash = useMemo(() => cashBreakdown(snapshot, grantFigs), [snapshot, grantFigs]);

  // Every caveat on this page, gathered into the one indicator in the toolbar.
  const issues = useMemo(() => dashboardIssues(snapshot, cash, integrity), [snapshot, cash, integrity]);

  const periods: PeriodPoint[] = useMemo(() => {
    const ms = snapshot.monthlyStatements ?? [];
    if (ms.length) return ms.map((s) => ({ idx: s.idx, month: s.month, totalIncome: s.totalIncome, totalExpenses: s.totalExpenses, netResult: s.netResult }));
    const it = snapshot.incomeTotals ?? {
      totalIncome: snapshot.revenueLines.reduce((a, r) => a + r.ytd, 0),
      totalExpenses: snapshot.departments.reduce((a, d) => a + d.ytdActual, 0),
      netResult: 0,
      revenueLines: snapshot.revenueLines,
    };
    return [{ idx: snapshot.period.monthOfYear, month: snapshot.period.label.split(" ")[0], totalIncome: it.totalIncome, totalExpenses: it.totalExpenses, netResult: it.netResult }];
  }, [snapshot]);
  const latestIdx = periods[periods.length - 1]?.idx ?? snapshot.period.monthOfYear;

  const [cfg, setCfg] = useState<Config>({
    stats: DEFAULT_STATS,
    order: [...WIDGET_IDS],
    hidden: [],
    periodIdx: latestIdx,
    mode: "cumulative",
    depts: null,
  });
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"filters" | "stats" | "panels">("filters");

  // Restore saved config, reconciled against the current data.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (!saved) return;
      const p = JSON.parse(saved) as Partial<Config>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCfg((c) => {
        const order = [...(p.order ?? []).filter((id) => WIDGET_IDS.includes(id as never)), ...WIDGET_IDS.filter((id) => !(p.order ?? []).includes(id))];
        return {
          stats: (p.stats ?? c.stats).filter(Boolean),
          order,
          hidden: (p.hidden ?? []).filter((id) => WIDGET_IDS.includes(id as never)),
          periodIdx: periods.some((x) => x.idx === p.periodIdx) ? (p.periodIdx as number) : c.periodIdx,
          mode: p.mode === "monthly" ? "monthly" : "cumulative",
          depts: Array.isArray(p.depts) ? p.depts.filter((id) => allDeptIds.includes(id)) : null,
        };
      });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify(cfg));
  }, [cfg]);

  // ── Apply filters ──────────────────────────────────────────────────────────
  const fin = useMemo(() => {
    const cur = periods.find((p) => p.idx === cfg.periodIdx) ?? periods[periods.length - 1];
    if (cfg.mode === "cumulative") {
      return { income: cur.totalIncome, expenses: cur.totalExpenses, net: cur.netResult, label: `YTD to ${cur.month}` };
    }
    const prior = periods.filter((p) => p.idx < cur.idx).sort((a, b) => b.idx - a.idx)[0];
    if (!prior) return { income: cur.totalIncome, expenses: cur.totalExpenses, net: cur.netResult, label: cur.month };
    return { income: cur.totalIncome - prior.totalIncome, expenses: cur.totalExpenses - prior.totalExpenses, net: cur.netResult - prior.netResult, label: `${cur.month} (month)` };
  }, [periods, cfg.periodIdx, cfg.mode]);

  const depts = cfg.depts ? allDepts.filter((d) => cfg.depts!.includes(d.id)) : allDepts;
  const grants = cfg.depts ? snapshot.grants.filter((g) => cfg.depts!.includes(g.departmentId)) : snapshot.grants;

  const totalBudget = depts.reduce((a, d) => a + d.annualBudget, 0);
  const ytdSpend = depts.reduce((a, d) => a + d.ytdActual, 0);
  const grantTotal = grants.reduce((a, g) => a + g.total, 0);
  const revenue = snapshot.revenueLines.reduce((a, r) => a + r.ytd, 0);
  // Grant dependency (CFO recommendation C2): grants as a share of total revenue.
  const grantRevenue = snapshot.revenueLines.find((r) => r.id === "grants-and-subsidies")?.ytd ?? grantTotal;
  const grantDependency = revenue > 0 ? grantRevenue / revenue : 0;
  const overBudget = depts.filter((d) => d.status === "over-budget").length;
  const surplus = fin.net >= 0;
  const margin = fin.income > 0 ? fin.net / fin.income : 0;
  const spendRate = fin.income > 0 ? fin.expenses / fin.income : 0;
  const { budgetEstimated, trendEstimated, comparisonLabel } = snapshot.period;

  const catalog: Metric[] = [
    { key: "total-income", label: "Total Income", value: fin.income, format: "compact", color: "teal", icon: "trending-up", meta: fin.label },
    { key: "total-expenses", label: "Total Expenses", value: fin.expenses, format: "compact", color: "amber", icon: "trending-down", meta: fin.label },
    { key: "net-result", label: surplus ? "Net Surplus" : "Net Deficit", value: fin.net, format: "compact", color: surplus ? "green" : "red", icon: "wallet", meta: fin.label },
    { key: "active-grants", label: "Active Grants", value: grants.length, format: "plain", color: "gold", icon: "file-text", meta: `${formatCompact(grantTotal)} tracked` },
    { key: "grant-funding", label: "Grant Funding", value: grantTotal, format: "compact", color: "gold", icon: "banknote", meta: `Across ${grants.length} grants` },
    { key: "grant-dependency", label: "Grant Dependency", value: grantDependency, format: "percent", color: grantDependencyRag(grantDependency) === "amber" ? "amber" : "gold", icon: "percent", meta: "Grants ÷ total revenue" },
    { key: "revenue-centres", label: "Revenue Centres (YTD)", value: revenue, format: "compact", color: "teal", icon: "coins", meta: `${snapshot.revenueLines.length} income lines` },
    { key: "ytd-spend", label: "YTD Spend (by function)", value: ytdSpend, format: "compact", color: "amber", icon: "activity", meta: `${depts.length} departments` },
    { key: "total-budget", label: comparisonLabel === "FY25" ? "FY25 Total Spend" : "Total Budget", value: totalBudget, format: "compact", color: "gold", icon: "wallet", meta: comparisonLabel === "FY25" ? "Prior full year" : "Loaded budget" },
    { key: "budget-remaining", label: comparisonLabel === "FY25" ? "Spend vs FY25" : "Budget Remaining", value: totalBudget - ytdSpend, format: "compact", color: "gold", icon: "piggy-bank", meta: comparisonLabel === "FY25" ? "vs prior year" : "vs comparator" },
    { key: "surplus-margin", label: "Surplus Margin", value: margin, format: "percent", color: surplus ? "green" : "red", icon: "percent", meta: "Net ÷ income" },
    { key: "spend-rate", label: "Spend Rate", value: spendRate, format: "percent", color: "amber", icon: "gauge", meta: "Of income spent" },
    { key: "departments", label: "Departments", value: depts.length, format: "plain", color: "blue", icon: "building-2", meta: "Cost & revenue centres" },
    { key: "grants-action", label: "Action Required", value: grants.filter(grantNeedsAction).length, format: "plain", color: grants.filter(grantNeedsAction).length > 0 ? "red" : "green", icon: "alert-triangle", meta: "Reports / acquittals due" },
    { key: "over-budget", label: "Over Budget", value: overBudget, format: "plain", color: overBudget > 0 ? "red" : "green", icon: "alert-triangle", meta: `of ${depts.length} departments` },
    // Liquidity (C1) — bounds, not exact figures, while the register is incomplete.
    { key: "restricted-cash", label: "Restricted Cash", value: cash.restrictedCash, format: "compact", color: "amber", icon: "lock", meta: cash.exact ? "Tied to grant purpose" : "At least · tied to grants" },
    { key: "unrestricted-cash", label: "Unrestricted Cash", value: cash.unrestrictedCash, format: "compact", color: "teal", icon: "lock-open", meta: cash.exact ? "Council may direct" : "At most · Council may direct" },
    { key: "cash-cover", label: "Months of Cover", value: cash.monthsCover ?? 0, format: "decimal", color: cash.belowMinimum ? "red" : "green", icon: "hourglass", meta: `${cash.exact ? "" : "At most · "}min ${MIN_MONTHS_COVER} months` },
    // Grant mix (C2, C6).
    { key: "capital-grants", label: "Capital Grants", value: grantMix.capital.totalGrantIncome, format: "compact", color: "blue", icon: "building-2", meta: `${grantMix.capital.count} grants · fund assets` },
    { key: "operating-grants", label: "Operating Grants", value: grantMix.operating.totalGrantIncome, format: "compact", color: "teal", icon: "coins", meta: `${grantMix.operating.count} grants · fund services` },
    { key: "disaster-funding", label: "Disaster Recovery", value: grantMix.disaster.totalGrantIncome, format: "compact", color: "amber", icon: "life-buoy", meta: `${grantMix.disaster.count} grants · QRA / NDRRA` },
  ];
  const byKey = new Map(catalog.map((m) => [m.key, m]));
  // Cash KPIs need a balance sheet. On an archived P&L-only period there's none, so
  // drop them rather than show $0 / 0.0 months (they stay in the customize catalog).
  const CASH_KEYS = new Set(["restricted-cash", "unrestricted-cash", "cash-cover"]);
  const shownStats = cfg.stats
    .map((k) => byKey.get(k))
    .filter((m): m is Metric => !!m && (cash.available || !CASH_KEYS.has(m.key)));

  // ── Widget nodes (filtered) ─────────────────────────────────────────────────
  // Revenue lines honouring the period + monthly/cumulative filters, so the
  // composition widget shows the same period as the headline figures. Monthly
  // mode diffs each line against the previous checkpoint by id.
  //
  // On the LATEST cumulative view (the default), prefer the per-account chart:
  // the statement's roll-up lines are by directorate, which can't be split into
  // grants / enterprise / interest. Filtered or monthly views fall back to the
  // roll-ups, whose unclassifiable lines land in "Other" by design.
  const revLines = (() => {
    const ms = snapshot.monthlyStatements ?? [];
    const cur = ms.find((s) => s.idx === cfg.periodIdx) ?? ms[ms.length - 1];
    const latestCumulative = cfg.mode !== "monthly" && cfg.periodIdx === latestIdx;
    if (latestCumulative && (snapshot.accounts?.length ?? 0) > 0) {
      return revenueLinesFromAccounts(snapshot.accounts!);
    }
    const base = cur?.revenueLines ?? snapshot.incomeTotals?.revenueLines ?? snapshot.revenueLines;
    if (cfg.mode !== "monthly" || !cur) return base;
    const prev = ms.filter((s) => s.idx < cur.idx).sort((a, b) => b.idx - a.idx)[0];
    if (!prev) return base;
    const prevBy = new Map(prev.revenueLines.map((r) => [r.id, r.ytd]));
    return base.map((r) => ({ ...r, ytd: r.ytd - (prevBy.get(r.id) ?? 0) }));
  })();

  const allocation = depts.map((d) => ({ department: d, share: totalBudget > 0 ? d.annualBudget / totalBudget : 0 }));
  const widgetNode: Record<string, React.ReactNode> = {
    "operating-position": <OperatingPosition totalIncome={fin.income} totalExpenses={fin.expenses} netResult={fin.net} periodLabel={fin.label} />,
    "revenue-composition": <RevenueComposition lines={revLines} totalIncome={fin.income} periodLabel={fin.label} />,
    "cash-position": <CashPosition cash={cash} periodLabel={snapshot.period.label} />,
    "grant-mix": <GrantMix summary={grantMix} periodLabel={snapshot.period.label} />,
    "budget-chart": <BudgetBarChart departments={depts} monthlySpend={snapshot.monthlySpend} trend={spendTrend(snapshot)} monthLabel={`Month ${snapshot.period.monthOfYear}`} budgetEstimated={budgetEstimated} trendEstimated={trendEstimated} comparisonLabel={comparisonLabel} />,
    "allocation-donut": <AllocationDonut allocation={allocation} totalBudget={totalBudget} revenueLines={snapshot.revenueLines} totalRevenue={snapshot.incomeTotals?.totalIncome ?? revenue} budgetEstimated={budgetEstimated} comparisonLabel={comparisonLabel} />,
    "department-table": <DepartmentTable departments={depts} periodLabel={snapshot.period.label} comparisonLabel={comparisonLabel} totalExpenses={cfg.depts === null ? snapshot.incomeTotals?.totalExpenses : undefined} />,
  };
  const visibleWidgets = cfg.order.filter((id) => !cfg.hidden.includes(id));

  // ── Mutators ────────────────────────────────────────────────────────────────
  const set = (patch: Partial<Config>) => setCfg((c) => ({ ...c, ...patch }));
  const toggleStat = (k: string) => setCfg((c) => ({ ...c, stats: c.stats.includes(k) ? c.stats.filter((x) => x !== k) : [...c.stats, k] }));
  const toggleWidget = (id: string) => setCfg((c) => ({ ...c, hidden: c.hidden.includes(id) ? c.hidden.filter((x) => x !== id) : [...c.hidden, id] }));
  const moveWidget = (id: string, dir: -1 | 1) =>
    setCfg((c) => {
      const i = c.order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.order.length) return c;
      const order = [...c.order];
      [order[i], order[j]] = [order[j], order[i]];
      return { ...c, order };
    });
  const toggleDept = (id: string) =>
    setCfg((c) => {
      const cur = c.depts ?? allDeptIds;
      let next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (next.length === 0) next = allDeptIds;
      return { ...c, depts: next.length === allDeptIds.length ? null : next };
    });
  const reset = () => setCfg({ stats: DEFAULT_STATS, order: [...WIDGET_IDS], hidden: [], periodIdx: latestIdx, mode: "cumulative", depts: null });

  const filtered = cfg.depts !== null || cfg.periodIdx !== latestIdx || cfg.mode !== "cumulative";

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <DataQualityBadge issues={issues} />
        {filtered && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold-dim px-2.5 py-0.5 font-mono text-[10px] text-gold-light">
            <Filter className="h-3 w-3" strokeWidth={2} />
            {fin.label}
            {cfg.depts !== null && ` · ${depts.length}/${allDeptIds.length} depts`}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
            editing ? "border-gold/40 bg-gold-dim text-gold-light" : "border-border bg-elevated text-muted-foreground hover:text-foreground",
          )}
        >
          <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          {editing ? "Done" : "Customize"}
        </button>
      </div>

      {/* Single editor with tabs */}
      {editing && (
        <div className="mb-5 animate-in fade-in slide-in-from-top-2 rounded-lg border border-border bg-card duration-300">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex gap-1">
              <EditorTab active={tab === "filters"} onClick={() => setTab("filters")} icon={Filter} label="Filters" />
              <EditorTab active={tab === "stats"} onClick={() => setTab("stats")} icon={BarChart3} label="Stats" />
              <EditorTab active={tab === "panels"} onClick={() => setTab("panels")} icon={LayoutGrid} label="Panels" />
            </div>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground">
              <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
              Reset all
            </button>
          </div>

          <div className="p-4">
            {tab === "filters" && (
              <div className="flex flex-col gap-5">
                {/* Time period */}
                <section className="flex flex-col gap-3">
                  <SectionTitle icon={CalendarRange} title="Time period" hint="Income, expenses & net result" />
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <select
                        value={cfg.periodIdx}
                        onChange={(e) => set({ periodIdx: Number(e.target.value) })}
                        className="h-9 rounded-md border border-border bg-elevated pl-3 pr-8 text-[13px] font-medium text-foreground outline-none transition-colors focus:border-gold/40"
                      >
                        {periods.map((p) => (
                          <option key={p.idx} value={p.idx}>
                            {p.month}
                            {p.idx === latestIdx ? " (latest)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex h-9 items-center rounded-md border border-border bg-elevated/40 p-1">
                      {(["cumulative", "monthly"] as Mode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => set({ mode: m })}
                          className={cn(
                            "h-full rounded px-3 text-[12px] font-medium transition-colors",
                            cfg.mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {m === "cumulative" ? "Cumulative" : "This month"}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <div className="h-px bg-border" />

                {/* Departments */}
                <section className="flex flex-col gap-3">
                  <SectionTitle
                    icon={Building2}
                    title="Departments"
                    hint="Budget panels & department stats"
                    right={
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-border bg-elevated px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {depts.length}/{allDeptIds.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => set({ depts: null })}
                          disabled={cfg.depts === null}
                          className="font-mono text-[10px] uppercase tracking-[0.06em] text-gold-light transition-colors hover:text-gold disabled:cursor-not-allowed disabled:text-muted-foreground/40"
                        >
                          Select all
                        </button>
                      </div>
                    }
                  />
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {allDepts.map((d) => {
                      const on = cfg.depts === null || cfg.depts.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleDept(d.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[12px] transition-colors",
                            on ? "border-gold/40 bg-gold-dim text-foreground" : "border-border bg-elevated/40 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", bgColor[d.color], !on && "opacity-30")} />
                          <span className="flex-1 truncate">{d.name}</span>
                          {on && <Check className="h-3.5 w-3.5 flex-shrink-0 text-gold-light" strokeWidth={2.25} />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {tab === "stats" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {catalog.map((m) => {
                  const on = cfg.stats.includes(m.key);
                  const Icon = ICONS[m.icon] ?? Activity;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleStat(m.key)}
                      className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[12px] transition-colors", on ? "border-gold/40 bg-gold-dim text-foreground" : "border-border bg-elevated/40 text-muted-foreground hover:text-foreground")}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
                      <span className="flex-1 truncate">{m.label}</span>
                      {on && <Check className="h-3.5 w-3.5 flex-shrink-0 text-gold-light" strokeWidth={2.25} />}
                    </button>
                  );
                })}
              </div>
            )}

            {tab === "panels" && (
              <div className="flex flex-col gap-1.5">
                {cfg.order.map((id, i) => {
                  const isHidden = cfg.hidden.includes(id);
                  return (
                    <div key={id} className={cn("flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2 text-[13px]", isHidden && "opacity-50")}>
                      <span className="flex-1 truncate text-foreground">{WIDGET_LABELS[id]}</span>
                      <div className="flex items-center gap-0.5">
                        <IconBtn label="Move up" disabled={i === 0} onClick={() => moveWidget(id, -1)}>
                          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                        </IconBtn>
                        <IconBtn label="Move down" disabled={i === cfg.order.length - 1} onClick={() => moveWidget(id, 1)}>
                          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                        </IconBtn>
                        <IconBtn label={isHidden ? "Show" : "Hide"} onClick={() => toggleWidget(id)}>
                          {isHidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
                        </IconBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {shownStats.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shownStats.map((m, i) => {
            // "vs this time last year" — only in the default council-wide YTD view,
            // where the same-month prior figure is a like-for-like comparison.
            const showYoY = prior && !filtered && m.key in YOY_KEYS;
            const meta = showYoY ? (
              <span className="flex flex-col gap-0.5">
                {m.meta && <span>{m.meta}</span>}
                <YoY now={m.value} then={prior!.stats[m.key]} good={YOY_KEYS[m.key]} suffix={prior!.label} />
              </span>
            ) : (
              m.meta
            );
            return (
              <KpiCard key={m.key} color={m.color} icon={ICONS[m.icon] ?? Activity} label={m.label} value={<CountUp value={m.value} format={m.format} />} meta={meta} delay={i * 70} />
            );
          })}
        </div>
      )}

      {/* Panels */}
      {visibleWidgets.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card/40 px-6 py-10 text-center text-[13px] text-muted-foreground">
          All panels hidden — open <span className="text-foreground">Customize dashboard → Panels</span> to bring some back.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {visibleWidgets.map((id, i) => (
            <div key={id} style={{ animationDelay: `${i * 90}ms` }} className={cn("animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out", WIDGET_SPAN[id])}>
              {widgetNode[id]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  hint,
  right,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 flex-shrink-0 text-gold" strokeWidth={1.75} />
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        {hint && <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">· {hint}</span>}
      </div>
      {right}
    </div>
  );
}

function EditorTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors", active ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="rounded p-1 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30">
      {children}
    </button>
  );
}
