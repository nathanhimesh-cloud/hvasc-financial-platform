<#
  25-probe-prioryear.ps1  -  READ-ONLY probe: can we rebuild FY2025-26 from Practical?
  ---------------------------------------------------------------------------
  The dashboard's "vs last year" comparatives need last year's figures in the
  archive. GLBAL only keeps the CURRENT year month-by-month plus last year's
  CLOSE, so last year's MONTHLY positions are gone from GLBAL. BUT the P&L
  (income / expenses / department spend / grant + job spend) resets to zero every
  financial year, so it can be rebuilt from the TRANSACTION history (GLTRN / JCTRN)
  alone -- IF Practical still holds FY2025-26 transactions.

  This probe answers exactly that, and rebuilds July 2025 as proof so you can eyeball
  it against a known figure before we commit to the full rebuild. STRICTLY READ-ONLY.

  Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\25-probe-prioryear.ps1
#>

param()

function Open-Practical {
  $attempts = @(
    @{ label = "the DSN's own login";     cs = 'DSN=Practical_Plus;' }
    @{ label = 'UID with empty password'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=;' }
  )
  if ($env:PRACTICAL_PWD) {
    $attempts += @{ label = 'UID with PRACTICAL_PWD'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=' + $env:PRACTICAL_PWD + ';' }
  }
  foreach ($a in $attempts) {
    try {
      $c = New-Object System.Data.Odbc.OdbcConnection($a.cs)
      $c.Open()
      Write-Host ("Connected via {0}." -f $a.label) -ForegroundColor Green
      return $c
    } catch { $lastErr = $_ }
  }
  throw ("Could not connect to Practical. Last error: {0}" -f $lastErr)
}

$conn = Open-Practical

function Invoke-Scalar([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  try { $v = $cmd.ExecuteScalar() } finally { $cmd.Dispose() }
  if ($null -eq $v -or $v -is [System.DBNull]) { return 0 }
  return $v
}
function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $da = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
  $dt = New-Object System.Data.DataTable
  try { [void]$da.Fill($dt) } finally { $cmd.Dispose(); $da.Dispose() }
  $rows = @($dt.Rows)
  return $rows
}
function R2($v) { if ($null -eq $v -or $v -is [System.DBNull]) { return 0 } return [math]::Round([double]$v, 2) }

# The prior financial year we want to rebuild. FY2025-26 = 1 Jul 2025 .. 30 Jun 2026.
$fyStart = '2025-07-01'
$fyEnd   = '2026-06-30'
$julEnd  = '2025-07-31'

Write-Host ""
Write-Host "==== PRIOR-YEAR REBUILD PROBE (FY2025-26) ====" -ForegroundColor Cyan

# 1. Does GLTRN still hold FY2025-26 transactions?
$glCount = [int](Invoke-Scalar "SELECT COUNT(*) FROM GLTRN t WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'")
$glMin   = Invoke-Scalar "SELECT MIN(t.TRNDATE) FROM GLTRN t WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'"
$glMax   = Invoke-Scalar "SELECT MAX(t.TRNDATE) FROM GLTRN t WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'"
Write-Host ""
Write-Host ("GLTRN rows in FY2025-26 : {0}" -f $glCount) -ForegroundColor $(if ($glCount -gt 0) { 'Green' } else { 'Red' })
Write-Host ("GLTRN date range        : {0} .. {1}" -f $glMin, $glMax)

# 2. Does JCTRN (job costs -> grant spend) still hold FY2025-26?
$jcOk = $true
try {
  $jcCount = [int](Invoke-Scalar "SELECT COUNT(*) FROM JCTRN t WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'")
  Write-Host ("JCTRN rows in FY2025-26 : {0}" -f $jcCount) -ForegroundColor $(if ($jcCount -gt 0) { 'Green' } else { 'Yellow' })
} catch {
  $jcOk = $false
  Write-Host "JCTRN probe skipped (column name differs) - not fatal; grant/job spend can be added later." -ForegroundColor Yellow
}

if ($glCount -le 0) {
  Write-Host ""
  Write-Host "RESULT: Practical does NOT retain FY2025-26 GL transactions - the rebuild is not possible from here." -ForegroundColor Red
  Write-Host "The comparatives will fill in going forward instead (each month is archived from now on)." -ForegroundColor Yellow
  $conn.Close(); return
}

# 3. Rebuild July 2025 P&L from GLTRN movement, so you can sanity-check it.
#    Income (type 5) is credit-normal: movement = CREDIT - DEBIT.
#    Expenses (type 6, ISCONTROL='Y') are debit-normal: movement = DEBIT - CREDIT.
$julIncome = R2 (Invoke-Scalar @"
SELECT SUM(CAST(t.CREDIT AS DOUBLE PRECISION) - CAST(t.DEBIT AS DOUBLE PRECISION))
FROM GLTRN t JOIN GLMST m ON m.GLACCOUNT = t.GLACCOUNT
WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$julEnd'
  AND m.RECACTIVE='Y' AND m.ACCNTTYPE = 5
"@)
$julExpense = R2 (Invoke-Scalar @"
SELECT SUM(CAST(t.DEBIT AS DOUBLE PRECISION) - CAST(t.CREDIT AS DOUBLE PRECISION))
FROM GLTRN t JOIN GLMST m ON m.GLACCOUNT = t.GLACCOUNT
WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$julEnd'
  AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE = 6
"@)
$julNet = R2 ($julIncome - $julExpense)

# Whole prior year, for a second sanity check against the known FY2025-26 actual.
$fyIncome = R2 (Invoke-Scalar @"
SELECT SUM(CAST(t.CREDIT AS DOUBLE PRECISION) - CAST(t.DEBIT AS DOUBLE PRECISION))
FROM GLTRN t JOIN GLMST m ON m.GLACCOUNT = t.GLACCOUNT
WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'
  AND m.RECACTIVE='Y' AND m.ACCNTTYPE = 5
"@)
$fyExpense = R2 (Invoke-Scalar @"
SELECT SUM(CAST(t.DEBIT AS DOUBLE PRECISION) - CAST(t.CREDIT AS DOUBLE PRECISION))
FROM GLTRN t JOIN GLMST m ON m.GLACCOUNT = t.GLACCOUNT
WHERE t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'
  AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE = 6
"@)

Write-Host ""
Write-Host "---- Rebuilt from GLTRN (sanity check) ----" -ForegroundColor Cyan
Write-Host ("July 2025  income  : {0:N2}" -f $julIncome)
Write-Host ("July 2025  expenses: {0:N2}" -f $julExpense)
Write-Host ("July 2025  net     : {0:N2}" -f $julNet)
Write-Host ("FY2025-26  income  : {0:N2}" -f $fyIncome)
Write-Host ("FY2025-26  expenses: {0:N2}" -f $fyExpense)
Write-Host ("FY2025-26  net     : {0:N2}" -f (R2 ($fyIncome - $fyExpense)))
Write-Host ""
Write-Host "If the FY2025-26 totals look right against the known actual, the full rebuild is a go." -ForegroundColor Green
Write-Host "Send me this output and I'll finish the rebuild-and-archive script (26-rebuild-prioryear.ps1)." -ForegroundColor Green

$conn.Close()
