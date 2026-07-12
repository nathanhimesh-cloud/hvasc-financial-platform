import type { FinancialSnapshot } from "@/lib/types";
import { cashBreakdown } from "@/lib/liquidity";
import { allGrantFigures } from "@/lib/grants";

/**
 * Queensland statutory financial sustainability ratios (Build Brief B8).
 *
 * Framework: Financial Management (Sustainability) Guideline 2024 — it replaced
 * the old three ratios, and groups councils into 8 tiers by remoteness and
 * population, with a separate category for Indigenous councils. Each tier has
 * DIFFERENT benchmarks.
 *
 * HOPE VALE IS **TIER 8**. Confirmed from the Council's own audited FY2025
 * Current-year Financial Sustainability Statement (Annual Report 2025), which
 * states "Target (Tier 8)" against every measure.
 *
 * The single most important rule here:
 *
 *   ► The OPERATING SURPLUS RATIO is **CONTEXTUAL** for Tier 8 — it has NO
 *     benchmark. Hope Vale is not held to a target on it. We report the value
 *     and NEVER red-flag it. Inventing a benchmark would tell the CEO they are
 *     failing a test they are not sitting.
 *
 * The Leverage Ratio is omitted because Hope Vale holds no debt — which the
 * platform independently corroborates: the Cash Flow's financing section is
 * empty. The Guideline requires a minimum of 8 and maximum of 9 ratios; a
 * council with no borrowings reports one fewer.
 *
 * Their published FY2025 actuals, used to validate this engine:
 *   Operating surplus ratio           23.20%   (contextual — no target)
 *   Operating cash ratio              45.72%   target > 0%
 *   Unrestricted cash expense cover   46.11 months  target > 4 months
 *   Asset sustainability ratio        41.72%   target > 90%
 *   Asset consumption ratio           59.18%   target > 60%
 *   Council-controlled revenue         3.23%   contextual
 *   Population growth                  2.19%   contextual
 */

export const COUNCIL_TIER = 8;

export type RatioStatus = "pass" | "fail" | "contextual" | "unavailable";

export interface Ratio {
  id: string;
  group: "Operating Performance" | "Liquidity" | "Asset Management" | "Financial Capacity";
  label: string;
  /** Plain-language: what this tells the CEO. */
  meaning: string;
  /** How it's calculated, in words. */
  formula: string;
  /** The value, or null when we can't compute it yet. */
  value: number | null;
  /** "percent" | "months" */
  unit: "percent" | "months";
  /** The Tier 8 benchmark, or null when the measure is contextual (no target). */
  target: number | null;
  /** Human-readable target, e.g. "Greater than 4 months". */
  targetLabel: string;
  status: RatioStatus;
  /** Why we can't compute it, when status is "unavailable". */
  blockedReason?: string;
  /** Hope Vale's audited FY2025 figure, for reference. */
  audited2025?: number;
}

function statusFor(value: number | null, target: number | null, blocked?: string): RatioStatus {
  if (blocked) return "unavailable";
  if (value === null) return "unavailable";
  if (target === null) return "contextual"; // Tier 8: no benchmark → never flag
  return value >= target ? "pass" : "fail";
}

export interface RatioReport {
  tier: number;
  ratios: Ratio[];
  /** Ratios we could actually compute. */
  computed: number;
  /** Ratios failing their benchmark (contextual ones never count). */
  failing: number;
  /** True when the feed doesn't carry the statutory inputs yet. */
  needsResync: boolean;
}

