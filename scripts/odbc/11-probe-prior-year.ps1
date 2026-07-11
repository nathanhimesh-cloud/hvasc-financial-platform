<#
  11-probe-prior-year.ps1  -  READ-ONLY: how much of FY2025-26 can we rebuild?
  ---------------------------------------------------------------------------
  We want to backfill last year so the dashboard can show two years and the
  period slider has something to slide over. Before writing a backfill script we
  need to know exactly what the database holds. Three questions:

  Q1. Is GLBAL.LASTYEAR a per-period CUMULATIVE column (like BUDGET turned out to
      be), or a single year-end total repeated on every row?

        cumulative -> we can rebuild all 12 months of FY2025-26
        one total  -> we get exactly one prior-year data point

      Test: sum LASTYEAR by period. Rising month on month = cumulative.
      Flat = a repeated total. This is the same trap BUDGET set for us, where
      MTH 1 held annual/12 and we called it the annual budget.

  Q2. Can we read the prior-year balance sheet? (LASTYEAR on account types 7-11
      at period 12 = closing position at 30 Jun 2026.) It should balance.

  Q3. Prior-year job costs from JCTRN, which spans years - and how many rows
      carry impossible dates.

  Also checks FRLASTYRACTUALS, an archive table the schema probe turned up. If it
  is readable it may carry prior-year actuals directly.

  SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\11-probe-prior-year.ps1
#>

$ErrorActionPreference = 'Stop'

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;')
$conn.Open()
Write-Host ("CONNECTED - {0}" -f $conn.ServerVersion) -ForegroundColor Green

function Get-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null
      try { $v = $r.GetValue($i) } catch { $v = $null }
      $o[$r.GetName($i)] = $(if ($v -is [DBNull]) { $null } else { $v })
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}

$yr = [int](Get-Rows 'SELECT YR FROM GLCON')[0].YR
$pyLabel = "FY{0}-{1}" -f ($yr - 2), (($yr - 1).ToString().Substring(2))
Write-Host ("Current FY ends {0}. Prior year is {1}." -f $yr, $pyLabel) -ForegroundColor Cyan

# -- Q1: is LASTYEAR cumulative per period? ----------------------------------
Write-Host ""
Write-Host "Q1. GLBAL.LASTYEAR by period (operating expense accounts, type 6):" -ForegroundColor Cyan
Write-Host "    MTH      SUM(LASTYEAR)        SUM(BALANCE)"
$rows = Get-Rows @'
SELECT b.MTH,
       SUM(CAST(b.LASTYEAR AS DOUBLE PRECISION)) AS LY,
       SUM(CAST(b.BALANCE  AS DOUBLE PRECISION)) AS BAL
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE = 6
GROUP BY b.MTH ORDER BY b.MTH
'@
$vals = @()
foreach ($r in $rows) {
  $ly = [double]$r.LY
  $vals += [math]::Round($ly, 2)
  Write-Host ("    {0,3}  {1,18:N2}  {2,18:N2}" -f [int]$r.MTH, $ly, [double]$r.BAL)
}

# Ignore period 0 (opening) when judging the shape.
$body = @($vals | Select-Object -Skip 1)
$distinct = ($body | Sort-Object -Unique).Count
$rising = $true
for ($i = 1; $i -lt $body.Count; $i++) {
  if ([math]::Abs($body[$i]) -lt [math]::Abs($body[$i-1]) - 0.01) { $rising = $false }
}

Write-Host ""
if ($distinct -le 1) {
  Write-Host "  => FLAT. LASTYEAR is a single year-end total repeated on every period." -ForegroundColor Yellow
  Write-Host "     Backfill gives ONE prior-year data point, not twelve months." -ForegroundColor Yellow
} elseif ($rising) {
  Write-Host "  => RISING each period. LASTYEAR is CUMULATIVE-TO-PERIOD, like BUDGET." -ForegroundColor Green
  Write-Host "     We can rebuild all 12 months of $pyLabel from it." -ForegroundColor Green
  Write-Host ("     Full prior year (period 12): {0:N2}" -f $body[-1])
} else {
  Write-Host "  => Values vary but do not rise monotonically. Inspect before trusting." -ForegroundColor Yellow
}

