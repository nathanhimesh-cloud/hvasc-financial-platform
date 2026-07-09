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
  [string]$OutFile = (Join-Path $PSScriptRoot 'snapshot.json')
)

# DB password comes from the PRACTICAL_PWD env var (set it on APP02 / in the
# scheduled task) so no credential is stored in the repo.
$DSN = "DSN=Practical_Plus;UID=PCSACCESS;PWD=$($env:PRACTICAL_PWD);"

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
$conn = New-Object System.Data.Odbc.OdbcConnection($DSN)
$conn.Open()
Write-Host "Connected: $($conn.ServerVersion)" -ForegroundColor Green

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
$acctRows = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, m.ACCNT2, b.BALANCE, b.BUDGET, b.LASTYEAR
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE IN (5,6)
"@

# Accumulators keyed by department id. revNonGrant excludes grant/subsidy revenue
# (ACCNT2 1100-1199) so it isn't double-counted against the "Grants & subsidies" line.
$agg = @{}
foreach ($id in $DEPTS.Keys) {
  $agg[$id] = @{ exp = 0.0; rev = 0.0; revNonGrant = 0.0; budExp = 0.0; lyExp = 0.0; lines = @() }
}
$unmappedAccounts = 0
$unmappedNames = @()
# The full chart of income/expense accounts, mapped or not. The Account Mapping
# page needs every account it might reassign - not just the handful that happen
# to carry a balance this month, which early in a financial year is almost none.
$accounts = @()

foreach ($r in $acctRows) {
  $code = [string]$r.GLACCOUNT
  $type = [int]$r.ACCNTTYPE
  $bal  = R2 $r.BALANCE
  $bud  = R2 $r.BUDGET
  $ly   = R2 $r.LASTYEAR
  $dept = Resolve-Dept $code

  $accounts += [ordered]@{
    code         = $code
    name         = ([string]$r.DESCRIPT).Trim()
    kind         = $(if ($type -eq 5) { 'revenue' } else { 'expense' })
    departmentId = $dept
    balance      = $bal
    budget       = $bud
  }

  if (-not $dept) {
    # Only flag accounts that actually carry money - dormant zero accounts are noise.
    if ($bal -ne 0 -or $bud -ne 0) {
      $unmappedAccounts++
      if ($unmappedNames.Count -lt 10) { $unmappedNames += ("{0} {1}" -f $code, ([string]$r.DESCRIPT).Trim()) }
    }
    continue
  }

  if ($type -eq 6) {
    $agg[$dept].exp    += $bal
    $agg[$dept].budExp += $bud
    $agg[$dept].lyExp  += $ly
    if ($bal -ne 0) {
      $agg[$dept].lines += [pscustomobject]@{ code = $code; account = ([string]$r.DESCRIPT).Trim(); amount = $bal }
    }
  } elseif ($type -eq 5) {
    $agg[$dept].rev += $bal
    $a2 = [int]$r.ACCNT2
    if (-not ($a2 -ge 1100 -and $a2 -le 1199)) { $agg[$dept].revNonGrant += $bal }
  }
}

$hasRealBudget = (($DEPTS.Keys | ForEach-Object { $agg[$_].budExp } | Measure-Object -Sum).Sum) -ne 0

