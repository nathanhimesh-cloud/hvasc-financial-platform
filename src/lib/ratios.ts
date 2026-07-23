import type { FinancialSnapshot, StatutoryPeriodInputs } from "@/lib/types";
import { cashBreakdown, MIN_MONTHS_COVER } from "@/lib/liquidity";
import { allGrantFigures } from "@/lib/grants";
import { formatCurrency } from "@/lib/format";

/**
 * Queensland statutory financial sustainability ratios (Build Brief B8).
 *
 * Framework: Financial Management (Sustainability) Guideline 2024 — it replaced
 * the old three ratios, and groups councils into 8 tiers by remoteness and
 * population. Each tier has DIFFERENT benchmarks.
 *
 * HOPE VALE IS **TIER 8**. Confirmed from the Council's own audited FY2025
 * Financial Sustainability Statement, which states "Target (Tier 8)" against
 * every measure.
 *
 * Two rules govern this module, and both exist because breaking them puts a
 * false red light in front of the CEO:
 *
 *   1. The OPERATING SURPLUS RATIO is **CONTEXTUAL** for Tier 8 — it has NO
 *      benchmark. We report it and never flag it.
 *
 *   2. These ratios are **ANNUAL** measures, and must be computed on a COMPLETE
 *      financial year. Hope Vale raises its rates once a year and receives most
 *      of its grant income later in the year, so at 31 July operating revenue to
 *      date is a few hundred dollars. Dividing by that produced an operating
 *      surplus ratio of −8,815% and a cash cover of 32,153 months. Both were
 *      arithmetically correct and completely meaningless.
 *
 *      So the FLOW ratios (surplus, cash) are reported on the last COMPLETE
 *      financial year until the current one closes. The current year is shown
 *      only once it carries enough revenue to mean anything, and even then it is
 *      marked provisional and never benchmarked.
 *
 *      The cash cover ratio is different: it is a point-in-time balance measure
 *      (cash on hand ÷ a monthly expense run-rate), so it IS meaningful today.
 *
 * The Leverage Ratio is omitted because Hope Vale holds no debt — which the
 * platform independently corroborates: the Cash Flow's financing section is
 * empty. The Guideline requires 8–9 ratios; a council with no borrowings reports
 * one fewer.
 *
 * Their published FY2025 actuals, used to sanity-check this engine:
 *   Operating surplus ratio           23.20%   (contextual — no target)
 *   Operating cash ratio              45.72%   target > 0%
 *   Unrestricted cash expense cover   46.11 months  target > 4 months
 *   Asset sustainability ratio        41.72%   target > 90%
 *   Asset consumption ratio           59.18%   target > 60%
 *   Council-controlled revenue         3.23%   contextual
 *   Population growth                  2.19%   contextual
 */

export const COUNCIL_TIER = 8;

/**
 * A year-to-date flow ratio only means something once enough of the year's
 * revenue has actually been posted. Below this share of a normal year's operating
 * revenue, we decline to show a number rather than show a wild one.
 */
const YTD_MATERIALITY = 0.05;

export type RatioStatus =
  | "pass"
  | "fail"
  /** Reported against no benchmark (Tier 8 has none for this measure). */
  | "contextual"
  /** Computed, but on part of a year — shown, never benchmarked. */
  | "provisional"
  | "unavailable";

export interface Ratio {
  id: string;
  group: "Operating Performance" | "Liquidity" | "Asset Management" | "Financial Capacity";
  label: string;
  /** Plain-language: what this tells the CEO. */
  meaning: string;
  /** How it's calculated, in words. */
  formula: string;
  /** The value, or null when we can't compute it. */
  value: number | null;
  /** "percent" | "months" */
  unit: "percent" | "months";
  /** The Tier 8 benchmark, or null when the measure is contextual (no target). */
  target: number | null;
  /** Human-readable target, e.g. "Greater than 4 months". */
  targetLabel: string;
  status: RatioStatus;
  /** What period the value is measured over, e.g. "FY2025-26 · full year". */
  basis: string;
  /** Why we can't compute it, when status is "unavailable". */
  blockedReason?: string;
  /** Hope Vale's audited FY2025 figure, for reference. */
  audited2025?: number;
}

