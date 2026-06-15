# How to access the Practical system (step by step)

This is the practical checklist for getting into Civica **Practical Plus** at
Hope Vale ASC, finding the data the dashboard needs, and exporting it so the app
can read it.

> Everything we do is **read-only**. We never change data or settings in Practical.

---

## 0. What you need first

- [ ] **Sophos VPN client** installed (Sophos Connect).
- [ ] **VPN access** to the council network.
- [ ] A **Practical login** (username + password are in the team's private
      handover credentials, not in this repo). You can change the password after
      first login.
- [ ] (For automation only) the **service account** `sandsservice` for scheduled tasks.

---

## 1. Connect the VPN

1. Open **Sophos Connect**.
2. Connect to: **`vpn.hopevale.qld.gov.au`** (type: SSL/UDP, gateway `131.242.18.142`).
3. Enter your council VPN credentials.
4. Wait for the green ✔ "Connected" status.

---

## 2. Remote Desktop into the server

1. Open **Remote Desktop Connection** (`mstsc` on Windows).
2. Connect to: **`172.20.72.12`** — this is server **`hvasc-app02`** (the "PP Server").
3. Log in. You'll see the Windows desktop with **Practical** icons
   (current year + year-specific icons 2016–2025 for historical data).

---

## 3. Open Practical Plus

1. Double-click the **Practical+** (current year) desktop icon.
2. Log in with your Practical username/password.
3. Top menu bar shows the modules: **Property · Registers · Accounts · Work ·
   Finance · Staff · Tools · Dashboard**.

---

## 4. Where the dashboard data lives

| Dashboard needs | Where in Practical |
| --- | --- |
| Department budgets, actual spend, GL lines | **Finance → Financial Reporting → Reports** |
| P&L, Balance Sheet, Cash Flow statements | Financial Reporting → report type **"Financial statements"** |
| GL account → department mapping | **General Ledger → Chart of Accounts report** |
| Grant expenditure (by job code) | **Job Costing** module |
| Grant revenue (by GL code) | General Ledger / revenue accounts |
| Grant deadlines & acquittals | Council's **Excel grants register** (outside Practical) |

### Running a report

1. **Finance → Financial Reporting**.
2. Go to the **Reports** tab.
3. Pick the report (e.g. *Financial statements*), set **GL Year** (2026) and
   **GL Month** (e.g. March / 31 Mar 2026).
4. Click **Preview** to check, then **Print → Export** to save it.
5. Export as **CSV/Excel** (this is what the dashboard reads).

---

## 5. Save exports where the app can read them

- Save (or schedule) exports to the shared network folder:
  **`\\hvasc-ad02\Data Share\Sands Reports`**
- This folder is reachable whenever the **VPN is connected**.
- The dashboard's CSV adapter reads from here (set `REPORTS_DIR` to this path
  and `DATA_SOURCE=csv` in `.env.local`).

---

## 6. (Optional) Automate the exports

To refresh data automatically instead of exporting by hand:

1. RDP into `hvasc-app02` with the **service account `sandsservice`**
   (granted "log on as a batch job" + access to the share).
2. Create a **Scheduled Task** that runs the Practical report export and drops
   the CSVs into `\\hvasc-ad02\Data Share\Sands Reports`.
3. Pick a cadence (e.g. nightly). The dashboard picks up the latest files.

---

## 7. (Future) Direct database access — pending Civica

A cleaner long-term option is querying the database directly, read-only:

- DB: **Firebird**, file `D:\Practical\PCSWIN\Pcs.qdb` on `hvasc-app02`.
- Needs the **Firebird ODBC driver** + a read-only credential (`PCSACCESS`).
- **Civica must approve this** — it was referred to them and is not yet granted.
- Once available, set `DATA_SOURCE=odbc` and implement the reader in
  `src/lib/data/index.ts`.

---

## Key facts (quick reference)

| Item | Value |
| --- | --- |
| VPN | `vpn.hopevale.qld.gov.au` (Sophos, SSL/UDP) |
| App server | `hvasc-app02` → RDP `172.20.72.12` |
| File server / share | `\\hvasc-ad02\Data Share\Sands Reports` |
| Practical DB | `D:\Practical\PCSWIN\Pcs.qdb` (Firebird) |
| System | Civica **Practical Plus**, v2020.12.4.1 |
| Service account | `sandsservice` (scheduled tasks; never expires) |
| Access policy | **Read-only — never modify data or settings** |

> Need the actual login passwords / service-account password? They're in the
> handover documents under `VPN and System Access/` and `Information Required/`.
> Don't commit credentials into this repo.
