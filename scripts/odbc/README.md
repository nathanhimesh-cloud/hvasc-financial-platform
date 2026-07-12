# The Practical feed — what runs on HVASC-APP02

These scripts read the Council's live general ledger out of Civica Practical Plus
(Firebird 1.5, ODBC DSN `Practical_Plus`) and push it to the dashboard.

**Read-only. `SELECT` only. Always.** The platform never writes to Practical — that
is the central constraint of the engagement, and no script here has any business
breaking it.

> 📖 **Read `knowledge-base/01-the-data-source.md` before writing a query.**
> Practical's schema has a dozen traps that fail *silently* — producing a plausible
> number rather than an error. Every one of them has cost this project real time.

---

## What runs in production

A Windows Scheduled Task (as `sandsservice`) runs this at **06:00, 12:30 and 18:00**
AEST:

```
07-run-feed.ps1
   ├── 05-build-snapshot.ps1   Practical → snapshot.json
   └── 06-push.ps1             snapshot.json → the dashboard
```

That is the whole automation, and it is complete — `05` builds every block the
platform uses (statements, ratios, commitments, ageing, assets, transactions) in a
single pass.

| Script | |
|---|---|
| `05-build-snapshot.ps1` | **The feed.** |
| `06-push.ps1` | Ships it. Advances the sync cursor **only** when the server confirms receipt, so a failed push never skips a transaction. |
| `07-run-feed.ps1` | 05 → 06, with logging. What the task calls. |
| `08-install-task.ps1` | Installs the scheduled task. Run once. |
| `department-map.json` | Account → department. **Must sit beside `05`.** |

## What does *not* run on a schedule

`01`–`04` and `09`–`19` are **one-off discovery probes**. Their findings are baked
into `05`; scheduling them would cost server capacity and return nothing new.

Keep them. They are the audit trail behind every claim in the knowledge base, and
re-running one is how you'd verify a change in Practical. `17-probe-fr-income.ps1` in
particular is what `05` tells you to run when it refuses to publish the ratios.

`12-backfill-prior-year.ps1` is a manual, archive-only backfill.

---

## When `05` refuses to do something

It is designed to. **Do not work around a refusal** — it is telling you something true.

| Refusal | Means |
|---|---|
| `REFUSING TO WRITE` | The connection failed or a query returned nothing. Usually a wrong `PRACTICAL_PWD` overriding the DSN's own working login. |
| `NOT EMITTING the statutory ratios` | The FR report doesn't classify the whole ledger, so any operating/capital split from it would be wrong. Run `17-probe-fr-income.ps1` — it reports which report *does* reconcile. |
| `Commitments: NOT EMITTED` | 8,919 order lines produced no commitment. That's a wrong column, not an absence of orders. |
| `Cash Flow build skipped` | It didn't tie to the actual movement in cash. A wrong cash flow in front of the CFO is worse than none. |

> **A wrong number that looks right is worse than no number at all.**
> That sentence is the reason every guard in here exists. Each one was added because
> something got through.

---

## Two gotchas that will bite you

**Never set `PRACTICAL_PWD` unless you know you need it.** The DSN carries its own
Firebird login; a wrong password in that variable **overrides** it and yields a
snapshot of zeros rather than an error.

```powershell
Remove-Item Env:\PRACTICAL_PWD -ErrorAction SilentlyContinue
```

**Keep these files pure ASCII.** A single non-ASCII character breaks PowerShell
parsing on the server.

```powershell
Select-String -Path .\05-build-snapshot.ps1 -Pattern '[^\x00-\x7F]'
```