export interface RatioReport {
  tier: number;
  ratios: Ratio[];
  /** Ratios we could actually compute. */
  computed: number;
  /** Ratios failing their benchmark. Contextual and provisional ones never count. */
  failing: number;
  /** True when the feed doesn't carry the statutory inputs yet — needs a resync. */
  needsResync: boolean;
  /**
   * True when the feed WITHHELD the ratios because the FR report doesn't reconcile
   * (distinct from needsResync — a resync will NOT fix this). `withheldReason`
   * explains it.
   */
  withheld: boolean;
  withheldReason?: string;
  /** True when the flow ratios are reported on last year because this one is incomplete. */
  usingPriorYear: boolean;
  /** The period the flow ratios are measured over. */
  flowBasis: string;
}

/**
 * Operating surplus ratio, as a percentage. Returns null when operating revenue
 * isn't positive — dividing by a near-zero or negative denominator is where the
 * −8,815% came from.
 */
function surplusRatioOf(p: StatutoryPeriodInputs | undefined): number | null {
  if (!p || p.operatingRevenue <= 0) return null;
  return ((p.operatingRevenue - p.operatingExpenses) / p.operatingRevenue) * 100;
}

function cashRatioOf(p: StatutoryPeriodInputs | undefined): number | null {
  if (!p || p.operatingRevenue <= 0 || p.operatingCashFlow === null) return null;
  return (p.operatingCashFlow / p.operatingRevenue) * 100;
}

