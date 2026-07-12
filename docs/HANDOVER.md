# Vantage — Handover & Operations Guide

**Hope Vale Aboriginal Shire Council · Financial Reporting & Dashboard Platform**
Prepared by SandS Australia · Engagement: Dashboard & Reporting Platform (20 May 2026)

This is the operations handover for Schedule 1 of the engagement letter. It covers
what the platform is, how the data flows, how to run and check it, and who to ask
when something looks wrong.

---

## 1. What it is

A read-only financial reporting dashboard that reads the Council's **Civica
Practical Plus** system over ODBC and presents it as a live dashboard: CFO
overview, department views, grant tracker, job budgets, the three financial
statements (P&L, Balance Sheet, Cash Flow), a transaction drill-down, and monthly
management reports.

**It never writes to Practical.** Every query is SELECT-only (engagement letter
cl. 3.2). The dashboard's accuracy depends on the data recorded in Practical
(cl. 3.3) — if a figure looks wrong, the first question is always "is it right in
Practical?"

## 2. How the data flows

```
Civica Practical Plus (Firebird, on HVASC-APP02)
        │  ODBC, read-only (PCSACCESS account)
        ▼
05-build-snapshot.ps1   ← runs ON THE SERVER, builds one JSON "snapshot"
        │  HTTPS PUT (curl, TLS)
        ▼
/api/feed/snapshot  (the website)
        ├─► Postgres  snapshots      (the source of truth the dashboard reads)
        ├─► Postgres  gl_transactions (the transaction ledger)
        ├─► Postgres  sync_log        (one row per push — "is it current?")
        └─► Vercel Blob               (fallback if Postgres is unreachable)
        ▼
Dashboard (Next.js on Vercel) reads Postgres and renders.
```

Three times a day a **Windows Scheduled Task** on HVASC-APP02 runs the build and
push automatically (`07-run-feed.ps1`, at 06:00 / 12:30 / 18:00 AEST). No one has
to do anything for the data to refresh.

## 3. The server side (HVASC-APP02)

Everything lives in `C:\Users\sandsservice\desktop\odbc\`.

| File | What it does |
|---|---|
| `05-build-snapshot.ps1` | Reads Practical, builds `snapshot.json`. READ-ONLY. |
| `06-push.ps1` | Pushes `snapshot.json` to the website over HTTPS. |
| `07-run-feed.ps1` | Build + push, with a log. This is what the scheduled task runs. |
| `08-install-task.ps1` | Installs the scheduled task (run once, as admin). |
| `department-map.json` | Which GL account belongs to which of the 3 departments. |
| `curl.exe` (+ `curl-ca-bundle.crt`) | OpenSSL curl — Server 2012 R2's own TLS can't reach Vercel. |
| `sync-cursor.json` | Tracks the last transaction sent (so re-syncs don't duplicate). |
| `logs\feed-*.log` | One log per scheduled run. |

**The database connection** uses the DSN's own stored login — no password needs
typing. If a run ever prompts for one, don't set `PRACTICAL_PWD` to a guess; a
wrong value overrides the working login and produces an empty snapshot (the script
now refuses to write one, but still).

## 4. Running it by hand

Normally you never need to — the scheduled task handles it. If you do:

```powershell
cd C:\Users\sandsservice\desktop\odbc
powershell -ExecutionPolicy Bypass -File .\05-build-snapshot.ps1   # build
# read the validation summary it prints — every "gap" should be 0
$env:HVASC_UPLOAD_PASSWORD = [Environment]::GetEnvironmentVariable('HVASC_UPLOAD_PASSWORD','Machine')
powershell -ExecutionPolicy Bypass -File .\06-push.ps1 -Url https://hvasc-financial-platform.vercel.app -Password $env:HVASC_UPLOAD_PASSWORD
```

The build prints a validation summary. **Trust the greens; investigate the reds.**
Key lines: `BALANCE gap` must be 0, `Cash Flow … reconciles`, and the department
budget totals.

## 5. "Is the dashboard up to date?"

Open **Data Status** in the dashboard (the `/status` page). It shows:

- **Where this data comes from** — should say *Postgres*.
- **Built from Practical** — when the server last read the GL.
- **Last push received** — when the dashboard last got data.
- **Sync history** — the recent automatic pushes.

If "Last push received" is today and recent, you're current. If it's stuck on an
old time, a sync failed — check the newest `logs\feed-*.log` on APP02 for the
reason.

## 6. Who does what

The platform reads data; it doesn't fix data. Some things are the Council's:

- **Account → department mapping** — edited in-app on the **Account Mapping** page
  (Finance/Admin roles). Or send SandS an updated map.
- **Grant register** — uploaded in-app on the **Grant Tracker** page, or sent to
  SandS. The register drives grant income/spend matching.
- **Cash Flow report definition** (report 739 in Practical's FR module) — the
  Council's Practical config. If accounts are added, they should be mapped into
  this report or they show under "Other operating."
- **Data accuracy** — anything wrong in Practical shows wrong here. Fix it at
  source.

## 7. Access & roles

Login is required (username + password, no public sign-up). Roles:

| Role | Sees |
|---|---|
| `admin` | Everything, incl. the audit log and user management |
| `finance` | All reports + account-mapping admin |
| `ceo` | Executive views (read-only) |
| `manager` | Department views (read-only) |
| `grant-manager` | Grants (may edit grant metadata, never GL figures) |

Financial figures are **read-only for every role**. Only reporting metadata
(names, department assignment, grant milestones) is editable, and every edit is
audit-logged.

## 8. When something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard data is old | A sync failed | Check newest `logs\feed-*.log` on APP02 |
| `PUSH FAILED … TLS` | curl missing/moved | `curl.exe -V` must say OpenSSL; keep it beside the scripts |
| `Unable to complete network request` | Firebird service down (e.g. after a reboot) | Start the Firebird service; set it to Automatic |
| A figure looks wrong | Usually the source data | Check it in Practical first |
| A red accuracy check | Two statements don't tie | The check names the gap; often an unmapped account |

## 9. Support

Managed Service support per the selected tier (engagement letter cl. 4.2).
Reporting/dashboard queries by email; response time per tier.

---

*This platform and its scripts remain the property of SandS Australia under the
engagement (cl. 8.1). The Council's financial data remains the Council's (cl. 8.2).*
