<#
  28-rebuild-prioryear.ps1  -  Rebuild last year's 12 monthly snapshots for the
                               "vs last year" comparatives, from GLBAL.LASTYEAR.
  ---------------------------------------------------------------------------
  27-probe confirmed GLBAL.LASTYEAR holds the prior year's P&L month by month.
  This reads it exactly the way the feed reads BALANCE -- once per month 1..12 --
  and builds a FY2025-26 snapshot for each, pushing them to the ARCHIVE only
  (?mode=archive), so the live dashboard is never touched.

  What it rebuilds (all GL-based, reliable): income, expenses, net, department
  spend, revenue lines, grant funding received, the full account list.
  What it does NOT (needs job/point-in-time history the GL doesn't keep): grant
  SPEND, job actuals, commitments, ageing -- those stay "vs last year -" and fill
  in going forward.

  STRICTLY READ-ONLY against Practical. Writes only to the dashboard archive.

  Run on HVASC-APP02:
      # 1. dry run - build all 12 months and PRINT a validation table, push nothing
      powershell -ExecutionPolicy Bypass -File .\28-rebuild-prioryear.ps1

      # 2. once the numbers look right, archive them
      powershell -ExecutionPolicy Bypass -File .\28-rebuild-prioryear.ps1 -Push -Url https://<app>.vercel.app -Password <UPLOAD_PASSWORD>
#>

param(
  [switch]$Push,
  [string]$Url      = $env:HVASC_URL,
  [string]$Password = $env:HVASC_UPLOAD_PASSWORD
)

$ErrorActionPreference = 'Stop'

function Open-Practical {
  $attempts = @(
    @{ label = "the DSN's own login";     cs = 'DSN=Practical_Plus;' }
    @{ label = 'UID with empty password'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=;' }
  )
  if ($env:PRACTICAL_PWD) {
    $attempts += @{ label = 'UID with PRACTICAL_PWD'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=' + $env:PRACTICAL_PWD + ';' }
  }
  foreach ($a in $attempts) {
    try { $c = New-Object System.Data.Odbc.OdbcConnection($a.cs); $c.Open()
          Write-Host ("Connected via {0}." -f $a.label) -ForegroundColor Green; return $c
    } catch { $lastErr = $_ }
  }
  throw ("Could not connect to Practical. Last error: {0}" -f $lastErr)
}

$conn = Open-Practical

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader(); $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null
      try { $v = $r.GetValue($i) } catch { try { $v = $r.GetString($i) } catch { $v = $null } }
      $o[$r.GetName($i)] = ($(if ($v -is [DBNull]) { $null } else { $v }))
    }
    $rows += [pscustomobject]$o
  }
  $r.Close(); return ,$rows
}
function Invoke-Scalar([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $v = $cmd.ExecuteScalar()
  if ($v -is [DBNull] -or $null -eq $v) { return 0 } else { return [double]$v }
}
function R2([object]$x) {
  if ($null -eq $x -or $x -is [DBNull]) { return 0 }
  if ($x -is [string]) { $d = 0.0; if ([double]::TryParse($x, [ref]$d)) { return [math]::Round($d, 2) } return 0 }
  return [math]::Round([double]$x, 2)
}
function Slugify([string]$s) { return (($s.ToLower() -replace '&','and' -replace '[^a-z0-9]+','-').Trim('-')) }

# -- department map (same file the feed uses) ---------------------------------
$mapPath = Join-Path $PSScriptRoot 'department-map.json'
if (-not (Test-Path $mapPath)) { throw "department-map.json not found next to this script ($mapPath). Copy it over from the feed folder." }
$deptMap = Get-Content $mapPath -Raw | ConvertFrom-Json
$ACCT2DEPT = @{}
foreach ($p in $deptMap.accounts.PSObject.Properties) { $ACCT2DEPT[$p.Name] = $p.Value }
$DEPTS = [ordered]@{}
foreach ($d in $deptMap.departments) { $DEPTS[$d.id] = $d }
function Resolve-Dept([string]$glAccount) {
  if (-not $glAccount) { return $null }
  $key = $glAccount.Trim(); if ($key.Length -ge 9) { $key = $key.Substring(0, 9) }
  if ($ACCT2DEPT.ContainsKey($key)) { return $ACCT2DEPT[$key] }
  return $null
}
$MONTHS = @('Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun')

# -- which year is "last year"? ------------------------------------------------
# GLCON.YR is the CURRENT FY-ending year. LASTYEAR therefore holds the year before.
$yr        = [int](Invoke-Scalar 'SELECT YR FROM GLCON')   # e.g. 2027 (FY2026-27)
$pyEndYr   = $yr - 1                                        # 2026  -> FY2025-26 ends Jun 2026
$pyFyLabel = "FY$($pyEndYr-1)-" + ($pyEndYr.ToString().Substring(2))
Write-Host ("Rebuilding {0} from GLBAL.LASTYEAR (current FY ends {1})." -f $pyFyLabel, $yr) -ForegroundColor Cyan

# Full prior-year department spend (LASTYEAR at MTH 12) -> a sensible annual figure
# so an archived month renders with a real utilisation if anyone opens it.
$annByDept = @{}
foreach ($id in $DEPTS.Keys) { $annByDept[$id] = 0.0 }
foreach ($r in (Invoke-Rows "SELECT m.GLACCOUNT, b.LASTYEAR AS BAL FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=12 AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6")) {
  $dept = Resolve-Dept ([string]$r.GLACCOUNT); if ($dept) { $annByDept[$dept] += (R2 $r.BAL) }
}

# -- push helper (curl.exe preferred; Server 2012 SChannel can't TLS to Vercel) -
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { '.' }
$localCurl = Join-Path $scriptDir 'curl.exe'
$curlExe = if (Test-Path $localCurl) { $localCurl } elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) { 'curl.exe' } else { $null }
$caBundle = Join-Path $scriptDir 'curl-ca-bundle.crt'

