<#
  13-probe-fr-tables.ps1  -  READ-ONLY: are the three FR tables now readable,
                             and what shape are they?
  ---------------------------------------------------------------------------
  The Cash Flow Statement isn't a stored number - it's the definition of which
  accounts roll into which report line, and that definition lives in:

      FRSECTION     report sections (headings)
      FRLINE        the lines within each section
      FRACCNTLINK   which GL accounts feed each line

  If Civica has granted SELECT, this confirms it AND dumps enough of the schema
  to build the Cash Flow against - column names, row counts, a few sample rows,
  and how a line links back to its accounts. If they're still locked, it says so
  cleanly, per table.

  SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\13-probe-fr-tables.ps1
#>

$ErrorActionPreference = 'Stop'

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;')
$conn.Open()
Write-Host ("CONNECTED - {0}" -f $conn.ServerVersion) -ForegroundColor Green

function Get-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null
      try { $v = $r.GetValue($i) } catch { try { $v = $r.GetString($i) } catch { $v = $null } }
      $o[$r.GetName($i)] = $(if ($v -is [DBNull]) { $null } else { $v })
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}

function Probe-Table([string]$name) {
  Write-Host ""
  Write-Host ("=== {0} ===" -f $name) -ForegroundColor Cyan

  # 1. readable at all?
  $count = $null
  try {
    $count = [int](Get-Rows "SELECT COUNT(*) AS N FROM $name")[0].N
  } catch {
    Write-Host ("  LOCKED - {0}" -f $_.Exception.Message) -ForegroundColor Red
    return $false
  }
  Write-Host ("  READABLE - {0} rows." -f $count) -ForegroundColor Green

  # 2. columns
  $cols = Get-Rows ("SELECT RDB`$FIELD_NAME AS FLD FROM RDB`$RELATION_FIELDS WHERE RDB`$RELATION_NAME = '$name' ORDER BY RDB`$FIELD_POSITION")
  $names = @($cols | ForEach-Object { ([string]$_.FLD).Trim() })
  Write-Host ("  columns: " + ($names -join ', '))

  # 3. a few sample rows (FIRST 5), so we can see the actual data shape
  if ($count -gt 0) {
    Write-Host "  sample:" -ForegroundColor DarkGray
    $sample = Get-Rows "SELECT FIRST 5 * FROM $name"
    $i = 0
    foreach ($row in $sample) {
      $i++
      $pairs = @()
      foreach ($p in $row.PSObject.Properties) {
        $val = [string]$p.Value
        if ($val.Length -gt 22) { $val = $val.Substring(0, 22) + '...' }
        $pairs += ("{0}={1}" -f $p.Name.Trim(), $val)
      }
      Write-Host ("    [{0}] {1}" -f $i, ($pairs -join '  '))
    }
  }
  return $true
}

$okSection = Probe-Table 'FRSECTION'
$okLine    = Probe-Table 'FRLINE'
$okLink    = Probe-Table 'FRACCNTLINK'

# -- if all three are open, show how they join --------------------------------
if ($okSection -and $okLine -and $okLink) {
  Write-Host ""
  Write-Host "All three readable. Checking how they join..." -ForegroundColor Cyan
  # We don't know the exact key names yet - the sample rows above reveal them.
  # This just confirms FRACCNTLINK references real GL accounts.
  try {
    $link = Get-Rows 'SELECT FIRST 8 * FROM FRACCNTLINK'
    Write-Host "  FRACCNTLINK first rows shown above - match the *ACCNT* / GLACCOUNT column"
    Write-Host "  against GLMST.GLACCOUNT, and the *LINE* / *SECTION* column against FRLINE."
  } catch {}
  Write-Host ""
  Write-Host "NEXT: paste this whole output back. With the column names I can build the" -ForegroundColor Green
  Write-Host "live Cash Flow Statement against these tables." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "Not all three are readable yet." -ForegroundColor Yellow
  Write-Host "Cash Flow stays blocked until Civica grants SELECT on the locked one(s) above." -ForegroundColor Yellow
}

$conn.Close()
Write-Host ""
Write-Host "Done. Nothing was written." -ForegroundColor Green
