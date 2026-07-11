<#
  12-backfill-prior-year.ps1  -  READ-ONLY: rebuild FY2025-26, month by month
  ---------------------------------------------------------------------------
  Builds twelve historical snapshots from GLBAL.LASTYEAR and pushes each one to
  the dashboard's archive, so the period selector spans two financial years.

  WHAT WE CAN REBUILD, AND WHAT WE CANNOT
  ---------------------------------------
  Proven by 11-probe-prior-year.ps1 against the live database:

    YES  Monthly P&L. LASTYEAR is cumulative-to-period with real monthly shape
         (Jul 942,364 ... Jun 19,837,904), not straight-lined.
    YES  Monthly balance sheet. LASTYEAR on account types 7-11. At period 12 it
         balances exactly: assets 192,212,028.38 = liabilities + equity.
    YES  Department rollups, grant income, revenue lines - all from LASTYEAR.
    YES  Job costs. JCTRN spans years (FY2026: 5,397 rows, 28,385,781.04).

    NO   Transactions. GLTRN holds the CURRENT financial year only. There is no
         prior-year transaction data in the database, so no drill-down and no
         daily spend for FY2025-26. Nothing can recover it.
    NO   Budgets. GLBAL.BUDGET is the current year's. Prior-year budget figures
         aren't stored, so these snapshots carry no budget and say so, rather
         than inventing a comparator.

  SAFETY
  ------
  - SELECT only. Never writes to Practical.
  - Pushes with ?mode=archive, so each period joins the `snapshots` table and
    NEVER overwrites the live dashboard or the Blob.
  - Carries no transactions, so the GLTRN sync cursor is untouched and tomorrow's
    incremental sync is unaffected.
  - -WhatIf builds the files and prints the summary without pushing anything.

  USAGE
      powershell -ExecutionPolicy Bypass -File .\12-backfill-prior-year.ps1 -WhatIf
      powershell -ExecutionPolicy Bypass -File .\12-backfill-prior-year.ps1 `
          -Url https://hvasc-financial-platform.vercel.app -Password <UPLOAD_PASSWORD>
#>

param(
  [string]$Url,
  [string]$Password = $env:HVASC_UPLOAD_PASSWORD,
  # Build and report, but push nothing.
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

if (-not $WhatIf) {
  if (-not $Url)      { throw "Give -Url, or use -WhatIf to build without pushing." }
  if (-not $Password) { throw "Give -Password, or set HVASC_UPLOAD_PASSWORD." }
}

# -- department map (same file 05 uses) ---------------------------------------
$mapPath = Join-Path $scriptDir 'department-map.json'
if (-not (Test-Path $mapPath)) { throw "department-map.json not found next to this script." }
$deptMap = Get-Content $mapPath -Raw | ConvertFrom-Json
$ACCT2DEPT = @{}
foreach ($p in $deptMap.accounts.PSObject.Properties) { $ACCT2DEPT[$p.Name] = $p.Value }
$DEPTS = [ordered]@{}
foreach ($d in $deptMap.departments) { $DEPTS[$d.id] = $d }

function Resolve-Dept([string]$glAccount) {
  if (-not $glAccount) { return $null }
  $key = $glAccount.Trim()
  if ($key.Length -ge 9) { $key = $key.Substring(0, 9) }
  if ($ACCT2DEPT.ContainsKey($key)) { return $ACCT2DEPT[$key] }
  return $null
}

$MONTHS = @('Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun')

# -- connect ------------------------------------------------------------------
$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;')
$conn.Open()
Write-Host ("Connected - {0}" -f $conn.ServerVersion) -ForegroundColor Green

function Get-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null
      try { $v = $r.GetValue($i) } catch { try { $v = $r.GetString($i) } catch { $v = $null } }
      $o[$r.GetName($i)] = $(if ($v -is [DBNull]) { $null } else { $v })
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}
function R2([object]$x) {
  if ($null -eq $x -or $x -is [DBNull]) { return 0 }
  if ($x -is [string]) { $d = 0.0; if ([double]::TryParse($x, [ref]$d)) { return [math]::Round($d, 2) }; return 0 }
  return [math]::Round([double]$x, 2)
}
function Slugify([string]$s) { (($s.ToLower() -replace '&','and' -replace '[^a-z0-9]+','-').Trim('-')) }

$yr      = [int](Get-Rows 'SELECT YR FROM GLCON')[0].YR   # FY-ending year, e.g. 2027
$pyEnd   = $yr - 1                                        # prior FY ends 2026
$pyLabel = "FY{0}-{1}" -f ($pyEnd - 1), ($pyEnd.ToString().Substring(2))
$pyStart = "{0}-07-01" -f ($pyEnd - 1)
$pyFinish = "{0}-06-30" -f $pyEnd
Write-Host ("Rebuilding {0} ({1} .. {2})" -f $pyLabel, $pyStart, $pyFinish) -ForegroundColor Cyan

# -- one pass: every account's LASTYEAR at every period ------------------------
# LASTYEAR is cumulative-to-period, so period m gives the prior year's position
# at the end of month m. That's exactly what a monthly snapshot needs.
Write-Host "Reading GLBAL.LASTYEAR for all periods..." -ForegroundColor DarkGray
$all = Get-Rows @'
SELECT b.MTH, m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, m.ACCNT2, m.ISCONTROL,
       CAST(b.LASTYEAR AS DOUBLE PRECISION) AS LY
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y' AND b.MTH BETWEEN 1 AND 12
  AND m.ACCNTTYPE IN (5,6,7,8,9,10,11)
'@
Write-Host ("  {0} rows." -f $all.Count) -ForegroundColor DarkGray

# -- job costs, cumulative to each month of the prior year ---------------------
# JCTRN carries corrupt dates (rows in 1120 and 2045), so bound both ends.
$jcAll = Get-Rows @"
SELECT t.JCACCOUNT, t.TRANDATE, CAST(t.TOTCOST AS DOUBLE PRECISION) AS COST
FROM JCTRN t
WHERE t.TRANDATE >= '$pyStart' AND t.TRANDATE <= '$pyFinish'
"@
Write-Host ("  {0} job-cost rows in {1}." -f $jcAll.Count, $pyLabel) -ForegroundColor DarkGray

# Month index 1..12 for a date inside the prior financial year.
function Fy-Month([datetime]$d) {
  $m = $d.Month
  if ($m -ge 7) { return $m - 6 } else { return $m + 6 }
}

$BS_SECTIONS = @(
  @{ key='currentAssets';         label='Current assets';          types=@(7)  }
  @{ key='nonCurrentAssets';      label='Non-current assets';      types=@(8)  }
  @{ key='currentLiabilities';    label='Current liabilities';     types=@(9)  }
  @{ key='nonCurrentLiabilities'; label='Non-current liabilities'; types=@(10) }
  @{ key='equity';                label='Community equity';        types=@(11) }
)

$built = @()
$monthlyStatements = @()

for ($mth = 1; $mth -le 12; $mth++) {
  $rows = @($all | Where-Object { [int]$_.MTH -eq $mth })
  if (-not $rows.Count) { Write-Host ("  period {0}: no rows, skipped." -f $mth) -ForegroundColor Yellow; continue }

  $calYr = if ($mth -le 6) { $pyEnd - 1 } else { $pyEnd }
  $periodLabel = "$($MONTHS[$mth-1]) $calYr"

  # -- departments + income statement -----------------------------------------
  $agg = @{}
  foreach ($id in $DEPTS.Keys) { $agg[$id] = @{ exp=0.0; rev=0.0; revNonGrant=0.0; lines=@() } }
  $income = 0.0; $expenses = 0.0; $deprec = 0.0; $grantsRev = 0.0
  $accounts = @(); $unmapped = 0

  foreach ($r in $rows) {
    $type = [int]$r.ACCNTTYPE
    if ($type -notin @(5,6)) { continue }
    $code = ([string]$r.GLACCOUNT).Trim()
    $amt  = R2 $r.LY
    $ctrl = (([string]$r.ISCONTROL).Trim().ToUpper() -eq 'Y')
    $dept = Resolve-Dept $code

    $accounts += [ordered]@{
      code=$code; name=([string]$r.DESCRIPT).Trim()
      kind=$(if ($type -eq 5) { 'revenue' } else { 'expense' })
      departmentId=$dept; balance=$amt; budget=0; budgetYtd=0
    }

    if ($type -eq 5) {
      $income += $amt
      $a2 = [int]$r.ACCNT2
      if ($a2 -ge 1100 -and $a2 -le 1199) { $grantsRev += $amt }
      if ($dept) {
        $agg[$dept].rev += $amt
        if (-not ($a2 -ge 1100 -and $a2 -le 1199)) { $agg[$dept].revNonGrant += $amt }
      }
    } else {
      # Operating expenses exclude depreciation (ISCONTROL='N'), same as 05.
      if ($ctrl) {
        $expenses += $amt
        if ($dept) {
          $agg[$dept].exp += $amt
          if ($amt -ne 0) { $agg[$dept].lines += [pscustomobject]@{ code=$code; account=([string]$r.DESCRIPT).Trim(); amount=$amt } }
        } elseif ($amt -ne 0) { $unmapped++ }
      } else { $deprec += $amt }
    }
  }

  $departments = @()
  foreach ($id in $DEPTS.Keys) {
    $cfg = $DEPTS[$id]; $a = $agg[$id]
    $glLines = @()
    foreach ($l in (@($a.lines) | Sort-Object { [double]$_.amount } -Descending | Select-Object -First 6)) {
      $glLines += [ordered]@{ code=$l.code; account=$l.account; amount=(R2 $l.amount) }
    }
    # No prior-year budget exists in Practical. Emit zero rather than invent one.
    $departments += [ordered]@{
      id=$cfg.id; slug=$cfg.slug; name=$cfg.name; icon=$cfg.icon; color=$cfg.color
      kind=$(if ($a.rev -gt 0) { 'cost-revenue' } else { 'cost' })
      annualBudget=0; ytdActual=(R2 $a.exp); ytdBudget=0; status='on-track'; glLines=$glLines
    }
  }

  # -- revenue lines ----------------------------------------------------------
  $revenueLines = @()
  if ($grantsRev -gt 0) { $revenueLines += [ordered]@{ id='grants-and-subsidies'; label='Grants & subsidies'; ytd=(R2 $grantsRev) } }
  foreach ($id in $DEPTS.Keys) {
    $rev = R2 $agg[$id].revNonGrant
    if ($rev -gt 0) {
      $cfg = $DEPTS[$id]
      $revenueLines += [ordered]@{ id=(Slugify ($cfg.name + ' revenue')); label="$($cfg.name) revenue"; departmentId=$cfg.id; ytd=$rev }
    }
  }

  # -- grants (revenue accounts in the grant range) ---------------------------
  $grants = @()
  foreach ($r in ($rows | Where-Object { [int]$_.ACCNTTYPE -eq 5 -and [int]$_.ACCNT2 -ge 1100 -and [int]$_.ACCNT2 -le 1199 })) {
    $total = R2 $r.LY
    if ($total -le 0) { continue }
    $code = ([string]$r.GLACCOUNT).Trim()
    $deptId = Resolve-Dept $code; if (-not $deptId) { $deptId = 'corporate-services' }
    $grants += [ordered]@{
      id=$code; name=([string]$r.DESCRIPT).Trim(); funder='Grant'; departmentId=$deptId
      total=$total; spent=0
      reportDue=[ordered]@{ label='-'; level='muted' }
      acquittal=[ordered]@{ label='-'; level='muted' }
      status='not-started'; statusChip=[ordered]@{ label='FUNDING RECEIVED'; level='muted' }
    }
  }

  # -- balance sheet ----------------------------------------------------------
  $bsSec = @{}
  foreach ($def in $BS_SECTIONS) {
    $lines = @(); $total = 0.0
    $match = @($rows | Where-Object { $def.types -contains [int]$_.ACCNTTYPE -and (([string]$_.ISCONTROL).Trim().ToUpper() -eq 'Y') -and (R2 $_.LY) -ne 0 }) |
      Sort-Object { [math]::Abs([double]$_.LY) } -Descending
    foreach ($row in $match) {
      $amt = R2 $row.LY
      $lines += [ordered]@{ label=([string]$row.DESCRIPT).Trim(); amount=$amt }
      $total += $amt
    }
    $bsSec[$def.key] = [ordered]@{ label=$def.label; lines=$lines; total=(R2 $total) }
  }
  $bsAssets = R2 ($bsSec.currentAssets.total + $bsSec.nonCurrentAssets.total)
  $bsLiab   = R2 ($bsSec.currentLiabilities.total + $bsSec.nonCurrentLiabilities.total)
  $bsEquity = R2 $bsSec.equity.total
  $balanceSheet = [ordered]@{
    currentAssets=$bsSec.currentAssets; nonCurrentAssets=$bsSec.nonCurrentAssets; totalAssets=$bsAssets
    currentLiabilities=$bsSec.currentLiabilities; nonCurrentLiabilities=$bsSec.nonCurrentLiabilities; totalLiabilities=$bsLiab
    netCommunityAssets=(R2 ($bsAssets - $bsLiab)); equity=$bsSec.equity; totalEquity=$bsEquity; asAt=$periodLabel
  }
  $bsGap = R2 ($bsAssets - ($bsLiab + $bsEquity))

  # -- job costs cumulative to this month -------------------------------------
  $jcMap = @{}
  foreach ($j in $jcAll) {
    if (-not $j.TRANDATE) { continue }
    if ((Fy-Month ([datetime]$j.TRANDATE)) -gt $mth) { continue }
    $raw = ([string]$j.JCACCOUNT).Trim()
    if ($raw.Length -lt 9) { continue }
    $key = $raw.Substring(0, 9)
    if (-not $jcMap.ContainsKey($key)) { $jcMap[$key] = 0.0 }
    $jcMap[$key] = [double]$jcMap[$key] + (R2 $j.COST)
  }
  $jobCosts = @()
  foreach ($k in ($jcMap.Keys | Sort-Object)) {
    if ([math]::Abs($jcMap[$k]) -lt 0.005) { continue }
    $jobCosts += [ordered]@{ code=$k; amount=(R2 $jcMap[$k]) }
  }

  $netResult = R2 ($income - $expenses)
  $monthlyStatements += [ordered]@{
    idx=$mth; month=$MONTHS[$mth-1]
    totalIncome=(R2 $income); totalExpenses=(R2 $expenses); netResult=$netResult; revenueLines=@()
  }

  $snapshot = [ordered]@{
    period = [ordered]@{
      label=$periodLabel; fyLabel=$pyLabel; monthOfYear=$mth; monthsInYear=12
      live=$false
      budgetEstimated=$true
      budgetBasis='No budget is stored for prior years in Practical - these periods carry no budget.'
      comparisonLabel='None'
      trendEstimated=$false
    }
    departments=$departments
    accounts=$accounts
    grants=$grants
    revenueLines=$revenueLines
    monthlySpend=@()
    incomeTotals=[ordered]@{ totalIncome=(R2 $income); totalExpenses=(R2 $expenses); netResult=$netResult; revenueLines=$revenueLines }
    monthlyStatements=@($monthlyStatements)   # cumulative series up to this month
    dailySpend=@()
    transactions=@()                          # GLTRN holds the current FY only
    jobCosts=$jobCosts
    jobBudgets=@()                            # no prior-year budgets to compare against
    balanceSheet=$balanceSheet
    meta=[ordered]@{
      source="Civica Practical ODBC (GLBAL.LASTYEAR backfill) - DSN=Practical_Plus"
      baseline='prior-year-actuals'
      generatedAt=(Get-Date -Format 'yyyy-MM-dd')
      generatedAtUtc=(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      unmappedAccounts=$unmapped
      backfilled=$true
      notes=@(
        "Rebuilt from GLBAL.LASTYEAR, which is cumulative-to-period.",
        "No transactions or daily spend: GLTRN holds the current financial year only.",
        "No budgets: GLBAL.BUDGET is the current year's."
      )
    }
  }

  $file = Join-Path $scriptDir ("backfill-{0}-{1:D2}.json" -f $pyLabel, $mth)
  # NOT Set-Content -Encoding UTF8: on PowerShell 4.0 that writes a BOM, curl
  # --data-binary sends those bytes verbatim, and the server's JSON.parse chokes.
  [System.IO.File]::WriteAllText($file, ($snapshot | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))

  $gapCol = if ([math]::Abs($bsGap) -le 1) { 'Green' } else { 'Red' }
  Write-Host ("  {0,-9} income {1,15:N2}  expenses {2,15:N2}  net {3,14:N2}  BS gap {4,8:N2}  jobs {5,3}" -f `
    $periodLabel, $income, $expenses, $netResult, $bsGap, $jobCosts.Count) -ForegroundColor $gapCol

  $built += [pscustomobject]@{ mth=$mth; file=$file; label=$periodLabel; gap=$bsGap }
}