function Push-Archive($snapshot, [string]$label) {
  $endpoint = ($Url.TrimEnd('/')) + '/api/feed/snapshot?mode=archive'
  $body = $snapshot | ConvertTo-Json -Depth 12 -Compress
  $tmp = Join-Path $env:TEMP ("pyrebuild-" + $label.Replace(' ','_') + ".json")
  [System.IO.File]::WriteAllText($tmp, $body, (New-Object System.Text.UTF8Encoding($false)))
  if ($curlExe) {
    $curlArgs = @('-s','-S','-X','PUT','-H','Content-Type: application/json','-H',"x-upload-password: $Password",'--data-binary',"@$tmp",$endpoint)
    if (Test-Path $caBundle) { $curlArgs = @('--cacert', $caBundle) + $curlArgs }
    $resp = & $curlExe @curlArgs
  } else {
    $headers = @{ 'x-upload-password' = $Password }
    $resp = Invoke-RestMethod -Method Put -Uri $endpoint -ContentType 'application/json' -Headers $headers -Body $body
    $resp = $resp | ConvertTo-Json -Compress
  }
  Remove-Item $tmp -ErrorAction SilentlyContinue
  return $resp
}

# -- build one month -----------------------------------------------------------
function Build-Month([int]$M) {
  $calYr = if ($M -le 6) { $pyEndYr - 1 } else { $pyEndYr }
  $label = "$($MONTHS[$M-1]) $calYr"

  $income   = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$M AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5")
  $expenses = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$M AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6")
  $net      = R2 ($income - $expenses)

  # Department + revenue rollup, reading LASTYEAR at this month.
  $agg = @{}; foreach ($id in $DEPTS.Keys) { $agg[$id] = @{ exp = 0.0; rev = 0.0; revNonGrant = 0.0; lines = @() } }
  $accounts = @()
  foreach ($r in (Invoke-Rows "SELECT m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, m.ACCNT2, b.LASTYEAR AS BAL FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$M AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE IN (5,6)")) {
    $code = [string]$r.GLACCOUNT; $type = [int]$r.ACCNTTYPE; $bal = R2 $r.BAL; $dept = Resolve-Dept $code
    $accounts += [ordered]@{ code = $code; name = ([string]$r.DESCRIPT).Trim(); kind = $(if ($type -eq 5) { 'revenue' } else { 'expense' }); departmentId = $dept; balance = $bal; budget = 0; budgetYtd = 0 }
    if (-not $dept) { continue }
    if ($type -eq 6) {
      $agg[$dept].exp += $bal
      if ($bal -ne 0) { $agg[$dept].lines += [pscustomobject]@{ code = $code; account = ([string]$r.DESCRIPT).Trim(); amount = $bal } }
    } elseif ($type -eq 5) {
      $agg[$dept].rev += $bal; $a2 = [int]$r.ACCNT2
      if (-not ($a2 -ge 1100 -and $a2 -le 1199)) { $agg[$dept].revNonGrant += $bal }
    }
  }

  $departments = @()
  foreach ($id in $DEPTS.Keys) {
    $cfg = $DEPTS[$id]; $a = $agg[$id]
    $ytdActual = R2 $a.exp; $revenue = R2 $a.rev
    $annualBudget = R2 $annByDept[$id]; if ($annualBudget -le 0) { $annualBudget = $ytdActual }
    $ytdBudget = R2 ($annualBudget * $M / 12)
    $ratio = if ($ytdBudget -gt 0) { $ytdActual / $ytdBudget } else { 0 }
    $status = if ($ratio -gt 1.05) { 'over-budget' } elseif ($ratio -gt 1.0) { 'at-risk' } else { 'on-track' }
    $glLines = @()
    foreach ($l in (@($a.lines) | Sort-Object { [double]$_.amount } -Descending | Select-Object -First 6)) {
      $glLines += [ordered]@{ code = $l.code; account = $l.account; amount = (R2 $l.amount) }
    }
    $departments += [ordered]@{
      id = $cfg.id; slug = $cfg.slug; name = $cfg.name; icon = $cfg.icon; color = $cfg.color
      kind = $(if ($revenue -gt 0) { 'cost-revenue' } else { 'cost' })
      annualBudget = $annualBudget; ytdActual = $ytdActual; ytdBudget = $ytdBudget
      revenue = $revenue; status = $status; glLines = $glLines
    }
  }

  $grantsRevTotal = R2 (Invoke-Scalar "SELECT SUM(b.LASTYEAR) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$M AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND m.ACCNT2 BETWEEN 1100 AND 1199")
  $revenueLines = @()
  if ($grantsRevTotal -gt 0) { $revenueLines += [ordered]@{ id = 'grants-and-subsidies'; label = 'Grants & subsidies'; ytd = $grantsRevTotal } }
  foreach ($id in $DEPTS.Keys) {
    $cfg = $DEPTS[$id]; $rev = R2 $agg[$id].revNonGrant
    if ($rev -gt 0) { $revenueLines += [ordered]@{ id = (Slugify ($cfg.name + ' revenue')); label = "$($cfg.name) revenue"; departmentId = $cfg.id; ytd = $rev } }
  }

  # Grant funding received (GL account level), from LASTYEAR at this month.
  $grants = @()
  foreach ($g in (Invoke-Rows "SELECT m.GLACCOUNT, m.DESCRIPT, b.LASTYEAR AS BAL FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$M AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND m.ACCNT2 BETWEEN 1100 AND 1199 AND b.LASTYEAR <> 0 ORDER BY b.LASTYEAR DESC")) {
    $total = R2 $g.BAL; if ($total -le 0) { continue }
    $deptId = Resolve-Dept ([string]$g.GLACCOUNT); if (-not $deptId) { $deptId = 'corporate-services' }
    $grants += [ordered]@{ id = [string]$g.GLACCOUNT; name = ([string]$g.DESCRIPT).Trim(); funder = 'Grant'; departmentId = $deptId; total = $total; spent = 0; reportDue = [ordered]@{ label='-'; level='muted' }; acquittal = [ordered]@{ label='-'; level='muted' }; status = 'not-started'; statusChip = [ordered]@{ label='FUNDING RECEIVED'; level='muted' } }
  }

  $snapshot = [ordered]@{
    period = [ordered]@{ label = $label; fyLabel = $pyFyLabel; monthOfYear = $M; monthsInYear = 12; live = $true; comparisonLabel = 'Budget' }
    departments = $departments
    grants = $grants
    revenueLines = $revenueLines
    monthlySpend = @()
    incomeTotals = [ordered]@{ totalIncome = $income; totalExpenses = $expenses; netResult = $net; revenueLines = $revenueLines }
    accounts = $accounts
    meta = [ordered]@{ source = "Rebuilt from GLBAL.LASTYEAR by 28-rebuild-prioryear.ps1"; generatedAt = (Get-Date).ToString('yyyy-MM-dd') }
  }
  return @{ snapshot = $snapshot; label = $label; income = $income; expenses = $expenses; net = $net }
}

