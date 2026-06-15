# HVASC Financial Dashboard — Explainer & Status

What the dashboard shows, where the numbers come from, and what's still needed.

- **Part 1 — The Dashboard** (hand this to the client)
- **Part 2 — Blockers** (what we still need, and from whom)

---

# PART 1 — THE DASHBOARD

## In short
A **read-only view of the council's real finances.** Practical (the accounting
system) is offline with no API, so the finance officer **exports Excel reports**
and **drags them onto the Upload page**; the dashboard reads them. It's a
**snapshot**, refreshed on each upload.

**Financial year:** runs **1 July → 30 June**.
- **This year (FY2025‑26):** Jul 2025 → Jun 2026 — data through **May 2026**.
- **Last year (FY2024‑25):** Jul 2024 → Jun 2025 — the comparison.

## Where the numbers come from
| Report (in `/reports`) | Feeds | Real? |
| --- | --- | --- |
| `FY26_Note3a_SpendByDepartment` | **Department spending** + GL detail (the core) | ✅ |
| `FY26_IncomeStatement` | **Revenue** lines + totals | ✅ |
| `FY26_Note5_Grants` | **The 32 grants** (funding received) | ✅ |
| `monthly-income-FY26/` (Jul…May) | **Monthly spend trend** | ✅ |
| `FY25_Note3a_SpendByDepartment` | **Last year**, for the comparison | ✅ |

## What the screen means
- **YTD Actual Spend ($13.48M)** — what's actually been spent this year. Real.
- **Active Grants (32)** — grant programs + funding received ($11.4M). Real.
- **FY25 Total Spend ($16.14M)** — all of last year, the yardstick.
- **Spend vs FY25 Pace (−$1.32M)** — running below last year's pace.
- **"Spend vs FY25 — By Department"** — each bar = this year's spend vs the same
  point last year. Green = under last year, **red = over**. (e.g. 207% = spent
  2× last year's pace.)
- **Revenue Centres** — real income this year (Total Revenue YTD ~$24.97M).
- **Monthly Spend Trend** — real, month-by-month (May spikes to ~$3M from
  year-end accruals).

## Two things to tell the client
1. **"Over" = spending more than last year, NOT over budget.** There's no budget
   to compare to yet (see blockers), so we compare to last year's actuals.
2. **Grants show $0 spent / no deadlines** — that data isn't in the grant report;
   it needs the grants register (see blockers).

## Accuracy — verified against the raw exports
- ✅ Department spending: **exact match** to Note 3a (all 9 departments).
- ✅ Revenue: **exact** ($24,968,450).
- ✅ Grants: each amount matches Note 5 (32 grants).

The only labelled estimates are the budget comparison and (until the council
loads a budget) nothing else — spend, revenue, grants and the trend are all real.

---

# PART 2 — BLOCKERS (what we still need)

These depend on the council finance team — everything in Practical is exported.

### 🔴 1. This year's budget isn't in Practical
- Every budget column exports as **$0** — the FY2026 budget hasn't been entered.
- So the dashboard compares to **last year** instead of a budget.
- **Need:** finance to **enter the FY2026 budget** in Practical. Then we re-export
  Note 3a with the budget column and it switches to budget-vs-actual automatically.
- **Ask:** *"When will the FY2026 budget be loaded into Practical?"*

### 🟠 2. The grants register (deadlines + the link to spending)
- We have grant **funding** (Note 5) and grant **spend** (Job Costing), but they
  use different codes — nothing links them. We also have no **deadlines**.
- **Need:** the council's **grants register spreadsheet** (grant deadlines,
  acquittal dates, and which job/account codes belong to each grant).
- **Ask:** *"Can we get the grants register Excel?"*

### ✅ Done
- Monthly spend trend (monthly Income Statements uploaded).

### 🟡 Later (optional)
- FY26 Balance Sheet & Cash Flow → future statement pages.

---

## Refresh each month
Re-export the current-year reports (Note 3a, Income Statement, that month's
Income Statement, Note 5) → **drag & drop** them onto the **Data Upload** page.
One file or many — it remembers the rest.