export function assessRatios(snapshot: FinancialSnapshot): RatioReport {
  const s = snapshot.statutory;
  // Withheld (FR report doesn't reconcile) is NOT the same as never-synced. A resync
  // fixes the latter; only Practical finalising its prior year fixes the former.
  const withheld = !!s?.withheld;
  const needsResync = !withheld && !s?.priorYear;

  const grantFigs = allGrantFigures(snapshot);
  const cash = cashBreakdown(snapshot, grantFigs);

  const ytd = s?.ytd;
  const prior = s?.priorYear;

  const monthOfYear = snapshot.period?.monthOfYear ?? 0;
  const monthsInYear = snapshot.period?.monthsInYear ?? 12;
  const yearComplete = monthOfYear >= monthsInYear;

  /**
   * Is the year-to-date revenue big enough for a YTD ratio to mean anything?
   * At month 1 Hope Vale has posted ~$500 of operating revenue against a normal
   * year of ~$29M. That is 0.002% — nowhere near enough.
   */
  const ytdRev = ytd?.operatingRevenue ?? 0;
  const normalYearRev = prior?.operatingRevenue ?? 0;
  const ytdIsMaterial =
    normalYearRev > 0 ? ytdRev >= normalYearRev * YTD_MATERIALITY : false;

  // Flow ratios are measured on a COMPLETE year. Until this one closes, that
  // means last year — a real, benchmarkable, audited-adjacent figure — rather
  // than a month of noise.
  const useYtdForFlows = yearComplete || (ytdIsMaterial && !prior);
  const flowSrc = useYtdForFlows ? ytd : prior;
  const usingPriorYear = !useYtdForFlows && !!prior;

  const flowBasis = usingPriorYear
    ? `${prior?.fyLabel ?? "Last complete year"} · full year`
    : yearComplete
      ? `${snapshot.period?.fyLabel ?? "This year"} · full year`
      : `Year to date · month ${monthOfYear} of ${monthsInYear}`;

  /** Shared reason for a flow ratio we decline to compute this early in the year. */
  const tooEarly =
    `These ratios are annual measures, and only ${monthOfYear} month${monthOfYear === 1 ? "" : "s"} ` +
    `of ${monthsInYear} ${monthOfYear === 1 ? "has" : "have"} been posted. Operating revenue to date is ` +
    `${formatCurrency(ytdRev)} — the Council raises its rates and receives most grant income later in ` +
    `the year, so a ratio calculated now would be meaningless. This populates once the year is far ` +
    `enough along, and is benchmarked at 30 June.`;

  // 1. Operating surplus ratio = (operating revenue − operating expenses) ÷ operating revenue
  const opSurplus = surplusRatioOf(flowSrc);

  // 2. Operating cash ratio = net operating cash flow ÷ operating revenue.
  //    Prior-year cash flow can't be rebuilt — GLBAL keeps DEBIT/CREDIT movement
  //    for the current year only — so this one falls back to the current year, and
  //    only once the year carries enough revenue to be meaningful.
  const cashRatioSrc = flowSrc?.operatingCashFlow !== null ? flowSrc : ytdIsMaterial ? ytd : undefined;
  const opCashRatio = cashRatioOf(cashRatioSrc);
  const opCashIsProvisional = cashRatioSrc === ytd && !yearComplete;

  // 3. Unrestricted cash expense cover. A point-in-time measure — cash on hand
  //    against a monthly expense run-rate — so it IS meaningful mid-year.
  //    cashBreakdown() already falls back to the prior year's run-rate when the
  //    year-to-date figure is too small to divide by.
  const cashCover = cash.monthsCover;

  // 4. Asset consumption = written-down value ÷ gross, over DEPRECIABLE assets.
  //    Computed in the feed from the GL asset accounts (mapped to classes via
  //    ARGROUP), not from ARMST — the asset register's totals don't reconcile to
  //    the balance sheet. Land drops out because it has no depreciation account.
  //    Also a point-in-time measure, so it's valid mid-year.
  const assetConsumption = snapshot.assets?.consumptionRatio ?? null;

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
      status: needsResync
        ? "unavailable"
        : opSurplus === null
          ? "unavailable"
          : "contextual",
      basis: flowBasis,
      blockedReason: needsResync
        ? "Needs a resync — the feed doesn't carry the operating/capital split yet."
        : opSurplus === null
          ? tooEarly
          : undefined,
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
      status: needsResync
        ? "unavailable"
        : opCashRatio === null
          ? "unavailable"
          : opCashIsProvisional
            ? "provisional"
            : opCashRatio >= 0
              ? "pass"
              : "fail",
      basis: opCashIsProvisional
        ? `Year to date · month ${monthOfYear} of ${monthsInYear} — provisional`
        : flowBasis,
      blockedReason: needsResync
        ? "Needs a resync."
        : opCashRatio === null
          ? `${tooEarly} Note the prior year can't fill the gap here: Practical stores debit/credit movement for the current year only, so a prior-year cash flow cannot be rebuilt from the GL.`
          : undefined,
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
      target: MIN_MONTHS_COVER,
      targetLabel: `Greater than ${MIN_MONTHS_COVER} months`,
      status:
        cashCover === null ? "unavailable" : cashCover >= MIN_MONTHS_COVER ? "pass" : "fail",
      // A balance measure, not a flow — valid on any day of the year.
      basis: `As at ${snapshot.period?.label ?? "today"} · point in time`,
      blockedReason:
        cashCover === null ? "Needs a monthly operating expense run-rate to divide by." : undefined,
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
      basis: "—",
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
      value: assetConsumption,
      unit: "percent",
      target: 60,
      targetLabel: "Greater than 60%",
      status:
        assetConsumption === null
          ? "unavailable"
          : assetConsumption >= 60
            ? "pass"
            : "fail",
      basis: `As at ${snapshot.period?.label ?? "today"} · point in time`,
      blockedReason:
        assetConsumption === null
          ? "Needs a resync — the feed doesn't carry the asset base yet."
          : undefined,
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
      basis: "—",
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
      basis: "—",
      blockedReason: "External data (ABS population), not in the finance system.",
      audited2025: 2.19,
    },
  ];

  return {
    tier: COUNCIL_TIER,
    ratios,
    computed: ratios.filter((r) => r.value !== null).length,
    // Contextual and provisional ratios can never "fail" — that's the whole point.
    failing: ratios.filter((r) => r.status === "fail").length,
    needsResync,
    withheld,
    withheldReason: s?.reason,
    usingPriorYear,
    flowBasis,
  };
}
