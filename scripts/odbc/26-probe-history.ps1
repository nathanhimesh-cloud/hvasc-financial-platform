<#
  26-probe-history.ps1  -  READ-ONLY: where did last year's GL detail go?
  ---------------------------------------------------------------------------
  25-probe-prioryear.ps1 found GLTRN empty for FY2025-26 -- Practical keeps GL
  transaction detail for the current year only. Two possibilities remain:

    (a) Last year's rows were ARCHIVED to a history table (e.g. GLTRNH, GLHIST,
        a year-suffixed table). If so, we can still rebuild from there.
    (b) They were purged. Then the monthly rebuild is genuinely off the table and
        we fall back to the full-year prior figure (already in the snapshot).

  This lists the candidate tables and shows GLTRN's true date span, so we know
  which case we're in. Also lists JCTRN's columns (its date column isn't TRNDATE).
  STRICTLY READ-ONLY.

  Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\26-probe-history.ps1
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

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $da = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
  $dt = New-Object System.Data.DataTable
  try { [void]$da.Fill($dt) } finally { $cmd.Dispose(); $da.Dispose() }
  return @($dt.Rows)
}

Write-Host ""
Write-Host "==== HISTORY / ARCHIVE PROBE ====" -ForegroundColor Cyan

# 1. Every user table (single-quoted SQL so PowerShell leaves the RDB$ dollars alone).
$tblRows = Invoke-Rows 'SELECT RDB$RELATION_NAME AS NM FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 ORDER BY RDB$RELATION_NAME'
$tables = @()
foreach ($r in $tblRows) { $tables += ([string]$r.NM).Trim() }
Write-Host ("User tables found: {0}" -f $tables.Count)

# 2. The ones that could hold GL / job transactions or history.
Write-Host ""
Write-Host "-- Candidate transaction / history tables --" -ForegroundColor Cyan
$interesting = $tables | Where-Object { $_ -match 'GL|JC|TRN|HIST|ARCH|PRIOR|LAST|20\d\d|FY' }
foreach ($t in $interesting) { Write-Host ("  {0}" -f $t) }
if (-not $interesting) { Write-Host "  (none matched)" -ForegroundColor Yellow }

# 3. GLTRN's TRUE span - proves whether it's current-year-only.
Write-Host ""
Write-Host "-- GLTRN overall span --" -ForegroundColor Cyan
try {
  $span = Invoke-Rows 'SELECT COUNT(*) AS N, MIN(t.TRNDATE) AS MN, MAX(t.TRNDATE) AS MX FROM GLTRN t'
  $s = $span[0]
  Write-Host ("  rows: {0}   earliest: {1}   latest: {2}" -f $s.N, $s.MN, $s.MX)
} catch { Write-Host ("  GLTRN span query failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow }

# 4. If a GLTRN history table exists, show ITS span too.
foreach ($cand in @('GLTRNH','GLTRNHIST','GLTRN_HIST','GLHIST','GLTRNARCH','GLARCH')) {
  if ($tables -contains $cand) {
    try {
      $sp = Invoke-Rows "SELECT COUNT(*) AS N, MIN(t.TRNDATE) AS MN, MAX(t.TRNDATE) AS MX FROM $cand t"
      Write-Host ("-- {0}: rows {1}, {2} .. {3}" -f $cand, $sp[0].N, $sp[0].MN, $sp[0].MX) -ForegroundColor Green
    } catch { Write-Host ("-- {0} exists but has no TRNDATE column" -f $cand) -ForegroundColor Yellow }
  }
}

# 5. JCTRN columns - find its date column (its probe earlier didn't have TRNDATE).
Write-Host ""
Write-Host "-- JCTRN columns --" -ForegroundColor Cyan
try {
  $cols = Invoke-Rows 'SELECT RDB$FIELD_NAME AS FN FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = ''JCTRN'' ORDER BY RDB$FIELD_POSITION'
  $names = @(); foreach ($c in $cols) { $names += ([string]$c.FN).Trim() }
  Write-Host ("  " + ($names -join ", "))
} catch { Write-Host ("  JCTRN column list failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow }

Write-Host ""
Write-Host "Send me this whole output. If a history table holds FY2025-26, the full rebuild is back on." -ForegroundColor Green
Write-Host "If GLTRN's earliest date is 1 Jul 2026 and no history table exists, we take the fallback." -ForegroundColor Green

$conn.Close()