export function assessRatios(snapshot: FinancialSnapshot): RatioReport {
  const s = snapshot.statutory;
  const needsResync = !s;

  const grantFigs = allGrantFigures(snapshot);
  const cash = cashBreakdown(snapshot, grantFigs);

  const opRev = s?.operatingRevenue ?? null;
  const opExp = s?.operatingExpenses ?? null;
  const dep = s?.depreciation ?? null;
  const opCash = s?.operatingCashFlow ?? null;

  // 1. Operating surplus ratio = (operating revenue − operating expenses) ÷ operating revenue
  const opSurplus = opRev && opRev !== 0 && opExp !== null ? ((opRev - opExp) / opRev) * 100 : null;

  // 2. Operating cash ratio = net operating cash flow ÷ operating revenue
  const opCashRatio = opRev && opRev !== 0 && opCash !== null ? (opCash / opRev) * 100 : null;

  // 3. Unrestricted cash expense cover = unrestricted cash ÷ monthly operating expenses
  //    (excluding depreciation — it's a non-cash expense).
  const monthlyCashOpex =
    opExp !== null && dep !== null && opExp - dep > 0 ? (opExp - dep) / 12 : null;
  const cashCover =
    monthlyCashOpex && monthlyCashOpex > 0 ? cash.unrestrictedCash / monthlyCashOpex : null;

  const ratios: Ratio[] = [
    {
      id: "operating-surplus",
      group: "Operating Performance",
      label: "Operating surplus ratio",
      meaning: "Do operating revenues cover operating expenses?",
      formula: "(Operating revenue − operating expenses) ÷ operating revenue",
      value: opSurplus,
      unit: "percent",
      target: null, // ← Tier 8: CONTEXTUAL. No benchmark. Never red-flag.
      targetLabel: "Contextual — no benchmark for Tier 8",
      status: statusFor(opSurplus, null, needsResync ? "resync" : undefined),
      blockedReason: needsResync ? "Needs a resync — the feed doesn't carry the operating/capital split yet." : undefined,
      audited2025: 23.2,
    },
    {
      id: "operating-cash",
      group: "Operating Performance",
      label: "Operating cash ratio",
      meaning: "Core operating cash generation (excludes depreciation).",
      formula: "Net cash from operating activities ÷ operating revenue",
      value: opCashRatio,
      unit: "percent",
      target: 0,
      targetLabel: "Greater than 0%",
      status: statusFor(opCashRatio, 0, needsResync ? "resync" : undefined),
      blockedReason: needsResync ? "Needs a resync." : undefined,
      audited2025: 45.72,
    },
    {
      id: "cash-cover",
      group: "Liquidity",
      label: "Unrestricted cash expense cover",
      meaning: "Months of expenses covered by unrestricted cash — the solvency measure.",
      formula: "Unrestricted cash ÷ (monthly operating expenses excluding depreciation)",
      value: cashCover,
      unit: "months",
      target: 4,
      targetLabel: "Greater than 4 months",
      status: statusFor(cashCover, 4, needsResync ? "resync" : undefined),
      blockedReason: needsResync ? "Needs a resync." : undefined,
      audited2025: 46.11,
    },
    {
      id: "asset-sustainability",
      group: "Asset Management",
      label: "Asset sustainability ratio",
      meaning: "Are assets being renewed as fast as they wear out?",
      formula: "Capital expenditure on asset renewals ÷ depreciation expense",
      value: null,
      unit: "percent",
      target: 90,
      targetLabel: "Greater than 90%",
      status: "unavailable",
      blockedReason:
        "Needs renewal capex separated from new/upgrade capex. The GL doesn't distinguish them — this needs the Council's asset register or a renewal flag on capital jobs.",
      audited2025: 41.72,
    },
    {
      id: "asset-consumption",
      group: "Asset Management",
      label: "Asset consumption ratio",
      meaning: "How 'used up' the asset base is.",
      formula: "Written-down value of depreciable assets ÷ gross current replacement cost",
      value: null,
      unit: "percent",
      target: 60,
      targetLabel: "Greater than 60%",
      status: "unavailable",
      blockedReason:
        "Needs gross current replacement cost, which lives in the Council's asset register, not the GL.",
      audited2025: 59.18,
    },
    {
      id: "council-controlled-revenue",
      group: "Financial Capacity",
      label: "Council-controlled revenue",
      meaning: "How much revenue the Council raises itself, vs grants.",
      formula: "Council-controlled revenue (rates, fees, charges) ÷ total operating revenue",
      value: null,
      unit: "percent",
      target: null,
      targetLabel: "Contextual — no benchmark",
      status: "unavailable",
      blockedReason:
        "Needs fees & charges isolated from other operating revenue. Confirm which GL accounts are Council-controlled.",
      audited2025: 3.23,
    },
    {
      id: "population-growth",
      group: "Financial Capacity",
      label: "Population growth",
      meaning: "Demand context.",
      formula: "Compound annual growth rate of the Council's population",
      value: null,
      unit: "percent",
      target: null,
      targetLabel: "Contextual — no benchmark",
      status: "unavailable",
      blockedReason: "External data (ABS population), not in the finance system.",
      audited2025: 2.19,
    },
  ];

  return {
    tier: COUNCIL_TIER,
    ratios,
    computed: ratios.filter((r) => r.value !== null).length,
    // Contextual ratios can never "fail" — that's the whole point.
    failing: ratios.filter((r) => r.status === "fail").length,
    needsResync,
  };
}
