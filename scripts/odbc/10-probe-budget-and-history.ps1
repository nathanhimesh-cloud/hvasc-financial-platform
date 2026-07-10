<#
  10-probe-budget-and-history.ps1  -  READ-ONLY: two questions we must not guess at
  ---------------------------------------------------------------------------
  Q1. Is GLBAL.BUDGET an ANNUAL budget repeated on every period row, or a PHASED
      budget for that period alone?

      05-build-snapshot.ps1 currently reads BUDGET at the CURRENT period and calls
      it `annualBudget`. If BUDGET is actually per-period, then every budget
      figure on the dashboard is roughly a twelfth of the truth, "Water
      Administration Expenses" really does have a $28 July budget rather than a
      $28 annual one, and the over-budget flags are meaningless.

      Test: sum BUDGET by period. If every period carries the same total, it's an
      annual figure. If the totals differ and add up to something like a year's
      expenditure, it's phased.

  Q2. How far back does Practical let us read?

      To backfill history (and to offer day-level filtering over past years) we
      need to know: how many periods GLBAL holds, and how far GLTRN's dates go.

      SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\10-probe-budget-and-history.ps1
#>

$ErrorActionPreference = 'Stop'

# The DSN carries its own Firebird login (see 09-probe-jcmst.ps1).
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

$yr = [int]($conn.CreateCommand() | ForEach-Object { $_.CommandText = 'SELECT YR FROM GLCON'; $_.ExecuteScalar() })
$mth = [int]($conn.CreateCommand() | ForEach-Object { $_.CommandText = 'SELECT MTH FROM GLCON'; $_.ExecuteScalar() })
Write-Host ("Current period: month {0} of FY{1}" -f $mth, $yr) -ForegroundColor Cyan

# -- Q1: budget shape ---------------------------------------------------------
Write-Host ""
Write-Host "Q1. GLBAL.BUDGET by period (operating expense accounts, type 6):" -ForegroundColor Cyan
Write-Host "    MTH        SUM(BUDGET)         SUM(BALANCE)"
$rows = Get-Rows @'
SELECT b.MTH,
       SUM(CAST(b.BUDGET  AS DOUBLE PRECISION)) AS BUD,
       SUM(CAST(b.BALANCE AS DOUBLE PRECISION)) AS BAL
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE = 6
GROUP BY b.MTH ORDER BY b.MTH
'@
$budTotal = 0.0
$distinct = @{}
foreach ($r in $rows) {
  $b = [double]$r.BUD
  $budTotal += $b
  $key = [math]::Round($b, 2)
  $distinct[$key] = $true
  Write-Host ("    {0,3}  {1,18:N2}  {2,18:N2}" -f [int]$r.MTH, $b, [double]$r.BAL)
}
Write-Host ("    SUM of BUDGET across all periods: {0:N2}" -f $budTotal)
Write-Host ""
if ($distinct.Keys.Count -eq 1 -and $rows.Count -gt 1) {
  Write-Host "  => Same value on every period. BUDGET is an ANNUAL figure." -ForegroundColor Green
  Write-Host "     05 is correct to treat BUDGET at the current period as the annual budget." -ForegroundColor Green
} else {
  Write-Host "  => Values DIFFER by period. BUDGET is PHASED (per-period)." -ForegroundColor Red
  Write-Host "     05 is WRONG: it reads one period's budget and labels it annual." -ForegroundColor Red
  Write-Host ("     The annual budget is the SUM above: {0:N2}" -f $budTotal) -ForegroundColor Red
  Write-Host "     Compare that against the Council's adopted FY27 operating budget." -ForegroundColor Yellow
}

# Is there a separate annual-budget column on GLMST or GLBAL?
Write-Host ""
Write-Host "Budget-ish columns available:" -ForegroundColor Cyan
foreach ($t in @('GLBAL','GLMST')) {
  $cols = Get-Rows ("SELECT RDB`$FIELD_NAME AS FLD FROM RDB`$RELATION_FIELDS WHERE RDB`$RELATION_NAME = '$t'")
  $hits = @($cols | ForEach-Object { ([string]$_.FLD).Trim() } | Where-Object { $_ -match 'BUD|EST|ANN|ORIG|REVIS' })
  Write-Host ("  {0}: {1}" -f $t, $(if ($hits.Count) { $hits -join ', ' } else { '(none)' }))
}

# -- Q2: how much history can we read? ----------------------------------------
Write-Host ""
Write-Host "Q2. History available for backfill:" -ForegroundColor Cyan

$p = Get-Rows 'SELECT MIN(MTH) AS LO, MAX(MTH) AS HI, COUNT(DISTINCT MTH) AS N FROM GLBAL'
Write-Host ("  GLBAL periods present: {0}..{1}  ({2} distinct)" -f $p[0].LO, $p[0].HI, $p[0].N)
Write-Host "    (GLBAL holds the CURRENT financial year only, plus a LASTYEAR column.)"

$t = Get-Rows 'SELECT MIN(TRNDATE) AS LO, MAX(TRNDATE) AS HI, COUNT(*) AS N FROM GLTRN'
Write-Host ("  GLTRN dates: {0} .. {1}   ({2} rows)" -f $t[0].LO, $t[0].HI, $t[0].N)

$j = Get-Rows 'SELECT MIN(TRANDATE) AS LO, MAX(TRANDATE) AS HI, COUNT(*) AS N FROM JCTRN'
Write-Host ("  JCTRN dates: {0} .. {1}   ({2} rows)" -f $j[0].LO, $j[0].HI, $j[0].N)

# Transactions per financial year, so we can size a backfill.
Write-Host ""
Write-Host "  GLTRN rows per calendar year:" -ForegroundColor Cyan
foreach ($r in (Get-Rows 'SELECT EXTRACT(YEAR FROM TRNDATE) AS YR, COUNT(*) AS N FROM GLTRN GROUP BY EXTRACT(YEAR FROM TRNDATE) ORDER BY 1')) {
  Write-Host ("    {0}  {1,8}" -f [int]$r.YR, [int]$r.N)
}

# Any archive / history tables Practical keeps for prior years?
Write-Host ""
Write-Host "  Tables that look like prior-year archives:" -ForegroundColor Cyan
$tables = Get-Rows @'
SELECT RDB$RELATION_NAME AS T FROM RDB$RELATIONS
WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
ORDER BY 1
'@
$arch = @($tables | ForEach-Object { ([string]$_.T).Trim() } | Where-Object { $_ -match 'HIST|ARCH|PRIOR|LAST|^GL.*Y$|BAK' })
if ($arch.Count) { $arch | ForEach-Object { Write-Host "    $_" } } else { Write-Host "    (none found)" }
Write-Host ("  Total user tables: {0}" -f $tables.Count)

$conn.Close()
Write-Host ""
Write-Host "Done. Nothing was written." -ForegroundColor Green
