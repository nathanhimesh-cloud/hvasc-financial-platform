/**
 * Import the Council's Grant Register (.xlsx) into src/data/grant-register.json.
 *
 *   node scripts/import-grant-register.mjs "<path to register.xlsx>" [sheetName]
 *
 * Reads the "Grant Summary" sheet, parses each grant's GL revenue code,
 * expenditure GL and job-cost codes (which may be single codes, "A to B" ranges,
 * "A & B" compounds, or newline-separated lists), and writes a clean JSON feed.
 *
 * Rows it cannot parse are NOT silently dropped — they're listed in the report so
 * the grant officer knows exactly what to fix. That report is the "clean list".
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

// The ESM build of xlsx has no filesystem bound by default.
XLSX.set_fs(fs);

const SRC = process.argv[2];
const SHEET = process.argv[3] ?? "Grant Summary";
if (!SRC) {
  console.error('Usage: node scripts/import-grant-register.mjs "<register.xlsx>" [sheetName]');
  process.exit(1);
}

// ── code parsing ─────────────────────────────────────────────────────────────
// A GL/job code is "1234-5678" (we ignore any trailing "-0000" sub-segment).
const CODE = /^(\d{3,4})-(\d{3,4})$/;

/** "3435-2000-0000" → "3435-2000"; tolerates a trailing dash. Null if not a code. */
function normCode(raw) {
  const t = String(raw).trim().replace(/-+$/, "");
  const m = t.match(/^(\d{3,4})-(\d{3,4})(?:-\d{3,4})?$/);
  if (!m) return null;
  return `${m[1].padStart(4, "0")}-${m[2].padStart(4, "0")}`;
}

/** Sortable integer for range comparisons: "3435-2000" → 34352000. */
export function codeValue(code) {
  const m = code.match(CODE);
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2]);
}

/**
 * Parse a register cell into matchers.
 * Returns { matchers, unresolved } — unresolved carries the reason if unparseable.
 */