$conn.Close()

Write-Host ""
Write-Host ("Built {0} period(s) for {1}." -f $built.Count, $pyLabel) -ForegroundColor Green
$badGaps = @($built | Where-Object { [math]::Abs($_.gap) -gt 1 })
if ($badGaps.Count) {
  Write-Host ("  WARNING: {0} period(s) have a balance-sheet gap. Investigate before pushing." -f $badGaps.Count) -ForegroundColor Red
  foreach ($b in $badGaps) { Write-Host ("    {0}: gap {1:N2}" -f $b.label, $b.gap) -ForegroundColor Red }
}

if ($WhatIf) {
  Write-Host ""
  Write-Host "-WhatIf: nothing was pushed. Files are next to this script." -ForegroundColor Yellow
  exit 0
}

# -- push each period, archive-only -------------------------------------------
# ?mode=archive stores the period in `snapshots` and leaves the live dashboard
# and the Blob completely untouched.
$localCurl = Join-Path $scriptDir 'curl.exe'
if (-not (Test-Path $localCurl)) { throw "curl.exe not found next to this script. Server 2012 R2's TLS can't reach Vercel without it." }
$caBundle = Join-Path $scriptDir 'curl-ca-bundle.crt'
$curlArgs = @()
if (Test-Path $caBundle) { $curlArgs += @('--cacert', $caBundle) }

$endpoint = ($Url.TrimEnd('/')) + '/api/feed/snapshot?mode=archive'
$ok = 0
foreach ($b in $built) {
  $respFile = Join-Path $scriptDir 'backfill-response.json'
  $status = & $localCurl @curlArgs -sS -o $respFile -w '%{http_code}' -X PUT $endpoint `
              -H "x-upload-password: $Password" -H 'Content-Type: application/json' `
              --data-binary ("@" + $b.file)
  $body = if (Test-Path $respFile) { Get-Content $respFile -Raw } else { '' }
  if ([int]$status -ge 200 -and [int]$status -lt 300) {
    Write-Host ("  pushed {0}  (HTTP {1})" -f $b.label, $status) -ForegroundColor Green
    $ok++
  } else {
    Write-Host ("  FAILED {0}  (HTTP {1}): {2}" -f $b.label, $status, $body) -ForegroundColor Red
  }
}
Remove-Item (Join-Path $scriptDir 'backfill-response.json') -ErrorAction SilentlyContinue

Write-Host ""
Write-Host ("Archived {0} of {1} periods. The live dashboard was not touched." -f $ok, $built.Count) -ForegroundColor Green
Write-Host "The period selector should now span two financial years." -ForegroundColor Green
