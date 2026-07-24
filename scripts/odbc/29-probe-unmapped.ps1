<#
  29-probe-unmapped.ps1  -  READ-ONLY: list the accounts behind "Other revenue"
                            and "Unassigned" so Micah can say where they belong.
  ---------------------------------------------------------------------------
  These are the active income/expense accounts that department-map.json does NOT
  assign to a department. Their money is counted in the totals but shows on the
  dashboard as "Other revenue" (income) / "Unassigned" (expense) until mapped.

  Prints code, name, kind, and current balance, biggest first — a ready list to
  hand the Council. STRICTLY READ-ONLY.

  Run on HVASC-APP02 (needs department-map.json next to it, same as the feed):
      powershell -ExecutionPolicy Bypass -File .\29-probe-unmapped.ps1
#>

param()
$ErrorActionPreference = 'Stop'

function Open-Practical {
  $attempts = @(
    @{ label = "the DSN's own login";     cs = 'DSN=Practical_Plus;' }
    @{ label = 'UID with empty password'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=;' }
  )
  if ($env:PRACTICAL_PWD) { $attempts += @{ label = 'UID with PRACTICAL_PWD'; cs = 'DSN=Practical_Plus;UID=PCSACCESS;PWD=' + $env:PRACTICAL_PWD + ';' } }
  foreach ($a in $attempts) {
    try { $c = New-Object System.Data.Odbc.OdbcConnection($a.cs); $c.Open()
          Write-Host ("Connected via {0}." -f $a.label) -ForegroundColor Green; return $c } catch { $lastErr = $_ }
  }
  throw ("Could not connect to Practical. Last error: {0}" -f $lastErr)
}
$conn = Open-Practical
function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader(); $rows = @()
  while ($r.Read()) { $o = [ordered]@{}; for ($i=0;$i -lt $r.FieldCount;$i++){ $v=$null; try{$v=$r.GetValue($i)}catch{$v=$null}; $o[$r.GetName($i)]=($(if($v -is [DBNull]){$null}else{$v})) }; $rows += [pscustomobject]$o }
  $r.Close(); return ,$rows
}
function Invoke-Scalar([string]$Sql){ $cmd=$conn.CreateCommand(); $cmd.CommandText=$Sql; $v=$cmd.ExecuteScalar(); if($v -is [DBNull] -or $null -eq $v){0}else{[double]$v} }
function R2($x){ if($null -eq $x -or $x -is [DBNull]){return 0}; return [math]::Round([double]$x,2) }

# department map (same file the feed uses)
$mapPath = Join-Path $PSScriptRoot 'department-map.json'
if (-not (Test-Path $mapPath)) { throw "department-map.json not found next to this script ($mapPath). Copy it from the feed folder." }
$deptMap = Get-Content $mapPath -Raw | ConvertFrom-Json
$ACCT2DEPT = @{}; foreach ($p in $deptMap.accounts.PSObject.Properties) { $ACCT2DEPT[$p.Name] = $p.Value }
function Resolve-Dept([string]$g){ if(-not $g){return $null}; $k=$g.Trim(); if($k.Length -ge 9){$k=$k.Substring(0,9)}; if($ACCT2DEPT.ContainsKey($k)){$ACCT2DEPT[$k]}else{$null} }

$cur = [int](Invoke-Scalar 'SELECT MTH FROM GLCON')
if ($cur -lt 1 -or $cur -gt 12) { $cur = 11 }

# Active income/expense accounts carrying money at the current period.
$rows = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE IN (5,6) AND b.BALANCE <> 0
"@

$un = @()
foreach ($r in $rows) {
  if (Resolve-Dept ([string]$r.GLACCOUNT)) { continue }
  $un += [pscustomobject]@{
    code    = ([string]$r.GLACCOUNT).Trim()
    name    = ([string]$r.DESCRIPT).Trim()
    kind    = $(if ([int]$r.ACCNTTYPE -eq 5) { 'revenue' } else { 'expense' })
    balance = (R2 $r.BAL)
  }
}
$un = @($un | Sort-Object { -[math]::Abs([double]$_.balance) })

Write-Host ""
Write-Host ("==== UNMAPPED ACCOUNTS (period MTH $cur) ====") -ForegroundColor Cyan
if ($un.Count -eq 0) { Write-Host "None - every account carrying money is mapped." -ForegroundColor Green; $conn.Close(); return }

$revTot = 0.0; $expTot = 0.0
Write-Host ("{0,-16} {1,-42} {2,-9} {3,16}" -f 'CODE','NAME','KIND','BALANCE') -ForegroundColor DarkGray
foreach ($u in $un) {
  if ($u.kind -eq 'revenue') { $revTot += $u.balance } else { $expTot += $u.balance }
  $col = if ($u.kind -eq 'revenue') { 'Green' } else { 'Yellow' }
  Write-Host ("{0,-16} {1,-42} {2,-9} {3,16:N2}" -f $u.code, ($u.name.PadRight(42).Substring(0,42)), $u.kind, $u.balance) -ForegroundColor $col
}
Write-Host ""
Write-Host ("Unmapped REVENUE (the 'Other revenue' line): {0,16:N2} across {1} account(s)" -f $revTot, @($un | Where-Object { $_.kind -eq 'revenue' }).Count) -ForegroundColor Green
Write-Host ("Unmapped EXPENSE (the 'Unassigned' line):    {0,16:N2} across {1} account(s)" -f $expTot, @($un | Where-Object { $_.kind -eq 'expense' }).Count) -ForegroundColor Yellow
Write-Host ""
Write-Host "Hand this list to Micah: for each, which department (Corporate / Operations / Social)?" -ForegroundColor Cyan
Write-Host "Once assigned in department-map.json (or on the /mapping page), these lines disappear." -ForegroundColor Cyan
$conn.Close()
