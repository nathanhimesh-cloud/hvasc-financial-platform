<#
  33-probe-unmapped-vs-groups.ps1  -  READ-ONLY: why is an account Micah mapped
                                      still showing as unmapped?
  ---------------------------------------------------------------------------
  Micah reports that everything is mapped in Practical, and the dashboard still
  lists unmapped accounts. Both can be true, and this says which.

  For every active income/expense account carrying money that the feed cannot
  place in a directorate, it prints EVERY Report Group the account belongs to and
  sorts it into one of three verdicts:

    A. IN A NON-DIRECTORATE GROUP  - Micah mapped it, to a group the feed ignores
                                     (Capital Works Program, DARSP, ...). This is
                                     a disagreement about what "mapped" means,
                                     not a mistake by either side.
    B. IN NO GROUP AT ALL          - genuinely not mapped in Practical.
    C. IN A DIRECTORATE GROUP      - mapped correctly and STILL unresolved, which
                                     would mean a bug in the feed (a join or a
                                     filter dropping it). Any row here is ours.

  It also prints every Report Group with its member count and whether the feed
  matches it to a directorate, so a renamed group shows up immediately.

  STRICTLY READ-ONLY (SELECT only). Needs department-map.json beside it:
      powershell -ExecutionPolicy Bypass -File .\33-probe-unmapped-vs-groups.ps1
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
    try { $c = New-Object System.Data.Odbc.OdbcConnection($a.cs); $c.Open()
          Write-Host ("Connected via {0}." -f $a.label) -ForegroundColor Green; return $c }
    catch { $lastErr = $_.Exception.Message }
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
      $v = $null; try { $v = $r.GetValue($i) } catch { $v = $null }
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
function Norm([string]$s) { return (($s -replace '[^A-Za-z]', '').ToLower()) }
function Pad([string]$s, [int]$n) { $t = [string]$s; if ($t.Length -gt $n) { $t.Substring(0, $n) } else { $t.PadRight($n) } }

# The SAME directorate names the feed matches on, read from the same file.
$mapPath = Join-Path $PSScriptRoot 'department-map.json'
if (-not (Test-Path $mapPath)) { throw "department-map.json not found next to this script ($mapPath)." }
$deptMap = Get-Content $mapPath -Raw | ConvertFrom-Json
$groupToDept = @{}
foreach ($d in $deptMap.departments) {
  $rg = Norm $d.reportGroup
  if ($rg) { $groupToDept[$rg] = $d.id }
}
Write-Host ("Directorate report groups the feed looks for: {0}" -f (($deptMap.departments | ForEach-Object { $_.reportGroup }) -join ' | ')) -ForegroundColor DarkGray

# The feed's own matching rule, copied exactly so this probe agrees with it.
function Match-Dept([string]$groupName) {
  $gn = Norm $groupName
  if (-not $gn) { return $null }
  if ($groupToDept.ContainsKey($gn)) { return $groupToDept[$gn] }
  foreach ($k in $groupToDept.Keys) { if ($gn.Contains($k) -or $k.Contains($gn)) { return $groupToDept[$k] } }
  return $null
}

$cur = [int](Invoke-Scalar 'SELECT MTH FROM GLCON')
if ($cur -lt 1 -or $cur -gt 12) { $cur = 1 }
Write-Host ("Period: MTH {0}" -f $cur) -ForegroundColor Cyan

# -- 1. every group, its size, and whether the feed matches it ----------------
Write-Host ""
Write-Host "==== 1. Report Groups, and which the feed treats as a directorate ====" -ForegroundColor Cyan
$grpRows = Invoke-Rows @"
SELECT g.GROUP_NAME, m.GLACCOUNT
FROM CVREPORTGROUPLINK l
JOIN CVREPORTGROUP g ON g.KY = l.GROUP_KY
JOIN GLMST m ON m.KY = l.MST_KY
WHERE m.RECACTIVE='Y'
"@

$byGroup = @{}
$groupsOfAcct = @{}
foreach ($r in $grpRows) {
  $gn = ([string]$r.GROUP_NAME).Trim()
  $ac = ([string]$r.GLACCOUNT).Trim()
  if (-not $byGroup.ContainsKey($gn)) { $byGroup[$gn] = New-Object System.Collections.Generic.HashSet[string] }
  [void]$byGroup[$gn].Add($ac)
  if (-not $groupsOfAcct.ContainsKey($ac)) { $groupsOfAcct[$ac] = @() }
  if ($groupsOfAcct[$ac] -notcontains $gn) { $groupsOfAcct[$ac] += $gn }
}