function parseCodes(cell) {
  if (cell === null || cell === undefined) return { matchers: [], unresolved: null };
  let s = String(cell).trim();
  if (!s || s === "-" || s === "?" || /^n\/?a$/i.test(s)) return { matchers: [], unresolved: null };

  // newlines behave like "&"
  s = s.replace(/[\r\n]+/g, " & ").replace(/\s+/g, " ").trim();

  // wildcards / free text can't be resolved to codes
  if (/[x]{2,}/i.test(s)) return { matchers: [], unresolved: `wildcard code: "${s}"` };
  if (/[a-z]/i.test(s.replace(/\bto\b/gi, "").replace(/&/g, ""))) {
    return { matchers: [], unresolved: `free text: "${s}"` };
  }

  const matchers = [];
  for (const partRaw of s.split("&")) {
    const part = partRaw.trim();
    if (!part) continue;
    const rangeBits = part.split(/\s+to\s+/i);
    if (rangeBits.length === 2) {
      const from = normCode(rangeBits[0]);
      let to = normCode(rangeBits[1]);
      // "0401-0410 to 0411" → the end is just the 2nd segment; reuse the prefix.
      if (!to && /^\d{3,4}$/.test(rangeBits[1].trim()) && from) {
        to = `${from.split("-")[0]}-${rangeBits[1].trim().padStart(4, "0")}`;
      }
      if (!from || !to) return { matchers: [], unresolved: `bad range: "${part}"` };
      matchers.push({ type: "range", from, to });
    } else {
      // A bare part may hold several codes separated by spaces ("1715-2000 0205-4197").
      for (const token of part.split(/\s+/)) {
        if (!token) continue;
        const c = normCode(token);
        if (!c) return { matchers: [], unresolved: `bad code: "${part}"` };
        matchers.push({ type: "single", code: c });
      }
    }
  }
  return { matchers, unresolved: null };
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

/** Excel serial date or text → ISO yyyy-mm-dd (or "" if not a date). */
function asDate(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// ── read ─────────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(SRC);
if (!wb.SheetNames.includes(SHEET)) {
  console.error(`Sheet "${SHEET}" not found. Sheets: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, blankrows: false });

// header row is the one containing "General Ledger Revenue Code"
const hIdx = rows.findIndex((r) => r.some((c) => String(c).includes("General Ledger Revenue Code")));
if (hIdx < 0) {
  console.error('Could not find the header row (expected "General Ledger Revenue Code").');
  process.exit(1);
}
const H = rows[hIdx].map((c) => str(c));
const col = (name) => H.findIndex((h) => h.toLowerCase().replace(/\s+/g, " ").includes(name));

const C = {
  no: 0,
  name: 1,
  revGl: col("general ledger revenue code"),
  expGl: col("expenditure gl"),
  job: col("job cost code"),
  scope: col("scope/notes"),
  opening: col("balance at 30 june"),
  received: col("actual cash received"),
  opex: col("operational expense"),
  capex: col("capital expense"),
  unspent: col("unspent grant"),
  restricted: col("restricted"),
  opCap: col("operating/"),
  totalFunded: col("tot project"),
  due: col("due date"),
  comm: col("comm"),
  end: col("end"),
  notes: H.findIndex((h) => /^notes$/i.test(h.trim())),
};

// The register is a working paper: rows destined for removal at EOFY are marked
// in Scope/Notes or Notes. Those are NOT active grants and must not inflate totals.
const CLOSED = /remove from fy27|closed out|inactivate|inactive/i;

const grants = [];
const failures = [];
let funder = "";

for (const r of rows.slice(hIdx + 1)) {
  const name = str(r[C.name]);
  if (!name) continue;
  // A row with a name but no grant number is a funding-body heading (or a total).
  if (typeof r[C.no] !== "number") {
    if (!/^total/i.test(name)) funder = name;
    continue;
  }
  if (/^total/i.test(name)) continue;

  const rev = parseCodes(r[C.revGl]);
  const exp = parseCodes(r[C.expGl]);
  const job = parseCodes(r[C.job]);

  const problems = [rev, exp, job]
    .map((p, i) => (p.unresolved ? `${["revenueGl", "expenditureGl", "jobCodes"][i]}: ${p.unresolved}` : null))
    .filter(Boolean);

  const scopeNote = [str(r[C.scope]), C.notes >= 0 ? str(r[C.notes]) : ""].filter(Boolean).join(" — ");
  const active = !CLOSED.test(scopeNote);

  const entry = {
    id: `grant-${r[C.no]}`,
    number: r[C.no],
    name,
    funder,
    active,
    scopeNote,
    revenueCodes: rev.matchers,
    expenditureCodes: exp.matchers,
    jobCodes: job.matchers,
    openingBalance: num(r[C.opening]),
    cashReceived: num(r[C.received]),
    operationalExpense: num(r[C.opex]),
    capitalExpense: num(r[C.capex]),
    unspent: num(r[C.unspent]),
    totalFunded: num(r[C.totalFunded]),
    restricted: /restricted/i.test(str(r[C.restricted])) && !/unrestricted/i.test(str(r[C.restricted])),
    operatingOrCapital: /cap/i.test(str(r[C.opCap])) ? "capital" : "operating",
    reportDue: asDate(r[C.due]),
    startDate: asDate(r[C.comm]),
    endDate: asDate(r[C.end]),
    milestones: [],
    issues: problems,
  };

  grants.push(entry);
  if (problems.length) failures.push({ number: entry.number, name, problems });
}

// ── write + report ───────────────────────────────────────────────────────────
const out = {
  source: path.basename(SRC),
  sheet: SHEET,
  importedAt: new Date().toISOString().slice(0, 10),
  grants,
};
const dest = path.join(process.cwd(), "src", "data", "grant-register.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));

const clean = grants.length - failures.length;
const active = grants.filter((g) => g.active);
const withJobs = active.filter((g) => g.jobCodes.length).length;
const money = (n) => "$" + n.toLocaleString("en-AU", { maximumFractionDigits: 0 });
console.log(`\nGrant register: ${path.basename(SRC)} → src/data/grant-register.json`);
console.log(`  grants found     : ${grants.length}`);
console.log(`  ACTIVE           : ${active.length}  (${money(active.reduce((a, g) => a + g.totalFunded, 0))} funded)`);
console.log(`  closed / removed : ${grants.length - active.length}  (flagged "remove from FY27" etc.)`);
console.log(`  fully parsed     : ${clean}`);
console.log(`  with job codes   : ${withJobs}  (of the active grants — needed to compute spend)`);
console.log(`  rows with issues : ${failures.length}`);
if (failures.length) {
  console.log(`\n--- FIX LIST for the grant officer ---`);
  for (const f of failures) {
    console.log(`  #${f.number} ${f.name}`);
    f.problems.forEach((p) => console.log(`      - ${p}`));
  }
}
console.log("");
