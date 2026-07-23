<#
  05-build-snapshot.ps1  -  READ-ONLY: build FinancialSnapshot JSON from Practical
  ---------------------------------------------------------------------------
  Assembles the dashboard's FinancialSnapshot (src/data/snapshot.json shape)
  straight from the Civica Practical GL via ODBC. No report exports needed.

  Basis (proven in discovery rounds 1-4, validated against the known figures):
    - Classification:  GLMST.ACCNTTYPE  (5 = revenue, 6 = expense)
    - Department:      account -> department via department-map.json (3 depts:
                       Corporate Services / Operations / Social Services)
    - Period balances: GLBAL.BALANCE (cumulative YTD) at the current period MTH
    - Prior year:      GLBAL.LASTYEAR (FY25 actuals = baseline; FY26 budget = 0)
    - Operating spend EXCLUDES depreciation (type 6, ISCONTROL='N') so the net
      result ties to the council's income statement (~$6.67M, not the $1.7M you
      get if depreciation is left in).

  STRICTLY READ-ONLY (SELECT only). Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\05-build-snapshot.ps1
  Writes snapshot.json next to the script and prints a validation summary.
  Add  -Push  later (06) to ship it to the dashboard.
#>

param(
  [string]$OutFile = (Join-Path $PSScriptRoot 'snapshot.json'),
  # Re-send every transaction of the current financial year, ignoring the sync
  # cursor. Use after rebuilding the database, never routinely.
  [switch]$FullResync
)

