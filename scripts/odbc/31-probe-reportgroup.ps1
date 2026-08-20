<#
  31-probe-reportgroup.ps1  -  READ-ONLY: is GLMST.REPORTGROUP populated?
  ---------------------------------------------------------------------------
  Discovery round 3 (Jul 2026) found REPORTGROUP empty for EVERY account - which
  is why department-map.json is a hand-transcribed file rather than a live read.
  Micah has since said the revenue centres are "all mapped in Practical". If that
  mapping landed on GLMST.REPORTGROUP, the feed can read it directly and the
  dashboard's "Council-wide & unmapped" row ($451,446 at Jul 2026) collapses.

  Answers three questions, in order of how much they matter:
    1. Is REPORTGROUP populated now, and with what values?
    2. Do those values look like the 3 directorates (Finance Director /
       Operations Manager / Social Services Director)?
    3. For the revenue accounts department-map.json CANNOT resolve today, does
       REPORTGROUP carry a value? That is the one that decides the fix.

  Also checks a second suspect: revenue accounts with ISCONTROL='N'. Those sit
  inside total income but are filtered OUT of the per-department rollup, so they
  stay in the unmapped row permanently no matter what anyone maps.

  department-map.json next to the script is OPTIONAL - with it, question 3 is
  answered exactly; without it, every revenue account is listed instead.

  STRICTLY READ-ONLY (SELECT only). Run on the Practical server:
      powershell -ExecutionPolicy Bypass -File .\31-probe-reportgroup.ps1
#>

param()
$ErrorActionPreference = 'Stop'

