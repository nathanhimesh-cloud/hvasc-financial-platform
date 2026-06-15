# Civica — read-only database access request

A ready-to-send request for **read-only ODBC access** to the Practical Plus
Firebird database, so the dashboard can run on a live feed instead of manual
CSV/Excel exports.

**Status:** direct DB access was referred to Civica earlier but **not yet
granted** (see [ACCESS-GUIDE.md](./ACCESS-GUIDE.md) §7 and
[ROADMAP.md](./ROADMAP.md) Phase 1). This email progresses it formally.

**Before sending, fill in:** the Civica recipient, the Hope Vale CFO/IT
authoriser to CC, and your name/phone.

---

**To:** [Civica Practical Support / Account Manager — e.g. support@civica.com.au]
**Cc:** [Hope Vale ASC CFO / IT authoriser]
**From:** info@sandsaustralia.com
**Subject:** Request: read-only database access (Firebird/ODBC) for Practical Plus — Hope Vale ASC

Hi [Civica contact name],

I'm writing on behalf of **Hope Vale Aboriginal Shire Council**, for whom SandS
Australia is building a read-only financial reporting dashboard. This follows our
earlier enquiry about direct database access, which I understand was referred to
Civica but not yet approved — we'd like to progress it formally.

**Background.** We currently refresh the dashboard from manual CSV/Excel exports
out of Practical Plus (Financial Reporting → Income Statement, Note 3a Analysis by
Function, Notes 4 & 5), saved to the council's network share. This works but is
manual. A **read-only** connection to the Practical database would let us automate
a reliable live feed and remove the manual export step entirely.

**What we're requesting** — strictly read-only, no writes, no schema or
configuration changes:

1. **A read-only database credential** for the Practical Plus Firebird database
   (the `PCSACCESS` read-only login previously referenced), scoped to **SELECT
   only**.
2. **Approval to install and use the Firebird ODBC driver** on the application
   server **`hvasc-app02`** to connect to `D:\Practical\PCSWIN\Pcs.qdb`
   (Practical Plus **v2020.12.4.1**).
3. **Confirmation that read-only access of this kind is permitted** under our
   licensing/support agreement and **will not affect support or warranty**.
4. **A schema / data dictionary** (or guidance) for the relevant tables so we can
   map our queries accurately — specifically: GL actuals and budgets, chart of
   accounts, cost centres / functions, income-statement lines, and job costing
   (grant expenditure).
5. **Your recommended connection approach** — e.g. querying the live database vs a
   replica/backup copy — and any guidance on read-query performance or locking so
   we don't impact day-to-day Practical users.

For assurance: all access will be **strictly read-only** (SELECT statements only),
used solely to read financial figures into a reporting layer. We will never modify
data, schema, or settings, consistent with the council's read-only policy. We're
happy to sign any access/confidentiality undertaking you require, and to run
queries under a service account (`sandsservice`) if preferred.

Could you let us know **what's needed from your side to approve this**, any
associated cost, and the likely timeframe? The council's [CFO / IT contact], CC'd
here, can confirm authorisation.

Thanks very much — happy to jump on a call if that's easier.

Kind regards,
[Your name]
SandS Australia
info@sandsaustralia.com
[phone]

---

## Technical reference (for whoever actions it)

| Item | Value |
| --- | --- |
| System | Civica **Practical Plus**, v2020.12.4.1 |
| App server | `hvasc-app02` (RDP `172.20.72.12`) |
| Database | **Firebird**, `D:\Practical\PCSWIN\Pcs.qdb` |
| Driver needed | Firebird **ODBC** driver (on `hvasc-app02`) |
| Credential | read-only login `PCSACCESS` (SELECT only) |
| Service account | `sandsservice` (if running scheduled queries) |
| Access policy | **Read-only — never modify data or settings** |
| Once granted | set `DATA_SOURCE=odbc` and implement the reader in `src/lib/data/index.ts` |
