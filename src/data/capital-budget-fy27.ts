/**
 * FY2026-27 capital programme, transcribed from Practical's printed
 * "Job Cost Budget" report (Hope Vale Aboriginal Council, accounts
 * 1000-2000-0000 → 1000-6005-0000, printed 23 Jul 2026, user GAVIN,
 * v2025.6.18.1). 43 jobs, $11,268,133, 0% spent at 6% of year elapsed.
 *
 * Why a transcription: the meeting note in src/lib/job-budgets.ts ("jobs carry
 * no budget of their own") is now outdated — this report shows Practical DOES
 * hold per-job capital budgets for FY27. Until the ODBC feed is extended to
 * read those estimates from JCMST (run 09-probe-jcmst.ps1 on the PP server to
 * confirm where they live), this build-time seed carries the budgets; actuals
 * and commitments join in live from the snapshot. Same pattern as
 * budget-report-fy27.ts, verified by scripts/verify-capital-budget.mjs.
 *
 * NOTE: several descriptions are truncated in the printed report ("Council bu",
 * "treatment ce"). They are transcribed verbatim; replace with full JCMST names
 * when the live pull lands.
 *
 * Categories are ours, derived from the job-number series (2000s roads, 3000s
 * community/IT, 4000s plant, 5000s water & sewerage, 6000s buildings) — the
 * report itself prints one flat list.
 */

export type CapitalCategoryName =
  | "Roads & Civil Works"
  | "Community Infrastructure & IT"
  | "Plant & Fleet"
  | "Water & Sewerage"
  | "Buildings & Housing";

export const CAPITAL_CATEGORY_ORDER: CapitalCategoryName[] = [
  "Roads & Civil Works",
  "Community Infrastructure & IT",
  "Plant & Fleet",
  "Water & Sewerage",
  "Buildings & Housing",
];

export interface CapitalJobSeed {
  /** Full JOB-SUBJOB-SUB2 key as printed, e.g. "1000-2011-0000". */
  code: string;
  name: string;
  category: CapitalCategoryName;
  origBudget: number;
  currBudget: number;
}

type Row = [code: string, name: string, orig: number, curr: number];

const ROADS: Row[] = [
  ["1000-2000-0000", "HVASC.0027, Alligator Creek Be", 1413371, 1413371],
  ["1000-2001-0000", "Alligator Creek Road", 100000, 100000],
  ["1000-2002-0000", "Aerodrome Road", 70000, 70000],
  ["1000-2003-0000", "Alligator Crk To Brannican Rd", 100000, 100000],
  ["1000-2004-0000", "Brannican Road", 70000, 70000],
  ["1000-2005-0000", "Coloured Sands Road", 20000, 20000],
  ["1000-2006-0000", "Elim Beach Campground Road", 50000, 50000],
  ["1000-2007-0000", "Elim Road", 400000, 400000],
  ["1000-2008-0000", "Elim to Sprink Hill Connection", 70000, 70000],
  ["1000-2009-0000", "Heavy Vehicle Bypass Road", 20000, 20000],
  ["1000-2011-0000", "Springhill Road", 900000, 900000],
  ["1000-2012-0000", "Tea Tree Farm Road", 25000, 25000],
  ["1000-2013-0000", "Theile McIvor Airport Road", 55000, 55000],
  ["1000-2014-0000", "Water Bores 4 and 8 Access Rd", 30000, 30000],
  ["1000-2015-0000", "Tip Road", 55000, 55000],
  ["1000-2016-0000", "Cooktown-McIvor River Road", 1000000, 1000000],
  ["1000-2017-0000", "Rehab Road", 500000, 500000],
  ["1000-2018-0000", "Construct speed bumps", 60000, 60000],
  ["1000-2019-0000", "Footpaths on designated strts", 500000, 500000],
  ["1000-2020-0000", "Street markings for zebra cros", 30000, 30000],
];

const COMMUNITY: Row[] = [
  ["1000-3000-0000", "IT Infra Upgrades", 269762, 269762],
  ["1000-3001-0000", "fencing splash park access", 40000, 40000],
  ["1000-3002-0000", "Artworks/murals for Council bu", 30000, 30000],
  ["1000-3003-0000", "solar farm - feasibility stud", 200000, 200000],
  ["1000-3004-0000", "Solar lights designated areas", 350000, 350000],
  ["1000-3006-0000", "Aged Care - New furniture", 70000, 70000],
];

const PLANT: Row[] = [
  ["1000-4000-0000", "Kubota ZD1221R - 29. (1)", 35000, 35000],
  ["1000-4001-0000", "Kubota ZD1221R - 29.1HP (2)", 35000, 35000],
  ["1000-4002-0000", "Kubota Z232KW-42 - 21.5 (1)", 10000, 10000],
  ["1000-4003-0000", "Kubota Z232KW-42 (2)", 10000, 10000],
  ["1000-4004-0000", "Euro 6 Fuso Crew Cab 4 (1)", 120000, 120000],
  ["1000-4005-0000", "Euro 6 Fuso Crew Cab 4 (2)", 120000, 120000],
  ["1000-4006-0000", "New rubbish truck", 500000, 500000],
  ["1000-4007-0000", "Small plant and equipment", 40000, 40000],
];

const WATER: Row[] = [
  ["1000-5000-0000", "Replace Sewage Pond Curtain", 50000, 50000],
  ["1000-5001-0000", "Renew Sewage Pond Fence", 50000, 50000],
  ["1000-5002-0000", "Upgrade for new Bore 1 electri", 100000, 100000],
  ["1000-5003-0000", "Water treatmt - feasibility st", 70000, 70000],
];

const BUILDINGS: Row[] = [
  ["1000-6000-0000", "Shop keepers house replacement", 600000, 600000],
  ["1000-6001-0000", "New staff housing", 600000, 600000],
  ["1000-6002-0000", "Kindy Upgrade", 950000, 950000],
  ["1000-6003-0000", "New dog pound and treatment ce", 750000, 750000],
  ["1000-6005-0000", "Council Buildings Upgrades", 800000, 800000],
];

function seed(rows: Row[], category: CapitalCategoryName): CapitalJobSeed[] {
  return rows.map(([code, name, origBudget, currBudget]) => ({ code, name, category, origBudget, currBudget }));
}

export const CAPITAL_JOBS_FY27: CapitalJobSeed[] = [
  ...seed(ROADS, "Roads & Civil Works"),
  ...seed(COMMUNITY, "Community Infrastructure & IT"),
  ...seed(PLANT, "Plant & Fleet"),
  ...seed(WATER, "Water & Sewerage"),
  ...seed(BUILDINGS, "Buildings & Housing"),
];

/** The figures printed on the source report, for the verification script. */
export const CAPITAL_BUDGET_PRINTED = {
  fyLabel: "FY2026\u201327",
  asAt: "23 Jul 2026",
  source:
    'Practical "Job Cost Budget" report, FY2027 (printed 23 Jul 2026, user GAVIN, v2025.6.18.1)',
  jobCount: 43,
  grandOrigBudget: 11268133,
  grandCurrBudget: 11268133,
} as const;
