<#
  32-probe-cvreportgroup.ps1  -  READ-ONLY: read Practical's Report Groups
  ---------------------------------------------------------------------------
  Micah maps accounts to directorates via Report Groups (Practical's two-pane
  account picker), NOT via GLMST.REPORTGROUP - which 31-probe proved is empty.

  The schema says that screen is backed by:
      CVREPORTGROUP      KY, GROUP_NAME, DESCRIPTION, SCOPE, BUDGETEXPORT
      CVREPORTGROUPLINK  LINK_KY, MST_KY, GROUP_KY      (the membership)
      GLMST.KY                                          (the join target)

  If those are readable, the feed can resolve every account to its directorate
  straight from Practical and department-map.json stops being hand-maintained.
  The FR* tables were permission-denied in July; CV* may or may not be. That is
  what this checks, one table at a time, so a denial names itself instead of
  killing the run.

  Writes report-groups.json next to the script - send that back to Nathan and the
  mapping can be rebuilt from it directly.

  STRICTLY READ-ONLY (SELECT only):
      powershell -ExecutionPolicy Bypass -File .\32-probe-cvreportgroup.ps1
#>

param(
  [string]$OutFile = (Join-Path $PSScriptRoot 'report-groups.json')
)
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
    } catch { $lastErr = $_.Exception.Message }
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
# Try a query; on failure report WHY and keep going. A permission denial is a
# result, not a crash - we need to know which table blocks us.
function Try-Rows([string]$Label, [string]$Sql) {
  try {
    $rows = Invoke-Rows $Sql
    Write-Host ("  OK   {0} - {1} row(s)" -f $Label, $rows.Count) -ForegroundColor Green
    return ,$rows
  } catch {
    Write-Host ("  FAIL {0} - {1}" -f $Label, $_.Exception.Message) -ForegroundColor Red
    return $null
  }
}

Write-Host ""
Write-Host "==== 1. Can we read the Report Group tables? ====" -ForegroundColor Cyan
$groups = Try-Rows 'CVREPORTGROUP'     'SELECT KY, GROUP_NAME, DESCRIPTION, SCOPE, BUDGETEXPORT FROM CVREPORTGROUP'
$links  = Try-Rows 'CVREPORTGROUPLINK' 'SELECT LINK_KY, MST_KY, GROUP_KY FROM CVREPORTGROUPLINK'

if ($null -eq $groups -or $null -eq $links) {
  Write-Host ""
  Write-Host "Blocked. Ask Civica to GRANT SELECT ON CVREPORTGROUP, CVREPORTGROUPLINK TO PCSACCESS." -ForegroundColor Yellow
  $conn.Close(); return
}

Write-Host ""
Write-Host "==== 2. The groups Micah has defined ====" -ForegroundColor Cyan
Write-Host ("{0,-6} {1,-34} {2,-34} {3,-6} {4}" -f 'KY','GROUP_NAME','DESCRIPTION','SCOPE','BUDEXP') -ForegroundColor DarkGray
foreach ($g in $groups) {
  Write-Host ("{0,-6} {1,-34} {2,-34} {3,-6} {4}" -f `
    $g.KY, ([string]$g.GROUP_NAME).Trim(), ([string]$g.DESCRIPTION).Trim(), $g.SCOPE, $g.BUDGETEXPORT)
}

# -- 3. account -> group, via GLMST.KY ---------------------------------------
Write-Host ""
Write-Host "==== 3. Account -> group membership ====" -ForegroundColor Cyan
$members = Try-Rows 'join to GLMST' @"
SELECT g.GROUP_NAME, m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE
FROM CVREPORTGROUPLINK l
JOIN CVREPORTGROUP g ON g.KY = l.GROUP_KY
JOIN GLMST m ON m.KY = l.MST_KY
WHERE m.RECACTIVE='Y'
"@

if ($null -eq $members) {
  Write-Host "  The link joins on MST_KY -> GLMST.KY; if that failed, the key may point elsewhere." -ForegroundColor Yellow
  $conn.Close(); return
}

$byGroup = @{}
foreach ($m in $members) {
  $gn = ([string]$m.GROUP_NAME).Trim()
  if (-not $byGroup.ContainsKey($gn)) { $byGroup[$gn] = 0 }
  $byGroup[$gn]++
}
foreach ($k in ($byGroup.Keys | Sort-Object)) {
  Write-Host ("  {0,-40} {1,5} account(s)" -f $k, $byGroup[$k])
}

# -- 4. sanity check against Micah's screenshot ------------------------------
Write-Host ""
Write-Host "==== 4. Sanity check: 7015-1100-0000 (Grant - IEI Revenue) ====" -ForegroundColor Cyan
$iei = @($members | Where-Object { ([string]$_.GLACCOUNT).Trim() -like '7015-1100*' })
if ($iei.Count -eq 0) {
  Write-Host "  NOT FOUND in any group - the screenshot says it should be Social Services." -ForegroundColor Red
} else {
  foreach ($i in $iei) {
    Write-Host ("  {0} -> {1}" -f ([string]$i.GLACCOUNT).Trim(), ([string]$i.GROUP_NAME).Trim()) -ForegroundColor Green
  }
  Write-Host "  Expect Social Services. If it matches, this table IS the mapping." -ForegroundColor Green
}

# -- 5. write it out ---------------------------------------------------------
$out = @()
foreach ($m in $members) {
  $out += [ordered]@{
    account = ([string]$m.GLACCOUNT).Trim()
    name    = ([string]$m.DESCRIPT).Trim()
    kind    = $(if ([int]$m.ACCNTTYPE -eq 5) { 'revenue' } elseif ([int]$m.ACCNTTYPE -eq 6) { 'expense' } else { 'other' })
    group   = ([string]$m.GROUP_NAME).Trim()
  }
}
$out | ConvertTo-Json -Depth 4 | Set-Content -Path $OutFile -Encoding UTF8
Write-Host ""
Write-Host ("Wrote {0} ({1} rows). Send this file to Nathan." -f $OutFile, $out.Count) -ForegroundColor Cyan
$conn.Close()