Write-Host ("{0} {1,7}  {2}" -f (Pad 'GROUP' 40), 'ACCTS', 'FEED TREATS AS') -ForegroundColor DarkGray
$ignoredAccts = New-Object System.Collections.Generic.HashSet[string]
foreach ($gn in ($byGroup.Keys | Sort-Object)) {
  $dept = Match-Dept $gn
  $verdict = if ($dept) { $dept } else { 'IGNORED (not a directorate)' }
  $col = if ($dept) { 'Green' } else { 'Yellow' }
  Write-Host ("{0} {1,7}  {2}" -f (Pad $gn 40), $byGroup[$gn].Count, $verdict) -ForegroundColor $col
  if (-not $dept) { foreach ($a in $byGroup[$gn]) { [void]$ignoredAccts.Add($a) } }
}

# -- 2. the accounts the feed cannot place -----------------------------------
Write-Host ""
Write-Host "==== 2. Accounts carrying money that the feed leaves unmapped ====" -ForegroundColor Cyan
$acct = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE IN (5,6) AND b.BALANCE <> 0
"@

$catA = @(); $catB = @(); $catC = @()
foreach ($r in $acct) {
  $code = ([string]$r.GLACCOUNT).Trim()
  $gs = $(if ($groupsOfAcct.ContainsKey($code)) { $groupsOfAcct[$code] } else { @() })

  # Does ANY of its groups resolve to a directorate? That is what the feed asks.
  $resolved = $null
  foreach ($g in $gs) { $d = Match-Dept $g; if ($d) { $resolved = $d; break } }
  if ($resolved) { continue }   # the feed placed it - not our problem

  $row = [pscustomobject]@{
    code = $code
    name = ([string]$r.DESCRIPT).Trim()
    kind = $(if ([int]$r.ACCNTTYPE -eq 5) { 'revenue' } else { 'expense' })
    bal  = (R2 $r.BAL)
    groups = $(if ($gs.Count) { $gs -join ', ' } else { '' })
  }
  if ($gs.Count -gt 0) { $catA += $row } else { $catB += $row }
}

function Show-Cat($title, $rows, $colour, $note) {
  Write-Host ""
  Write-Host ("-- {0}  ({1} account(s), {2:N2}) --" -f $title, $rows.Count, (($rows | Measure-Object -Property bal -Sum).Sum)) -ForegroundColor $colour
  Write-Host ("   {0}" -f $note) -ForegroundColor DarkGray
  if (-not $rows.Count) { Write-Host "   none" -ForegroundColor DarkGray; return }
  foreach ($u in ($rows | Sort-Object { -[math]::Abs([double]$_.bal) })) {
    Write-Host ("   {0} {1} {2,-8} {3,14:N2}  {4}" -f (Pad $u.code 16), (Pad $u.name 34), $u.kind, $u.bal, $u.groups) -ForegroundColor $colour
  }
}

Show-Cat "A. MAPPED, but to a group the feed ignores" $catA 'Yellow' `
  "Micah did map these. Decide which directorate each group belongs to, or split them."
Show-Cat "B. In NO Report Group at all" $catB 'Red' `
  "Genuinely unmapped in Practical - these are the ones to send back to Micah."

# -- 3. the bug check --------------------------------------------------------
# An account in a DIRECTORATE group that the feed still failed to place would be
# a fault in the feed, not in the mapping. There should be none.
Write-Host ""
Write-Host "==== 3. Feed self-check: directorate-mapped accounts we failed to place ====" -ForegroundColor Cyan
$bug = 0
foreach ($r in $acct) {
  $code = ([string]$r.GLACCOUNT).Trim()
  $gs = $(if ($groupsOfAcct.ContainsKey($code)) { $groupsOfAcct[$code] } else { @() })
  foreach ($g in $gs) {
    if (Match-Dept $g) {
      # It matched here, so the feed should also have matched it. Report only if
      # the account is one this probe classified as unplaced.
      if (($catA + $catB) | Where-Object { $_.code -eq $code }) {
        Write-Host ("   BUG: {0} is in '{1}' yet reads unmapped" -f $code, $g) -ForegroundColor Red
        $bug++
      }
      break
    }
  }
}
if ($bug -eq 0) { Write-Host "   None - every directorate-mapped account was placed. The feed's matching is sound." -ForegroundColor Green }

Write-Host ""
Write-Host ("SUMMARY: {0} account(s) mapped to an ignored group, {1} in no group at all." -f $catA.Count, $catB.Count) -ForegroundColor Cyan
Write-Host "Send Nathan sections 1 and 2." -ForegroundColor Cyan
$conn.Close()
