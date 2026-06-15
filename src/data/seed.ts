import type {
  Department,
  FinancialSnapshot,
  Grant,
  MonthlySpend,
  ReportingPeriod,
  RevenueLine,
} from "@/lib/types";

/**
 * Seed data mirroring the original demo
 * (HopeVale_Financial_Intelligence_Platform_DEMO.html).
 *
 * Figures are illustrative only. They are replaced by live Practical data
 * once the CSV / ODBC adapter is wired in (see src/lib/data).
 */

export const period: ReportingPeriod = {
  label: "March 2026",
  fyLabel: "FY2025–26",
  monthOfYear: 9,
  monthsInYear: 12,
  live: false,
  budgetEstimated: false,
  comparisonLabel: "Budget",
  trendEstimated: false,
};

export const departments: Department[] = [
  {
    id: "water",
    slug: "water",
    name: "Water Infrastructure",
    icon: "droplets",
    color: "teal",
    kind: "cost-revenue",
    annualBudget: 1_640_000,
    ytdActual: 882_000,
    ytdBudget: 1_025_000,
    status: "on-track",
    glLines: [
      { code: "4100", account: "Salaries & Wages", amount: 312_400 },
      { code: "4210", account: "Plant & Equipment", amount: 198_600 },
      { code: "4320", account: "Maintenance & Repairs", amount: 224_800 },
      { code: "4410", account: "Chemicals & Materials", amount: 146_200 },
    ],
  },
  {
    id: "roads",
    slug: "roads",
    name: "Roads & Infrastructure",
    icon: "route",
    color: "blue",
    kind: "cost",
    annualBudget: 1_350_000,
    ytdActual: 1_228_000,
    ytdBudget: 843_750,
    status: "at-risk",
    glLines: [
      { code: "5100", account: "Salaries & Wages", amount: 398_200 },
      { code: "5210", account: "Contractor Costs", amount: 487_600, flagged: true },
      { code: "5320", account: "Materials & Gravel", amount: 242_100 },
      { code: "5410", account: "Plant Hire", amount: 100_100 },
    ],
  },
  {
    id: "storage",
    slug: "storage",
    name: "Storage Infrastructure",
    icon: "warehouse",
    color: "indigo",
    kind: "cost-revenue",
    annualBudget: 960_000,
    ytdActual: 528_000,
    ytdBudget: 600_000,
    status: "on-track",
    glLines: [
      { code: "6100", account: "Salaries & Wages", amount: 188_400 },
      { code: "6210", account: "Construction Works", amount: 210_600 },
      { code: "6320", account: "Maintenance", amount: 88_400 },
      { code: "6410", account: "Utilities", amount: 40_600 },
    ],
  },
  {
    id: "childcare",
    slug: "childcare",
    name: "Child Care Services",
    icon: "baby",
    color: "violet",
    kind: "cost-revenue",
    annualBudget: 870_000,
    ytdActual: 922_000,
    ytdBudget: 543_750,
    status: "over-budget",
    glLines: [
      { code: "7100", account: "Salaries & Wages", amount: 502_800, flagged: true },
      { code: "7210", account: "Program Supplies", amount: 198_400 },
      { code: "7320", account: "Facility Costs", amount: 142_600 },
      { code: "7410", account: "Transport", amount: 78_200 },
    ],
  },
];

export const grants: Grant[] = [
  {
    id: "atsic-water",
    name: "ATSIC Water Access Fund",
    funder: "STATE GOVERNMENT",
    departmentId: "water",
    total: 480_000,
    spent: 412_000,
    reportDue: { label: "⚠ 15 Apr", level: "urgent" },
    acquittal: { label: "30 Jun 2026", level: "muted" },
    status: "report-due",
    statusChip: { label: "REPORT DUE", level: "urgent" },
  },
  {
    id: "roads-to-recovery",
    name: "Roads to Recovery Prog",
    funder: "FEDERAL GOVERNMENT",
    departmentId: "roads",
    total: 650_000,
    spent: 610_000,
    reportDue: { label: "⚠ OVERDUE", level: "urgent" },
    acquittal: { label: "⚡ 30 Apr", level: "warning" },
    status: "overdue",
    statusChip: { label: "OVERDUE", level: "urgent" },
  },
  {
    id: "indigenous-childcare",
    name: "Indigenous Childcare Initiative",
    funder: "QLD GOVERNMENT",
    departmentId: "childcare",
    total: 320_000,
    spent: 198_000,
    reportDue: { label: "⚡ 1 May", level: "warning" },
    acquittal: { label: "31 Aug 2026", level: "muted" },
    status: "report-due",
    statusChip: { label: "REPORT DUE", level: "warning" },
  },
  {
    id: "remote-infrastructure",
    name: "Remote Infrastructure Fund",
    funder: "FEDERAL GOVERNMENT",
    departmentId: "storage",
    total: 410_000,
    spent: 180_000,
    reportDue: { label: "1 Jul 2026", level: "muted" },
    acquittal: { label: "30 Sep 2026", level: "muted" },
    status: "on-track",
    statusChip: { label: "✓ ON TRACK", level: "ok" },
  },
  {
    id: "water-safety",
    name: "Community Water Safety Grant",
    funder: "QLD GOVERNMENT",
    departmentId: "water",
    total: 145_000,
    spent: 82_000,
    reportDue: { label: "15 Jun 2026", level: "muted" },
    acquittal: { label: "31 Jul 2026", level: "muted" },
    status: "on-track",
    statusChip: { label: "✓ ON TRACK", level: "ok" },
  },
  {
    id: "cape-york-boost",
    name: "Cape York Infrastructure Boost",
    funder: "QLD GOVERNMENT",
    departmentId: "roads",
    total: 220_000,
    spent: 0,
    reportDue: { label: "1 Sep 2026", level: "muted" },
    acquittal: { label: "31 Dec 2026", level: "muted" },
    status: "not-started",
    statusChip: { label: "✓ NOT STARTED", level: "ok" },
  },
  {
    id: "early-childhood",
    name: "Early Childhood Development",
    funder: "FEDERAL GOVERNMENT",
    departmentId: "childcare",
    total: 85_000,
    spent: 0,
    reportDue: { label: "1 Oct 2026", level: "muted" },
    acquittal: { label: "31 Jan 2027", level: "muted" },
    status: "not-started",
    statusChip: { label: "✓ NOT STARTED", level: "ok" },
  },
];

export const revenueLines: RevenueLine[] = [
  { id: "water-charges", label: "Water Charges", departmentId: "water", ytd: 284_200 },
  { id: "childcare-fees", label: "Childcare Fees", departmentId: "childcare", ytd: 91_500 },
  { id: "storage-leases", label: "Storage Leases", departmentId: "storage", ytd: 44_800 },
];

// Monthly council-wide spend, Jul → Mar. Sums to $3,560,000 — exactly the
// total YTD actual across the four departments (882 + 1,228 + 528 + 922 K),
// so the trend line reconciles with the department bars.
export const monthlySpend: MonthlySpend[] = [
  { month: "Jul", amount: 345_000 },
  { month: "Aug", amount: 360_000 },
  { month: "Sep", amount: 375_000 },
  { month: "Oct", amount: 385_000 },
  { month: "Nov", amount: 400_000 },
  { month: "Dec", amount: 405_000 },
  { month: "Jan", amount: 415_000 },
  { month: "Feb", amount: 425_000 },
  { month: "Mar", amount: 450_000 },
];

export const seedSnapshot: FinancialSnapshot = {
  period,
  departments,
  grants,
  revenueLines,
  monthlySpend,
};
