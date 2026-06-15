/**
 * Shared feed parser — turns rows from Civica Practical exports into a
 * FinancialSnapshot. Pure functions over `string[][]` rows (the shape both
 * SheetJS `sheet_to_json({header:1})` and a CSV split produce), so the same
 * logic powers the CLI (`scripts/build-snapshot.mjs`) and the in-app upload
 * API (`/api/feed/upload`).
 *
 * Inputs are classified by report kind (see classifyRows), not by filename, so
 * uploads work regardless of what the user names the files.
 */

// Canonical functions from Practical's "Analysis by function", + display config.
export const FUNCTIONS = [
  { name: "Governance", icon: "landmark", color: "gold" },
  { name: "Community Services", icon: "users", color: "violet" },
  { name: "Housing", icon: "home", color: "blue" },
  { name: "Youth and Recreation", icon: "trophy", color: "amber" },
  { name: "Water", icon: "droplets", color: "teal" },
  { name: "Sewerage", icon: "waves", color: "indigo" },
  { name: "Essential Services", icon: "zap", color: "amber" },
  { name: "Environment Management", icon: "leaf", color: "green" },
  { name: "Economic Development", icon: "briefcase", color: "blue" },
];
const FUNCTION_NAMES = new Set(FUNCTIONS.map((f) => f.name));

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];
const MONTH_OF_YEAR = MONTHS.length; // May = month 11 of the FY

// ── cell helpers ────────────────────────────────────────────────────────────
export const cell = (row, i) => String((row && row[i]) ?? "").trim();