# Always emit all three departments - even at $0 actual - so the full budgeted
# structure is visible early in the financial year rather than an empty list.
$departments = @()
foreach ($id in $DEPTS.Keys) {
  $cfg = $DEPTS[$id]
  $a   = $agg[$id]
  $ytdActual = R2 $a.exp
  $revenue   = R2 $a.rev

  $annualBudget = if ($hasRealBudget) { R2 $a.budExp } else { R2 $a.lyExp }
  if ($annualBudget -le 0 -and $ytdActual -gt 0) { $annualBudget = R2 ($ytdActual * 12 / $cur) }  # run-rate fallback
  $ytdBudget = R2 ($annualBudget * $cur / 12)
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
# t.KY is GLTRN's own primary key. We ship it so the dashboard can UPSERT each
# transaction into Postgres instead of re-inserting it on every sync. That's what
# lets the ledger accumulate across the year without duplicates.
$trnRows = Invoke-Rows @"
SELECT FIRST $TRN_CAP t.KY, t.GLACCOUNT, m.DESCRIPT AS ACCTNAME, t.TRNDATE,
       t.DESCRIPT AS TRNDESC, t.DEBIT, t.CREDIT, t.REF, m.ACCNTTYPE
FROM GLTRN t JOIN GLMST m ON m.GLACCOUNT = t.GLACCOUNT
WHERE t.TRNDATE >= '$fyStart' AND m.RECACTIVE='Y'
ORDER BY t.TRNDATE DESC
"@

$transactions = @()
$dailyMap = @{}
foreach ($t in $trnRows) {
  $debit  = R2 $t.DEBIT
  $credit = R2 $t.CREDIT
  $d = if ($t.TRNDATE) { ([datetime]$t.TRNDATE).ToString('yyyy-MM-dd') } else { '' }
  $transactions += [ordered]@{
    ky          = [int64]$t.KY
    date        = $d
    code        = [string]$t.GLACCOUNT
    account     = ([string]$t.ACCTNAME).Trim()
    description = ([string]$t.TRNDESC).Trim()
    ref         = ([string]$t.REF).Trim()
    debit       = $debit
    credit      = $credit
  }
  # Daily spend = expense accounts only (ACCNTTYPE 6), net of any credits.
  if ([int]$t.ACCNTTYPE -eq 6 -and $d) {
    if (-not $dailyMap.ContainsKey($d)) { $dailyMap[$d] = 0.0 }
    $dailyMap[$d] = [double]$dailyMap[$d] + ($debit - $credit)
  }
}
$dailySpend = @()
foreach ($k in ($dailyMap.Keys | Sort-Object)) {
  $dailySpend += [ordered]@{ date = $k; amount = (R2 $dailyMap[$k]) }
}
$trnCapped = ($trnRows.Count -ge $TRN_CAP)

# -- 6b2. job costing actuals (JCTRN) -----------------------------------------
# Spend per job code for the current FY. The grant register maps each grant to
# its job code(s), so grant EXPENDITURE is the sum of its jobs' costs. Codes are
# normalised to the "JOB-SUBJOB" (4-4) prefix the register uses.
# TOTCOST is a scaled NUMERIC. SUM() of it overflows what the Firebird ODBC
# driver will convert, and GetValue throws on a handful of the larger jobs -
# which then read as $0 and silently understate both this report AND the grant
# expenditure derived from it. Casting to DOUBLE PRECISION in SQL avoids it.
$jcRows = Invoke-Rows @"
SELECT t.JCACCOUNT, SUM(CAST(t.TOTCOST AS DOUBLE PRECISION)) AS SPEND
FROM JCTRN t
WHERE t.TRANDATE >= '$fyStart'
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
      name = ([string]$r.DESCRIPT).Trim(); budget = (R2 $r.BUDGET); actual = (R2 $r.BALANCE)
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
  priorYear     = $priorYear
  meta = [ordered]@{
    source = "Civica Practical ODBC (live GL) - DSN=Practical_Plus"
    baseline = $(if ($hasRealBudget) { 'fy-budget' } else { 'fy25-actuals' })
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    unmappedAccounts = $unmappedAccounts
    notes = @(
      "Live read-only feed from the General Ledger (GLMST/GLBAL) at period $cur, FY$yr.",
      "Departments = the Council's 3 management departments (Corporate Services / Operations / Social Services) via department-map.json. Spend is operating expenditure; depreciation (`$$deprec) is excluded so the net result ties to the income statement.",
      "Budget baseline = FY25 actuals (GLBAL.LASTYEAR); FY26 budget not loaded in Practical.",
      "Grants list = grant/subsidy revenue received (funding received). Spend % + deadlines need the council's grants register + job costing."
    )
  }
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
Write-Host ("  transactions: {0}{1}" -f $transactions.Count, $(if ($trnCapped) { " (CAPPED at $TRN_CAP - older txns not included)" } else { "" }))
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
Write-Host "Department spend (operating):" -ForegroundColor Cyan
$deptTotal = 0
foreach ($d in $departments) { Write-Host ("  {0,-30} {1,16:N2}" -f $d.name, $d.ytdActual); $deptTotal += [double]$d.ytdActual }
Write-Host ("  {0,-30} {1,16:N2}" -f 'TOTAL', $deptTotal)
Write-Host "`nDone." -ForegroundColor Green
