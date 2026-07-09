import type { DepartmentStatus } from "@/lib/types";

/**
 * Red / amber / green thresholds (CFO recommendation C5 — presentation discipline).
 *
 * These were previously magic numbers repeated across four components, which
 * meant the same ratio could be amber on one screen and green on another. Every
 * RAG decision in the platform now resolves here, so a threshold is changed once
 * and the whole platform agrees.
 *
 * The three measures are deliberately NOT on the same scale — a grant is *meant*
 * to be fully spent, whereas a department spending its whole budget early is a
 * warning — so they get separate, named thresholds rather than one shared rule.
 */

export type Rag = "green" | "amber" | "red";

// ── Budget consumption: actual ÷ budget ──────────────────────────────────────
/** Above budget by more than this → over budget. */
export const BUDGET_OVER = 1.05;
/** At or over budget, but within the tolerance above → at risk. */
export const BUDGET_AT_RISK = 1.0;

export function budgetRag(ratio: number): Rag {
  if (ratio > BUDGET_OVER) return "red";
  if (ratio > BUDGET_AT_RISK) return "amber";
  return "green";
}

export function budgetStatus(ratio: number): DepartmentStatus {
  const rag = budgetRag(ratio);
  return rag === "red" ? "over-budget" : rag === "amber" ? "at-risk" : "on-track";
}

// ── Grant utilisation: spent ÷ grant value ───────────────────────────────────
/**
 * Spending more than the grant is a compliance problem, so anything past 100%
 * is red. The small tolerance absorbs floating-point noise on a fully-drawn
 * grant (0.999999… should not read as an overspend).
 */
export const GRANT_OVERSPENT = 1.001;
/** Approaching full expenditure — fine, but worth watching against the end date. */
export const GRANT_NEARLY_SPENT = 0.9;

export function grantUtilisationRag(utilisation: number): Rag {
  if (utilisation > GRANT_OVERSPENT) return "red";
  if (utilisation > GRANT_NEARLY_SPENT) return "amber";
  return "green";
}

// ── Grant dependency: grant revenue ÷ total revenue ──────────────────────────
/**
 * Hope Vale is structurally grant-dependent, so this flags concentration risk
 * rather than a failure. Amber only — there is no "red" the Council could act on
 * in-year, and a red tile people can't act on becomes a tile people ignore.
 */
export const GRANT_DEPENDENCY_HIGH = 0.75;

export function grantDependencyRag(ratio: number): Rag {
  return ratio > GRANT_DEPENDENCY_HIGH ? "amber" : "green";
}

/** Tailwind text colour for a RAG value. */
export const ragText: Record<Rag, string> = {
  green: "text-green",
  amber: "text-amber",
  red: "text-red",
};