# The DSN "Practical_Plus" carries its own Firebird login. Supplying a password
# only OVERRIDES that working login, and a wrong one left in PRACTICAL_PWD
# silently produced a snapshot full of zeros.
#
# Try each connection form in turn. The second - UID with an EMPTY password - is
# what the scheduled task has used unattended for months, so it stays in the list
# even though the first form usually works. Never assume one shape always holds.
#
# Note the failure modes are different, and worth reading:
#   08004 "user name and password are not defined"  -> auth: wrong credentials
#   08004 "Unable to complete network request"      -> the Firebird SERVICE is
#                                                      down or unreachable. No
#                                                      credential will fix that.
function Open-Practical {
  $attempts = @(
    @{ label = "the DSN's own login";       cs = 'DSN=Practical_Plus;' }
    @{ label = 'UID with empty password';   cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=;' }
  )
  if ($env:PRACTICAL_PWD) {
    # Concatenated, never interpolated: the password may contain $ & ( \ characters.
    $attempts += @{ label = 'UID with PRACTICAL_PWD'
                    cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=' + $env:PRACTICAL_PWD + ';' }
  }

  $lastErr = $null
  foreach ($a in $attempts) {
    try {
      $c = New-Object System.Data.Odbc.OdbcConnection($a.cs)
      $c.Open()
      Write-Host ("Connected via {0}." -f $a.label) -ForegroundColor Green
      return $c
    } catch {
      $lastErr = $_.Exception.Message
      Write-Host ("  {0}: refused - {1}" -f $a.label, $lastErr) -ForegroundColor DarkGray
    }
  }

  if ($lastErr -match 'network request|Unable to complete') {
    throw ("Cannot reach the Firebird server on hvasc-app02. This is NOT a credential " +
           "problem - check the Firebird service is running:`n" +
           "    Get-Service | Where-Object { `$_.Name -like '*firebird*' -or `$_.DisplayName -like '*Firebird*' }`n" +
           "Last error: $lastErr")
  }
  throw "Could not connect to Practical. Last error: $lastErr"
}

# -- departments: the Council's THREE management departments ------------------
# Corporate Services - Operations - Social Services (confirmed 9 Jul 2026).
# The account -> department map comes from department-map.json, generated from the
# FY2026-27 budget document + Practical's Revenue & Expenditure reports.
# COPY department-map.json into this folder alongside the script.
$mapPath = Join-Path $PSScriptRoot 'department-map.json'
if (-not (Test-Path $mapPath)) { throw "department-map.json not found next to this script ($mapPath)." }
$deptMap = Get-Content $mapPath -Raw | ConvertFrom-Json

# Flatten the JSON objects into hashtables for fast, PS4-safe lookups.
$ACCT2DEPT = @{}
foreach ($p in $deptMap.accounts.PSObject.Properties) { $ACCT2DEPT[$p.Name] = $p.Value }
$DEPTS = [ordered]@{}
foreach ($d in $deptMap.departments) { $DEPTS[$d.id] = $d }

# GL accounts are "1215-1500-0000"; the map keys on the "1215-1500" prefix.
function Resolve-Dept([string]$glAccount) {
  if (-not $glAccount) { return $null }
  $key = $glAccount.Trim()
  if ($key.Length -ge 9) { $key = $key.Substring(0, 9) }
  if ($ACCT2DEPT.ContainsKey($key)) { return $ACCT2DEPT[$key] }
  return $null
}

$MONTHS = @('Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun')

# -- ODBC plumbing ------------------------------------------------------------
# Stop on the first error. Without this a failed Open() only printed a warning,
# every query then returned nothing, and the script cheerfully wrote a snapshot
# of zeros - which, pushed, would have wiped the live dashboard.
$ErrorActionPreference = 'Stop'
$conn = Open-Practical
Write-Host "Server: $($conn.ServerVersion)" -ForegroundColor Green

$script:BadCells = 0
$script:BadCellNames = @()

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      # Practical holds a few malformed values (bad dates, numerics stored as
      # text) that the ODBC driver refuses to convert. GetValue then THROWS. The
      # old code left the previous column's value in $v and wrote that into this
      # column - silent, undetectable corruption. Reset per cell, fall back to
      # the raw string, and only then give up with $null. Count what we lose.
      $v = $null
      try {
        $v = $r.GetValue($i)
      } catch {
        try { $v = $r.GetString($i) } catch { $v = $null }
        $script:BadCells++
        $nm = $r.GetName($i)
        if ($script:BadCellNames -notcontains $nm) { $script:BadCellNames += $nm }
      }
      $o[$r.GetName($i)] = ($(if ($v -is [DBNull]) { $null } else { $v }))
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}
function Invoke-Scalar([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $v = $cmd.ExecuteScalar()
  if ($v -is [DBNull] -or $null -eq $v) { return 0 } else { return [double]$v }
}
# Round to cents. Non-numeric input yields 0 rather than throwing: some Practical
# columns that look like amounts are actually Y/N flags (JCMST.JOBBUDGET is one),
# and one such column must not be able to kill the whole nightly build.
function R2([object]$x) {
  if ($null -eq $x -or $x -is [DBNull]) { return 0 }
  if ($x -is [string]) {
    $d = 0.0
    if ([double]::TryParse($x, [ref]$d)) { return [math]::Round($d, 2) }
    return 0
  }
  return [math]::Round([double]$x, 2)
}
function Slugify([string]$s) {
  $t = $s.ToLower() -replace '&','and' -replace '[^a-z0-9]+','-'
  return ($t.Trim('-'))
}

# -- 1. period ----------------------------------------------------------------
$cur = [int](Invoke-Scalar 'SELECT MTH FROM GLCON')
$yr  = [int](Invoke-Scalar 'SELECT YR FROM GLCON')
if ($cur -lt 1 -or $cur -gt 12) { $cur = 11 }
# GLCON.YR is the FY-ENDING year. The FY runs Jul(1)..Jun(12), so months 1-6
# (Jul-Dec) are in calendar year (yr-1) and months 7-12 (Jan-Jun) are in (yr).
# Using $yr directly gave the wrong "Jul 2027" for July 2026.
$calYr       = if ($cur -le 6) { $yr - 1 } else { $yr }
$periodLabel = "$($MONTHS[$cur-1]) $calYr"
$fyLabel     = "FY$($yr-1)-" + ($yr.ToString().Substring(2))   # FY2026-27
$pyFyLabel   = "FY$($yr-2)-" + (($yr-1).ToString().Substring(2))   # prior FY, e.g. FY2025-26
Write-Host "Period: $periodLabel  (month $cur of FY$yr)" -ForegroundColor Cyan

# -- 2. department rollup - 3 departments, via the account->department map -----
# One row per active income/expense account, resolved to its department in PS.
# Accounts the map can't resolve are COUNTED (brief A7), never silently dropped.
# GLBAL.BUDGET is the budget CUMULATIVE TO THAT PERIOD, straight-lined across the
# year - proven by 10-probe-budget-and-history.ps1:
#     MTH 1  = 2,242,558   (annual / 12)
#     MTH 6  = 13,455,348  (annual * 6/12)
#     MTH 12 = 26,910,717  (the annual budget)
# So the ANNUAL budget is BUDGET at period 12, and the YTD budget is BUDGET at the
# current period. The old code read the current period's value, called it annual,
# and then prorated it a second time - understating both figures.
# The annual budget (period 12) comes in on a LEFT JOIN, not a correlated
# subquery. The subquery form ran once per row - a thousand extra lookups on
# every sync, for a value one join fetches in a single pass. LEFT, not INNER: an
# account with no period-12 row must still appear, with a null budget, rather
# than vanishing from the department totals.
$acctRows = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, m.ACCNT2,
       b.BALANCE, b.BUDGET AS BUDYTD, b.LASTYEAR,
       b12.BUDGET AS BUDANN
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
LEFT JOIN GLBAL b12 ON b12.GLACCOUNT = b.GLACCOUNT AND b12.MTH = 12
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE IN (5,6)
"@

# Accumulators keyed by department id. revNonGrant excludes grant/subsidy revenue
# (ACCNT2 1100-1199) so it isn't double-counted against the "Grants & subsidies" line.
$agg = @{}
foreach ($id in $DEPTS.Keys) {
  $agg[$id] = @{ exp = 0.0; rev = 0.0; revNonGrant = 0.0; budExpAnn = 0.0; budExpYtd = 0.0; lyExp = 0.0; lines = @() }
}
$unmappedAccounts = 0
$unmappedNames = @()
# The full chart of income/expense accounts, mapped or not. The Account Mapping
# page needs every account it might reassign - not just the handful that happen
# to carry a balance this month, which early in a financial year is almost none.
$accounts = @()

foreach ($r in $acctRows) {
  $code   = [string]$r.GLACCOUNT
  $type   = [int]$r.ACCNTTYPE
  $bal    = R2 $r.BALANCE
  $budYtd = R2 $r.BUDYTD    # budget cumulative to the current period
  $budAnn = R2 $r.BUDANN    # budget cumulative to period 12 = the annual budget
  $ly     = R2 $r.LASTYEAR
  $dept   = Resolve-Dept $code

  $accounts += [ordered]@{
    code         = $code
    name         = ([string]$r.DESCRIPT).Trim()
    kind         = $(if ($type -eq 5) { 'revenue' } else { 'expense' })
    departmentId = $dept
    balance      = $bal
    budget       = $budAnn
    budgetYtd    = $budYtd
  }

  if (-not $dept) {
    # Only flag accounts that actually carry money - dormant zero accounts are noise.
    if ($bal -ne 0 -or $budAnn -ne 0) {
      $unmappedAccounts++
      if ($unmappedNames.Count -lt 10) { $unmappedNames += ("{0} {1}" -f $code, ([string]$r.DESCRIPT).Trim()) }
    }
    continue
  }

  if ($type -eq 6) {
    $agg[$dept].exp       += $bal
    $agg[$dept].budExpAnn += $budAnn
    $agg[$dept].budExpYtd += $budYtd
    $agg[$dept].lyExp     += $ly
    if ($bal -ne 0) {
      $agg[$dept].lines += [pscustomobject]@{ code = $code; account = ([string]$r.DESCRIPT).Trim(); amount = $bal }
    }
  } elseif ($type -eq 5) {
    $agg[$dept].rev += $bal
    $a2 = [int]$r.ACCNT2
    if (-not ($a2 -ge 1100 -and $a2 -le 1199)) { $agg[$dept].revNonGrant += $bal }
  }
}

$hasRealBudget = (($DEPTS.Keys | ForEach-Object { $agg[$_].budExpAnn } | Measure-Object -Sum).Sum) -ne 0

# Always emit all three departments - even at $0 actual - so the full budgeted
# structure is visible early in the financial year rather than an empty list.
$departments = @()
foreach ($id in $DEPTS.Keys) {
  $cfg = $DEPTS[$id]
  $a   = $agg[$id]
  $ytdActual = R2 $a.exp
  $revenue   = R2 $a.rev

  # Both figures come straight from GLBAL: annual = period 12, YTD = current period.
  # Never derive one from the other - Practical already phases the budget, and
  # prorating an already-cumulative figure is what produced the old wrong numbers.
  $annualBudget = if ($hasRealBudget) { R2 $a.budExpAnn } else { R2 $a.lyExp }
  $ytdBudget    = if ($hasRealBudget) { R2 $a.budExpYtd } else { R2 ($annualBudget * $cur / 12) }
  if ($annualBudget -le 0 -and $ytdActual -gt 0) {
    $annualBudget = R2 ($ytdActual * 12 / $cur)      # run-rate fallback
    $ytdBudget    = R2 ($annualBudget * $cur / 12)
  }
  $ratio  = if ($ytdBudget -gt 0) { $ytdActual / $ytdBudget } else { 0 }
  $status = if ($ratio -gt 1.05) { 'over-budget' } elseif ($ratio -gt 1.0) { 'at-risk' } else { 'on-track' }

  $glLines = @()
  $first = $true
  foreach ($l in (@($a.lines) | Sort-Object { [double]$_.amount } -Descending | Select-Object -First 6)) {
    $line = [ordered]@{ code = $l.code; account = $l.account; amount = (R2 $l.amount) }
    if ($first -and $l.amount -gt ($ytdActual * 0.4)) { $line.flagged = $true }
    $glLines += $line
    $first = $false
  }

  $departments += [ordered]@{
    id           = $cfg.id
    slug         = $cfg.slug
    name         = $cfg.name
    icon         = $cfg.icon
    color        = $cfg.color
    kind         = $(if ($revenue -gt 0) { 'cost-revenue' } else { 'cost' })
    annualBudget = $annualBudget
    ytdActual    = $ytdActual
    ytdBudget    = $ytdBudget
    # Last year's spend for the SAME department. It was already being summed (to
    # fall back on when no budget is loaded) but never emitted, so the platform
    # could compare a department to its budget and to nothing else. Micah asked for
    # a prior-year comparison; the number was sitting in memory the whole time.
    priorYearActual = R2 $a.lyExp
    revenue      = $revenue
    status       = $status
    glLines      = $glLines
  }
}

# -- 3. council income statement (operating basis; ties to ~$6.67M net) --------
$income   = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5")
$expenses = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6")
$deprec   = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ISCONTROL='N' AND m.ACCNTTYPE=6")
$netResult = R2 ($income - $expenses)

# -- 4. revenue lines: grants&subsidies (ACCNT2 1100-1199) + by-function rest --
$grantsRevTotal = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND m.ACCNT2 BETWEEN 1100 AND 1199")
$revenueLines = @()
if ($grantsRevTotal -gt 0) {
  $revenueLines += [ordered]@{ id = 'grants-and-subsidies'; label = 'Grants & subsidies'; ytd = $grantsRevTotal }
}
# Non-grant revenue grouped by the 3 departments (from the rollup above)
foreach ($id in $DEPTS.Keys) {
  $cfg = $DEPTS[$id]
  $rev = R2 $agg[$id].revNonGrant
  if ($rev -gt 0) {
    $revenueLines += [ordered]@{ id = (Slugify ($cfg.name + ' revenue')); label = "$($cfg.name) revenue"; departmentId = $cfg.id; ytd = $rev }
  }
}

# -- 5. grants register (funding received; ACCNT2 1100-1199 revenue accounts) --
$grantRows = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, b.BALANCE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5
  AND m.ACCNT2 BETWEEN 1100 AND 1199 AND b.BALANCE <> 0
ORDER BY b.BALANCE DESC
"@
$grants = @()
foreach ($g in $grantRows) {
  $total = R2 $g.BALANCE
  if ($total -le 0) { continue }
  $deptId = Resolve-Dept ([string]$g.GLACCOUNT)
  if (-not $deptId) { $deptId = 'corporate-services' }
  $grants += [ordered]@{
    id          = [string]$g.GLACCOUNT
    name        = ([string]$g.DESCRIPT).Trim()
    funder      = 'Grant'
    departmentId = $deptId
    total       = $total
    spent       = 0
    reportDue   = [ordered]@{ label = '-'; level = 'muted' }
    acquittal   = [ordered]@{ label = '-'; level = 'muted' }
    status      = 'not-started'
    statusChip  = [ordered]@{ label = 'FUNDING RECEIVED'; level = 'muted' }
  }
}

# -- 6. monthly trend + cumulative statements (from per-period balances) -------
$movRows = Invoke-Rows @"
SELECT b.MTH, SUM(b.DEBIT - b.CREDIT) AS MOVE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6 AND b.MTH BETWEEN 1 AND $cur
GROUP BY b.MTH ORDER BY b.MTH
"@
$monthlySpend = @()
for ($i = 1; $i -le $cur; $i++) {
  $m = $movRows | Where-Object { [int]$_.MTH -eq $i } | Select-Object -First 1
  $monthlySpend += [ordered]@{ month = $MONTHS[$i-1]; amount = R2 ($(if ($m) { $m.MOVE } else { 0 })) }
}

$cumRows = Invoke-Rows @"
SELECT b.MTH,
       SUM(CASE WHEN m.ACCNTTYPE=5 THEN b.BALANCE ELSE 0 END) AS INC,
       SUM(CASE WHEN m.ACCNTTYPE=6 AND m.ISCONTROL='Y' THEN b.BALANCE ELSE 0 END) AS EXP
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y' AND m.ACCNTTYPE IN (5,6) AND b.MTH BETWEEN 1 AND $cur
GROUP BY b.MTH ORDER BY b.MTH
"@
$monthlyStatements = @()
foreach ($c in $cumRows) {
  $inc = R2 $c.INC; $exp = R2 $c.EXP
  if ($inc -eq 0 -and $exp -eq 0) { continue }
  $idx = [int]$c.MTH
  $monthlyStatements += [ordered]@{
    idx = $idx; month = $MONTHS[$idx-1]
    totalIncome = $inc; totalExpenses = $exp; netResult = R2 ($inc - $exp)
    revenueLines = @()
  }
}

# -- 6b. transactions + daily spend (from GLTRN) ------------------------------
# Individual transactions for the current FY, most-recent first, capped so the
# snapshot stays a reasonable size. Drives the transaction report / drill-down
# (brief B3) and the daily spend series. Early in the year this is every txn; if
# the cap is hit, older transactions aren't included (flagged in the summary).
$TRN_CAP = 5000
$fyStart = ("{0}-07-01" -f ($yr - 1))   # FY starts 1 July of the prior calendar year
$fyEnd   = ("{0}-06-30" -f $yr)         # ...and ends 30 June of the FY-ending year

# INCREMENTAL SYNC. Hope Vale posts ~53 transactions a day, so a financial year is
# roughly 19,000 of them. Re-sending the year on every sync would mean a ~3 MB
# payload three times a day, and the old "SELECT FIRST 5000 ... ORDER BY TRNDATE
# DESC" silently stopped covering the whole year around day 95: everything older
# than the newest 5,000 rows was never sent again.
#
# Instead we ship only what's new since the last SUCCESSFUL push. GLTRN.KY is a
# monotonic primary key, so the high-water mark is a single number. 06-push.ps1
# advances the cursor only after the server returns 200 - a failed push leaves it
# alone, so nothing is ever skipped. The dashboard UPSERTs on ky, so a re-send is
# harmless. Use -FullResync to rebuild the ledger from the start of the year.
$cursorFile = Join-Path $PSScriptRoot 'sync-cursor.json'
$sinceKy = 0
if ((-not $FullResync) -and (Test-Path $cursorFile)) {
  try {
    $cur0 = Get-Content $cursorFile -Raw | ConvertFrom-Json
    # The cursor is per financial year: a new FY starts from scratch.
    if ($cur0.fyLabel -eq $fyLabel) { $sinceKy = [int64]$cur0.maxKy }
  } catch { $sinceKy = 0 }
}
if ($FullResync) { Write-Host "FullResync: ignoring the sync cursor." -ForegroundColor Yellow }
Write-Host ("Transactions since GLTRN.KY > {0}" -f $sinceKy) -ForegroundColor Cyan

# Ascending by KY, so a capped batch is the OLDEST unsent rows and the cursor
# advances steadily. Descending would strand the tail forever.
$trnRows = Invoke-Rows @"
SELECT FIRST $TRN_CAP t.KY, t.GLACCOUNT, m.DESCRIPT AS ACCTNAME, t.TRNDATE,
       t.DESCRIPT AS TRNDESC, t.DEBIT, t.CREDIT, t.REF, m.ACCNTTYPE
FROM GLTRN t JOIN GLMST m ON m.GLACCOUNT = t.GLACCOUNT
WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'
  AND m.RECACTIVE='Y' AND t.KY > $sinceKy
ORDER BY t.KY ASC
"@

$transactions = @()
$maxKy = $sinceKy
foreach ($t in $trnRows) {
  $ky = [int64]$t.KY
  if ($ky -gt $maxKy) { $maxKy = $ky }
  $d = if ($t.TRNDATE) { ([datetime]$t.TRNDATE).ToString('yyyy-MM-dd') } else { '' }
  $transactions += [ordered]@{
    ky          = $ky
    date        = $d
    code        = [string]$t.GLACCOUNT
    account     = ([string]$t.ACCTNAME).Trim()
    description = ([string]$t.TRNDESC).Trim()
    ref         = ([string]$t.REF).Trim()
    debit       = (R2 $t.DEBIT)
    credit      = (R2 $t.CREDIT)
  }
}
# More waiting than one batch can carry: the next run picks up where this stopped.
$trnCapped = ($trnRows.Count -ge $TRN_CAP)

# Daily spend must cover the WHOLE year, so it can't be derived from an
# incremental batch. Aggregate it in the database instead - one row per day.
$dailyRows = Invoke-Rows @"
SELECT t.TRNDATE, SUM(CAST(t.DEBIT AS DOUBLE PRECISION) - CAST(t.CREDIT AS DOUBLE PRECISION)) AS NET
FROM GLTRN t JOIN GLMST m ON m.GLACCOUNT = t.GLACCOUNT
WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'
  AND m.RECACTIVE='Y' AND m.ACCNTTYPE = 6
GROUP BY t.TRNDATE
ORDER BY t.TRNDATE
"@
$dailySpend = @()
foreach ($r in $dailyRows) {
  if (-not $r.TRNDATE) { continue }
  $dailySpend += [ordered]@{
    date   = ([datetime]$r.TRNDATE).ToString('yyyy-MM-dd')
    amount = (R2 $r.NET)
  }
}

# -- 6b2. job costing actuals (JCTRN) -----------------------------------------
# Spend per job code for the current FY. The grant register maps each grant to
# its job code(s), so grant EXPENDITURE is the sum of its jobs' costs. Codes are
# normalised to the "JOB-SUBJOB" (4-4) prefix the register uses.
# TOTCOST is a scaled NUMERIC. SUM() of it overflows what the Firebird ODBC
# driver will convert, and GetValue throws on a handful of the larger jobs -
# which then read as $0 and silently understate both this report AND the grant
# expenditure derived from it. Casting to DOUBLE PRECISION in SQL avoids it.
# JCTRN spans many years AND holds corrupt dates - the probe found rows dated
# 15/08/1120 and 10/04/2045. A ">= fyStart" filter alone lets the 2045 rows into
# the current year's spend. Bound BOTH ends of the financial year.
$jcOutOfRange = [int](Invoke-Scalar "SELECT COUNT(*) FROM JCTRN WHERE TRANDATE > '$fyEnd' OR TRANDATE < '1990-01-01'")
if ($jcOutOfRange -gt 0) {
  Write-Host ("NOTE: {0} JCTRN row(s) carry impossible dates (before 1990 or after $fyEnd) and are excluded." -f $jcOutOfRange) -ForegroundColor Yellow
}
$jcRows = Invoke-Rows @"
SELECT t.JCACCOUNT, SUM(CAST(t.TOTCOST AS DOUBLE PRECISION)) AS SPEND
FROM JCTRN t
WHERE t.TRANDATE >= '$fyStart' AND t.TRANDATE <= '$fyEnd'
GROUP BY t.JCACCOUNT
"@
$jcMap = @{}
$jcNullSpend = 0
foreach ($j in $jcRows) {
  $raw = ([string]$j.JCACCOUNT).Trim()
  if ($raw.Length -lt 9) { continue }
  $key = $raw.Substring(0, 9)          # "0305-0410"
  # A null here is a job whose spend we could NOT read - not a job that spent $0.
  if ($null -eq $j.SPEND) { $jcNullSpend++ }
  $amt = R2 $j.SPEND
  if (-not $jcMap.ContainsKey($key)) { $jcMap[$key] = 0.0 }
  $jcMap[$key] = [double]$jcMap[$key] + $amt
}
if ($jcNullSpend -gt 0) {
  Write-Host ("WARNING: {0} job code(s) had an unreadable SPEND and count as 0. Grant expenditure is understated." -f $jcNullSpend) -ForegroundColor Red
}
$jobCosts = @()
foreach ($k in ($jcMap.Keys | Sort-Object)) {
  if ([math]::Abs($jcMap[$k]) -lt 0.005) { continue }
  $jobCosts += [ordered]@{ code = $k; amount = (R2 $jcMap[$k]) }
}

# -- 6b3. job register + job-wise budget tracking (JCMST) ----------------------
# Practical holds the BUDGET on the GL account, not on the job: in the FY26 job
# costing report only 12 of 384 jobs carried an estimate, and the FY27 "Jobs
# Budget" report nests jobs under their GL account's budget. So we mirror that
# report - GL account budget vs the actuals of the jobs beneath it.
#
# JCMST's columns vary between Practical builds, so probe them first. A missing
# optional column degrades the report; it must never break the nightly build.
$jcmstCols = @{}
foreach ($c in (Invoke-Rows @'
SELECT RDB$FIELD_NAME AS FLD FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'JCMST'
'@)) {
  $n = ([string]$c.FLD).Trim().ToUpper()
  if ($n) { $jcmstCols[$n] = $true }
}
function Test-JcCol([string]$n) { return $jcmstCols.ContainsKey($n.ToUpper()) }

$jobBudgets = @()
$jobsUnmappedToGl = 0
if (-not (Test-JcCol 'JCACCOUNT')) {
  Write-Host "JCMST has no JCACCOUNT column - skipping the job budget report." -ForegroundColor Yellow
} else {
  # NOTE: JCMST.JOBBUDGET is a Y/N FLAG ("is this job budgeted?"), not an amount.
  # The money lives in the estimate columns, which line up with the "Estimates"
  # block of Practical's Total Job Costs report:
  #     ESTIMATE = Original    NEWEST = Current    NEXTEST = Next Year
  $sel = @('JCACCOUNT')
  foreach ($opt in @('JCDESC', 'RACTIVE', 'PYGLACC', 'ESTIMATE', 'NEWEST', 'COMTOT')) {
    if (Test-JcCol $opt) { $sel += $opt }
  }
  Write-Host ("JCMST columns used: " + ($sel -join ', ')) -ForegroundColor Cyan
  $jobRows = Invoke-Rows ("SELECT " + ($sel -join ', ') + " FROM JCMST")

  # Aggregate JCMST to the 4-4 key that the cost ledger and grant register both
  # use. Several sub-jobs share one key, so sum their budgets rather than
  # attaching the key's whole actual to each of them (which would double-count).
  $jobMap = @{}
  foreach ($j in $jobRows) {
    $raw = ([string]$j.JCACCOUNT).Trim()
    if ($raw.Length -lt 9) { continue }
    $key = $raw.Substring(0, 9)
    if (-not $jobMap.ContainsKey($key)) {
      $jobMap[$key] = @{ code = $key; name = ''; gl = ''; active = $false; budget = 0.0; committed = 0.0 }
    }
    $e = $jobMap[$key]
    # Prefer the "-0000" parent row's description and GL account.
    $isParent = ($raw.Length -ge 14 -and $raw.Substring(10, 4) -eq '0000')
    $desc = $(if (Test-JcCol 'JCDESC') { ([string]$j.JCDESC).Trim() } else { '' })
    if ($desc -and ((-not $e.name) -or $isParent)) { $e.name = $desc }
    if (Test-JcCol 'PYGLACC') {
      $g = ([string]$j.PYGLACC).Trim()
      if ($g -and ((-not $e.gl) -or $isParent)) { $e.gl = $g }
    }
    if ((Test-JcCol 'RACTIVE') -and (([string]$j.RACTIVE).Trim().ToUpper() -eq 'Y')) { $e.active = $true }
    # Prefer the CURRENT estimate (NEWEST); fall back to the ORIGINAL (ESTIMATE).
    $bud = 0
    if (Test-JcCol 'NEWEST')   { $bud = R2 $j.NEWEST }
    if ($bud -eq 0 -and (Test-JcCol 'ESTIMATE')) { $bud = R2 $j.ESTIMATE }
    $e.budget = [double]$e.budget + $bud
    if (Test-JcCol 'COMTOT')   { $e.committed = [double]$e.committed + (R2 $j.COMTOT) }
  }

  # GL account -> name / budget / actual, for the accounts the jobs post against.
  $glInfo = @{}
  foreach ($r in $acctRows) {
    $glInfo[([string]$r.GLACCOUNT).Trim()] = @{
      name      = ([string]$r.DESCRIPT).Trim()
      budget    = (R2 $r.BUDANN)   # annual
      budgetYtd = (R2 $r.BUDYTD)   # to the current period - what actual should be judged against
      actual    = (R2 $r.BALANCE)
    }
  }

  # Group the jobs under their GL account.
  $byGl = @{}
  foreach ($key in ($jobMap.Keys | Sort-Object)) {
    $e = $jobMap[$key]
    $actual = $(if ($jcMap.ContainsKey($key)) { R2 $jcMap[$key] } else { 0 })
    # JCMST carries ~4,100 job rows, most of them long-dormant shells. Practical's
    # own report lists only jobs with activity, so keep a job when it has spend or
    # a budget. The RACTIVE flag alone isn't enough - thousands are flagged active
    # with nothing against them, and they'd bloat the snapshot for no information.
    if ($actual -eq 0 -and $e.budget -eq 0) { continue }

    $gl = [string]$e.gl
    if (-not $gl) { $jobsUnmappedToGl++; $gl = 'unmapped' }
    if (-not $byGl.ContainsKey($gl)) { $byGl[$gl] = @() }
    $byGl[$gl] += [ordered]@{
      code = $e.code; name = $e.name; active = $e.active
      budget = (R2 $e.budget); actual = $actual; committed = (R2 $e.committed)
    }
  }

  foreach ($gl in ($byGl.Keys | Sort-Object)) {
    $jobs = @($byGl[$gl])
    $info = $(if ($glInfo.ContainsKey($gl)) { $glInfo[$gl] } else { $null })
    $jobActual = 0.0
    foreach ($j in $jobs) { $jobActual = $jobActual + [double]$j.actual }
    $jobBudgets += [ordered]@{
      glAccount    = $gl
      glName       = $(if ($info) { $info.name } else { '' })
      departmentId = $(if ($gl -ne 'unmapped') { Resolve-Dept $gl } else { $null })
      # The budget lives on the GL account. `glActual` is the account's real
      # balance; `jobActual` is only the part that was job-costed. They differ
      # when spend posts straight to the account without a job.
      budget    = $(if ($info) { $info.budget } else { 0 })
      budgetYtd = $(if ($info) { $info.budgetYtd } else { 0 })
      glActual  = $(if ($info) { $info.actual } else { 0 })
      jobActual = (R2 $jobActual)
      jobs      = $jobs
    }
  }
  $keptJobs = 0
  foreach ($g in $jobBudgets) { $keptJobs += @($g.jobs).Count }
  $withBudget = @($jobBudgets | Where-Object { [double]$_.budget -gt 0 }).Count
  Write-Host ("Job budget report: {0} GL accounts ({1} with a budget), {2} jobs kept of {3} in JCMST, {4} with no GL account." -f `
    $jobBudgets.Count, $withBudget, $keptJobs, $jobMap.Count, $jobsUnmappedToGl) -ForegroundColor Cyan
}

# -- 6c. balance sheet (Statement of Financial Position, live from GLBAL) ------
# Classify by GLMST.ACCNTTYPE: 7=current assets, 8=non-current, 9=current
# liabilities, 10=non-current, 11=equity. Totals are reliable; the current/non-
# current LIABILITY split (9 vs 10) and the cash line are the bits to validate
# against a Balance Sheet you trust. No ABS() in SQL (Firebird 1.5 lacks it) -
# lines are sorted by size in PowerShell.
$BS_SECTIONS = @(
  @{ key = 'currentAssets';         label = 'Current assets';          types = @(7)  }
  @{ key = 'nonCurrentAssets';      label = 'Non-current assets';      types = @(8)  }
  @{ key = 'currentLiabilities';    label = 'Current liabilities';     types = @(9)  }
  @{ key = 'nonCurrentLiabilities'; label = 'Non-current liabilities'; types = @(10) }
  @{ key = 'equity';                label = 'Community equity';        types = @(11) }
)
$bsAllTypes = ($BS_SECTIONS | ForEach-Object { $_.types }) -join ','
# LAST YEAR'S CLOSING BALANCE, PER LINE.
#
# b12.LASTYEAR at MTH 12 is the account's balance at the END of last year. Without
# it, the "net result ties to equity" check can only say the two differ by $69,752
# and leave it there - a number with no owner, which nobody can act on and everyone
# learns to ignore.
#
# With it, the same check can name the account that moved without a P&L entry, and
# Micah can answer in one sentence whether that was a reserve transfer.
#
# It also gives every balance-sheet line a prior-year comparative, which is what a
# balance sheet is supposed to have.
$bsRows = Invoke-Rows @"
SELECT m.ACCNTTYPE, m.GLACCOUNT, m.DESCRIPT, b.BALANCE, b12.LASTYEAR AS PYBAL
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
LEFT JOIN GLBAL b12 ON b12.GLACCOUNT = b.GLACCOUNT AND b12.MTH = 12
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y'
  AND m.ACCNTTYPE IN ($bsAllTypes) AND b.BALANCE <> 0
ORDER BY m.ACCNTTYPE
"@
function Build-BsSection($def) {
  $lines = @(); $total = 0.0
  $match = @($bsRows | Where-Object { $def.types -contains [int]$_.ACCNTTYPE }) |
    Sort-Object { [math]::Abs([double]$_.BALANCE) } -Descending
  foreach ($row in $match) {
    $amt = R2 $row.BALANCE
    # Carry the GL code. Without it the only way to ask "is this line cash?" is to
    # pattern-match its NAME, and the Council has bank accounts called "Bank QTC"
    # and "Maxi-Direct" that no sane regex agrees on. The code lets the integrity
    # check compare the Balance Sheet against the Cash Flow's OWN cash accounts.
    $lines += [ordered]@{
      code      = ([string]$row.GLACCOUNT).Trim()
      label     = ([string]$row.DESCRIPT).Trim()
      amount    = $amt
      priorYear = (R2 $row.PYBAL)   # last year's CLOSE, for the comparative + the equity tie-out
    }
    $total += $amt
  }
  return [ordered]@{ label = $def.label; lines = $lines; total = (R2 $total) }
}
$bsSec = @{}
foreach ($def in $BS_SECTIONS) { $bsSec[$def.key] = Build-BsSection $def }
$bsTotalAssets = R2 ($bsSec.currentAssets.total + $bsSec.nonCurrentAssets.total)
$bsTotalLiab   = R2 ($bsSec.currentLiabilities.total + $bsSec.nonCurrentLiabilities.total)
$bsTotalEquity = R2 $bsSec.equity.total
$balanceSheet = [ordered]@{
  currentAssets         = $bsSec.currentAssets
  nonCurrentAssets      = $bsSec.nonCurrentAssets
  totalAssets           = $bsTotalAssets
  currentLiabilities    = $bsSec.currentLiabilities
  nonCurrentLiabilities = $bsSec.nonCurrentLiabilities
  totalLiabilities      = $bsTotalLiab
  netCommunityAssets    = R2 ($bsTotalAssets - $bsTotalLiab)
  equity                = $bsSec.equity
  totalEquity           = $bsTotalEquity
  asAt                  = $periodLabel
}
$bsGap = R2 ($bsTotalAssets - ($bsTotalLiab + $bsTotalEquity))

# -- 6c-recon. LINE-BY-LINE reconciliation: GLBAL.BALANCE vs the transactions -----
#
# WHY THIS EXISTS. An independent reviewer's line-by-line reconciliation found the
# dashboard's balance sheet ~$42k off Practical's on a handful of high-churn control
# accounts (AP Control, Payroll Suspense, Accrued Creditors). The probe
# (22-probe-bs-recon.ps1) proved the cause was NOT a bug: GLBAL.BALANCE and the live
# transactions agreed to the cent; the variance was snapshot staleness on accounts
# that move millions within a single month.
#
# But our integrity engine tests only the TOTALS (Assets = Liabilities + Equity, and
# equity ties to the audited close). It never checked whether an individual line's
# GLBAL.BALANCE actually matches the transactions that produced it -- so a real
# GLBAL/GLTRN divergence would pass straight through. This closes that gap.
#
# For each balance-sheet account:
#     expected = opening balance (GLBAL at MTH 0) + net movement from GLTRN this FY
#   * assets (type 7/8) are debit-normal:   movement = DEBIT - CREDIT
#   * liabilities/equity (9/10/11) credit-normal: movement = CREDIT - DEBIT
# If GLBAL.BALANCE (what the dashboard reads) and `expected` diverge beyond $1, that
# is a genuine data-integrity problem and gets surfaced. If they agree, the balance
# sheet is faithful to the ledger and the check passes silently.
$bsReconciliation = $null
try {
  $bsAcctCodes = @($bsRows | ForEach-Object { ([string]$_.GLACCOUNT).Trim() } | Where-Object { $_ } | Select-Object -Unique)

  # Opening balance per account = GLBAL.BALANCE at MTH 0 (the year's brought-forward).
  $opening = @{}
  foreach ($r in (Invoke-Rows "SELECT GLACCOUNT, CAST(BALANCE AS DOUBLE PRECISION) AS BAL FROM GLBAL WHERE MTH = 0")) {
    $opening[([string]$r.GLACCOUNT).Trim()] = [double]$r.BAL
  }
  # Live movement per account, from the transaction ledger, for the current FY.
  $mvByAcct = @{}
  foreach ($r in (Invoke-Rows @"
SELECT t.GLACCOUNT,
       SUM(CAST(t.DEBIT  AS DOUBLE PRECISION)) AS DR,
       SUM(CAST(t.CREDIT AS DOUBLE PRECISION)) AS CR
FROM GLTRN t
WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'
GROUP BY t.GLACCOUNT
"@)) {
    $mvByAcct[([string]$r.GLACCOUNT).Trim()] = @{ dr = [double]$r.DR; cr = [double]$r.CR }
  }

  $reconChecked = 0
  $reconMismatch = @()
  foreach ($r in $bsRows) {
    $code = ([string]$r.GLACCOUNT).Trim()
    if (-not $code) { continue }
    $glbal = R2 $r.BALANCE
    $type  = [int]$r.ACCNTTYPE
    $open  = $(if ($opening.ContainsKey($code)) { $opening[$code] } else { 0 })
    $mv    = $(if ($mvByAcct.ContainsKey($code)) { $mvByAcct[$code] } else { @{ dr = 0.0; cr = 0.0 } })
    # Sign the movement by the account's normal side.
    $signed = if ($type -eq 7 -or $type -eq 8) { $mv.dr - $mv.cr } else { $mv.cr - $mv.dr }
    $expected = R2 ($open + $signed)
    $diff = R2 ($glbal - $expected)
    $reconChecked++
    if ([math]::Abs($diff) -ge 1) {
      $reconMismatch += [ordered]@{
        code     = $code
        account  = ([string]$r.DESCRIPT).Trim()
        glbal    = $glbal          # what the dashboard shows
        expected = $expected       # opening + transactions
        diff     = $diff
      }
    }
  }
  $reconMismatch = @($reconMismatch | Sort-Object { -[math]::Abs([double]$_.diff) })

  $bsReconciliation = [ordered]@{
    checked      = $reconChecked
    mismatchCount = $reconMismatch.Count
    # The worst 25 only; the point is to flag, not to dump the whole ledger.
    mismatches   = @($reconMismatch | Select-Object -First 25)
    asAt         = $periodLabel
    source       = 'Each balance-sheet account: GLBAL.BALANCE at the current period vs opening (GLBAL MTH 0) plus GLTRN movement this FY, signed by the account normal side. A mismatch means the balance table and the transactions disagree.'
  }
  if ($reconMismatch.Count -eq 0) {
    Write-Host ("BS line reconciliation: all {0} accounts tie to the transactions." -f $reconChecked) -ForegroundColor Green
  } else {
    Write-Host ("BS line reconciliation: {0} of {1} accounts DIVERGE from the transactions -" -f $reconMismatch.Count, $reconChecked) -ForegroundColor Red
    foreach ($m in ($reconMismatch | Select-Object -First 6)) {
      Write-Host ("    {0}  {1,-30} GLBAL {2,14:N2}  vs txns {3,14:N2}  diff {4,12:N2}" -f $m.code, $m.account, $m.glbal, $m.expected, $m.diff) -ForegroundColor Yellow
    }
  }
} catch {
  Write-Host ("BS line reconciliation skipped: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# -- 6c2. Cash Flow Statement (live, from the FR report definition) ------------
# The Cash Flow isn't a stored figure - it's report 739 in Practical's Financial
# Reporting module: which account MOVEMENTS roll into which cash-flow line.
# FRSECTION -> FRLINE -> FRACCNTLINK, readable since Civica granted SELECT (Jul 2026).
#
# A cash flow is built from MOVEMENTS, not balances. Each link takes an account's
# YTD debit (D), credit (C) or net (A) movement, in CREDIT-POSITIVE terms, so the
# non-cash lines sum to the change in cash held (double-entry guarantees it).
#
# SELF-CHECK: the statement's "net increase in cash" MUST equal the actual
# movement in the cash accounts. We compute both independently, auto-correct a
# global sign flip, and REFUSE to emit an unreconciled statement - a wrong Cash
# Flow in front of the CFO is worse than none.
$cashFlow = $null
$cfNote = ''
try {
  # YTD debit/credit movement per account, with name + type. GLBAL holds the
  # current FY only, so summing MTH 1..cur is the year-to-date movement.
  $mv = @{}; $accName = @{}; $accType = @{}
  foreach ($r in (Invoke-Rows "SELECT b.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, SUM(CAST(b.DEBIT AS DOUBLE PRECISION)) AS DR, SUM(CAST(b.CREDIT AS DOUBLE PRECISION)) AS CR FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH BETWEEN 1 AND $cur GROUP BY b.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE")) {
    $a = ([string]$r.GLACCOUNT).Trim()
    $mv[$a] = @{ dr = [double]$r.DR; cr = [double]$r.CR }
    $accName[$a] = ([string]$r.DESCRIPT).Trim()
    $accType[$a] = [int]$r.ACCNTTYPE
  }
  # Closing balance per account, for the cash opening/closing reconciliation.
  $balAt = @{}
  foreach ($r in (Invoke-Rows "SELECT b.GLACCOUNT, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL FROM GLBAL b WHERE b.MTH = $cur")) {
    $balAt[([string]$r.GLACCOUNT).Trim()] = [double]$r.BAL
  }

  # Report 739's structure, pulled live so a change to the Council's report
  # definition flows through without touching this script.
  $CF_RPTKY = 739
  $cfSecs = Invoke-Rows "SELECT KY, SECTNO, SECTTYPE, TITLE FROM FRSECTION WHERE RPTKY = $CF_RPTKY ORDER BY SECTNO"
  if (-not $cfSecs.Count) { throw "report $CF_RPTKY not found (are the FR tables readable?)" }

  # All account links for the report in one query, grouped by line. `linkedSet`
  # is every account the report references, for the residual calculation.
  $linksByLine = @{}
  $linkedSet = @{}
  foreach ($a in (Invoke-Rows "SELECT LNKY, GLACCOUNT, INVERT, TRANTYPE FROM FRACCNTLINK WHERE RPTKY = $CF_RPTKY")) {
    $lk = [int]$a.LNKY
    if (-not $linksByLine.ContainsKey($lk)) { $linksByLine[$lk] = @() }
    $linksByLine[$lk] += $a
    $linkedSet[([string]$a.GLACCOUNT).Trim()] = $true
  }

  # One line's amount, credit-positive: A = CR-DR, C = CR, D = -DR; invert negates.
  function CF-Line([int]$lineKy) {
    $sum = 0.0
    if ($linksByLine.ContainsKey($lineKy)) {
      foreach ($a in $linksByLine[$lineKy]) {
        $acc = ([string]$a.GLACCOUNT).Trim()
        if (-not $mv.ContainsKey($acc)) { continue }
        $dr = $mv[$acc].dr; $cr = $mv[$acc].cr
        $tt = ([string]$a.TRANTYPE).Trim().ToUpper()
        $c = if ($tt -eq 'C') { $cr } elseif ($tt -eq 'D') { -$dr } else { $cr - $dr }
        if (([string]$a.INVERT).Trim().ToUpper() -eq 'Y') { $c = -$c }
        $sum += $c
      }
    }
    return $sum
  }

  function CF-Section([int]$sectKy) {
    $lines = @(); $net = 0.0
    foreach ($ln in (Invoke-Rows "SELECT KY, DESCRIPT FROM FRLINE WHERE SECTKY = $sectKy ORDER BY LINENO")) {
      $desc = ([string]$ln.DESCRIPT).Trim()
      if (-not $desc) { continue }
      $amt = CF-Line ([int]$ln.KY)
      $lines += [pscustomobject]@{ label = $desc; amount = $amt }
      $net += $amt
    }
    return @{ lines = $lines; net = $net }
  }

  $sByNo = @{}
  foreach ($s in $cfSecs) { $sByNo[[int]$s.SECTNO] = $s }
  $op  = if ($sByNo.ContainsKey(1)) { CF-Section ([int]$sByNo[1].KY) } else { @{ lines=@(); net=0 } }
  $inv = if ($sByNo.ContainsKey(2)) { CF-Section ([int]$sByNo[2].KY) } else { @{ lines=@(); net=0 } }
  $fin = if ($sByNo.ContainsKey(3)) { CF-Section ([int]$sByNo[3].KY) } else { @{ lines=@(); net=0 } }
  $netRaw = $op.net + $inv.net + $fin.net

  # Cash accounts + opening balance from the reconciliation section's
  # "beginning" line - self-describing, so we never hardcode the cash accounts.
  $cashAccts = @()
  if ($sByNo.ContainsKey(5)) {
    foreach ($ln in (Invoke-Rows ("SELECT KY, DESCRIPT FROM FRLINE WHERE SECTKY = " + [int]$sByNo[5].KY))) {
      if (([string]$ln.DESCRIPT).Trim() -match 'beginning') {
        if ($linksByLine.ContainsKey([int]$ln.KY)) {
          foreach ($a in $linksByLine[[int]$ln.KY]) { $cashAccts += ([string]$a.GLACCOUNT).Trim() }
        }
      }
    }
  }
  # Actual change in cash = movement in the cash accounts (debit-normal assets,
  # so DR-CR). This is the GROUND TRUTH the statement must reconcile to.
  $cashSet = @{}; foreach ($acc in $cashAccts) { $cashSet[$acc] = $true }
  $cashEndActual = 0.0; $cashMove = 0.0
  foreach ($acc in $cashAccts) {
    if ($balAt.ContainsKey($acc)) { $cashEndActual += $balAt[$acc] }
    if ($mv.ContainsKey($acc))    { $cashMove += ($mv[$acc].dr - $mv[$acc].cr) }
  }

  # Pick the orientation of the report lines that sits closest to actual cash.
  # (The diagnostic proved sign=1 for Hope Vale; this keeps it robust anyway.)
  $sign = if ([math]::Abs($cashMove - (-$netRaw)) -lt [math]::Abs($cashMove - $netRaw)) { -1 } else { 1 }
  $apply = {
    param($sec)
    $ls = @()
    foreach ($l in $sec.lines) { $ls += [ordered]@{ label = $l.label; amount = (R2 ($l.amount * $sign)) } }
    return [ordered]@{ lines = $ls; net = (R2 ($sec.net * $sign)) }
  }
  $opF = & $apply $op; $invF = & $apply $inv; $finF = & $apply $fin

  # RESIDUAL. Report 739's account links are stale - accounts added since the
  # report was last configured (QBuild revenue, several wage accounts, project
  # management) moved cash but aren't mapped to any line. The diagnostic
  # (15-probe-cashflow-recon.ps1) proved this is the ENTIRE gap and that the
  # LINKED accounts are computed correctly.
  #
  # residual = actual cash movement - what the report classified. Attributing it
  # to a clearly-labelled "Other operating" line makes the statement reconcile to
  # the penny and stays honest: it shows exactly what the FR report captured, and
  # what it didn't. The unclassified accounts are listed so the Council can add
  # them to report 739 in Practical.
  $reportNet = R2 ($opF.net + $invF.net + $finF.net)
  $residual  = R2 ($cashMove - $reportNet)

  # The specific unclassified movers, for the note (operating/asset accounts only;
  # the equity surplus roll-up and the cash accounts are non-cash / not applicable).
  $unclassified = @()
  foreach ($acc in $mv.Keys) {
    if ($cashSet.ContainsKey($acc)) { continue }
    if ($linkedSet.ContainsKey($acc)) { continue }
    if ($accType.ContainsKey($acc) -and $accType[$acc] -notin @(5,6,7,8)) { continue }  # skip equity/liab roll-ups
    $m = R2 ($mv[$acc].cr - $mv[$acc].dr)
    if ([math]::Abs($m) -lt 0.005) { continue }
    $unclassified += [pscustomobject]@{ acc = $acc; name = $accName[$acc]; move = $m }
  }
  $unclassified = @($unclassified | Sort-Object { [math]::Abs($_.move) } -Descending)

  if ([math]::Abs($residual) -ge 0.005) {
    $opLines = @($opF.lines)
    $opLines += [ordered]@{ label = 'Other operating receipts and payments (not classified in the FR report)'; amount = $residual }
    $opF = [ordered]@{ lines = $opLines; net = (R2 ($opF.net + $residual)) }
  }

  $netChange = R2 ($opF.net + $invF.net + $finF.net)   # == cashMove by construction
  $cashStart = R2 ($cashEndActual - $cashMove)
  $cashEnd   = R2 ($cashStart + $netChange)
  $cfGap     = R2 ($netChange - $cashMove)

  $cashFlow = [ordered]@{
    operating = [ordered]@{ label='Cash flows from operating activities'; lines=$opF.lines; net=$opF.net }
    investing = [ordered]@{ label='Cash flows from investing activities'; lines=$invF.lines; net=$invF.net }
    financing = [ordered]@{ label='Cash flows from financing activities'; lines=$finF.lines; net=$finF.net }
    netChange = $netChange
    cashStart = $cashStart
    cashEnd   = $cashEnd
    # The accounts report 739 itself treats as cash. Publishing them turns the
    # "Balance Sheet cash doesn't match Cash Flow cash" check from a mystery
    # dollar gap into a named list of accounts one statement counts and the
    # other doesn't - which is a question the Council can actually answer.
    cashAccounts = @($cashAccts)
    asAt      = $periodLabel
  }
  Write-Host ("Cash Flow (report 739): net change {0:N2}, reconciles to cash movement (gap {1:N2})." -f $netChange, $cfGap) -ForegroundColor Green
  if ([math]::Abs($residual) -ge 1) {
    Write-Host ("  NOTE: {0:N2} of cash movement across {1} account(s) is not in report 739's line mapping" -f $residual, $unclassified.Count) -ForegroundColor Yellow
    Write-Host "        (shown as 'Other operating'). These should be added to the Cash Flow report in Practical:" -ForegroundColor Yellow
    foreach ($u in ($unclassified | Select-Object -First 8)) {
      Write-Host ("          {0}  {1,-32} {2,14:N2}" -f $u.acc, $u.name, $u.move) -ForegroundColor DarkGray
    }
  }
} catch {
  Write-Host ("Cash Flow build skipped: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# -- 6c3. statutory ratio inputs (operating vs capital, from FR reports) -------
# The Queensland sustainability ratios need OPERATING revenue/expenses separated
# from CAPITAL - and Practical already defines that split in its own FR reports:
#     report 743 = "Operating income:"   / "Capital income:"
#     report 744 = "Operating expenses:" / "Capital expenses:"
# Reading those is authoritative. Guessing which accounts are capital would be
# exactly the kind of invented rule this platform exists to avoid.
#
# Hope Vale is a TIER 8 council (confirmed from their audited FY2025 Financial
# Sustainability Statement). Tier 8's benchmarks: operating cash ratio > 0%,
# unrestricted cash cover > 4 months, asset sustainability > 90%, asset
# consumption > 60%. The OPERATING SURPLUS RATIO IS CONTEXTUAL - it has NO
# benchmark for Tier 8, and must never be red-flagged.
# CRITICAL: these ratios are ANNUAL measures. Feeding them a year-to-date figure
# from month 1 produces nonsense - Hope Vale raises its rates and receives most of
# its grants later in the year, so operating revenue at 31 July is a few hundred
# dollars and the ratio explodes (we shipped -8,815% before catching this).
#
# So we emit TWO sets of inputs:
#   ytd       - the current year to date. Indicative only; never benchmarked.
#   priorYear - the LAST COMPLETE financial year, from GLBAL.LASTYEAR at period 12
#               over the same FR-linked accounts. THIS is what gets benchmarked.
$statutory = $null
try {
  # Closing balance per account for the current period, and last year's full-year
  # close. Built here rather than reused from the Cash Flow block, which may have
  # been skipped - a statutory figure must not silently depend on that succeeding.
  $balNow = @{}
  foreach ($r in (Invoke-Rows "SELECT b.GLACCOUNT, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL FROM GLBAL b WHERE b.MTH = $cur")) {
    $balNow[([string]$r.GLACCOUNT).Trim()] = [double]$r.BAL
  }
  $balLy = @{}
  foreach ($r in (Invoke-Rows "SELECT b.GLACCOUNT, CAST(b.LASTYEAR AS DOUBLE PRECISION) AS BAL FROM GLBAL b WHERE b.MTH = 12")) {
    $balLy[([string]$r.GLACCOUNT).Trim()] = [double]$r.BAL
  }

  # WHICH REPORT SUPPLIES THE SPLIT.
  #
  # 743/744 were the obvious choice - their sections are literally called
  # "Operating income:" and "Capital income:" - and they are WRONG. They are the
  # by-FUNCTION note (the segment analysis), their account links are stale, and
  # 17-probe-fr-income.ps1 measured exactly how stale: report 743 accounts for
  # 34% of the Council's income and reports capital income as $0.00. It produced a
  # confident, plausible operating surplus ratio of -30.25% against an audited
  # +23.20%. Nothing about the number looked wrong; only the reconciliation caught it.
  #
  # RPTKY 804 is the real Statement of Comprehensive Income, and it reconciles:
  #     1.1.1 Recurrent revenue   303 accounts   FY2025-26  23,005,644.86
  #     1.1.2 Capital revenue      96 accounts               6,472,480.34
  #     2.1   Recurrent expenses  558 accounts              20,116,408.93
  #     2.2   Capital expenses      5 accounts                       0.00
  # Income accounted for: 100.0% (a single $317.80 account unlinked).
  # => operating surplus ratio 12.6% for FY2025-26. Sane, and the right sign.
  #
  # "Recurrent" is the accounting term for what the Guideline calls "operating".
  $FR_RPT     = 804
  $RX_OP_INC  = '^\s*1\.1\.1\b|Recurrent revenue'
  $RX_CAP_INC = '^\s*1\.1\.2\b|Capital revenue'
  $RX_OP_EXP  = '^\s*2\.1\b|Recurrent expenses'
  $RX_CAP_EXP = '^\s*2\.2\b|Capital expenses'

  # LOAD THE REPORT'S STRUCTURE ONCE.
  #
  # This used to be a classic N+1: for each of the four sections we wanted, and
  # for BOTH balance maps (this year and last), it re-queried FRSECTION, then ran
  # one query per line, then one query per line's account links. Eight calls, each
  # firing twenty-odd round trips - several hundred queries to Firebird, to read a
  # report definition that does not change between the first call and the eighth.
  #
  # Three queries now. The section -> line -> account structure is loaded into
  # memory and every total is summed from that. On a server that feeds three times
  # a day, forever, an avoidable query is a cost the Council pays forever too.
  $frSections = Invoke-Rows "SELECT KY, TITLE FROM FRSECTION WHERE RPTKY = $FR_RPT"
  $frLines    = Invoke-Rows "SELECT KY, SECTKY FROM FRLINE WHERE SECTKY IN (SELECT KY FROM FRSECTION WHERE RPTKY = $FR_RPT)"
  $frLinks    = Invoke-Rows "SELECT LNKY, GLACCOUNT, INVERT FROM FRACCNTLINK WHERE RPTKY = $FR_RPT"

  # line KY -> its account links
  $linksOfLine = @{}
  foreach ($a in $frLinks) {
    $lk = [int]$a.LNKY
    if (-not $linksOfLine.ContainsKey($lk)) { $linksOfLine[$lk] = @() }
    $linksOfLine[$lk] += $a
  }
  # section KY -> every account it references, with its invert flag, flattened.
  $acctsOfSection = @{}
  foreach ($ln in $frLines) {
    $sk = [int]$ln.SECTKY
    $lk = [int]$ln.KY
    if (-not $linksOfLine.ContainsKey($lk)) { continue }
    if (-not $acctsOfSection.ContainsKey($sk)) { $acctsOfSection[$sk] = @() }
    $acctsOfSection[$sk] += $linksOfLine[$lk]
  }

  # Sum a balance map over every account under a section whose title matches
  # $pattern. Pure memory - no database.
  function FR-SectionTotal([string]$pattern, $balMap) {
    $total = 0.0
    foreach ($s in $frSections) {
      if (([string]$s.TITLE).Trim() -notmatch $pattern) { continue }
      $sk = [int]$s.KY
      if (-not $acctsOfSection.ContainsKey($sk)) { continue }
      foreach ($a in $acctsOfSection[$sk]) {
        $acc = ([string]$a.GLACCOUNT).Trim()
        if (-not $balMap.ContainsKey($acc)) { continue }
        $v = $balMap[$acc]
        if (([string]$a.INVERT).Trim().ToUpper() -eq 'Y') { $v = -$v }
        $total += $v
      }
    }
    return (R2 $total)
  }

  function FR-Inputs($balMap) {
    return [ordered]@{
      operatingRevenue  = (FR-SectionTotal $RX_OP_INC  $balMap)
      capitalRevenue    = (FR-SectionTotal $RX_CAP_INC $balMap)
      operatingExpenses = (FR-SectionTotal $RX_OP_EXP  $balMap)
      capitalExpenses   = (FR-SectionTotal $RX_CAP_EXP $balMap)
    }
  }

  $ytdIn = FR-Inputs $balNow
  $lyIn  = FR-Inputs $balLy
  $lyDeprec = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ISCONTROL='N' AND m.ACCNTTYPE=6")

  # RECONCILE OR REFUSE.
  #
  # An FR report only tells the truth about the operating/capital split if it
  # actually classifies the whole ledger. Measure it, and if it doesn't add up,
  # emit NOTHING. A missing ratio is an honest gap; a confident wrong one in front
  # of the CEO is a liability.
  #
  # NOTE WHAT THE EXPENSE GROUND TRUTH IS. Practical holds depreciation twice:
  #     1282-2000-0000  Depreciation                        5,385,453.82  <- parent
  #     1282-2000-0100    Depreciation Estimation Current Yr  5,383,564.92
  #     1282-2000-0001    Depreciation - Funded Component         1,888.90
  # The two children sum to the parent EXACTLY. The parent is a roll-up flagged
  # ISCONTROL='N'; the children are the postings. So SUM(all type-6) counts
  # depreciation twice and is NOT the Council's expense total - the ISCONTROL='Y'
  # sum is, and it is the figure whose net result ties to audited equity within
  # $5,141. Report 804 links the PARENT, the P&L picks up the CHILDREN; both carry
  # depreciation exactly once, which is why the two agree to within 1.4%.
  $glIncomeLy  = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5")
  $glExpenseLy = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6")
  $rptIncomeLy  = R2 ($lyIn.operatingRevenue  + $lyIn.capitalRevenue)
  $rptExpenseLy = R2 ($lyIn.operatingExpenses + $lyIn.capitalExpenses)
  $covInc = $(if ($glIncomeLy  -ne 0) { 100 * $rptIncomeLy  / $glIncomeLy }  else { 0 })
  $covExp = $(if ($glExpenseLy -ne 0) { 100 * $rptExpenseLy / $glExpenseLy } else { 0 })

  Write-Host ""
  Write-Host ("Statutory source check - does FR report {0} account for the whole ledger?" -f $FR_RPT) -ForegroundColor Cyan
  Write-Host ("  income  : report {0,15:N2} vs GL {1,15:N2}  = {2,6:N1}%  (expect ~100)" -f $rptIncomeLy, $glIncomeLy, $covInc)
  Write-Host ("  expenses: report {0,15:N2} vs GL {1,15:N2}  = {2,6:N1}%  (expect ~100)" -f $rptExpenseLy, $glExpenseLy, $covExp)

  # +/-5%. Tighter than that and the depreciation parent/child mismatch (1.4%)
  # trips it; looser and a genuinely stale report could slip through.
  if ($covInc -lt 95 -or $covInc -gt 105 -or $covExp -lt 95 -or $covExp -gt 105) {
    Write-Host ""
    Write-Host "  NOT EMITTING the statutory ratios this run." -ForegroundColor Red
    Write-Host ("  FR report {0} does not classify the whole general ledger, so any" -f $FR_RPT) -ForegroundColor Red
    Write-Host "  operating/capital split taken from it would be wrong. The dashboard will" -ForegroundColor Red
    Write-Host "  show 'needs data' rather than a confident, incorrect percentage." -ForegroundColor Red
    Write-Host "  Run 17-probe-fr-income.ps1 - it reports which report DOES reconcile." -ForegroundColor Yellow
    throw "FR report $FR_RPT does not reconcile to the GL (income $([math]::Round($covInc,1))%, expenses $([math]::Round($covExp,1))%)"
  }

  $statutory = [ordered]@{
    tier = 8
    # Year to date. monthOfYear says how far through the year this is; the app
    # refuses to benchmark it until the year is complete.
    ytd = [ordered]@{
      operatingRevenue  = $ytdIn.operatingRevenue
      capitalRevenue    = $ytdIn.capitalRevenue
      operatingExpenses = $ytdIn.operatingExpenses
      capitalExpenses   = $ytdIn.capitalExpenses
      depreciation      = $deprec
      operatingCashFlow = $(if ($cashFlow) { $cashFlow.operating.net } else { $null })
      monthOfYear       = $cur
    }
    # The last COMPLETE financial year - what the ratios are actually reported on.
    # operatingCashFlow is null here on purpose: GLBAL keeps DEBIT/CREDIT movement
    # for the CURRENT year only, so a prior-year cash flow cannot be rebuilt from
    # it. Inventing one would be worse than admitting we don't have it.
    priorYear = [ordered]@{
      fyLabel           = $pyFyLabel
      operatingRevenue  = $lyIn.operatingRevenue
      capitalRevenue    = $lyIn.capitalRevenue
      operatingExpenses = $lyIn.operatingExpenses
      capitalExpenses   = $lyIn.capitalExpenses
      depreciation      = $lyDeprec
      operatingCashFlow = $null
    }
    source = "FR report $FR_RPT (Statement of Comprehensive Income: recurrent vs capital); tier from the audited FY2025 Financial Sustainability Statement"
  }
  Write-Host ("Statutory inputs YTD (month {0}): op revenue {1:N2}, op expenses {2:N2}, capital revenue {3:N2}" -f `
    $cur, $ytdIn.operatingRevenue, $ytdIn.operatingExpenses, $ytdIn.capitalRevenue) -ForegroundColor Cyan
  Write-Host ("Statutory inputs {0} (FULL YEAR - this is what gets benchmarked):" -f $pyFyLabel) -ForegroundColor Cyan
  Write-Host ("    op revenue {0,16:N2}   op expenses {1,16:N2}" -f $lyIn.operatingRevenue, $lyIn.operatingExpenses)
  Write-Host ("    cap revenue{0,16:N2}   depreciation{1,15:N2}" -f $lyIn.capitalRevenue, $lyDeprec)
  if ($lyIn.operatingRevenue -gt 0) {
    $osr = 100 * ($lyIn.operatingRevenue - $lyIn.operatingExpenses) / $lyIn.operatingRevenue
    Write-Host ("    => operating surplus ratio {0:N2}%   (audited FY2025 was 23.20% - a similar order is expected)" -f $osr) -ForegroundColor Green
  } else {
    Write-Host "    => operating revenue is not positive - the FR 743 section titles may not match. Tell Nathan." -ForegroundColor Red
  }
} catch {
  Write-Host ("Statutory ratio inputs skipped: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# =============================================================================
# 6f. COMMITMENTS - outstanding purchase orders (deliverable C4)
# =============================================================================
# I told Nathan twice that capital commitments were unobtainable. Both times I
# was wrong, and the second time I was wrong for a better reason:
#
#   - FR report 787 has a section literally called "(d) Capital commitments" -
#     but it is an ABANDONED TEMPLATE. Zero accounts linked to any line, and the
#     text still names a refuse contract expiring 30 June 2003.
#   - The Works Orders tables (WOORDERS) are permission-LOCKED.
#   - But the PURCHASE ORDER module is right there and readable:
#         OPMST  7,029 orders     OPDET  8,919 order lines
#     and OPDET.COMMITBAL is exactly what we need: the value ordered but not yet
#     invoiced. That IS the commitment.
#
# Capital vs operating is decided by the GL account each order line posts to -
# an asset account (ACCNTTYPE 7/8) is capital, an expense account (6) is
# operating. No invented rule; the chart of accounts already says which is which.
$commitments = $null
try {
  # NO "WHERE COMMITBAL <> 0" HERE.
  #
  # That is what I wrote first, and it returned 0 rows from a table of 8,919.
  # In SQL, NULL <> 0 evaluates to UNKNOWN, not TRUE - so if COMMITBAL is null on
  # the open lines, the filter throws away every one of them and the result reads
  # as "no commitments" rather than "the query was wrong". Exactly the same shape
  # of mistake as RDB$SYSTEM_FLAG = 0, which made the module probe find 1 table
  # out of 914.
  #
  # 8,919 rows is nothing. Read them all and filter in PowerShell, where R2()
  # turns a null into 0 instead of silently dropping the row.
  $coRows = Invoke-Rows @"
SELECT d.GLACCOUNT, d.JCACCOUNT, d.ITEMDESC, d.STATUS, d.COMPIND,
       CAST(d.COMMITBAL AS DOUBLE PRECISION) AS COMMITBAL,
       CAST(d.ESTVALUE AS DOUBLE PRECISION) AS ESTVALUE,
       CAST(d.AMTINV AS DOUBLE PRECISION) AS AMTINV,
       m.ORDERNUM, m.ORDERDATE, m.CREDNAME
FROM OPDET d JOIN OPMST m ON m.KY = d.MSTKY
"@
  Write-Host ("  OPDET: {0} order line(s) read." -f $coRows.Count) -ForegroundColor DarkGray

  # GL account -> type/name, so we can classify a commitment without guessing.
  $glType = @{}; $glName2 = @{}
  foreach ($r in (Invoke-Rows "SELECT GLACCOUNT, DESCRIPT, ACCNTTYPE FROM GLMST")) {
    $a = ([string]$r.GLACCOUNT).Trim()
    $glType[$a] = [int]$r.ACCNTTYPE
    $glName2[$a] = ([string]$r.DESCRIPT).Trim()
  }

  # HOW THE COMMITMENT IS MEASURED, and why not the obvious way.
  #
  # COMMITBAL is ZERO on all 8,919 rows (19-probe-orders.ps1 counted them: not
  # null - actually zero). Hope Vale does not use Practical's commitment field.
  # JCMST.COMTOT is empty too. So the field designed for this answer is unusable,
  # and the commitment has to come from the order lines themselves:
  #
  #     outstanding = ESTVALUE - AMTINV      (ordered, less invoiced)
  #
  # PER LINE, FLOORED AT ZERO, and only where the line is not yet fully invoiced.
  # Every one of those qualifiers is load-bearing:
  #
  #   * Per line, floored - summing the raw difference across the whole table
  #     gives MINUS $221,170, because closed orders routinely invoice for more
  #     than they estimated. A negative commitment is not a thing.
  #   * Not fully invoiced (QTYINV < QTYORDERED) - a line that has been invoiced
  #     in full is finished, whatever the money says.
  #
  # The ten newest orders prove the shape: ordered 10 Jul 2026, quantity
  # delivered 0, invoiced 0, ESTVALUE $1,500. That is a live commitment.
  #
  # AGE. An un-invoiced order from 2019 is not a commitment, it is a line nobody
  # ever closed off. We split them: `total` counts orders raised in the last 12
  # months, `stale` reports the rest so it is visible rather than quietly dropped.
  $STALE_AFTER_DAYS = 365
  $today = Get-Date

  # GL account. COSTTYPE 'J' lines (8,504 of 8,919) are job-costed and carry a
  # BLANK GLACCOUNT - the account lives on the job. Resolve through JCMST, and
  # count anything we still can't place rather than silently calling it operating.
  #
  # $jobRows is JCMST, already read in full by the job-budget section above.
  # Re-querying its 4,118 rows to fetch two columns we are holding in memory is a
  # round trip the Council pays for three times a day and gets nothing back for.
  $jobToGl = @{}
  if ($jobRows -and (Test-JcCol 'JCACCOUNT') -and (Test-JcCol 'PYGLACC')) {
    foreach ($j in $jobRows) {
      $jk = ([string]$j.JCACCOUNT).Trim()
      $jg = ([string]$j.PYGLACC).Trim()
      if ($jk -and $jg) { $jobToGl[$jk] = $jg }
    }
  }

  $capTotal = 0.0; $opTotal = 0.0; $unTotal = 0.0; $staleTotal = 0.0
  $staleCount = 0
  $coLines = @()
  foreach ($r in $coRows) {
    $est = R2 $r.ESTVALUE
    $inv = R2 $r.AMTINV
    $qOrd = R2 $r.QTYORDERED
    $qInv = R2 $r.QTYINV

    # Fully invoiced = finished, regardless of what the amounts say.
    if ($qOrd -gt 0 -and $qInv -ge $qOrd) { continue }
    $amt = R2 ($est - $inv)
    if ($amt -le 0.005) { continue }          # floored at zero, per line

    $od = ''; $ageDays = 99999
    if ($r.ORDERDATE) {
      try {
        $d = [datetime]$r.ORDERDATE
        $od = $d.ToString('yyyy-MM-dd')
        $ageDays = ($today - $d).TotalDays
      } catch { $od = '' }
    }
    if ($ageDays -gt $STALE_AFTER_DAYS) {
      $staleTotal += $amt; $staleCount++
      continue                                 # counted, but never called a commitment
    }

    # Direct GL account, else the job's GL account, else unclassified.
    $gl = ([string]$r.GLACCOUNT).Trim()
    $jc = ([string]$r.JCACCOUNT).Trim()
    if (-not $gl -and $jc) {
      if ($jobToGl.ContainsKey($jc)) { $gl = $jobToGl[$jc] }
      elseif ($glType.ContainsKey($jc)) { $gl = $jc }   # some lines carry a GL code in JCACCOUNT
    }
    $t = $(if ($gl -and $glType.ContainsKey($gl)) { $glType[$gl] } else { 0 })
    $kind = if ($t -eq 7 -or $t -eq 8) { 'capital' } elseif ($t -eq 6) { 'operating' } else { 'unclassified' }
    if     ($kind -eq 'capital')   { $capTotal += $amt }
    elseif ($kind -eq 'operating') { $opTotal  += $amt }
    else                           { $unTotal  += $amt }

    $coLines += [pscustomobject]@{
      orderNo   = ([string]$r.ORDERNUM).Trim()
      orderDate = $od
      supplier  = ([string]$r.CREDNAME).Trim()
      item      = ([string]$r.ITEMDESC).Trim()
      code      = $gl
      account   = $(if ($gl -and $glName2.ContainsKey($gl)) { $glName2[$gl] } else { '' })
      jobCode   = $jc
      kind      = $kind
      amount    = $amt
    }
  }
  $coLines = @($coLines | Sort-Object { -[double]$_.amount })

  # Committed-by-job, so the Job Budgets page can show budget / actual / committed.
  $commitByJob = @{}
  foreach ($l in $coLines) {
    $jc = $l.jobCode
    if ($jc.Length -lt 9) { continue }
    $k = $jc.Substring(0, 9)
    if (-not $commitByJob.ContainsKey($k)) { $commitByJob[$k] = 0.0 }
    $commitByJob[$k] = [double]$commitByJob[$k] + [double]$l.amount
  }
  $jobCommitments = @()
  foreach ($k in ($commitByJob.Keys | Sort-Object)) {
    if ([math]::Abs($commitByJob[$k]) -lt 0.005) { continue }
    $jobCommitments += [ordered]@{ code = $k; amount = (R2 $commitByJob[$k]) }
  }

  if ($coLines.Count -eq 0) {
    # Never publish a zero as though it were a finding. 8,919 order lines that
    # yield no commitment means the wrong column was read, not that the Council
    # has ordered nothing.
    $commitments = $null
    Write-Host ("Commitments (C4): NOT EMITTED - {0} order lines read, none outstanding. That is suspicious; check 19-probe-orders.ps1." -f $coRows.Count) -ForegroundColor Red
  } else {
    $commitments = [ordered]@{
      capital      = R2 $capTotal
      operating    = R2 $opTotal
      unclassified = R2 $unTotal
      total        = R2 ($capTotal + $opTotal + $unTotal)
      orderCount   = $coLines.Count
      # Un-invoiced order lines older than a year. NOT counted as commitments -
      # they are almost certainly orders nobody ever closed off. Reported anyway,
      # because a number quietly dropped is a number nobody can question.
      stale        = R2 $staleTotal
      staleCount   = $staleCount
      # The 200 biggest. The snapshot is not an archive, and nobody reads past the
      # top of a commitments schedule.
      lines        = @($coLines | Select-Object -First 200 | ForEach-Object {
                       [ordered]@{ orderNo=$_.orderNo; orderDate=$_.orderDate; supplier=$_.supplier
                                   item=$_.item; code=$_.code; account=$_.account
                                   jobCode=$_.jobCode; kind=$_.kind; amount=$_.amount } })
      byJob        = $jobCommitments
      asAt         = $periodLabel
      source       = 'Purchase orders (OPMST/OPDET): value ordered less value invoiced, per line, on lines not yet fully invoiced and raised in the last 12 months. Practical''s COMMITBAL field is unused at this site (zero on all 8,919 lines), so it cannot be used. Capital vs operating from the GL account the line posts to (via the job, for job-costed lines).'
    }
    Write-Host ("Commitments (C4): capital {0:N2}, operating {1:N2}, unclassified {2:N2} across {3} open order line(s)." -f `
      $commitments.capital, $commitments.operating, $commitments.unclassified, $commitments.orderCount) -ForegroundColor Green
    Write-Host ("    total committed: {0:N2}" -f $commitments.total) -ForegroundColor Green
    if ($staleCount -gt 0) {
      Write-Host ("    plus {0:N2} on {1} order line(s) over a year old - EXCLUDED (orders never closed off, not commitments)." -f $staleTotal, $staleCount) -ForegroundColor Yellow
    }
    if ($unTotal -ne 0) {
      Write-Host ("    {0:N2} could not be classified capital/operating - no GL account on the line or its job." -f $unTotal) -ForegroundColor Yellow
    }
  }
} catch {
  Write-Host ("Commitments skipped: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# =============================================================================
# 6g. RECEIVABLES / PAYABLES AGEING (deliverable B4)
# =============================================================================
# DRMST (debtors) and CRMST (creditors) already carry the 30/60/90 buckets -
# Practical ages them at end of month, so nothing needs computing here.
#
# The buckets reconcile exactly for debtors:
#     BALANCE00 + BALANCE30 + BALANCE60 + BALANCE90 = BALANCE
# CRMST has NO BALANCE00 column, so the current bucket is the remainder. Do not
# assume the two tables have the same shape - they don't.
$ageing = $null
try {
  function Age-Table([string]$tbl, [string]$keyCol, [bool]$hasCurrent) {
    $cur0 = $(if ($hasCurrent) { ', CAST(BALANCE00 AS DOUBLE PRECISION) AS B00' } else { '' })
    $rows = Invoke-Rows ("SELECT $keyCol AS ID, NAME, CAST(BALANCE AS DOUBLE PRECISION) AS BAL, " +
      "CAST(BALANCE30 AS DOUBLE PRECISION) AS B30, CAST(BALANCE60 AS DOUBLE PRECISION) AS B60, " +
      "CAST(BALANCE90 AS DOUBLE PRECISION) AS B90" + $cur0 + " FROM $tbl WHERE BALANCE <> 0")

    $t = @{ current = 0.0; d30 = 0.0; d60 = 0.0; d90 = 0.0; total = 0.0 }
    $accts = @()
    foreach ($r in $rows) {
      $bal = R2 $r.BAL
      $b30 = R2 $r.B30; $b60 = R2 $r.B60; $b90 = R2 $r.B90
      # Current = the explicit column when it exists, otherwise the remainder.
      $b00 = $(if ($hasCurrent) { R2 $r.B00 } else { R2 ($bal - $b30 - $b60 - $b90) })
      $t.current += $b00; $t.d30 += $b30; $t.d60 += $b60; $t.d90 += $b90; $t.total += $bal
      $accts += [pscustomobject]@{
        id = ([string]$r.ID).Trim(); name = ([string]$r.NAME).Trim()
        current = $b00; d30 = $b30; d60 = $b60; d90 = $b90; total = $bal
      }
    }
    $accts = @($accts | Sort-Object { -[double]$_.total })
    return [ordered]@{
      current  = R2 $t.current
      days30   = R2 $t.d30
      days60   = R2 $t.d60
      days90   = R2 $t.d90
      total    = R2 $t.total
      count    = $accts.Count
      accounts = @($accts | Select-Object -First 60 | ForEach-Object {
                   [ordered]@{ id=$_.id; name=$_.name; current=$_.current
                               days30=$_.d30; days60=$_.d60; days90=$_.d90; total=$_.total } })
    }
  }

  $ageing = [ordered]@{
    receivables = (Age-Table 'DRMST' 'DEBTOR'   $true)    # DRMST HAS BALANCE00
    payables    = (Age-Table 'CRMST' 'CREDITOR' $false)   # CRMST does NOT
    asAt        = $periodLabel
    source      = "Practical's own ageing buckets (DRMST / CRMST, aged at end of month)."
  }
  Write-Host ("Ageing (B4): receivables {0:N2} ({1:N2} over 90 days), payables {2:N2}." -f `
    $ageing.receivables.total, $ageing.receivables.days90, $ageing.payables.total) -ForegroundColor Green
  if ($ageing.receivables.total -gt 0) {
    $pct90 = 100 * $ageing.receivables.days90 / $ageing.receivables.total
    $c = if ($pct90 -gt 40) { 'Yellow' } else { 'Green' }
    Write-Host ("    {0:N1}% of money owed to the Council is more than 90 days overdue." -f $pct90) -ForegroundColor $c
  }
} catch {
  Write-Host ("Ageing skipped: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# =============================================================================
# 6h. ASSETS - for the Asset Consumption ratio (B8)
# =============================================================================
# NOT from the asset register. ARMST holds 1,360 assets, but its totals do not
# reconcile: gross 99.0M less accumulated depreciation 78.0M = 21.0M written
# down, against ~127M of non-current assets on the balance sheet, and every
# asset sampled had YEAROPENVAL = 0. The register is not maintained, and a ratio
# built on it would read ~21% against the Council's audited 59.18%.
#
# ARGROUP gives us something better: the GL ACCOUNTS behind each asset class.
#     Infrastructure   cost 0290-4000-0100  reval ...-0200  accum dep 0295-4010-0000
#     Land             cost 0210-4000-0100                  (none - not depreciable)
# Reading the ledger instead means the ratio reconciles to the balance sheet by
# construction, and land drops out on its own because it has no depreciation
# account - which is exactly the accounting treatment.
#
# CAREFUL: several groups share one set of accounts (5, 9 and 10 all point at the
# same infrastructure accounts). Summing per GROUP would count ~$90M of
# infrastructure three times. Dedupe on the account triple, not the group.
$assets = $null
try {
  # $balNow is built in the statutory block. If that block threw, it may not
  # exist - and the asset ratio must not silently depend on the statutory one
  # having succeeded. Rebuild it here if we have to.
  if (-not $balNow -or $balNow.Count -eq 0) {
    $balNow = @{}
    foreach ($r in (Invoke-Rows "SELECT b.GLACCOUNT, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL FROM GLBAL b WHERE b.MTH = $cur")) {
      $balNow[([string]$r.GLACCOUNT).Trim()] = [double]$r.BAL
    }
  }
  $grpRows = Invoke-Rows "SELECT GROUPNO, DESCRIPTION, DEFASSETGLACC, DEFREVALGLACC, DEFACCUMDEPGLACC FROM ARGROUP"
  $seenTriple = @{}
  $classes = @()
  $grossDep = 0.0; $wdvDep = 0.0; $accumDep = 0.0; $landTotal = 0.0

  foreach ($g in $grpRows) {
    $ac = ([string]$g.DEFASSETGLACC).Trim()
    $rc = ([string]$g.DEFREVALGLACC).Trim()
    $dc = ([string]$g.DEFACCUMDEPGLACC).Trim()
    if (-not $ac) { continue }
    $triple = "$ac|$rc|$dc"
    if ($seenTriple.ContainsKey($triple)) { continue }   # <- the triple-count guard
    $seenTriple[$triple] = $true

    $cost  = $(if ($balNow.ContainsKey($ac)) { R2 $balNow[$ac] } else { 0 })
    $reval = $(if ($rc -and $balNow.ContainsKey($rc)) { R2 $balNow[$rc] } else { 0 })
    # Accumulated depreciation is credit-normal, so it sits NEGATIVE in the ledger.
    $adep  = $(if ($dc -and $balNow.ContainsKey($dc)) { R2 $balNow[$dc] } else { 0 })
    $gross = R2 ($cost + $reval)
    $wdv   = R2 ($gross + $adep)
    if ($gross -eq 0 -and $wdv -eq 0) { continue }

    # No depreciation account = not a depreciable asset (land). It belongs on the
    # balance sheet but must NOT be in the asset consumption ratio.
    $depreciable = [bool]$dc
    if ($depreciable) { $grossDep += $gross; $wdvDep += $wdv; $accumDep += $adep }
    else              { $landTotal += $wdv }

    $classes += [ordered]@{
      name        = ([string]$g.DESCRIPTION).Trim()
      depreciable = $depreciable
      cost        = $cost
      revaluation = $reval
      gross       = $gross
      accumulatedDepreciation = $adep
      writtenDownValue        = $wdv
    }
  }

  # CAPITAL WORKS IN PROGRESS. The 0205-4xxx series - one non-current asset
  # account per capital project (NDRRA, W4Q, LRCI, Secure Communities...), the
  # same programs the grant register funds. These are NOT in ARGROUP because they
  # aren't asset classes yet: they're spend accumulating until the work is
  # finished and capitalised. Correctly excluded from the consumption ratio (WIP
  # isn't depreciated), but far too useful to leave out of the snapshot.
  $wipRows = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE = 8
  AND m.GLACCOUNT LIKE '0205-%' AND b.BALANCE <> 0
ORDER BY b.BALANCE DESC
"@
  $wip = @(); $wipTotal = 0.0
  foreach ($r in $wipRows) {
    $v = R2 $r.BAL
    $wipTotal += $v
    $wip += [ordered]@{
      code    = ([string]$r.GLACCOUNT).Trim()
      project = ([string]$r.DESCRIPT).Trim()
      amount  = $v
    }
  }

  $consumption = $(if ($grossDep -gt 0) { R2 (100 * $wdvDep / $grossDep) } else { $null })
  $assets = [ordered]@{
    classes = @($classes | Sort-Object { -[double]$_.gross })
    grossDepreciable       = R2 $grossDep
    writtenDownDepreciable = R2 $wdvDep
    accumulatedDepreciation = R2 $accumDep
    nonDepreciable         = R2 $landTotal   # land
    consumptionRatio       = $consumption    # percent
    # Capital works in progress, one line per project.
    workInProgress         = $wip
    workInProgressTotal    = R2 $wipTotal
    asAt                   = $periodLabel
    source = 'GL asset accounts, mapped by class from ARGROUP. Not from ARMST, whose totals do not reconcile to the balance sheet (gross 99.0M vs the ledger''s ~171M). Work in progress is the 0205 series, excluded from the consumption ratio because it is not yet depreciated.'
  }
  Write-Host ("Assets (B8): depreciable gross {0:N2}, written down {1:N2}" -f $assets.grossDepreciable, $assets.writtenDownDepreciable) -ForegroundColor Green
  if ($null -ne $consumption) {
    Write-Host ("    => asset consumption ratio {0:N2}%   (audited FY2025 was 59.18% - expect the same order)" -f $consumption) -ForegroundColor Green
  }
  Write-Host ("    land / non-depreciable: {0:N2}" -f $assets.nonDepreciable) -ForegroundColor DarkGray
  Write-Host ("    capital works in progress: {0:N2} across {1} project(s)" -f $assets.workInProgressTotal, $wip.Count) -ForegroundColor Cyan
} catch {
  Write-Host ("Assets skipped: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

# -- 6d. prior year (from GLBAL.LASTYEAR at period 12 = last year's close) -----
# Same live GL, just the prior-year column. Period 12 gives last year's full-year
# P&L and closing balances. Feeds the "result ties to equity" check + comparatives.
$pyIncome  = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5")
$pyExpense = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6")
$pyEquity  = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=11")
# Prior-year depreciation. `$pyExpense` above INCLUDES it (via the two child
# accounts 1282-2000-0100 and -0001), so anything that needs a CASH expense
# figure - the months-of-cover runway above all - must subtract this. Depreciation
# is a non-cash charge: it consumes no bank balance and cannot shorten a runway.
$pyDeprec  = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ISCONTROL='N' AND m.ACCNTTYPE=6")
$priorYear = [ordered]@{
  fyLabel       = $pyFyLabel
  income        = $pyIncome
  expenses      = $pyExpense
  depreciation  = $pyDeprec
  netResult     = R2 ($pyIncome - $pyExpense)
  closingEquity = $pyEquity
}

# -- 6e. unmapped-accounts (brief A7) -----------------------------------------
# Computed during the department rollup in section 2: active income/expense
# accounts carrying money that department-map.json couldn't resolve. 0 = all mapped.

# -- 6i. invoices + supplier bills (brief B4) ----------------------------------
#
# DRTRAN (123,755 rows) = money the Council is OWED. CRTRN (205,597) = money it OWES.
#
# WHAT PROBE 20 SAVED US FROM. The obvious table for an invoice report is DRINV.
# DRINV has TWO ROWS. One of them literally says SUMMARY=Test, and both are
# RECACTIVE=N -- it is a data-ENTRY staging table, not history. Building the report
# on it would have shipped a customer invoice page showing one test invoice. The
# real table is DRTRAN, one letter from the DRTRN that does not exist.
#
# INCREMENTAL, like the GL transactions. A year is ~10,000 rows on each side; shipping
# them in full three times a day would put ~3 MB on the wire for no reason. Each side
# has its own cursor because KY is a per-table sequence.
#
# THE DATE GUARD IS NOT PARANOIA. CRTRN carries rows dated 2061, 2045 and 2028 --
# four data-entry typos sitting in the middle of 205,597 good rows. Any query that
# takes a MAX(date), or an open-ended range, silently inherits them. We bound both
# ends explicitly.
$BILL_CAP  = 2000   # per side. Compressed, 2000+2000 is ~1 MB - well inside the 4.5 MB limit.
$OPEN_CAP  = 3000   # unpaid rows are re-sent IN FULL every run, so this cap must not bite.
$billFrom  = ("{0}-07-01" -f ($yr - 2))                  # two years of history, for the report
$billTo    = (Get-Date).AddDays(1).ToString('yyyy-MM-dd') # nothing from the future

# TWO QUERIES PER SIDE, AND THE REASON MATTERS.
#
#   A. EVERY STILL-UNPAID ROW, at any age, re-sent in full on every run.
#   B. Recent history (two years), sent incrementally via the KY cursor.
#
# The first version had only (B), and it was wrong in a way NO amount of re-running
# would have fixed. The dashboard's ageing panel reads DRMST -- the debtor master's
# balance buckets -- and reports $1.92M owed, of which 65% is more than 90 days old.
# Some of that debt is older than the two-year window, so an invoice list built only
# from (B) could never sum to the same total. Two pages of the same platform would
# have disagreed about what the Council is owed, permanently, and the invoice page
# would have been the quiet liar.
#
# Query (A) fixes it at the root: an invoice is included because it is UNPAID, not
# because it is recent. It re-sends the same rows every run, which costs nothing --
# they are few, and the upsert makes a repeat free -- and buys exact agreement with
# the ageing report on the very first sync.

$billCursorFile = Join-Path $PSScriptRoot 'billing-cursor.json'
$sinceArKy = 0
$sinceApKy = 0
if ((-not $FullResync) -and (Test-Path $billCursorFile)) {
  try {
    $bc = Get-Content $billCursorFile -Raw | ConvertFrom-Json
    $sinceArKy = [int64]$bc.arKy
    $sinceApKy = [int64]$bc.apKy
  } catch { $sinceArKy = 0; $sinceApKy = 0 }
}

Write-Host ""
Write-Host "Invoices + supplier bills (B4)" -ForegroundColor Cyan
Write-Host ("  DRTRAN.KY > {0} | CRTRN.KY > {1}" -f $sinceArKy, $sinceApKy) -ForegroundColor DarkGray

# ---- customer invoices (DRTRAN) ----------------------------------------------
# ORIGINALDR/CR is what was invoiced. CURRENTDR/CR is what is STILL UNPAID -- and
# that is the number that matters. An invoice raised for $10,000 and paid down to
# $500 is a $500 problem; reporting the original would overstate what the Council
# is owed by twentyfold.
$invoices = @()
$maxArKy = $sinceArKy
try {
  # (A) Every invoice still carrying money, at ANY age. No cursor, no lower date
  # bound -- it belongs here because it is UNPAID, not because it is recent.
  $arOpen = Invoke-Rows @"
SELECT FIRST $OPEN_CAP t.KY, t.DEBTOR, m.NAME AS DRNAME, t.REFERENCE, t.TRANTYPE,
       t.TRANDATE, t.DUEDATE, t.SUMMARY, t.ORDERNO,
       CAST(t.ORIGINALDR AS DOUBLE PRECISION) AS ODR,
       CAST(t.ORIGINALCR AS DOUBLE PRECISION) AS OCR,
       CAST(t.CURRENTDR  AS DOUBLE PRECISION) AS CDR,
       CAST(t.CURRENTCR  AS DOUBLE PRECISION) AS CCR
FROM DRTRAN t LEFT JOIN DRMST m ON m.DEBTOR = t.DEBTOR
WHERE (t.CURRENTDR <> 0 OR t.CURRENTCR <> 0)
  AND t.TRANDATE <= '$billTo'
ORDER BY t.KY ASC
"@
  if ($arOpen.Count -ge $OPEN_CAP) {
    Write-Host "  WARNING: hit the open-invoice cap ($OPEN_CAP). Raise OPEN_CAP." -ForegroundColor Red
    Write-Host "           Until you do, the invoice total will NOT reconcile to the ageing report." -ForegroundColor Red
  }

  # (B) Recent history, incremental. Context for the report; not needed to reconcile.
  $arRows = Invoke-Rows @"
SELECT FIRST $BILL_CAP t.KY, t.DEBTOR, m.NAME AS DRNAME, t.REFERENCE, t.TRANTYPE,
       t.TRANDATE, t.DUEDATE, t.SUMMARY, t.ORDERNO,
       CAST(t.ORIGINALDR AS DOUBLE PRECISION) AS ODR,
       CAST(t.ORIGINALCR AS DOUBLE PRECISION) AS OCR,
       CAST(t.CURRENTDR  AS DOUBLE PRECISION) AS CDR,
       CAST(t.CURRENTCR  AS DOUBLE PRECISION) AS CCR
FROM DRTRAN t LEFT JOIN DRMST m ON m.DEBTOR = t.DEBTOR
WHERE t.KY > $sinceArKy
  AND t.TRANDATE >= '$billFrom' AND t.TRANDATE <= '$billTo'
ORDER BY t.KY ASC
"@
  foreach ($r in $arRows) {
    $ky = [int64]$r.KY
    # ONLY the incremental batch moves the cursor. The open-invoice query has no
    # cursor, and its rows can carry high KYs -- letting them advance the mark would
    # skip history that was never sent.
    if ($ky -gt $maxArKy) { $maxArKy = $ky }
    $invoices += [ordered]@{
      ky          = $ky
      debtor      = ([string]$r.DEBTOR).Trim()
      debtorName  = ([string]$r.DRNAME).Trim()
      reference   = ([string]$r.REFERENCE).Trim()
      tranType    = ([string]$r.TRANTYPE).Trim()
      date        = $(if ($r.TRANDATE) { ([datetime]$r.TRANDATE).ToString('yyyy-MM-dd') } else { '' })
      dueDate     = $(if ($r.DUEDATE)  { ([datetime]$r.DUEDATE).ToString('yyyy-MM-dd') }  else { '' })
      summary     = ([string]$r.SUMMARY).Trim()
      orderNo     = ([string]$r.ORDERNO).Trim()
      invoiced    = (R2 ((R2 $r.ODR) - (R2 $r.OCR)))
      outstanding = (R2 ((R2 $r.CDR) - (R2 $r.CCR)))
    }
  }
  # Fold in the open invoices, skipping any the incremental batch already carried.
  $seenAr = @{}
  foreach ($x in $invoices) { $seenAr[[string]$x.ky] = $true }
  $openAdded = 0
  foreach ($r in $arOpen) {
    $k = [string]([int64]$r.KY)
    if ($seenAr.ContainsKey($k)) { continue }
    $seenAr[$k] = $true
    $openAdded++
    $invoices += [ordered]@{
      ky          = [int64]$r.KY
      debtor      = ([string]$r.DEBTOR).Trim()
      debtorName  = ([string]$r.DRNAME).Trim()
      reference   = ([string]$r.REFERENCE).Trim()
      tranType    = ([string]$r.TRANTYPE).Trim()
      date        = $(if ($r.TRANDATE) { ([datetime]$r.TRANDATE).ToString('yyyy-MM-dd') } else { '' })
      dueDate     = $(if ($r.DUEDATE)  { ([datetime]$r.DUEDATE).ToString('yyyy-MM-dd') }  else { '' })
      summary     = ([string]$r.SUMMARY).Trim()
      orderNo     = ([string]$r.ORDERNO).Trim()
      invoiced    = (R2 ((R2 $r.ODR) - (R2 $r.OCR)))
      outstanding = (R2 ((R2 $r.CDR) - (R2 $r.CCR)))
    }
  }
  Write-Host ("  invoices:       {0} sent ({1} still unpaid, any age)" -f $invoices.Count, $openAdded) -ForegroundColor Green
} catch {
  Write-Host ("  invoices: FAILED - " + $_.Exception.Message.Split("`n")[0]) -ForegroundColor Red
}

# ---- supplier bills (CRTRN) --------------------------------------------------
# HOLDPAYMENT is the status: PAID (156,116) / blank (47,690) / CANC (1,634) / HOLD.
# We ship the code and let the dashboard decide -- but the 1,634 CANC rows are the
# reason we carry it at all. A report that doesn't know what CANC means will present
# cancelled cheques as outstanding liabilities.
$supplierBills = @()
$maxApKy = $sinceApKy
try {
  # (A) Every supplier invoice not yet paid and not cancelled, at ANY age.
  # PAID and CANC are excluded here on purpose: a cancelled cheque is not a debt,
  # and Practical carries 1,634 of them. Treating 'not paid' as 'still owed' would
  # put every one of them on the page as money the Council still has to find.
  $apOpen = Invoke-Rows @"
SELECT FIRST $OPEN_CAP t.KY, t.CREDITOR, m.NAME AS CRNAME, t.REFERENCE, t.TRNT,
       t.TRNDATE, t.DUEDATE, t.PAYDATE, t.SUMMARY, t.ORDERNO, t.CHQNO, t.HOLDPAYMENT,
       CAST(t.DEBIT AS DOUBLE PRECISION) AS DR,
       CAST(t.CREDIT AS DOUBLE PRECISION) AS CR,
       CAST(t.GSTRECOVERABLE AS DOUBLE PRECISION) AS GST
FROM CRTRN t LEFT JOIN CRMST m ON m.CREDITOR = t.CREDITOR
WHERE t.TRNT = 'I'
  AND t.PAYDATE IS NULL
  AND (t.HOLDPAYMENT IS NULL OR (t.HOLDPAYMENT <> 'PAID' AND t.HOLDPAYMENT <> 'CANC'))
  AND t.TRNDATE <= '$billTo'
ORDER BY t.KY ASC
"@
  if ($apOpen.Count -ge $OPEN_CAP) {
    Write-Host "  WARNING: hit the open-bill cap ($OPEN_CAP). Raise OPEN_CAP." -ForegroundColor Red
  }

  # (B) Recent history, incremental.
  $apRows = Invoke-Rows @"
SELECT FIRST $BILL_CAP t.KY, t.CREDITOR, m.NAME AS CRNAME, t.REFERENCE, t.TRNT,
       t.TRNDATE, t.DUEDATE, t.PAYDATE, t.SUMMARY, t.ORDERNO, t.CHQNO, t.HOLDPAYMENT,
       CAST(t.DEBIT AS DOUBLE PRECISION) AS DR,
       CAST(t.CREDIT AS DOUBLE PRECISION) AS CR,
       CAST(t.GSTRECOVERABLE AS DOUBLE PRECISION) AS GST
FROM CRTRN t LEFT JOIN CRMST m ON m.CREDITOR = t.CREDITOR
WHERE t.KY > $sinceApKy
  AND t.TRNDATE >= '$billFrom' AND t.TRNDATE <= '$billTo'
ORDER BY t.KY ASC
"@
  foreach ($r in $apRows) {
    $ky = [int64]$r.KY
    # Only (B) moves the cursor -- see the note on the invoice side.
    if ($ky -gt $maxApKy) { $maxApKy = $ky }
    $supplierBills += [ordered]@{
      ky           = $ky
      creditor     = ([string]$r.CREDITOR).Trim()
      creditorName = ([string]$r.CRNAME).Trim()
      reference    = ([string]$r.REFERENCE).Trim()
      trnt         = ([string]$r.TRNT).Trim()
      date         = $(if ($r.TRNDATE) { ([datetime]$r.TRNDATE).ToString('yyyy-MM-dd') } else { '' })
      dueDate      = $(if ($r.DUEDATE) { ([datetime]$r.DUEDATE).ToString('yyyy-MM-dd') } else { '' })
      payDate      = $(if ($r.PAYDATE) { ([datetime]$r.PAYDATE).ToString('yyyy-MM-dd') } else { '' })
      summary      = ([string]$r.SUMMARY).Trim()
      orderNo      = ([string]$r.ORDERNO).Trim()
      chequeNo     = ([string]$r.CHQNO).Trim()
      status       = ([string]$r.HOLDPAYMENT).Trim()
      debit        = (R2 $r.DR)
      credit       = (R2 $r.CR)
      gst          = (R2 $r.GST)
    }
  }
  # Fold in the open bills, skipping any the incremental batch already carried.
  $seenAp = @{}
  foreach ($x in $supplierBills) { $seenAp[[string]$x.ky] = $true }
  $apOpenAdded = 0
  foreach ($r in $apOpen) {
    $k = [string]([int64]$r.KY)
    if ($seenAp.ContainsKey($k)) { continue }
    $seenAp[$k] = $true
    $apOpenAdded++
    $supplierBills += [ordered]@{
      ky           = [int64]$r.KY
      creditor     = ([string]$r.CREDITOR).Trim()
      creditorName = ([string]$r.CRNAME).Trim()
      reference    = ([string]$r.REFERENCE).Trim()
      trnt         = ([string]$r.TRNT).Trim()
      date         = $(if ($r.TRNDATE) { ([datetime]$r.TRNDATE).ToString('yyyy-MM-dd') } else { '' })
      dueDate      = $(if ($r.DUEDATE) { ([datetime]$r.DUEDATE).ToString('yyyy-MM-dd') } else { '' })
      payDate      = $(if ($r.PAYDATE) { ([datetime]$r.PAYDATE).ToString('yyyy-MM-dd') } else { '' })
      summary      = ([string]$r.SUMMARY).Trim()
      orderNo      = ([string]$r.ORDERNO).Trim()
      chequeNo     = ([string]$r.CHQNO).Trim()
      status       = ([string]$r.HOLDPAYMENT).Trim()
      debit        = (R2 $r.DR)
      credit       = (R2 $r.CR)
      gst          = (R2 $r.GST)
    }
  }
  Write-Host ("  supplier bills: {0} sent ({1} still unpaid, any age)" -f $supplierBills.Count, $apOpenAdded) -ForegroundColor Green
} catch {
  Write-Host ("  supplier bills: FAILED - " + $_.Exception.Message.Split("`n")[0]) -ForegroundColor Red
}

$billsCapped = ($invoices.Count -ge $BILL_CAP) -or ($supplierBills.Count -ge $BILL_CAP)
if ($billsCapped) {
  Write-Host "  (batch capped - the next run picks up where this stopped)" -ForegroundColor DarkYellow
}

# -- 7. assemble + write ------------------------------------------------------
$snapshot = [ordered]@{
  period = [ordered]@{
    label = $periodLabel; fyLabel = $fyLabel; monthOfYear = $cur; monthsInYear = 12
    live = $true
    budgetEstimated = (-not $hasRealBudget)
    budgetBasis = $(if ($hasRealBudget) { 'FY budget loaded in Practical vs actual' } else { 'Compared to FY25 actuals (prior year) - no FY26 budget loaded' })
    comparisonLabel = $(if ($hasRealBudget) { 'Budget' } else { 'FY25' })
    trendEstimated = $false
  }
  departments   = $departments
  accounts      = $accounts
  grants        = $grants
  revenueLines  = $revenueLines
  monthlySpend  = $monthlySpend
  incomeTotals  = [ordered]@{ totalIncome = $income; totalExpenses = $expenses; netResult = $netResult; revenueLines = $revenueLines }
  monthlyStatements = $monthlyStatements
  dailySpend    = $dailySpend
  transactions  = $transactions
  jobCosts      = $jobCosts
  jobBudgets    = $jobBudgets
  balanceSheet  = $balanceSheet
  bsReconciliation = $bsReconciliation
  cashFlow      = $cashFlow
  statutory     = $statutory
  commitments   = $commitments
  ageing        = $ageing
  assets        = $assets
  priorYear     = $priorYear
  invoices      = $invoices
  supplierBills = $supplierBills
  meta = [ordered]@{
    source = "Civica Practical ODBC (live GL) - DSN=Practical_Plus"
    baseline = $(if ($hasRealBudget) { 'fy-budget' } else { 'fy25-actuals' })
    # Date AND time. Three syncs a day means "9 Jul" is not enough to tell whether
    # you're looking at this morning's figures or this evening's.
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    unmappedAccounts = $unmappedAccounts
    # The transaction batch in this payload is INCREMENTAL: everything with
    # GLTRN.KY between sinceKy (exclusive) and maxKy (inclusive). 06-push.ps1
    # writes maxKy to sync-cursor.json only after the server accepts the push.
    sinceKy = $sinceKy
    maxKy   = $maxKy
    # B4 billing cursors. DRTRAN and CRTRN each have their OWN KY sequence, so
    # each needs its own high-water mark. One shared cursor would strand whichever
    # side of the ledger fell behind the moment the two tables drifted apart.
    billing = [ordered]@{
      sinceArKy = $sinceArKy
      maxArKy   = $maxArKy
      sinceApKy = $sinceApKy
      maxApKy   = $maxApKy
      capped    = $billsCapped
    }
    transactionsAreIncremental = $true
    moreTransactionsPending = $trnCapped
    notes = @(
      "Live read-only feed from the General Ledger (GLMST/GLBAL) at period $cur, FY$yr.",
      "Departments = the Council's 3 management departments (Corporate Services / Operations / Social Services) via department-map.json. Spend is operating expenditure; depreciation (`$$deprec) is excluded so the net result ties to the income statement.",
      "Budget baseline = FY25 actuals (GLBAL.LASTYEAR); FY26 budget not loaded in Practical.",
      "Grants list = grant/subsidy revenue received (funding received). Spend % + deadlines need the council's grants register + job costing."
    )
  }
}

# -- refuse to write a snapshot that says nothing ------------------------------
# A failed connection or a bad query used to yield an all-zero snapshot with a
# null fyLabel. Pushed, that overwrites the live dashboard with nothing. Sanity
# checks are cheap; an empty dashboard in front of the CFO is not.
$fatal = @()
if (-not $fyLabel -or $fyLabel -notmatch '^FY\d{4}-\d{2}$') { $fatal += "period.fyLabel is '$fyLabel'" }
if ($cur -lt 1 -or $cur -gt 12)                             { $fatal += "period month is $cur" }
if ($accounts.Count -eq 0)                                  { $fatal += "no GL accounts were read" }
if ($bsTotalAssets -eq 0 -and $bsTotalLiab -eq 0)            { $fatal += "balance sheet is entirely zero" }
if ($fatal.Count) {
  Write-Host ""
  Write-Host "REFUSING TO WRITE $OutFile - the snapshot is empty or malformed:" -ForegroundColor Red
  foreach ($f in $fatal) { Write-Host "  - $f" -ForegroundColor Red }
  Write-Host ""
  Write-Host "  This almost always means the database connection failed." -ForegroundColor Yellow
  Write-Host "  If PRACTICAL_PWD is set to a wrong password it OVERRIDES the DSN's own" -ForegroundColor Yellow
  Write-Host "  working login. Clear it and re-run:" -ForegroundColor Yellow
  Write-Host "      Remove-Item Env:\PRACTICAL_PWD -ErrorAction SilentlyContinue" -ForegroundColor Yellow
  $conn.Close()
  exit 1
}

# -COMPRESS IS NOT COSMETIC. It is the difference between a push that works and a
# push that dies.
#
# ConvertTo-Json PRETTY-PRINTS by default: every field on its own indented line.
# On a snapshot carrying thousands of invoice and supplier-bill rows that roughly
# doubles the payload, and Vercel rejects any request body over 4.5 MB with
# HTTP 413 FUNCTION_PAYLOAD_TOO_LARGE. Nothing in the file is meant to be read by
# a human, so the whitespace buys nothing and costs the entire feed.
$json = $snapshot | ConvertTo-Json -Depth 12 -Compress
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
$conn.Close()

# -- validation summary -------------------------------------------------------
Write-Host ""
Write-Host "Wrote $OutFile" -ForegroundColor Green

# THE SIZE MUST BE VISIBLE. The 413 that cost an evening was invisible from this
# script: it built a perfect snapshot, said "Done.", and the failure surfaced two
# steps later as "push step exited 1" with no hint that size was the reason.
$sizeMb = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
$sizeColour = if ($sizeMb -ge 4.0) { 'Red' } elseif ($sizeMb -ge 3.0) { 'Yellow' } else { 'DarkGray' }
Write-Host ("  size        : {0} MB  (Vercel rejects anything over 4.5 MB)" -f $sizeMb) -ForegroundColor $sizeColour
if ($sizeMb -ge 4.0) {
  Write-Host ""
  Write-Host "  WARNING: this snapshot is close to Vercel's 4.5 MB request limit." -ForegroundColor Red
  Write-Host "           The push will fail with HTTP 413 (FUNCTION_PAYLOAD_TOO_LARGE)." -ForegroundColor Red
  Write-Host "           Lower `$BILL_CAP in section 6i and run again - the cursor means" -ForegroundColor Red
  Write-Host "           nothing is lost, the backfill simply takes more runs." -ForegroundColor Red
}
Write-Host ("  departments : {0}" -f $departments.Count)
Write-Host ("  accounts    : {0}  (full chart of income/expense accounts, for mapping)" -f $accounts.Count)
Write-Host ("  grants      : {0}" -f $grants.Count)
Write-Host ("  revenueLines: {0}" -f $revenueLines.Count)
Write-Host ("  transactions: {0}  (NEW since ky {1}; high-water mark now {2})" -f $transactions.Count, $sinceKy, $maxKy)
if ($trnCapped) {
  Write-Host ("      more than $TRN_CAP pending - the next run continues from ky $maxKy") -ForegroundColor Yellow
}
Write-Host ("  daily points: {0}" -f $dailySpend.Count)
Write-Host ("  job codes   : {0}  (spend per job, for grant expenditure)" -f $jobCosts.Count)
$umCol = if ($unmappedAccounts -gt 0) { 'Yellow' } else { 'Green' }
Write-Host ("  unmapped acc: {0}  (active accts not in a department; 0 = all mapped)" -f $unmappedAccounts) -ForegroundColor $umCol
foreach ($u in $unmappedNames) { Write-Host ("      ! {0}" -f $u) -ForegroundColor Yellow }
if ($script:BadCells -gt 0) {
  Write-Host ("  unreadable cells: {0} in column(s): {1}" -f $script:BadCells, ($script:BadCellNames -join ', ')) -ForegroundColor Yellow
  Write-Host "      (value could not be converted by the ODBC driver; stored as null/text, never as another column's value)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Balance Sheet (live) - VALIDATE:" -ForegroundColor Cyan
Write-Host ("  Total Assets       : {0,18:N2}" -f $bsTotalAssets)
Write-Host ("  Total Liabilities  : {0,18:N2}" -f $bsTotalLiab)
Write-Host ("  Total Equity       : {0,18:N2}" -f $bsTotalEquity)
$bsCol = if ([math]::Abs($bsGap) -le 1) { 'Green' } else { 'Red' }
Write-Host ("  BALANCE gap        : {0,18:N2}  (should be 0)" -f $bsGap) -ForegroundColor $bsCol
Write-Host ""
if ($cashFlow) {
  Write-Host "Cash Flow Statement (live, report 739) - VALIDATE against Practical's own Cash Flow:" -ForegroundColor Cyan
  Write-Host ("  Operating          : {0,18:N2}" -f $cashFlow.operating.net)
  Write-Host ("  Investing          : {0,18:N2}" -f $cashFlow.investing.net)
  Write-Host ("  Financing          : {0,18:N2}" -f $cashFlow.financing.net)
  Write-Host ("  Net change in cash : {0,18:N2}   (= movement in cash accounts - reconciled)" -f $cashFlow.netChange) -ForegroundColor Green
  Write-Host ("  Cash at start      : {0,18:N2}" -f $cashFlow.cashStart)
  Write-Host ("  Cash at end        : {0,18:N2}" -f $cashFlow.cashEnd)
} else {
  Write-Host "Cash Flow Statement: not emitted this run (see the note above)." -ForegroundColor Yellow
}
Write-Host ""
Write-Host ("Prior year ($pyFyLabel) - VALIDATE against the audited FY statements:") -ForegroundColor Cyan
Write-Host ("  Income        : {0,18:N2}   (FULL prior year - not the mid-year figure)" -f $pyIncome)
Write-Host ("  Expenses      : {0,18:N2}   (FULL prior year, operating basis)" -f $pyExpense)
Write-Host ("  Closing equity: {0,18:N2}   (should ~= this year's opening equity)" -f $pyEquity)
Write-Host ""
Write-Host ("Income statement (operating basis) - YEAR TO DATE, month $cur of 12:") -ForegroundColor Cyan
Write-Host ("  Income   : {0,18:N2}" -f $income)
Write-Host ("  Expenses : {0,18:N2}" -f $expenses)
Write-Host ("  Net      : {0,18:N2}" -f $netResult)
Write-Host ("  Deprec.  : {0,18:N2}   (excluded from operating)" -f $deprec)
if ($cur -le 2) {
  Write-Host "  (Month $cur of the financial year - small figures here are expected, not a fault.)" -ForegroundColor DarkGray
}
# Reference anchors from FY2025-26, for sanity-checking a FULL year's build.
Write-Host "  FY2025-26 full year, for reference: income ~25,013,723  expenses ~18,343,558  net ~6,670,164" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Department spend (operating) - actual vs budget TO DATE:" -ForegroundColor Cyan
Write-Host ("  {0,-24} {1,15} {2,15} {3,15}" -f 'Department', 'YTD actual', 'YTD budget', 'Annual budget')
$deptTotal = 0; $ytdBudTotal = 0; $annBudTotal = 0
foreach ($d in $departments) {
  Write-Host ("  {0,-24} {1,15:N2} {2,15:N2} {3,15:N2}" -f $d.name, $d.ytdActual, $d.ytdBudget, $d.annualBudget)
  $deptTotal += [double]$d.ytdActual; $ytdBudTotal += [double]$d.ytdBudget; $annBudTotal += [double]$d.annualBudget
}
Write-Host ("  {0,-24} {1,15:N2} {2,15:N2} {3,15:N2}" -f 'TOTAL', $deptTotal, $ytdBudTotal, $annBudTotal)
Write-Host ""
Write-Host "  VALIDATE the annual budget against the Council's adopted FY27 operating budget." -ForegroundColor Yellow
Write-Host "  (GLBAL.BUDGET is cumulative-to-period: period 12 = annual, current period = YTD.)" -ForegroundColor DarkGray
Write-Host "`nDone." -ForegroundColor Green