/** Parse a money cell: "(1,234.50)" → -1234.5, "" → 0. */
export function money(s) {
  let t = String(s ?? "").trim();
  if (!t) return 0;
  let neg = false;
  if (t.startsWith("(") && t.endsWith(")")) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

const slug = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Financial-year month order (Jul = 1 … May = 11). Used to detect a month from
// a monthly Income Statement export's filename, so monthly files build the
// trend instead of overwriting the main (latest) income figures. The month
// abbreviation must follow the start or a separator (space/_/-/.) so it isn't
// matched inside another word (e.g. "mar" inside "summary").
const FY_MONTHS = [
  ["jul", 1, "Jul"], ["aug", 2, "Aug"], ["sep", 3, "Sep"], ["oct", 4, "Oct"],
  ["nov", 5, "Nov"], ["dec", 6, "Dec"], ["jan", 7, "Jan"], ["feb", 8, "Feb"],
  ["mar", 9, "Mar"], ["apr", 10, "Apr"], ["may", 11, "May"],
];
export function detectFyMonth(name) {
  const s = String(name ?? "").toLowerCase();
  for (const [key, idx, label] of FY_MONTHS) {
    if (new RegExp("(?:^|[\\s_.\\-/])" + key).test(s)) return { idx, label };
  }
  return null;
}
const cleanAccount = (s) =>
  String(s).replace(/\s+/g, " ").replace(/^[A-Z][A-Z &/]+-/, "").trim() || String(s).trim();
const round = (n) => Math.round(n * 100) / 100;

// ── report classification ───────────────────────────────────────────────────
/**
 * Identify which Practical report a sheet's rows are, by looking at the title
 * cells. Returns one of: "byFunction" | "income" | "grants" | "revenue" |
 * "listByAccount" | null (unknown).
 */
export function classifyRows(rows) {
  const head = rows.slice(0, 6).map((r) => r.map((c) => String(c ?? "")).join(" ")).join(" ").toLowerCase();
  if (head.includes("analysis of results by function") || head.includes("analysis by function"))
    return "byFunction";
  if (head.includes("income statement")) return "income";
  if (head.includes("grants, subsidies") || head.includes("note 5")) return "grants";
  if (head.includes("revenue analysis") || head.includes("note 4")) return "revenue";
  if (head.includes("account") && head.includes("fr report")) return "listByAccount";
  if (head.includes("statement of financial")) return "balanceSheet";
  if (head.includes("statement of cash flows")) return "cashFlow";
  return null;
}

// ── Note 3a: Analysis by function ───────────────────────────────────────────
// Practical exports this note in two layouts:
//   - "Supporting Report" (detailed): vertical blocks per function, with
//     per-account detail rows → gives GL line items.
//   - Statement summary: one row per function, with Total revenue / Total
//     expenses / Net result as COLUMNS → totals only, no account detail.
// We detect and handle both.
export function parseByFunction(rows) {
  const headerRow = rows.find(
    (r) =>
      r.some((c, i) => i > 0 && String(c).trim() === "Total expenses") &&
      r.some((c, i) => i > 0 && String(c).trim() === "Total revenue"),
  );
  if (headerRow) return parseByFunctionHorizontal(rows);
  return parseByFunctionVertical(rows);
}

/**
 * Summary layout: one row per function. Practical offsets the data cells from
 * their header labels, so we read the values POSITIONALLY in their fixed order
 * — [grants rev, other rev, total rev, total exp, net result, assets] — taking
 * the non-empty cells after the function name.
 */
function parseByFunctionHorizontal(rows) {
  const funcs = {};
  for (const row of rows) {
    const nameIdx = row.findIndex((c) => FUNCTION_NAMES.has(String(c).trim()));
    if (nameIdx === -1) continue;
    const name = String(row[nameIdx]).trim();
    const vals = row.slice(nameIdx + 1).map((c) => String(c ?? "").trim()).filter((v) => v !== "");
    if (vals.length < 4) continue; // need at least up to Total expenses
    funcs[name] = {
      revenue: money(vals[2]), // Total revenue
      expenses: money(vals[3]), // Total expenses
      net: money(vals[4] ?? ""), // Net result for period
      expLines: [],
    };
  }
  return { funcs, codeToFunc: {} };
}

/** Detailed "Supporting Report" layout: vertical blocks with account detail. */
function parseByFunctionVertical(rows) {
  const funcs = {};
  const codeToFunc = {};
  let cur = null;
  let mode = null;
  const newFn = () => ({ revenue: 0, expenses: 0, net: 0, budget: 0, expLines: [] });

  for (const row of rows) {
    const c0 = cell(row, 0);
    // Section heading = a label alone on its row (cols 1..9 empty). Function
    // names open a block; any OTHER heading ends it so trailing zero-total
    // sections (e.g. "Section Without Title") don't overwrite a real function.
    const isHeading = c0 && row.slice(1, 10).every((c) => !String(c ?? "").trim());
    if (isHeading) {
      if (FUNCTION_NAMES.has(c0)) {
        cur = c0;
        funcs[cur] = newFn();
      } else {
        cur = null;
      }
      mode = null;
      continue;
    }
    if (!cur) continue;

    const c5 = cell(row, 5);
    if (c0 === "Total revenue" && c5 === "Statement values") { funcs[cur].revenue = money(cell(row, 8)); mode = "rev"; continue; }
    if (c0 === "Total expenses" && c5 === "Statement values") {
      funcs[cur].expenses = money(cell(row, 8));
      // Column 9 = the budget column (Report Columns → Field 2 = Budgets).
      // It's 0 until the council loads the FY26 budget into Practical.
      funcs[cur].budget = money(cell(row, 9));
      mode = "exp";
      continue;
    }
    if (c0 === "Net result for period") { mode = "net"; continue; }
    if (mode === "net" && c5 === "(not from accounts)") { funcs[cur].net = money(cell(row, 8)); mode = null; continue; }
    if (c0 === "Assets") { mode = "assets"; continue; }
    if (c0 === "Grants revenue" || c0 === "Other revenue") { mode = "skip"; continue; }

    if (cell(row, 1) === "DR/CR" && cell(row, 2)) {
      const code = cell(row, 2);
      const type = cell(row, 3);
      const desc = cell(row, 4);
      const amt = money(cell(row, 8));
      if (!(code in codeToFunc)) codeToFunc[code] = cur;
      const program = code.split("-")[0];
      if (!(program in codeToFunc)) codeToFunc[program] = cur;
      if (mode === "exp" && type === "Expenditure" && amt > 0) {
        funcs[cur].expLines.push({ code, account: cleanAccount(desc), amount: amt });
      }
    }
  }
  return { funcs, codeToFunc };
}

// ── FY26 Income Statement: council revenue lines + totals ───────────────────
export function parseIncomeStatement(rows) {
  const want = {
    "Net rate and utility charges": "Rates & utility charges",
    "Fees and charges": "Fees & charges",
    "Rental income": "Rental income",
    "Interest received": "Interest received",
    "Sales - contract and recoverable works": "Sales – contract & recoverable works",
    "Other recurrent income": "Other recurrent income",
  };
  const revenueLines = [];
  let grants = 0;
  let totalIncome = 0, totalExpenses = 0, netResult = 0, pending = null;

  for (const row of rows) {
    const label = cell(row, 1);
    const c0 = cell(row, 0);
    const amt = money(cell(row, 6));
    if (label in want) revenueLines.push({ id: slug(want[label]), label: want[label], ytd: amt });
    if (label === "Grants, subsidies, contributions and donations") grants += amt;
    if (c0 === "Total income") pending = "income";
    else if (c0 === "Total expenses") pending = "expenses";
    else if (c0 === "Net result attributable to council") { netResult = money(cell(row, 6)); pending = null; }
    else if (pending && cell(row, 6)) {
      if (pending === "income") totalIncome = money(cell(row, 6));
      else if (pending === "expenses") totalExpenses = money(cell(row, 6));
      pending = null;
    }
  }
  if (grants) revenueLines.push({ id: "grants-and-subsidies", label: "Grants & subsidies", ytd: grants });
  return { revenueLines, totals: { totalIncome, totalExpenses, netResult } };
}

// ── Note 5: grant funding by program ────────────────────────────────────────
export function parseGrants(rows, codeToFunc = {}) {
  let recurrentCapital = "Recurrent";
  let funder = "Grant";
  const byCode = new Map();

  for (const row of rows) {
    const c0 = cell(row, 0);
    if (/^\(i\)\s/i.test(c0)) recurrentCapital = "Recurrent";
    else if (/^\(ii\)\s/i.test(c0)) recurrentCapital = "Capital";
    if (/General purpose grants/i.test(c0)) funder = "General Purpose Grant";
    else if (/State Government subsidies and grants/i.test(c0)) funder = "State Government";
    else if (/^Donations/i.test(c0)) funder = "Donations";
    else if (/^Contributions/i.test(c0)) funder = "Contributions";

    if (cell(row, 2) && /revenue/i.test(cell(row, 3))) {
      const code = cell(row, 2);
      const amt = money(cell(row, 8));
      if (amt === 0) continue;
      const prior = byCode.get(code);
      const desc = cleanAccount(cell(row, 4));
      const deptFn = codeToFunc[code] ?? codeToFunc[code.split("-")[0]] ?? null;
      byCode.set(code, {
        code,
        name: prior?.name ?? desc,
        funder: `${funder}${recurrentCapital === "Capital" ? " (Capital)" : ""}`,
        departmentId: deptFn ? slug(deptFn) : "governance",
        total: (prior?.total ?? 0) + amt,
      });
    }
  }

  return [...byCode.values()]
    .filter((g) => g.total > 0) // drop zero / net-negative adjustment lines
    .sort((a, b) => b.total - a.total)
    .map((g) => ({
      id: slug(g.code),
      name: g.name,
      funder: g.funder,
      departmentId: g.departmentId,
      total: round(g.total),
      spent: 0,
      reportDue: { label: "—", level: "muted" },
      acquittal: { label: "—", level: "muted" },
      status: "not-started",
      statusChip: { label: "FUNDING RECEIVED", level: "muted" },
    }));
}

// ── assemble the snapshot ───────────────────────────────────────────────────
/**
 * Build a FinancialSnapshot from classified report rows.
 * @param {{ byFunction: string[][], income?: string[][], grants?: string[][], fy25ByFunction?: string[][]|null }} input
 */
export function buildSnapshot({ byFunction, income, grants, fy25ByFunction, monthly } = {}) {
  if (!byFunction) throw new Error("Missing the 'Analysis by function' (Note 3a) report — it's required.");

  const { funcs, codeToFunc } = parseByFunction(byFunction);
  // Main income = the no-month Income Statement; if absent, use the latest monthly.
  let inc;
  if (income) inc = parseIncomeStatement(income);
  else if (monthly?.length) inc = parseIncomeStatement([...monthly].sort((a, b) => b.idx - a.idx)[0].rows);
  else inc = { revenueLines: [], totals: {} };
  const grantList = grants ? parseGrants(grants, codeToFunc) : [];

  // Pick the budget baseline, in priority order:
  //   1. fy26-budget   — a REAL budget column is present in this year's Note 3a
  //   2. fy25-actuals  — last year's actuals supplied as a comparison
  //   3. run-rate      — neither, so annualise YTD as a rough estimate
  let fy25 = null;
  if (fy25ByFunction) fy25 = parseByFunction(fy25ByFunction).funcs;
  const hasRealBudget = Object.values(funcs).some((f) => (f.budget ?? 0) !== 0);
  const baselineMode = hasRealBudget
    ? "fy26-budget"
    : fy25
      ? "fy25-actuals"
      : "run-rate";

  const departments = FUNCTIONS.map((cfg) => {
    const fn = funcs[cfg.name];
    if (!fn) return null;
    const ytdActual = round(fn.expenses);
    const fy25Exp = fy25?.[cfg.name]?.expenses;
    const annualBudget =
      baselineMode === "fy26-budget"
        ? round(fn.budget)
        : baselineMode === "fy25-actuals" && fy25Exp
          ? round(fy25Exp)
          : round((ytdActual * 12) / MONTH_OF_YEAR);
    const ytdBudget = round((annualBudget * MONTH_OF_YEAR) / 12);
    const ratio = ytdBudget > 0 ? ytdActual / ytdBudget : 0;
    const status = ratio > 1.05 ? "over-budget" : ratio > 1.0 ? "at-risk" : "on-track";

    const glLines = fn.expLines
      .reduce((acc, l) => {
        const hit = acc.find((x) => x.code === l.code);
        if (hit) hit.amount += l.amount;
        else acc.push({ ...l });
        return acc;
      }, [])
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((l) => ({ code: l.code, account: l.account, amount: round(l.amount) }));
    if (glLines[0] && glLines[0].amount > ytdActual * 0.4) glLines[0].flagged = true;

    return {
      id: slug(cfg.name),
      slug: slug(cfg.name),
      name: cfg.name,
      icon: cfg.icon,
      color: cfg.color,
      kind: fn.revenue > 0 ? "cost-revenue" : "cost",
      annualBudget,
      ytdActual,
      ytdBudget,
      status,
      glLines,
    };
  })
    .filter(Boolean)
    .sort((a, b) => b.ytdActual - a.ytdActual);

  // Monthly trend: cumulative council expenses at each available month-end
  // (from monthly Income Statement exports + the main one as the latest point),
  // spread evenly between known checkpoints. With one checkpoint it's flat;
  // each extra month adds real shape.
  const cumByIdx = {};
  for (const mp of monthly ?? []) {
    const exp = Math.abs(parseIncomeStatement(mp.rows).totals.totalExpenses || 0);
    if (exp) cumByIdx[mp.idx] = exp;
  }
  const mainExp = Math.abs(inc.totals?.totalExpenses || 0);
  if (mainExp) cumByIdx[MONTH_OF_YEAR] = mainExp;

  const checkpoints = [[0, 0], ...Object.entries(cumByIdx).map(([k, v]) => [Number(k), v])].sort(
    (a, b) => a[0] - b[0],
  );
  let monthlySpend;
  if (checkpoints.length > 1) {
    const perMonth = new Array(MONTHS.length + 1).fill(0); // 1-indexed
    for (let p = 1; p < checkpoints.length; p++) {
      const [i0, v0] = checkpoints[p - 1];
      const [i1, v1] = checkpoints[p];
      const step = (v1 - v0) / (i1 - i0);
      for (let i = i0 + 1; i <= Math.min(i1, MONTHS.length); i++) perMonth[i] = step;
    }
    monthlySpend = MONTHS.map((m, k) => ({ month: m, amount: round(perMonth[k + 1]) }));
  } else {
    // No income at all → flat estimate from department spend.
    const totalSpend = departments.reduce((a, d) => a + d.ytdActual, 0);
    const per = round(totalSpend / MONTHS.length);
    monthlySpend = MONTHS.map((m) => ({ month: m, amount: per }));
  }
  // "Complete" (not estimated) only once every month has its own checkpoint.
  const trendEstimated = Object.keys(cumByIdx).length < MONTHS.length;

  // ── Income statements (P&L) for the Reports tab ──────────────────────────
  // YTD totals from the main Income Statement, plus a cumulative P&L checkpoint
  // per month from the monthly Income Statement exports. Expenses are stored as
  // a positive magnitude; netResult keeps its sign.
  const asStatement = (parsed, idx, month) => ({
    idx,
    month,
    totalIncome: round(parsed.totals.totalIncome || 0),
    totalExpenses: round(Math.abs(parsed.totals.totalExpenses || 0)),
    netResult: round(parsed.totals.netResult || 0),
    revenueLines: parsed.revenueLines ?? [],
  });
  const incomeTotals = {
    totalIncome: round(inc.totals?.totalIncome || 0),
    totalExpenses: round(Math.abs(inc.totals?.totalExpenses || 0)),
    netResult: round(inc.totals?.netResult || 0),
    revenueLines: inc.revenueLines ?? [],
  };
  const monthlyStatements = (monthly ?? [])
    .map((mp) => asStatement(parseIncomeStatement(mp.rows), mp.idx, mp.label))
    .filter((s) => s.totalIncome || s.totalExpenses);
  // Add the main (period-end) Income Statement as the latest checkpoint.
  if (incomeTotals.totalIncome || incomeTotals.totalExpenses) {
    const idx = MONTH_OF_YEAR;
    if (!monthlyStatements.some((s) => s.idx === idx))
      monthlyStatements.push({ idx, month: MONTHS[idx - 1], ...incomeTotals });
  }
  monthlyStatements.sort((a, b) => a.idx - b.idx);

  return {
    period: {
      label: "May 2026",
      fyLabel: "FY2025–26",
      monthOfYear: MONTH_OF_YEAR,
      monthsInYear: 12,
      live: true,
      budgetEstimated: baselineMode === "run-rate",
      budgetBasis:
        baselineMode === "fy26-budget"
          ? "FY2026 budget (loaded in Practical) vs actual"
          : baselineMode === "fy25-actuals"
            ? "Compared to FY25 actuals (prior year) — no FY26 budget loaded"
            : "Run-rate estimate — FY26 budget not loaded in Practical",
      comparisonLabel: baselineMode === "fy25-actuals" ? "FY25" : "Budget",
      trendEstimated,
    },
    departments,
    grants: grantList,
    revenueLines: inc.revenueLines,
    monthlySpend,
    incomeTotals,
    monthlyStatements,
    meta: {
      source: "Civica Practical exports — Analysis by function, Income Statement, Note 5",
      baseline: baselineMode,
      notes: [
        baselineMode === "fy26-budget"
          ? "Budget = FY2026 budget loaded in Practical (real budget-vs-actual)."
          : baselineMode === "run-rate"
            ? "FY2026 budget is not loaded in Practical (all budget columns = 0); department budgets are a run-rate estimate. Upload a FY25 'Analysis by function' export for a FY25-actuals baseline."
            : "Budget baseline = FY25 actuals by function.",
        trendEstimated
          ? `Monthly trend uses ${Object.keys(cumByIdx).length} cumulative month-end checkpoint(s); upload monthly Income Statements (named with the month) to fill it in.`
          : "Monthly trend built from month-by-month Income Statement exports.",
        "Grants show funding received (Note 5). Spend % and report/acquittal deadlines need the council's Excel grants register + job-costing export.",
      ],
    },
  };
}
