/**
 * Accuracy check for the transcribed FY27 capital budget
 * (src/data/capital-budget-fy27.ts) against the printed Grand Total on the
 * source Practical "Job Cost Budget" report (23 Jul 2026). Run:
 *   node scripts/verify-capital-budget.mjs
 * Exits non-zero if the row count or either budget column disagrees with the
 * printed figures. The report prints whole dollars, so no rounding tolerance
 * is needed here — every leaf is transcribed exactly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "data", "capital-budget-fy27.ts"), "utf8");

// Printed on page 2 of the source report.
const PRINTED = { jobCount: 43, grandOrig: 11268133, grandCurr: 11268133 };

const ROW = /\["(1000-\d{4}-0000)",\s*"(?:[^"\\]|\\.)*",\s*(\d+),\s*(\d+)\]/g;

let count = 0;
let orig = 0;
let curr = 0;
const seen = new Set();
for (const m of src.matchAll(ROW)) {
  count += 1;
  orig += Number(m[2]);
  curr += Number(m[3]);
  if (seen.has(m[1])) {
    console.error(`DUPLICATE job code in transcription: ${m[1]}`);
    process.exit(1);
  }
  seen.add(m[1]);
}

const fails = [];
if (count !== PRINTED.jobCount) fails.push(`job count ${count} ≠ printed ${PRINTED.jobCount}`);
if (orig !== PRINTED.grandOrig) fails.push(`orig budget ${orig} ≠ printed ${PRINTED.grandOrig}`);
if (curr !== PRINTED.grandCurr) fails.push(`curr budget ${curr} ≠ printed ${PRINTED.grandCurr}`);

if (fails.length) {
  for (const f of fails) console.error(`FAIL  ${f}`);
  process.exit(1);
}
console.log(`OK  ${count} jobs · orig ${orig.toLocaleString()} · curr ${curr.toLocaleString()} — matches the printed Grand Total.`);
