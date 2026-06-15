# What the dashboard needs to show (data requirements)

This is the definitive list of every number/field each view displays, and where
it comes from in Civica Practical. Use it as the spec when wiring live data
(it maps 1:1 to the types in `src/lib/types.ts` and the seed in `src/data/seed.ts`).

**Period context** (shown everywhere): financial year (e.g. FY2025–26), the
current reporting month (e.g. March 2026), and month N of 12.
Source: chosen reporting period when exporting from Practical.

---

## 1. CFO Dashboard (`/`)

The whole-of-council overview.

### KPI cards (top row)

| KPI | Meaning | How it's calculated | Source |
| --- | --- | --- | --- |
| Total Budget FY26 | Sum of all department annual budgets | Σ annual budget | GL budget |
| YTD Actual Spend | Total spent so far + % of annual | Σ YTD actual; ÷ total budget | GL actuals |
| Budget Remaining | Total budget − YTD actual | derived | derived |
| Grants Requiring Action | Count of grants overdue / report due | count where status = urgent/warning | Grants register |

### Budget vs Actual — by department

- One bar per department showing **% spent** (YTD actual ÷ annual budget).
- **Monthly spend trend** sparkline (total council spend, Jul → current month).
- Source: GL actuals by month and by cost centre.

### Budget Allocation (donut)

- Each department's **share of the total annual budget** (amount + %).
- Source: GL annual budget per cost centre.

### Revenue centres (YTD)

- Income lines: Water Charges, Childcare Fees, Storage Leases (+ total).
- Source: GL revenue accounts, YTD.

### Department summary table

For each department: **Annual Budget · YTD Actual · YTD Budget · Variance ·
% Spent · Status** (+ a link to drill into the department).
Source: GL budget + actuals per cost centre.

---

## 2. Grant Tracker (`/grants`)

### KPI cards

| KPI | Meaning | Source |
| --- | --- | --- |
| Active Grants | Count of grants in the register | Grants register |
| Total Grant Funds | Σ grant allocations this FY | Grants register / GL |
| Spent to Date | Σ grant expenditure (+ % utilised) | Job codes (expenditure) |
| Action Required | Count needing a report/acquittal now | Grants register |

### Grant register table

For each grant:

- **Name** + **funder** (Federal / State / QLD)
- **Owning department**
- **Total** allocation, **Spent**, **Remaining**
- **Progress** % (spent ÷ total)
- **Next report** deadline (+ urgency)
- **Acquittal** deadline (+ urgency)
- **Status** (On Track / Report Due / Overdue / Not Started)

Source: council's **Excel grants register** (deadlines, acquittals, allocations)
+ **GL codes** for grant revenue + **job codes** for grant expenditure.

---

## 3. Manager View (`/departments` and `/departments/[slug]`)

One card per department (a manager sees their own at a glance):

- **Header**: name, centre type (cost / cost & revenue), RAG status pill.
- **Metrics**: Annual Budget · YTD Spent · Variance.
- **Spend bar**: % of budget used + month N of 12.
- **GL line items**: account code + name + YTD amount (flagged lines in red),
  e.g. Salaries & Wages, Contractor Costs, Materials, Plant Hire.
- **Active grants**: chips showing each grant + its status.

Source: GL actuals/budget for that cost centre + grants linked to it.

---

## Field → model → source summary

| Domain object | Model (`types.ts`) | Practical source |
| --- | --- | --- |
| Department budget/actual/status + GL lines | `Department`, `GLLine` | General Ledger (Financial Reporting) |
| Revenue lines | `RevenueLine` | GL revenue accounts |
| Grants | `Grant` | Excel grants register + GL (revenue) + Job Costing (spend) |
| Monthly spend trend | `MonthlySpend` | GL actuals by month |
| Reporting period | `ReportingPeriod` | export period selection |

---

## Things to confirm before live data (blockers)

1. **GL → department mapping** — which GL/cost-centre codes belong to each of
   the 4 departments. (New GL codes are still being finalised; use the Chart of
   Accounts report.)
2. **FY2026 budget** — not yet loaded in Practical, so budget-vs-actual is
   partial until it is.
3. **Export column names** — get one real export file to map exact columns into
   `src/lib/data/csv-adapter.ts`.
4. **Grant job codes** — the specific job codes used per grant for expenditure.

See **[ACCESS-GUIDE.md](./ACCESS-GUIDE.md)** for how to pull these, and
**[ROADMAP.md](./ROADMAP.md)** for the build order.
