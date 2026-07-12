import type { FinancialSnapshot } from "@/lib/types";
import { deriveDepartments } from "@/lib/derive";
import { assessIntegrity, type IntegrityReport } from "@/lib/integrity";
import { allGrantFigures, grantSummary, type GrantFigures, type GrantSummary } from "@/lib/grants";
import { cashBreakdown, type CashBreakdown } from "@/lib/liquidity";
import { budgetRag, type Rag } from "@/lib/rag";

/**
 * Monthly management report (engagement letter, Schedule 1: "Monthly management
 * report templates for distribution to department managers and senior
 * leadership"; managed-service tiers: "Four department monthly reports … to the
 * CFO").
 *
 * This assembles the report model from a single snapshot — no new data source.
 * Two shapes:
 *   - "consolidated"  → the CFO / senior-leadership pack (whole council)
 *   - a department id → that department manager's pack
 *
 * It is a pure function so the same model drives the on-screen view and the
 * print/PDF. Nothing here fetches or mutates.
 */

export type ReportScope = "consolidated" | string;

export interface ReportLine {
  label: string;
  budget: number;
  actual: number;
  variance: number;
  /** actual ÷ budget-to-date. */
  utilisation: number;
  rag: Rag;
}

export interface MonthlyReport {
  scope: ReportScope;
  title: string;
  subtitle: string;
  periodLabel: string;
  fyLabel: string;
  monthOfYear: number;
  monthsInYear: number;
  generatedAt?: string;
  comparisonLabel: string;
  /** True when comparators are a real budget, not prior-year actuals. */
  hasBudget: boolean;

  // Headline figures.
  income: number;
  expenses: number;
  netResult: number;
  surplus: boolean;

  // Budget position (whole council, or the one department).
  annualBudget: number;
  ytdBudget: number;
  ytdActual: number;
  variance: number;
  utilisation: number;

  /** Per-department rows (consolidated) or per-GL-line rows (department). */
  lines: ReportLine[];
  linesLabel: string;

  grants: GrantSummary | null;
  grantRows: GrantFigures[];
  cash: CashBreakdown | null;
  integrity: IntegrityReport | null;

  /** Plain-language notes: caveats a reader should see. */
  notes: string[];
}

function line(label: string, budget: number, actual: number, ytdBudget: number): ReportLine {
  const varToDate = ytdBudget - actual;
  const util = ytdBudget > 0 ? actual / ytdBudget : 0;
  return { label, budget, actual, variance: varToDate, utilisation: util, rag: budgetRag(util) };
}

export function buildMonthlyReport(snapshot: FinancialSnapshot, scope: ReportScope): MonthlyReport {
  const depts = deriveDepartments(snapshot);
  const { period } = snapshot;
  const hasBudget = (snapshot.period.comparisonLabel ?? "Budget") === "Budget";
  const comparisonLabel = snapshot.period.comparisonLabel ?? "Budget";

  const grantFigs = allGrantFigures(snapshot);
  const notes: string[] = [];
  if (period.monthOfYear <= 2) {
    notes.push(
      `This report covers month ${period.monthOfYear} of the financial year. Year-to-date figures are small and can read negative where June year-end accruals are being reversed — this is expected, not an error.`,
    );
  }
  if (!hasBudget) {
    notes.push(
      "No FY budget is loaded in Practical, so 'budget' columns compare against the prior year's actuals.",
    );
  }
  if ((snapshot.meta?.unmappedAccounts ?? 0) > 0) {
    notes.push(
      `${snapshot.meta?.unmappedAccounts} GL account(s) carry money but aren't assigned to a department, so department totals may understate slightly.`,
    );
  }

  if (scope === "consolidated") {
    const annualBudget = depts.reduce((a, d) => a + d.annualBudget, 0);
    const ytdBudget = depts.reduce((a, d) => a + d.ytdBudget, 0);
    const ytdActual = depts.reduce((a, d) => a + d.ytdActual, 0);
    const lines = depts.map((d) => line(d.name, d.annualBudget, d.ytdActual, d.ytdBudget));

    return {
      scope,
      title: "Monthly Management Report",
      subtitle: "Consolidated — CFO & Senior Leadership",
      periodLabel: period.label,
      fyLabel: period.fyLabel,
      monthOfYear: period.monthOfYear,
      monthsInYear: period.monthsInYear,
      generatedAt: snapshot.meta?.generatedAt,
      comparisonLabel,
      hasBudget,
      income: snapshot.incomeTotals?.totalIncome ?? 0,
      expenses: snapshot.incomeTotals?.totalExpenses ?? 0,
      netResult: snapshot.incomeTotals?.netResult ?? 0,
      surplus: (snapshot.incomeTotals?.netResult ?? 0) >= 0,
      annualBudget,
      ytdBudget,
      ytdActual,
      variance: ytdBudget - ytdActual,
      utilisation: ytdBudget > 0 ? ytdActual / ytdBudget : 0,
      lines,
      linesLabel: "Department performance",
      grants: grantSummary(grantFigs),
      grantRows: grantFigs.filter((g) => g.entry.active).slice(0, 12),
      cash: cashBreakdown(snapshot, grantFigs),
      integrity: assessIntegrity(snapshot),
      notes,
    };
  }

  // Single department.
  const d = depts.find((x) => x.id === scope || x.slug === scope);
  if (!d) {
    // Unknown department → fall back to a minimal consolidated so we never crash.
    return buildMonthlyReport(snapshot, "consolidated");
  }

  // Department GL lines as report lines. The snapshot carries the department's
  // top expense lines; budget isn't split per line, so we show actuals with the
  // department's overall RAG rather than inventing per-line budgets.
  const glLines: ReportLine[] = d.glLines.map((g) => ({
    label: `${g.code}  ${g.account}`,
    budget: 0,
    actual: g.amount,
    variance: 0,
    utilisation: 0,
    rag: "green" as Rag,
  }));

  const deptGrants = grantFigs.filter((g) => {
    // Match a grant to this department via its live GL grant rows.
    return snapshot.grants.some((sg) => sg.departmentId === d.id && sg.id === g.entry.id);
  });

  return {
    scope,
    title: "Monthly Management Report",
    subtitle: d.name,
    periodLabel: period.label,
    fyLabel: period.fyLabel,
    monthOfYear: period.monthOfYear,
    monthsInYear: period.monthsInYear,
    generatedAt: snapshot.meta?.generatedAt,
    comparisonLabel,
    hasBudget,
    income: d.grants.reduce((a, g) => a + g.total, 0),
    expenses: d.ytdActual,
    netResult: -d.ytdActual,
    surplus: false,
    annualBudget: d.annualBudget,
    ytdBudget: d.ytdBudget,
    ytdActual: d.ytdActual,
    variance: d.ytdBudget - d.ytdActual,
    utilisation: d.ytdBudget > 0 ? d.ytdActual / d.ytdBudget : 0,
    lines: glLines,
    linesLabel: "Largest expenditure lines",
    grants: null,
    grantRows: deptGrants,
    cash: null,
    integrity: null,
    notes,
  };
}

/** The report scopes available for a snapshot: consolidated + each department. */
export function reportScopes(snapshot: FinancialSnapshot): { id: ReportScope; label: string }[] {
  return [
    { id: "consolidated", label: "Consolidated (CFO)" },
    ...snapshot.departments.map((d) => ({ id: d.id, label: d.name })),
  ];
}