function Open-Practical {
  $attempts = @(
    @{ label = "the DSN's own login";     cs = 'DSN=Practical_Plus;' }
    @{ label = 'UID with empty password'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=;' }
  )
  if ($env:PRACTICAL_PWD) { $attempts += @{ label = 'UID with PRACTICAL_PWD'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=' + $env:PRACTICAL_PWD + ';' } }
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
  throw "Could not connect to Practical. Last error: $lastErr"
}
$conn = Open-Practical

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader(); $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null
      try { $v = $r.GetValue($i) } catch { $v = $null }
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
function R2($x) { if ($null -eq $x -or $x -is [DBNull]) { return 0 }; return [math]::Round([double]$x, 2) }
function Show([string]$s) {
  if ($null -eq $s) { return '(null)' }
  $t = ([string]$s).Trim()
  if ($t -eq '') { return '(empty)' } else { return $t }
}
function Pad([string]$s, [int]$n) {
  $t = [string]$s
  if ($t.Length -gt $n) { return $t.Substring(0, $n) } else { return $t.PadRight($n) }
}

$cur = [int](Invoke-Scalar 'SELECT MTH FROM GLCON')
if ($cur -lt 1 -or $cur -gt 12) { $cur = 1 }
Write-Host ("Current period: MTH {0}" -f $cur) -ForegroundColor Cyan

# -- optional department map, so we can isolate what is unmapped TODAY ---------
$ACCT2DEPT = @{}
$mapPath = Join-Path $PSScriptRoot 'department-map.json'
$haveMap = Test-Path $mapPath
if ($haveMap) {
  $deptMap = Get-Content $mapPath -Raw | ConvertFrom-Json
  foreach ($p in $deptMap.accounts.PSObject.Properties) { $ACCT2DEPT[$p.Name] = $p.Value }
  Write-Host ("department-map.json loaded - {0} accounts." -f $ACCT2DEPT.Count) -ForegroundColor DarkGray
} else {
  Write-Host "department-map.json NOT found - listing every revenue account, not just unmapped ones." -ForegroundColor Yellow
}
function Resolve-Dept([string]$g) {
  if (-not $g) { return $null }
  $k = $g.Trim()
  if ($k.Length -ge 9) { $k = $k.Substring(0, 9) }
  if ($ACCT2DEPT.ContainsKey($k)) { return $ACCT2DEPT[$k] } else { return $null }
}

# -- 1. is REPORTGROUP populated, on revenue accounts? ------------------------
Write-Host ""
Write-Host "==== 1. GLMST.REPORTGROUP on REVENUE accounts (ACCNTTYPE=5) ====" -ForegroundColor Cyan
$q1 = Invoke-Rows "SELECT REPORTGROUP, COUNT(*) AS N FROM GLMST WHERE RECACTIVE='Y' AND ACCNTTYPE=5 GROUP BY REPORTGROUP ORDER BY 2 DESC"
foreach ($r in $q1) { Write-Host ("  {0} {1,6}" -f (Pad (Show $r.REPORTGROUP) 46), $r.N) }
$populated = @($q1 | Where-Object { $null -ne $_.REPORTGROUP -and ([string]$_.REPORTGROUP).Trim() -ne '' })
if ($populated.Count -eq 0) {
  Write-Host "  => STILL EMPTY. Whatever Micah mapped, it is not on GLMST.REPORTGROUP." -ForegroundColor Red
} else {
  Write-Host ("  => POPULATED: {0} distinct value(s). The feed can read this." -f $populated.Count) -ForegroundColor Green
}

# -- 2. same across revenue + expense, to see the whole scheme ----------------
Write-Host ""
Write-Host "==== 2. REPORTGROUP across ALL income/expense accounts ====" -ForegroundColor Cyan
$q2 = Invoke-Rows "SELECT REPORTGROUP, COUNT(*) AS N FROM GLMST WHERE RECACTIVE='Y' AND ACCNTTYPE IN (5,6) GROUP BY REPORTGROUP ORDER BY 2 DESC"
foreach ($r in $q2) { Write-Host ("  {0} {1,6}" -f (Pad (Show $r.REPORTGROUP) 46), $r.N) }

# -- 3. the money question: the revenue we cannot place today -----------------
Write-Host ""
Write-Host "==== 3. Revenue accounts carrying money - does REPORTGROUP place them? ====" -ForegroundColor Cyan
$sql3 = "SELECT m.GLACCOUNT, m.DESCRIPT, m.REPORTGROUP, m.ISCONTROL, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL " +
        "FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT " +
        "WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND b.BALANCE <> 0"
$rows = Invoke-Rows $sql3
$target = @()
foreach ($r in $rows) {
  if ($haveMap -and (Resolve-Dept ([string]$r.GLACCOUNT))) { continue }   # already mapped - not our problem
  $target += [pscustomobject]@{
    code = ([string]$r.GLACCOUNT).Trim()
    name = ([string]$r.DESCRIPT).Trim()
    rg   = (Show $r.REPORTGROUP)
    ctl  = ([string]$r.ISCONTROL).Trim()
    bal  = (R2 $r.BAL)
  }
}
$target = @($target | Sort-Object { -[math]::Abs([double]$_.bal) })
if ($target.Count -eq 0) {
  Write-Host "  Nothing unmapped that carries a balance." -ForegroundColor Green
} else {
  Write-Host ("{0} {1} {2} {3} {4,14}" -f (Pad 'CODE' 16), (Pad 'NAME' 38), (Pad 'REPORTGROUP' 28), (Pad 'CTL' 4), 'BALANCE') -ForegroundColor DarkGray
  $withRg = 0; $tot = 0.0; $rgTot = 0.0
  foreach ($u in $target) {
    $tot += $u.bal
    $has = ($u.rg -ne '(empty)' -and $u.rg -ne '(null)')
    if ($has) { $withRg++; $rgTot += $u.bal }
    $col = if ($has) { 'Green' } else { 'Yellow' }
    Write-Host ("{0} {1} {2} {3} {4,14:N2}" -f (Pad $u.code 16), (Pad $u.name 38), (Pad $u.rg 28), (Pad $u.ctl 4), $u.bal) -ForegroundColor $col
  }
  Write-Host ""
  Write-Host ("  Unplaced revenue total:            {0,16:N2} across {1} account(s)" -f $tot, $target.Count)
  Write-Host ("  ...of which REPORTGROUP resolves:  {0,16:N2} across {1} account(s)" -f $rgTot, $withRg) -ForegroundColor Green
  Write-Host ("  ...still nothing to go on:         {0,16:N2}" -f ($tot - $rgTot)) -ForegroundColor Yellow
}

# -- 4. the other suspect: revenue the rollup filters out entirely ------------
Write-Host ""
Write-Host "==== 4. Revenue accounts with ISCONTROL='N' (never reach a department) ====" -ForegroundColor Cyan
$nCtl = Invoke-Scalar "SELECT COUNT(*) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND m.ISCONTROL='N' AND b.BALANCE <> 0"
$vCtl = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND m.ISCONTROL='N'")
$ctlCol = if ($nCtl -gt 0) { 'Yellow' } else { 'Green' }
Write-Host ("  {0} account(s), {1:N2}" -f [int]$nCtl, $vCtl) -ForegroundColor $ctlCol
if ($nCtl -gt 0) {
  Write-Host "  => This much is in Total Income but EXCLUDED from the per-department rollup" -ForegroundColor Yellow
  Write-Host "     (05-build-snapshot.ps1 filters ISCONTROL='Y'). Mapping will never shift it." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Send Nathan sections 1, 3 and 4." -ForegroundColor Cyan
$conn.Close()
