import type { FinancialSnapshot, BalanceSheet, CashFlow } from "@/lib/types";

export type Rows = string[][];
export type ReportKind =
  | "byFunction"
  | "income"
  | "grants"
  | "revenue"
  | "listByAccount"
  | "balanceSheet"
  | "cashFlow"
  | null;

export interface BuildInput {
  byFunction: Rows;
  income?: Rows;
  grants?: Rows;
  fy25ByFunction?: Rows | null;
  monthly?: { idx: number; label: string; rows: Rows }[];
}

export function classifyRows(rows: Rows): ReportKind;
export function buildSnapshot(input: BuildInput): FinancialSnapshot;
export function parseBalanceSheet(rows: Rows): BalanceSheet;
export function parseCashFlow(rows: Rows): CashFlow;
export function detectFyMonth(name: string): { idx: number; label: string } | null;
export const FUNCTIONS: { name: string; icon: string; color: string }[];
export function money(s: unknown): number;
export function cell(row: Rows[number], i: number): string;
