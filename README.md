# Hope Vale ASC — Financial Intelligence Platform

A financial dashboard for **Hope Vale Aboriginal Shire Council (HVASC)**, built
by **SandS Australia**. It rebuilds the original static demo
(`../HopeVale_Financial_Intelligence_Platform_DEMO.html`) as a real Next.js app
with a clean data layer ready to connect to the council's accounting system.

Three views:

- **CFO Dashboard** — budget vs actual, allocation, revenue, department summary
- **Grant Tracker** — grant register with spend, report deadlines, acquittals
- **Manager View** — per-department budget/spend/GL/grant cards (+ drill-down)

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (type-check + lint)
```

Runs on **seed data** out of the box — no credentials or VPN needed.

## Tech stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4 + shadcn/ui
- Dark + gold/teal brand theme in `src/app/globals.css`

> Node ≥ 20.19 is recommended (Next 16). It runs on 20.15 with a harmless
> engine warning, but bump Node when convenient.

## Project structure

```
src/
  app/(app)/              # route group sharing the sidebar/topbar shell
    page.tsx              #   /            CFO Dashboard
    grants/page.tsx       #   /grants      Grant Tracker
    departments/          #   /departments Manager View (+ /[slug] drill-down)
  components/
    layout/               # sidebar, topbar
    kit/                  # brand primitives (KpiCard, pills, panel)
    dashboard/ grants/ managers/   # per-view feature components
  data/seed.ts            # demo figures (replaceable)
  lib/
    types.ts              # domain models
    data/                 # data-access layer: index.ts (source switch) + csv-adapter.ts
    derive.ts             # KPI / variance / allocation calculations
    format.ts colors.ts nav.ts
```

## Data access — how live council data will flow

**There is no API.** The accounting system is **Civica Practical Plus**
(version 2020.12.4.1), a desktop app over a **Firebird** database. Access is
only possible from inside the council network:

1. **VPN** — Sophos Connect to `vpn.hopevale.qld.gov.au` (SSL/UDP).
2. **Remote Desktop** to `172.20.72.12` (server `hvasc-app02`, the "PP Server").
   Practical logins are in the handover docs (e.g. `SHAUN`, `SAM`, `LEVI`).
3. Practical DB lives at `D:\Practical\PCSWIN\Pcs.qdb` on `hvasc-app02`.

Two supported data routes, selected by the `DATA_SOURCE` env var
(see `.env.example`):

| Source | Status | How |
| --- | --- | --- |
| `seed` | ✅ default | Illustrative demo figures. |
| `csv` | ✅ ready to wire | A scheduled task (service account `sandsservice`) exports Practical reports to `\\hvasc-ad02\Data Share\Sands Reports`; this app reads them over the VPN. Implement column mapping in `src/lib/data/csv-adapter.ts`, then set `DATA_SOURCE=csv` + `REPORTS_DIR`. |
| `odbc` | ⏳ pending Civica | Direct read-only query via the Firebird ODBC driver (`PCSACCESS` account). Approval was referred to Civica. Stub in `src/lib/data/index.ts`. |

To switch sources without touching any view code, change `DATA_SOURCE` — every
page calls `getSnapshot()` and is agnostic to the origin.

### Important data caveats (from the council)

- New **GL codes** are still being finalised — map via the Chart of Accounts
  report under General Ledger.
- The **FY2027 budget is loaded** (live feed: `budgetEstimated: false`). The
  old FY2026 gap only affects archived FY26 periods.
- **Grants**: kept in an Excel register; revenue tracked by GL code, expenditure
  by **job codes**.
- 4 departments / cost-(revenue-)centres: Water, Roads, Storage, Child Care.

## Documentation

All project docs live in **[`docs/`](./docs)**:

- **[docs/DATA-REQUIREMENTS.md](./docs/DATA-REQUIREMENTS.md)** — what each view
  shows and where the data comes from.
- **[docs/ACCESS-GUIDE.md](./docs/ACCESS-GUIDE.md)** — step-by-step access to the
  Practical system.
- **[docs/ROADMAP.md](./docs/ROADMAP.md)** — prioritised backlog.

## What to do next

See the [roadmap](./docs/ROADMAP.md). Phase 1 (real data integration) is the
highest-value next step.