# -- Q2: prior-year balance sheet at period 12 -------------------------------
Write-Host ""
Write-Host "Q2. Prior-year balance sheet (LASTYEAR at period 12):" -ForegroundColor Cyan
$bs = Get-Rows @'
SELECT m.ACCNTTYPE, SUM(CAST(b.LASTYEAR AS DOUBLE PRECISION)) AS AMT
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = 12 AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE IN (7,8,9,10,11)
GROUP BY m.ACCNTTYPE ORDER BY m.ACCNTTYPE
'@
$t = @{}
$names = @{ 7='Current assets'; 8='Non-current assets'; 9='Current liabilities'; 10='Non-current liabilities'; 11='Community equity' }
foreach ($r in $bs) {
  $k = [int]$r.ACCNTTYPE; $t[$k] = [double]$r.AMT
  Write-Host ("    {0,-24} {1,18:N2}" -f $names[$k], $t[$k])
}
$assets = ($t[7] + $t[8]); $liab = ($t[9] + $t[10]); $eq = $t[11]
$gap = [math]::Round($assets - ($liab + $eq), 2)
Write-Host ("    {0,-24} {1,18:N2}" -f 'Total assets', $assets)
Write-Host ("    {0,-24} {1,18:N2}" -f 'Liabilities + equity', ($liab + $eq))
$col = if ([math]::Abs($gap) -le 1) { 'Green' } else { 'Red' }
Write-Host ("    {0,-24} {1,18:N2}   (should be 0)" -f 'GAP', $gap) -ForegroundColor $col

# -- Q3: prior-year job costs -------------------------------------------------
Write-Host ""
Write-Host "Q3. JCTRN by financial year (1 Jul - 30 Jun):" -ForegroundColor Cyan
foreach ($fy in @(($yr - 2), ($yr - 1), $yr)) {
  $s = "{0}-07-01" -f ($fy - 1)
  $e = "{0}-06-30" -f $fy
  $r = (Get-Rows "SELECT COUNT(*) AS N, SUM(CAST(TOTCOST AS DOUBLE PRECISION)) AS TOT FROM JCTRN WHERE TRANDATE >= '$s' AND TRANDATE <= '$e'")[0]
  Write-Host ("    FY{0}  {1,8} rows   {2,18:N2}" -f $fy, [int]$r.N, [double]$r.TOT)
}
$bad = (Get-Rows "SELECT COUNT(*) AS N FROM JCTRN WHERE TRANDATE < '1990-01-01' OR TRANDATE > '$yr-06-30'")[0].N
Write-Host ("    rows with impossible dates: {0}" -f [int]$bad) -ForegroundColor Yellow

# -- Bonus: is FRLASTYRACTUALS readable? -------------------------------------
Write-Host ""
Write-Host "Bonus. FRLASTYRACTUALS (turned up in the table list):" -ForegroundColor Cyan
try {
  $n = (Get-Rows 'SELECT COUNT(*) AS N FROM FRLASTYRACTUALS')[0].N
  Write-Host ("    READABLE - {0} rows." -f [int]$n) -ForegroundColor Green
  $cols = Get-Rows "SELECT RDB`$FIELD_NAME AS FLD FROM RDB`$RELATION_FIELDS WHERE RDB`$RELATION_NAME = 'FRLASTYRACTUALS'"
  Write-Host ("    columns: " + (($cols | ForEach-Object { ([string]$_.FLD).Trim() }) -join ', '))
} catch {
  Write-Host ("    NOT readable: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

$conn.Close()
Write-Host ""
Write-Host "Done. Nothing was written." -ForegroundColor Green