# -- run all 12 months ---------------------------------------------------------
Write-Host ""
Write-Host ("{0,-10} {1,16} {2,16} {3,16}" -f 'Month','Income','Expenses','Net') -ForegroundColor Cyan
$built = @()
for ($M = 1; $M -le 12; $M++) {
  $b = Build-Month $M
  $built += $b
  Write-Host ("{0,-10} {1,16:N0} {2,16:N0} {3,16:N0}" -f $b.label, $b.income, $b.expenses, $b.net)
}

if (-not $Push) {
  Write-Host ""
  Write-Host "DRY RUN - nothing pushed. If these match last year's known actuals, re-run with:" -ForegroundColor Yellow
  Write-Host "  .\28-rebuild-prioryear.ps1 -Push -Url https://<app>.vercel.app -Password <UPLOAD_PASSWORD>" -ForegroundColor Yellow
  $conn.Close(); return
}

if (-not $Url -or -not $Password) { throw "-Push needs -Url and -Password (or HVASC_URL / HVASC_UPLOAD_PASSWORD env vars)." }

Write-Host ""
Write-Host "Archiving 12 months to $Url ..." -ForegroundColor Cyan
foreach ($b in $built) {
  try {
    $resp = Push-Archive $b.snapshot $b.label
    Write-Host ("  {0,-10} archived. {1}" -f $b.label, ([string]$resp).Substring(0, [Math]::Min(80, ([string]$resp).Length))) -ForegroundColor Green
  } catch {
    Write-Host ("  {0,-10} FAILED: {1}" -f $b.label, $_.Exception.Message) -ForegroundColor Red
  }
}
Write-Host ""
Write-Host "Done. Reload the dashboard - the 'vs last year' placeholders for income, expenses, net," -ForegroundColor Green
Write-Host "department spend, revenue and grant funding will now show real July-vs-July numbers." -ForegroundColor Green
$conn.Close()
