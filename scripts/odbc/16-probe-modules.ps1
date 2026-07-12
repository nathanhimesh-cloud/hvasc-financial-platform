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
$tables = @(Get-Rows @'
SELECT RDB$RELATION_NAME AS T FROM RDB$RELATIONS
WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL ORDER BY 1
'@ | ForEach-Object { ([string]$_.T).Trim() })
Log ("Total user tables: {0}" -f $tables.Count) 'Cyan'

# Property/Water and Accounts (AR/AP) tend to use these prefixes in Practical.
$groups = [ordered]@{
  'Property / Rates / Water' = 'PR|PROP|RATE|WATER|WTR|ASSESS|PARCEL|VALU|METER|CONSUMP'
  'Accounts Receivable'      = 'AR|DEBTOR|DBT|INVOICE|INV|RECEIV|SUNDRY'
  'Accounts Payable'         = 'AP|CRED|CREDITOR|PAYAB|PAYMENT|SUPPLIER|PURCH|PO'
}

foreach ($g in $groups.Keys) {
  Log ""
  Log ("=== {0} ===" -f $g) 'Cyan'
  $pat = $groups[$g]
  $hits = @($tables | Where-Object { $_ -match "^($pat)" })
  if (-not $hits.Count) { Log "  (no tables match this pattern)"; continue }

  foreach ($t in $hits) {
    # Readable? and roughly how big?
    $count = $null
    try { $count = [int](Get-Rows "SELECT COUNT(*) AS N FROM $t")[0].N }
    catch { Log ("  {0,-24} LOCKED ({1})" -f $t, ($_.Exception.Message -replace '\s+',' ' | ForEach-Object { $_.Substring(0, [Math]::Min(40, $_.Length)) })) 'Yellow'; continue }

    $cols = @(Get-Rows ("SELECT RDB`$FIELD_NAME AS F FROM RDB`$RELATION_FIELDS WHERE RDB`$RELATION_NAME = '$t' ORDER BY RDB`$FIELD_POSITION") | ForEach-Object { ([string]$_.F).Trim() })
    Log ("  {0,-24} {1,8} rows  [{2} cols]" -f $t, $count, $cols.Count) 'Green'
    # Show columns only for the tables that clearly hold data (keeps it readable).
    if ($count -gt 0) { Log ("      cols: " + (($cols | Select-Object -First 24) -join ', ')) }
  }
}

$conn.Close()
[System.IO.File]::WriteAllText($OutFile, ($script:buffer -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ("Saved to: {0}" -f $OutFile) -ForegroundColor Green
Write-Host "Copy it into the repo data folder and tell me - I'll scope Property/Water + Accounts from it." -ForegroundColor Green
