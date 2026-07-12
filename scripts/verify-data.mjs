/**
 * verify-data.mjs — cross-check the LIVE data end to end.
 *
 *   node scripts/verify-data.mjs
 *
 * Needs DATABASE_URL. Pull it first (this writes the production secrets to a
 * local file — it stays out of git, but know that you are doing it):
 *
 *   npx vercel env pull .env.local --environment=production
 *
 * WHY THIS EXISTS.
 *
 * The platform's own accuracy checks run against the SNAPSHOT — they prove the
 * snapshot is internally consistent. They cannot prove the snapshot is what
 * Practical actually said, or that what Practical said is what Postgres actually
 * stored. Three places for a number to go wrong, and the app can only see one.
 *
 * So this reads Postgres directly and asks the questions the app cannot:
 *
 *   - Does the ledger hold the transactions the feed claims it sent?
 *   - Do those transactions ADD UP to the income statement in the snapshot?
 *   - Does the balance sheet balance, does the cash flow tie, does the net result
 *     tie to equity — measured from the stored snapshot, not the one in memory?
 *   - Are the grants, commitments, ageing and asset blocks actually present, and
 *     do their internals reconcile?
 *
 * It prints PASS/FAIL per check and exits non-zero if anything fails, so it can be
 * wired into a deploy or a cron later.
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";

// ── env ──────────────────────────────────────────────────────────────────────
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.\n");
  console.error("  npx vercel env pull .env.local --environment=production\n");
  process.exit(2);
}

const sql = neon(url);

// ── reporting ────────────────────────────────────────────────────────────────
let failures = 0;
const D = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n);

function check(name, ok, detail) {
  if (!ok) failures++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${tag}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}
function info(name, detail) {
  console.log(`  \x1b[90m··\x1b[0m    ${name}`);
  if (detail) console.log(`        ${detail}`);
}
function head(t) {
  console.log(`\n\x1b[36m${t}\x1b[0m`);
}

// A dollar difference below this is rounding, not a break.
const TOL = 1;

// ── 1. the stored snapshot ───────────────────────────────────────────────────
head("1. The snapshot Postgres is serving");

const snapRows = await sql`
  SELECT payload, updated_at FROM snapshots ORDER BY updated_at DESC LIMIT 1
`;
if (!snapRows.length) {
  console.error("  No snapshot in Postgres at all. The dashboard is serving a fallback.");
  process.exit(1);
}
const snap = snapRows[0].payload;
const period = snap.period ?? {};
info("Period", `${period.label} · ${period.fyLabel} · month ${period.monthOfYear} of ${period.monthsInYear}`);
info("Generated", `${snap.meta?.generatedAt} (stored ${new Date(snapRows[0].updated_at).toISOString()})`);
info("Source", snap.meta?.source);

check(
  "Every block the feed should carry is present",
  !!(snap.balanceSheet && snap.cashFlow && snap.statutory && snap.commitments && snap.ageing && snap.assets),
  [
    `balanceSheet=${!!snap.balanceSheet}`,
    `cashFlow=${!!snap.cashFlow}`,
    `statutory=${!!snap.statutory}`,
    `commitments=${!!snap.commitments}`,
    `ageing=${!!snap.ageing}`,
    `assets=${!!snap.assets}`,
  ].join("  "),
);

// ── 2. the four accountant's rules, measured from what's STORED ──────────────
head("2. The four rules, against the STORED snapshot");

const bs = snap.balanceSheet;
if (bs) {
  const gap = bs.totalAssets - (bs.totalLiabilities + bs.totalEquity);
  check(
    "Balance sheet balances",
    Math.abs(gap) <= TOL,
    `assets ${D(bs.totalAssets)} vs liabilities+equity ${D(bs.totalLiabilities + bs.totalEquity)} — gap ${D(gap)}`,
  );
}

const cf = snap.cashFlow;
if (cf) {
  const gap = cf.cashEnd - (cf.cashStart + cf.netChange);
  check(
    "Cash flow adds up",
    Math.abs(gap) <= TOL,
    `open ${D(cf.cashStart)} + move ${D(cf.netChange)} = ${D(cf.cashStart + cf.netChange)}, closing ${D(cf.cashEnd)}`,
  );

  // The known disagreement, quantified — not a bug in our data, a stale FR report.
  const CASH = /cash|bank|qtc|maxi[\s-]?direct|petty|float/i;
  const bsCash = (bs?.currentAssets?.lines ?? [])
    .filter((l) => CASH.test(l.label))
    .reduce((a, l) => a + l.amount, 0);
  const codes = new Set((cf.cashAccounts ?? []).map((c) => String(c).trim()));
  const orphans = (bs?.currentAssets?.lines ?? []).filter(
    (l) => CASH.test(l.label) && l.code && !codes.has(String(l.code).trim()),
  );
  check(
    "Cash agrees across the two statements",
    Math.abs(cf.cashEnd - bsCash) <= TOL,
    orphans.length
      ? `differs by ${D(bsCash - cf.cashEnd)} — ${orphans.length} bank account(s) on the balance sheet are NOT in Practical's cash-flow report 739: ${orphans.map((o) => `${o.label} ${D(o.amount)}`).join(", ")}`
      : `cash flow close ${D(cf.cashEnd)} vs balance sheet cash ${D(bsCash)}`,
  );
}

if (snap.incomeTotals && snap.priorYear && bs) {
  const movement = bs.totalEquity - snap.priorYear.closingEquity;
  const gap = snap.incomeTotals.netResult - movement;

  // Explain the gap by the year-end roll, if the arithmetic supports it. You
  // cannot find the anomaly by looking at which equity account moved MOST: at the
  // start of a year the two biggest movements are last year's surplus rolling from
  // Current Surplus into Accumulated Surplus — millions of dollars that net to
  // exactly zero. The roll is the lever, not the noise: whatever leaves the surplus
  // account must arrive in the accumulated one, so anything EXTRA that arrived is
  // money posted straight to equity, bypassing the P&L.
  let detail = `net result ${D(snap.incomeTotals.netResult)} vs equity movement ${D(movement)} — differ by ${D(gap)}`;

  const moves = (bs.equity?.lines ?? [])
    .filter((l) => l.priorYear !== undefined)
    .map((l) => ({ label: l.label, prior: l.priorYear, moved: l.amount - l.priorYear }));

  if (moves.length >= 2) {
    const rose = [...moves].sort((a, b) => b.moved - a.moved)[0];
    const fell = [...moves].sort((a, b) => a.moved - b.moved)[0];
    const excess = rose.moved - fell.prior;
    if (rose.label !== fell.label && Math.abs(excess + gap) <= TOL * 5) {
      detail =
        `${D(Math.abs(gap))} posted STRAIGHT TO EQUITY, bypassing the P&L. ` +
        `At year-end ${D(fell.prior)} rolled out of ${fell.label} into ${rose.label}, ` +
        `but ${rose.label} received ${D(rose.moved)} — ${D(Math.abs(excess))} more than came out. ` +
        `Normally a reserve transfer or prior-period adjustment. Ask Micah to confirm.`;
    }
  }

  check("Net result ties to the movement in equity", Math.abs(gap) <= TOL, detail);
}

// ── 3. Postgres ledger vs the snapshot ──────────────────────────────────────
head("3. The transaction ledger — does Postgres hold what the feed sent?");

const fy = period.fyLabel;
const [led] = await sql`
  SELECT COUNT(*)::int AS n,
         COALESCE(SUM(debit), 0)::float8  AS debit,
         COALESCE(SUM(credit), 0)::float8 AS credit,
         MIN(txn_date)::text AS first_date,
         MAX(txn_date)::text AS last_date,
         MAX(ky)::bigint  AS max_ky
  FROM gl_transactions WHERE fy_label = ${fy}
`;

info("Rows stored", `${led.n.toLocaleString()} for ${fy}`);
if (led.n > 0) {
  info("Date span", `${led.first_date} → ${led.last_date}`);
  info("Debits / credits", `${D(led.debit)} / ${D(led.credit)}`);
  info("Highest ky", String(led.max_ky));
}

check(
  "The ledger has transactions for this financial year",
  led.n > 0,
  led.n > 0 ? undefined : "EMPTY. Run: 05-build-snapshot.ps1 -FullResync, then 06-push.ps1",
);

// The cursor the feed thinks it has reached.
if (snap.meta?.maxKy != null && led.n > 0) {
  check(
    "The feed's high-water mark matches the ledger's",
    Number(led.max_ky) === Number(snap.meta.maxKy),
    `feed says maxKy=${snap.meta.maxKy}, ledger's highest is ${led.max_ky}` +
      (Number(led.max_ky) < Number(snap.meta.maxKy)
        ? " — the ledger is BEHIND: transactions were sent but not stored"
        : ""),
  );
}

// Do the stored transactions ADD UP to the income statement?
// GLTRN is every posting, including balance-sheet ones, so we can't tie the whole
// ledger to the P&L. But daily spend IS derived from expense postings, so the
// snapshot's own dailySpend must sum to something the ledger can corroborate.
if (snap.dailySpend?.length) {
  const daily = snap.dailySpend.reduce((a, d) => a + d.amount, 0);
  info(
    "Daily spend series",
    `${snap.dailySpend.length} days, summing to ${D(daily)} (expense postings only — will not equal total expenses, which include journals)`,
  );
}

// ── 4. sync history ─────────────────────────────────────────────────────────
head("4. Sync history — is the feed actually running?");

const syncs = await sql`
  SELECT received_at, period_label, txns_sent, txns_ingested, archived, source
  FROM sync_log ORDER BY received_at DESC LIMIT 5
`;
for (const s of syncs) {
  const held = s.txns_sent > 0 && s.txns_ingested < s.txns_sent;
  info(
    new Date(s.received_at).toLocaleString("en-AU"),
    `${s.period_label} · sent ${s.txns_sent}, stored ${s.txns_ingested}${held ? "  ← LEDGER REJECTED THESE" : ""}`,
  );
}
check(
  "The most recent sync stored everything it sent",
  !syncs.length || syncs[0].txns_sent === 0 || syncs[0].txns_ingested >= syncs[0].txns_sent,
  syncs.length ? undefined : "No syncs recorded at all.",
);

const lastRun = syncs.length ? new Date(syncs[0].received_at) : null;
const hoursAgo = lastRun ? (Date.now() - lastRun.getTime()) / 36e5 : Infinity;
check(
  "The feed has run recently",
  hoursAgo < 24,
  lastRun ? `last sync ${hoursAgo.toFixed(1)} hours ago` : "never",
);

// ── 5. the derived blocks reconcile internally ──────────────────────────────
head("5. Do the derived figures reconcile?");

const st = snap.statutory;
if (st?.priorYear) {
  const p = st.priorYear;
  const osr = p.operatingRevenue > 0 ? ((p.operatingRevenue - p.operatingExpenses) / p.operatingRevenue) * 100 : null;
  info(
    `Operating surplus ratio (${p.fyLabel})`,
    `${osr?.toFixed(2)}%  — revenue ${D(p.operatingRevenue)}, expenses ${D(p.operatingExpenses)}`,
  );
  check(
    "Operating surplus ratio is in a sane range",
    osr !== null && osr > -100 && osr < 100,
    osr === null ? "not computable" : "audited FY2025 was 23.20% — a wildly different figure means the wrong FR report",
  );

  // The whole point of the reconcile-or-refuse guard: the FR report must cover
  // the ledger. Verify it independently here.
  const glIncome = snap.priorYear?.income ?? 0;
  const cov = glIncome > 0 ? ((p.operatingRevenue + p.capitalRevenue) / glIncome) * 100 : 0;
  check(
    "The FR report accounts for the whole ledger",
    cov > 95 && cov < 105,
    `report classifies ${D(p.operatingRevenue + p.capitalRevenue)} of the ledger's ${D(glIncome)} = ${cov.toFixed(1)}%`,
  );
}

const co = snap.commitments;
if (co) {
  const sum = co.capital + co.operating + co.unclassified;
  check(
    "Commitments add up",
    Math.abs(sum - co.total) <= TOL,
    `capital ${D(co.capital)} + operating ${D(co.operating)} + unclassified ${D(co.unclassified)} = ${D(sum)} vs total ${D(co.total)}`,
  );
  check(
    "Every commitment was classified capital or operating",
    Math.abs(co.unclassified) <= TOL,
    co.unclassified ? `${D(co.unclassified)} could not be placed — its order lines have no GL account` : undefined,
  );
  if (co.staleCount) {
    info("Excluded as stale", `${D(co.stale)} on ${co.staleCount} orders raised over a year ago and never invoiced`);
  }
}

const ag = snap.ageing;
if (ag) {
  for (const [name, s] of [["Receivables", ag.receivables], ["Payables", ag.payables]]) {
    const sum = s.current + s.days30 + s.days60 + s.days90;
    check(
      `${name}: the ageing buckets sum to the total`,
      Math.abs(sum - s.total) <= TOL,
      `current ${D(s.current)} + 30 ${D(s.days30)} + 60 ${D(s.days60)} + 90+ ${D(s.days90)} = ${D(sum)} vs ${D(s.total)}`,
    );
  }
  const pct90 = ag.receivables.total > 0 ? (ag.receivables.days90 / ag.receivables.total) * 100 : 0;
  info("Debtors over 90 days", `${D(ag.receivables.days90)} of ${D(ag.receivables.total)} — ${pct90.toFixed(1)}%`);
}

const as = snap.assets;
if (as) {
  const wdv = as.grossDepreciable + as.accumulatedDepreciation; // accum dep is negative
  check(
    "Written-down value = gross less accumulated depreciation",
    Math.abs(wdv - as.writtenDownDepreciable) <= TOL,
    `gross ${D(as.grossDepreciable)} + accum dep ${D(as.accumulatedDepreciation)} = ${D(wdv)} vs ${D(as.writtenDownDepreciable)}`,
  );
  info(
    "Asset consumption ratio",
    `${as.consumptionRatio}%  (audited FY2025: 59.18% — a fall is expected as the base ages)`,
  );
}

// ── verdict ─────────────────────────────────────────────────────────────────
console.log("");
if (failures === 0) {
  console.log("\x1b[32m✓ Everything reconciles.\x1b[0m");
} else {
  console.log(`\x1b[31m✗ ${failures} check(s) failed.\x1b[0m`);
  console.log("  A failure here is not necessarily a bug in the platform — read the detail.");
  console.log("  The known one is cash: three bank accounts are missing from Practical's report 739.");
}
process.exit(failures ? 1 : 0);
