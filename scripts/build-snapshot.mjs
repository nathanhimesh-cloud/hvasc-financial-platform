/**
 * Feed builder (CLI) — reads Civica Practical exports from a folder and writes
 * src/data/snapshot.json (the bundled fallback feed).
 *
 * Reads .XLS / .XLSX / .CSV directly via SheetJS — no manual Excel conversion
 * needed anymore. Parsing logic is shared with the in-app upload route
 * (src/lib/feed/parse.mjs), so the CLI and the website produce identical feeds.
 *
 *   node scripts/build-snapshot.mjs            # reads ../reports
 *   REPORTS_DIR=/path node scripts/build-snapshot.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { buildSnapshot, classifyRows, detectFyMonth } from "../src/lib/feed/parse.mjs";

const PROJECT_ROOT = process.cwd();
const DIR = process.env.REPORTS_DIR ?? path.resolve(PROJECT_ROOT, "..", "reports");
const OUT_FILE = path.resolve(PROJECT_ROOT, "src", "data", "snapshot.json");

/** Read a spreadsheet file into rows (string[][]). */
function fileToRows(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
}

async function main() {
  // Reads nested folders (reports/current-year-FY26, /monthly-income-FY26, …).
  const names = (await fs.readdir(DIR, { recursive: true })).filter((f) =>
    /\.(xls|xlsx|csv)$/i.test(f),
  );
  const input = { byFunction: null, income: undefined, grants: undefined, fy25ByFunction: null, monthly: [] };

  for (const name of names) {
    const buf = await fs.readFile(path.join(DIR, name));
    let rows;
    try { rows = fileToRows(buf); } catch { continue; }
    const base = path.basename(name);
    const kind = classifyRows(rows);
    // "FY25" marks a last-year file. NOT a bare "2025" (FY26 months like
    // "Dec 2025" contain 2025 too).
    const isFy25 = /fy[\s_-]?25/i.test(base);
    let tag = kind ?? "";
    if (kind === "byFunction") {
      if (isFy25) input.fy25ByFunction = rows;
      else input.byFunction = rows;
    } else if (kind === "income" && !isFy25) {
      // A month in the name → it's a monthly trend export, not the main income.
      const mo = detectFyMonth(base);
      if (mo) {
        input.monthly = [...input.monthly.filter((x) => x.idx !== mo.idx), { ...mo, rows }];
        tag = `income (${mo.label} monthly)`;
      } else input.income = rows;
    } else if (kind === "grants" && !isFy25) input.grants = rows;
    if (kind) console.log(`  ${base} → ${tag}${isFy25 ? " (FY25)" : ""}`);
  }

  if (!input.byFunction) throw new Error(`No 'Analysis by function' (Note 3a) export found in ${DIR}`);

  const snapshot = buildSnapshot(input);
  snapshot.meta.generatedAt = new Date().toISOString().slice(0, 10);
  await fs.writeFile(OUT_FILE, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

  const spend = snapshot.departments.reduce((a, d) => a + d.ytdActual, 0);
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`  departments: ${snapshot.departments.length}  grants: ${snapshot.grants.length}  revenueLines: ${snapshot.revenueLines.length}`);
  console.log(`  baseline: ${snapshot.meta.baseline}  totalYTDspend: ${spend.toLocaleString()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
