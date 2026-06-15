# ODBC live feed — Civica Practical → dashboard

Read-only automated feed that replaces the manual report-export process. Runs on
**HVASC-APP02** as `sandsservice`, reads the General Ledger over the
`Practical_Plus` DSN, builds the dashboard's `FinancialSnapshot`, and pushes it
to the live site. **Strictly read-only — only `SELECT` queries.**

See `../../../reports/practical_schema/SCHEMA-MAPPING.md` for the table→field
mapping and the discovery findings behind these queries.

## Scripts (run order)

| Script | What it does |
|---|---|
| `01–04-discover.ps1` | One-off schema discovery (already run; kept for reference). |
| `05-build-snapshot.ps1` | Reads Practical, writes `snapshot.json` next to the script. Prints a validation summary. |
| `06-push.ps1` | PUTs `snapshot.json` to `/api/feed/snapshot` on the live site → Vercel Blob. |
| `07-run-feed.ps1` | Build + push with logging. **This is what the Scheduled Task runs.** |
| `08-install-task.ps1` | Installs the twice-daily Scheduled Task (stores secrets as machine env vars, registers the task as the service account). |

## How the data maps (proven in discovery)

- **Classification** — `GLMST.ACCNTTYPE`: `5` = revenue, `6` = expense (7/8 = assets, 9/10 = liabilities, 11 = equity).
- **Function (department)** — `GLMST.L1ACCNT` → parent account `DESCRIPT`. 8 GL-native functions (Administration, Housing & Construction, Health & Social Welfare, Essential Services, Education/Youth/Rec, Economic Development, Land & Sea Management, CDEP).
- **Amounts** — `GLBAL.BALANCE` (cumulative YTD) at the current period (`GLCON.MTH`). Monthly trend = `GLBAL.DEBIT−CREDIT` per `MTH`.
- **Prior year** — `GLBAL.LASTYEAR` (FY25 actuals = budget baseline; FY26 budget = `GLBAL.BUDGET`, currently 0).
- **Operating expenses exclude depreciation** (`ACCNTTYPE=6 AND ISCONTROL='N'`) so the net result ties to the council's income statement (~$6.67M).
- **Grants** — revenue accounts with `ACCNT2` in 1100–1199 (funding received). Spend %/deadlines still need the council's grants register.

> The statutory Note 3a 9-function view and the exact income-statement line items
> live in Practical's FR reporting module, which `PCSACCESS` cannot read
> (column-level permission denied). This feed uses the GL-native structure
> instead. To switch to the exact statutory view, ask Civica to
> `GRANT SELECT ON FRFUNCTIONS, FRACCNTLINK TO PCSACCESS`.

## One-time setup

1. **Vercel:** create a Blob store (injects `BLOB_READ_WRITE_TOKEN`) and set an
   `UPLOAD_PASSWORD` env var. Redeploy.
2. **APP02:** copy this `odbc/` folder somewhere stable, e.g.
   `D:\SandS\odbc\`. Set the Practical DB password as an env var (it is **not**
   stored in the repo) and test once by hand:
   ```powershell
   $env:PRACTICAL_PWD = '<read-only PCSACCESS password>'
   powershell -ExecutionPolicy Bypass -File .\05-build-snapshot.ps1   # check the validation summary
   .\06-push.ps1 -Url https://<your-app>.vercel.app -Password <UPLOAD_PASSWORD>
   ```
   For the scheduled task, set `PRACTICAL_PWD` as a machine/service-account
   environment variable so the unattended run can read it.
3. **Scheduled Task** (twice daily, as `sandsservice`) — run the installer once:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\08-install-task.ps1 -Url https://<your-app>.vercel.app
   ```
   It prompts (securely) for the Practical DB password, the website
   `UPLOAD_PASSWORD`, and the service-account password, stores the first two as
   machine env vars, and registers the task to run at **06:00 and 18:00**
   (change with `-Times "07:00","19:00"`). Logs land in `odbc\logs\`
   (last 30 runs kept). Test immediately with
   `Start-ScheduledTask -TaskName "HVASC Financial Feed"`.

## Safety

- Every query is `SELECT`. No `INSERT`/`UPDATE`/`DELETE`/`DDL`, no changes to
  Practical data, settings, `PCS.INI`, or the DSN.
- The blob token stays on Vercel; APP02 only holds the `UPLOAD_PASSWORD`.
