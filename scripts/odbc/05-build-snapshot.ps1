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
$acctRows = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, m.ACCNT2,
       b.BALANCE, b.BUDGET AS BUDYTD, b.LASTYEAR,
       (SELECT b12.BUDGET FROM GLBAL b12
         WHERE b12.GLACCOUNT = b.GLACCOUNT AND b12.MTH = 12) AS BUDANN
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
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
$bsRows = Invoke-Rows @"
SELECT m.ACCNTTYPE, m.GLACCOUNT, m.DESCRIPT, b.BALANCE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
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
    $lines += [ordered]@{ label = ([string]$row.DESCRIPT).Trim(); amount = $amt }
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

# -- 6d. prior year (from GLBAL.LASTYEAR at period 12 = last year's close) -----
# Same live GL, just the prior-year column. Period 12 gives last year's full-year
# P&L and closing balances. Feeds the "result ties to equity" check + comparatives.
$pyIncome  = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5")
$pyExpense = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6")
$pyEquity  = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=11")
$pyFyLabel = "FY$($yr-2)-" + (($yr-1).ToString().Substring(2))   # prior FY, e.g. FY2025-26
$priorYear = [ordered]@{
  fyLabel       = $pyFyLabel
  income        = $pyIncome
  expenses      = $pyExpense
  netResult     = R2 ($pyIncome - $pyExpense)
  closingEquity = $pyEquity
}

# -- 6e. unmapped-accounts (brief A7) -----------------------------------------
# Computed during the department rollup in section 2: active income/expense
# accounts carrying money that department-map.json couldn't resolve. 0 = all mapped.

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
  cashFlow      = $cashFlow
  priorYear     = $priorYear
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

$json = $snapshot | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
$conn.Close()

# -- validation summary -------------------------------------------------------
Write-Host ""
Write-Host "Wrote $OutFile" -ForegroundColor Green
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
