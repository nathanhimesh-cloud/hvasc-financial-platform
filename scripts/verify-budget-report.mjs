/**
 * Accuracy check for the transcribed FY27 Budget vs Actual data
 * (src/data/budget-report-fy27.ts) against the printed group totals on the
 * source Practical "Revenue and Expenditure Report" PDFs. Run:
 *   node scripts/verify-budget-report.mjs
 * Exits non-zero if any group total is off by more than the source report's own
 * whole-dollar display rounding. Practical prints each leaf and each subtotal
 * rounded independently, so leaf sums can differ from printed subtotals by a few
 * dollars (e.g. Parks 321,451 + 100,550 = 422,001 but the PDF shows 422,000).
 * Leaf values are transcribed exactly; TOL absorbs only that rounding.
 */
const TOL = 10;
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "data", "budget-report-fy27.ts"), "utf8");

// Printed "TOTAL REVENUE & EXPENDITURE" figures from each PDF.
const EXPECTED = {
  corporateServices: { revBudget: 9203983, expBudget: 12957503, revActual: 0, expActual: 2156.43 },
  operations: { revBudget: 9314992, expBudget: 9070172, revActual: 4793.01, expActual: 431.38 },
  socialServices: { revBudget: 5373783, expBudget: 4883043, revActual: 0, expActual: 0 },
};

const ROW = /\["\d{3,4}-\d{4}",\s*"(?:[^"\\]|\\.)*",\s*"(R|E)",\s*([\d.]+),\s*([\d.]+)\]/g;

function sliceSection(name, next) {
  const start = src.indexOf(`const ${name}`);
  const end = next ? src.indexOf(`const ${next}`) : src.indexOf("export const budgetReportFY27");
  return src.slice(start, end);
}

const sections = {
  corporateServices: sliceSection("corporateServices", "operations"),
  operations: sliceSection("operations", "socialServices"),
  socialServices: sliceSection("socialServices", null),
};

let failed = 0;
const money = (n) => "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

for (const [name, text] of Object.entries(sections)) {
  const totals = { revBudget: 0, expBudget: 0, revActual: 0, expActual: 0 };
  let m;
  ROW.lastIndex = 0;
  while ((m = ROW.exec(text))) {
    const kind = m[1];
    const actual = parseFloat(m[2]);
    const budget = parseFloat(m[3]);
    if (kind === "R") {
      totals.revBudget += budget;
      totals.revActual += actual;
    } else {
      totals.expBudget += budget;
      totals.expActual += actual;
    }
  }
  const exp = EXPECTED[name];
  console.log(`\n${name}`);
  for (const key of ["revBudget", "expBudget", "revActual", "expActual"]) {
    const diff = totals[key] - exp[key];
    const ok = Math.abs(diff) <= TOL;
    if (!ok) failed++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${key.padEnd(9)} got ${money(totals[key]).padStart(18)}  ` +
        `expected ${money(exp[key]).padStart(18)}  diff ${money(diff)}`,
    );
  }
}

console.log(failed === 0 ? "\n✓ All group totals tie to the source report (±$1 rounding)." : `\n✗ ${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
