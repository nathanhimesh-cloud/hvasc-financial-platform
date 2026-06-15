# HVASC Financial Intelligence Platform — Roadmap

A living backlog. We build the **base** first (done), then work through these
one by one. Tick items as we go. Ordered roughly by priority/dependency.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## ✅ Phase 0 — Base scaffold (DONE)

- [x] Next.js 16 (App Router, TypeScript) + Tailwind v4 + shadcn/ui
- [x] Brand theme (dark + gold/teal) ported from the original demo
- [x] Typed domain models (`src/lib/types.ts`)
- [x] Seed data mirroring the demo (`src/data/seed.ts`)
- [x] Data-access layer with source switch + CSV adapter stub (`src/lib/data`)
- [x] App shell: sidebar, topbar, reporting period
- [x] CFO Dashboard (KPIs, budget-vs-actual, allocation donut, dept table)
- [x] Grant Tracker (KPIs + grant register table)
- [x] Manager View (per-department cards) + department drill-down route
- [x] Production build + lint passing

---

## 🔌 Phase 1 — Real data integration (HIGHEST VALUE)

> No API exists. Civica Practical Plus is a desktop app over a Firebird DB.
> See README "Data access" for the full picture.

- [x] **Confirm the export format** — pulled real May-2026 exports: Income
      Statement, **Note 3a "Analysis by function"** (the department split),
      Note 4 (revenue), Note 5 (grants), and the List-By-Account chart of
      accounts. Converted to CSV under `reports/_csv/`.
- [x] **Feed builder** — `scripts/build-snapshot.mjs` parses those exports into
      `src/data/snapshot.json` (the `FinancialSnapshot` feed). New default data
      source `feed` reads it (Vercel-friendly: JSON bundled at build, no VPN at
      runtime). Run `npm run build:feed` after dropping new exports.
- [x] **GL → department mapping** — departments are now the council's real
      **functions** (Governance, Community Services, Housing, Water, Sewerage,
      Youth & Recreation, Essential Services, Environment Mgmt, Economic Dev),
      derived from Note 3a. Account codes are `PROGRAM-ACCOUNT-SUB`.
- [~] **Grants ingestion** — grant *funding received* now comes from Note 5.
      Still need the council's **Excel grants register** (deadlines/acquittals)
      + **job-costing** export for grant *spend* and report status.
- [~] **Budget data** — FY2026 budget is **not loaded in Practical** (all budget
      columns export as 0). Interim baseline = run-rate (YTD annualised). Swap to
      real FY26 budget when loaded, or drop a **FY25 Note 3a** export for a
      FY25-actuals baseline (the builder auto-detects it).
- [ ] **Monthly trend** — exports have no month-by-month series; the sparkline is
      a flat estimate. Needs a per-period P&L export to make it real.
- [ ] **Scheduled refresh** — document/automate the `sandsservice` scheduled
      task that exports reports to the share; decide refresh cadence. On Vercel
      this means an in-network agent that rebuilds + commits/pushes the snapshot.
- [ ] **(Stretch) Direct ODBC** — once Civica approves a read-only DB credential
      (PCSACCESS), implement the `odbc` source to emit the same snapshot live.

## 📊 Phase 2 — Reporting depth

- [ ] Financial statement pages: P&L, Balance Sheet, Cash Flow (we have the
      Practical export layouts to match).
- [ ] Period selector wired up (Mar / YTD / Full FY toggle currently visual only).
- [ ] Month-by-month drill-down + real monthly spend series per department.
- [ ] Budget-vs-actual variance commentary / RAG thresholds configurable.
- [ ] Export to PDF / Excel for board packs.

## 🔐 Phase 3 — Multi-user & access control

- [ ] Authentication (council SSO / email login).
- [ ] Roles: CFO/admin (all departments) vs department manager (own only).
- [ ] Per-manager landing on their department.
- [ ] Audit log of who viewed what (council financial data).

## 🔔 Phase 4 — Alerts & workflow

- [ ] Grant report/acquittal deadline reminders (email/in-app).
- [ ] Over-budget / at-risk department alerts.
- [ ] Configurable thresholds per department.

## 🎨 Phase 5 — Polish & ops

- [ ] Replace emoji icons with a proper SVG icon set.
- [ ] Loading / empty / error states for each view.
- [ ] Charts library decision (current SVGs are hand-rolled; consider Recharts).
- [ ] Responsive/mobile pass for managers in the field.
- [ ] Tests (data layer + derive helpers) and CI.
- [ ] Deployment target + hosting that can reach the VPN/share (or a sync job).

---

## Known shortcuts in the base (revisit later)

- `+$124K vs forecast` on the CFO "Budget Remaining" KPI is a hard-coded demo
  figure — needs a real forecast source.
- `% Spent` is computed as `YTD actual ÷ annual budget` (consistent), which
  differs slightly from a couple of hand-authored numbers in the old demo.
- Topbar subtitle for `/grants` is static ("7 Active Grants · 3 Requiring
  Action") — make it derive from data.
- Period toggle (Mar/YTD/Full FY) is visual only.
