<#
  16-probe-modules.ps1  -  READ-ONLY: what's in the Property/Water and Accounts
                           modules?
  ---------------------------------------------------------------------------
  Schedule 1 of the engagement letter names four modules: Finance/GL, Job
  Costing, Property/Water, and Accounts. GL and Job Costing are built. This
  discovers the other two so they can be scoped: which tables exist, are they
  readable (some FR/reporting tables were permission-blocked), what columns and
  roughly how much data.

  Practical's module tables aren't standardised across sites, so this casts a
  wide net by name pattern and reports what's actually there.

  Writes module-probe.txt next to the script. SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\16-probe-modules.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$OutFile = Join-Path $scriptDir 'module-probe.txt'

$script:buffer = New-Object System.Collections.Generic.List[string]
function Log([string]$m = "", [string]$c = "") { if ($c) { Write-Host $m -ForegroundColor $c } else { Write-Host $m }; $script:buffer.Add($m) }

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;')
$conn.Open()
Log ("CONNECTED - {0}" -f $conn.ServerVersion) 'Green'

function Get-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader(); $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null; try { $v = $r.GetValue($i) } catch { try { $v = $r.GetString($i) } catch { $v = $null } }
      $o[$r.GetName($i)] = $(if ($v -is [DBNull]) { $null } else { $v })
    }
    $rows += [pscustomobject]$o
  }
  $r.Close(); return ,$rows
}

# All user tables, so we can pattern-match module tables.
#
# NOTE the NULL test. In Firebird a USER table has RDB$SYSTEM_FLAG = NULL, not 0 -
# only a handful of tables ever carry an explicit 0. The first version of this
# probe filtered on "= 0", which is never true for NULL, so it found exactly ONE
# table and reported "no tables match" for every module. The database was fine;
# the question was wrong.
# NOTE the assignment on its own line. Get-Rows ends with "return ,$rows" - the
# comma stops PowerShell unrolling a single-row result into a bare object. Pipe
# that return value STRAIGHT into ForEach-Object and PowerShell unrolls the outer
# wrapper only, handing the whole inner array over as ONE item: [string]$_.T then
# string-joins all 914 table names into a single 29 KB blob and the count reads 1.
# Assigning to a variable first unrolls it properly. (This is what actually broke
# the first two runs - the SQL was only half the problem.)
$tableRows = Get-Rows @'
SELECT RDB$RELATION_NAME AS T FROM RDB$RELATIONS
WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
  AND RDB$VIEW_BLR IS NULL
ORDER BY 1
'@
$tables = @($tableRows | ForEach-Object { ([string]$_.T).Trim() } | Where-Object { $_ })
Log ("Total user tables: {0}" -f $tables.Count) 'Cyan'
if ($tables.Count -lt 100) {
  Log "  WARNING: Practical has ~914 tables. This is wrong - do not trust what follows." 'Red'
}

# The REAL module prefixes, read off the full table list from the first good run.
# My original guesses were wrong in a way worth recording:
#   AR* is the ASSET REGISTER (ARMST, ARDEPN, ARASSETCLASS, ARREVAL) - NOT
#       accounts receivable. This is what the Asset Sustainability and Asset
#       Consumption ratios need, and I had written them off as unobtainable.
#   AP* is planning APPLICATIONS (development approvals) - NOT accounts payable.
#   The real subledgers are DR* (debtors) and CR* (creditors).
$groups = [ordered]@{
  'Asset register (AR)  - asset ratios B8'     = '^AR(MST|DEPN|ASSETCLASS|REVAL|LOCATION|GROUP|SALES|WRITEOFF|VALNUNITS|CON|MAPTOGL|GLACCNTTYPE)'
  'Rates / property (RM, RC)'                  = '^RM(RATE|PROP|METER|QLDVAL|BALANCE)|^RCRATES|^RCDEBTOR'
  'Water (WA)'                                 = '^WA'
  'Debtors / receivable (DR)'                  = '^DR'
  'Creditors / payable (CR)'                   = '^CR'
  'Works & purchase orders (WO) - C4'          = '^WO(ORDERS|ORDERTYPES|ORDER_ACTIVITIES|ASSET_ORDER)|^RPWORKSORDER'
}

foreach ($g in $groups.Keys) {
  Log ""
  Log ("=== {0} ===" -f $g) 'Cyan'
  $pat = $groups[$g]
  $hits = @($tables | Where-Object { $_ -match $pat })
  if (-not $hits.Count) { Log "  (no tables match this pattern)"; continue }

  foreach ($t in $hits) {
    # Readable? and roughly how big? A LOCKED table is the answer to a different
    # question (ask Civica for SELECT) and must not look like an empty one.
    $count = $null
    try {
      $cRows = Get-Rows "SELECT COUNT(*) AS N FROM $t"
      $count = [int]$cRows[0].N
    } catch {
      $msg = ($_.Exception.Message -replace '\s+', ' ')
      if ($msg.Length -gt 60) { $msg = $msg.Substring(0, 60) }
      Log ("  {0,-26} LOCKED - {1}" -f $t, $msg) 'Yellow'
      continue
    }

    # Same unrolling trap as the table list: assign, then pipe.
    $colRows = Get-Rows ("SELECT RDB`$FIELD_NAME AS F FROM RDB`$RELATION_FIELDS WHERE RDB`$RELATION_NAME = '$t' ORDER BY RDB`$FIELD_POSITION")
    $cols = @($colRows | ForEach-Object { ([string]$_.F).Trim() } | Where-Object { $_ })
    Log ("  {0,-26} {1,9} rows  [{2} cols]" -f $t, $count, $cols.Count) 'Green'
    if ($count -gt 0) { Log ("      cols: " + (($cols | Select-Object -First 30) -join ', ')) }
  }
}

$conn.Close()
[System.IO.File]::WriteAllText($OutFile, ($script:buffer -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ("Saved to: {0}" -f $OutFile) -ForegroundColor Green
Write-Host "Copy it into the repo data folder and tell me - I'll scope Property/Water + Accounts from it." -ForegroundColor Green
