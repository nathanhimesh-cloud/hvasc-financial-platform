<#
  27-probe-lastyear.ps1  -  READ-ONLY: find the best prior-year MONTHLY source.
  ---------------------------------------------------------------------------
  26-probe found Practical keeps prior-year ACTUALS in reporting tables even
  though GLTRN detail is current-year only. The best case is that last year's
  monthly figures already sit in GLBAL.LASTYEAR (the column the feed reads for the
  year-end close) -- if it's populated per MONTH, we rebuild by reading LASTYEAR
  exactly like BALANCE, no new logic at all.

  This checks that first, then dumps the FRLASTYRACTUALS / GLEYR / GLYR tables as
  backups. STRICTLY READ-ONLY.

  Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\27-probe-lastyear.ps1
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
function ColsOf([string]$table) {
  $sql = "SELECT RDB`$FIELD_NAME AS FN FROM RDB`$RELATION_FIELDS WHERE RDB`$RELATION_NAME = '$table' ORDER BY RDB`$FIELD_POSITION"
  # single-quote-safe: build with literal dollar via -replace is overkill; use here-string with backtick escape above.
  $r = Invoke-Rows $sql
  $n = @(); foreach ($c in $r) { $n += ([string]$c.FN).Trim() }
  return ($n -join ", ")
}

Write-Host ""
Write-Host "==== PRIOR-YEAR MONTHLY SOURCE PROBE ====" -ForegroundColor Cyan

# 1. THE KEY TEST: is GLBAL.LASTYEAR populated per MONTH?
#    Prior-year income (type 5) and expenses (type 6, control) YTD at each period.
Write-Host ""
Write-Host "-- GLBAL.LASTYEAR by month (prior-year YTD P&L) --" -ForegroundColor Cyan
try {
  $rows = Invoke-Rows @"
SELECT b.MTH AS MTH,
       SUM(CASE WHEN m.ACCNTTYPE=5 THEN CAST(b.LASTYEAR AS DOUBLE PRECISION) ELSE 0 END) AS INC,
       SUM(CASE WHEN m.ACCNTTYPE=6 AND m.ISCONTROL='Y' THEN CAST(b.LASTYEAR AS DOUBLE PRECISION) ELSE 0 END) AS EXP,
       SUM(CASE WHEN m.ACCNTTYPE=5 THEN CAST(b.BALANCE AS DOUBLE PRECISION) ELSE 0 END) AS INC_CUR
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y'     
GROUP BY b.MTH ORDER BY b.MTH
"@
  Write-Host ("  MTH  |  LASTYEAR income  |  LASTYEAR expenses |  (current income)")
  foreach ($r in $rows) {
    Write-Host ("  {0,3}  |  {1,15:N0}  |  {2,15:N0}  |  {3,12:N0}" -f [int]$r.MTH, [double]$r.INC, [double]$r.EXP, [double]$r.INC_CUR)
  }
  Write-Host ""
  Write-Host "  >> If LASTYEAR income/expenses grow across MTH 1..12, prior-year MONTHLY is in GLBAL. Rebuild is trivial." -ForegroundColor Green
  Write-Host "  >> If LASTYEAR is only non-zero at MTH 12 (or identical every row), it's the year-CLOSE only." -ForegroundColor Yellow
} catch { Write-Host ("  query failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow }

# 2. Backup source: FRLASTYRACTUALS (FR module's last-year actuals).
Write-Host ""
Write-Host "-- FRLASTYRACTUALS --" -ForegroundColor Cyan
try {
  Write-Host ("  columns: " + (ColsOf 'FRLASTYRACTUALS'))
  $c = Invoke-Rows 'SELECT COUNT(*) AS N FROM FRLASTYRACTUALS'
  Write-Host ("  rows: {0}" -f $c[0].N)
} catch { Write-Host ("  not readable: {0}" -f $_.Exception.Message) -ForegroundColor Yellow }

# 3. Backups: GLEYR / GLYR / GLEYRGL (GL by-year stores).
foreach ($t in @('GLEYR','GLYR','GLEYRGL','GLACTUALS','GLTOT')) {
  Write-Host ""
  Write-Host ("-- {0} --" -f $t) -ForegroundColor Cyan
  try {
    Write-Host ("  columns: " + (ColsOf $t))
    $c = Invoke-Rows "SELECT COUNT(*) AS N FROM $t"
    Write-Host ("  rows: {0}" -f $c[0].N)
  } catch { Write-Host ("  not readable: {0}" -f $_.Exception.Message) -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "Send me this output. The GLBAL.LASTYEAR-by-month result decides it; the table dumps are backups." -ForegroundColor Green
$conn.Close()
