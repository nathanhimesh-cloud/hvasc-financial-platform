<#
  30-probe-current-period.ps1  -  READ-ONLY: why does the dashboard stop at July?

  The feed reads the CURRENT accounting period from GLCON.MTH and then filters
  every figure to "WHERE MTH = <that>". So the dashboard shows exactly the months
  Practical says are open/posted. If the dashboard shows July only, GLCON.MTH is 1.

  The question this answers: does AUGUST (month 2 of the Jul-start FY) actually have
  posted actuals in GLBAL that we're missing because GLCON.MTH still says 1 -- or is
  August simply not in the ledger yet?

  It prints:
    1. GLCON.MTH / GLCON.YR                (what the feed treats as "now")
    2. SUM(BALANCE) for actual P&L accounts, per MTH 1..12
       - if MTH 2 has a DIFFERENT cumulative than MTH 1, August has real movement
       - if MTH 2 is absent or equal to MTH 1, August has nothing posted yet
    3. The max MTH that carries any actual (type 5/6) balance row

  STRICTLY READ-ONLY. Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\30-probe-current-period.ps1
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
    try { $c = New-Object System.Data.Odbc.OdbcConnection($a.cs); $c.Open()
          Write-Host ("Connected via {0}." -f $a.label) -ForegroundColor Green; return $c
    } catch { $lastErr = $_ }
  }
  throw ("Could not connect to Practical. Last error: {0}" -f $lastErr)
}

$conn = Open-Practical
function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $da = New-Object System.Data.Odbc.OdbcDataAdapter($cmd); $dt = New-Object System.Data.DataTable
  try { [void]$da.Fill($dt) } finally { $cmd.Dispose(); $da.Dispose() }
  return @($dt.Rows)
}
function Invoke-Scalar([string]$Sql) {
  $r = Invoke-Rows $Sql
  if ($r.Count -eq 0) { return $null }
  return $r[0][0]
}

$MONTHS = @('Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun')

Write-Host ''
Write-Host '=== 1. Practical current period (GLCON) ===' -ForegroundColor Cyan
$mth = [int](Invoke-Scalar 'SELECT MTH FROM GLCON')
$yr  = [int](Invoke-Scalar 'SELECT YR FROM GLCON')
$lbl = if ($mth -ge 1 -and $mth -le 12) { $MONTHS[$mth-1] } else { '??' }
Write-Host ("  GLCON.MTH = {0}  ({1})   GLCON.YR (FY ending) = {2}" -f $mth, $lbl, $yr)
Write-Host ("  -> the feed treats '{0}' as the current period and filters every figure to MTH = {1}." -f $lbl, $mth)

Write-Host ''
Write-Host '=== 2. Actual P&L cumulative (SUM of GLBAL.BALANCE, type 5/6) per month ===' -ForegroundColor Cyan
Write-Host '     A month whose total differs from the one before it has real postings.'
$rows = Invoke-Rows @'
SELECT b.MTH AS MTH, SUM(b.BALANCE) AS BAL, COUNT(*) AS N
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE = 'Y' AND m.ACCNTTYPE IN (5,6)
GROUP BY b.MTH
ORDER BY b.MTH
'@
$prev = $null
foreach ($r in $rows) {
  $m = [int]$r.MTH
  $b = [double]$r.BAL
  $name = if ($m -ge 1 -and $m -le 12) { $MONTHS[$m-1] } elseif ($m -eq 0) { 'opening' } else { "MTH$m" }
  $delta = if ($prev -ne $null) { $b - $prev } else { $b }
  $moved = if ([math]::Abs($delta) -gt 0.005) { 'MOVED' } else { 'no change' }
  Write-Host ("  MTH {0,2} {1,-8} cumulative = {2,16:N2}   rows = {3,5}   vs prev: {4}" -f $m, $name, $b, [int]$r.N, $moved)
  $prev = $b
}

Write-Host ''
Write-Host '=== 3. Latest month carrying any actual balance row ===' -ForegroundColor Cyan
$maxMth = Invoke-Scalar @'
SELECT MAX(b.MTH) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE = 'Y' AND m.ACCNTTYPE IN (5,6)
'@
Write-Host ("  MAX(MTH) with a type 5/6 row = {0}" -f $maxMth)
Write-Host ''
Write-Host 'READ:' -ForegroundColor Yellow
Write-Host '  - If MTH 2 (Aug) is present AND "MOVED", August has real data the feed is missing'
Write-Host '    because GLCON.MTH still says 1 -> we make the feed follow the latest posted month.'
Write-Host '  - If MTH 2 is absent, or present but "no change" from MTH 1, August is not posted in'
Write-Host '    Practical yet -> July is correctly the latest period; August appears once it is rolled.'
Write-Host ''

$conn.Close()
