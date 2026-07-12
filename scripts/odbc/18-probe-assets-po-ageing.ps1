<#
  18-probe-assets-po-ageing.ps1  -  READ-ONLY: the three things 16 + 17 unblocked.
  ---------------------------------------------------------------------------
  16-probe-modules.ps1 found that my module guesses had been wrong in a very
  useful way:

    * AR* is the ASSET REGISTER (ARMST, 1,360 assets, 108 columns) - NOT accounts
      receivable. I had told Nathan the Asset Sustainability and Asset Consumption
      ratios needed data "the finance system does not hold". It holds it.
    * The real subledgers are DR* (2,095 debtors) and CR* (2,654 creditors), and
      both master tables already carry 30/60/90-day ageing buckets. That is
      deliverable B4, sitting there ready.
    * AP* is planning APPLICATIONS, not accounts payable.

  17-probe-fr-income.ps1 killed one hope: RPTKY 787 "(d) Capital commitments" is
  an EMPTY, ABANDONED template - every line has zero accounts linked and the text
  still refers to a refuse contract expiring 30 June 2003. So C4 cannot come from
  the FR module. It has to come from outstanding purchase orders, and WOORDERS is
  permission-LOCKED. The OP* tables are the remaining candidate.

  This probe answers exactly three questions:
    1. ASSETS  - what does ARMST hold? We need written-down value and gross
                 current replacement cost for the Asset Consumption ratio, and
                 renewal capex for Asset Sustainability.
    2. ORDERS  - do the OP* tables hold outstanding purchase orders (C4)?
    3. AGEING  - what do the DR/CR ageing buckets add up to (B4)?

  Writes assets-po-ageing.txt next to the script. SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\18-probe-assets-po-ageing.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$OutFile = Join-Path $scriptDir 'assets-po-ageing.txt'

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
# Assign before piping - Get-Rows returns ",$rows" and piping it straight into
# ForEach-Object hands the whole array over as ONE object. That bug made
# 16-probe-modules report "1 table" twice.
function Columns-Of([string]$t) {
  $rows = Get-Rows ("SELECT RDB`$FIELD_NAME AS F FROM RDB`$RELATION_FIELDS WHERE RDB`$RELATION_NAME = '$t' ORDER BY RDB`$FIELD_POSITION")
  return @($rows | ForEach-Object { ([string]$_.F).Trim() } | Where-Object { $_ })
}
function Try-Count([string]$t) {
  try { $r = Get-Rows "SELECT COUNT(*) AS N FROM $t"; return [int]$r[0].N } catch { return -1 }
}

# ============================================================================
# 1. THE ASSET REGISTER  (ratios: asset sustainability + asset consumption)
# ============================================================================
Log ""
Log "############ 1. ASSET REGISTER (ARMST) ############" 'Cyan'
$n = Try-Count 'ARMST'
Log ("ARMST rows: {0}" -f $n)
if ($n -gt 0) {
  # All 108 columns. The ratios need: gross/original cost, accumulated
  # depreciation, written-down value, and current replacement cost. Print the lot
  # and let a human match them to the ratio definitions rather than guessing.
  $cols = Columns-Of 'ARMST'
  Log ""
  Log ("ARMST columns ({0}):" -f $cols.Count)
  $line = @(); $i = 0
  foreach ($c in $cols) {
    $line += ("{0,-24}" -f $c); $i++
    if ($i % 4 -eq 0) { Log ("  " + ($line -join '')); $line = @() }
  }
  if ($line.Count) { Log ("  " + ($line -join '')) }

  # Totals over every numeric-looking column that matters for the ratios.
  # Firebird 1.5: no ABS(), so no clever filtering - just sum what we asked for.
  Log ""
  Log "ARMST totals (the ratio inputs, if these columns hold what their names say):"
  foreach ($c in @('YEAROPENVAL','YTDPURCH','YTDREVAL','YTDDEPN','YTDWO','RESIDUALVALUE','CURRENTVAL','WDV','GROSSVAL','REPLACEMENTVAL','ORIGCOST','ACCUMDEPN','COST')) {
    if ($cols -notcontains $c) { continue }
    try {
      $r = Get-Rows "SELECT SUM(CAST($c AS DOUBLE PRECISION)) AS S FROM ARMST"
      $v = $r[0].S
      Log ("  {0,-18} {1,18:N2}" -f $c, $(if ($null -eq $v) { 0 } else { [double]$v }))
    } catch {
      Log ("  {0,-18} (not numeric)" -f $c)
    }
  }

  # Three real assets, so we can see what the columns actually contain.
  Log ""
  Log "ARMST sample (3 assets, the columns most likely to be the ratio inputs):"
  $keep = @('ASSETCODE','ASSETDESC1','DEPNTYPE','DEPNRATE','RESIDUALVALUE','YEAROPENVAL','YTDPURCH','YTDREVAL','YTDDEPN','YTDWO','ASSETGLACC','ACCUMDEPGLACC','DEPEXPGLACC')
  $sel = @($keep | Where-Object { $cols -contains $_ })
  $rows = Get-Rows ("SELECT FIRST 3 " + ($sel -join ', ') + " FROM ARMST")
  foreach ($r in $rows) {
    Log "  ---"
    foreach ($c in $sel) { Log ("    {0,-16} {1}" -f $c, $r.$c) }
  }

  # Asset classes and groups give the renewal-vs-new split a chance.
  foreach ($t in @('ARASSETCLASS','ARGROUP')) {
    Log ""
    Log ("{0}:" -f $t)
    try {
      foreach ($r in (Get-Rows "SELECT * FROM $t")) {
        $vals = @()
        foreach ($p in $r.PSObject.Properties) { $vals += ("{0}={1}" -f $p.Name, $p.Value) }
        Log ("  " + ($vals -join '  '))
      }
    } catch { Log ("  unreadable: {0}" -f $_.Exception.Message) 'Yellow' }
  }
}

# ============================================================================
# 2. PURCHASE / WORKS ORDERS  (deliverable C4 - capital commitments)
# ============================================================================
Log ""
Log "############ 2. ORDERS - capital commitments (C4) ############" 'Cyan'
Log "RPTKY 787 '(d) Capital commitments' is an abandoned template (0 accounts linked,"
Log "text still refers to a contract expiring 30 June 2003). C4 must come from"
Log "OUTSTANDING ORDERS instead. WOORDERS is permission-locked; try OP* and the rest."
Log ""
$tblRows = Get-Rows @'
SELECT RDB$RELATION_NAME AS T FROM RDB$RELATIONS
WHERE (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0) AND RDB$VIEW_BLR IS NULL
ORDER BY 1
'@
$all = @($tblRows | ForEach-Object { ([string]$_.T).Trim() } | Where-Object { $_ })
Log ("(total user tables: {0})" -f $all.Count)

$orderish = @($all | Where-Object { $_ -match '^OP|ORDER|COMMIT|REQUI' })
foreach ($t in $orderish) {
  $c = Try-Count $t
  if ($c -lt 0) { Log ("  {0,-26} LOCKED" -f $t) 'Yellow'; continue }
  $cols = Columns-Of $t
  $col = if ($c -gt 0) { 'Green' } else { '' }
  Log ("  {0,-26} {1,9} rows  [{2} cols]" -f $t, $c, $cols.Count) $col
  if ($c -gt 0) { Log ("      cols: " + (($cols | Select-Object -First 30) -join ', ')) }
}

# CRTRN carries an ORDERNO. An order with no matching invoice is an outstanding
# commitment - a possible route to C4 even without the orders table itself.
Log ""
Log "CRTRN.ORDERNO - how many creditor transactions carry an order number?"
try {
  $r = Get-Rows "SELECT COUNT(*) AS N FROM CRTRN WHERE ORDERNO IS NOT NULL AND ORDERNO <> ''"
  Log ("  {0} of 205,597 CRTRN rows have an ORDERNO" -f $r[0].N)
} catch { Log ("  failed: {0}" -f $_.Exception.Message) 'Yellow' }

# ============================================================================
# 3. DEBTOR / CREDITOR AGEING  (deliverable B4)
# ============================================================================
Log ""
Log "############ 3. AR / AP AGEING (B4) ############" 'Cyan'
Log "DRMST and CRMST already carry the 30/60/90 buckets - no computation needed."
foreach ($spec in @(
  @{ t = 'DRMST'; who = 'Debtors (money owed TO the Council)';   key = 'DEBTOR';   nm = 'NAME'; act = 'RACTIVE' }
  @{ t = 'CRMST'; who = 'Creditors (money the Council OWES)';    key = 'CREDITOR'; nm = 'NAME'; act = $null }
)) {
  $t = $spec.t
  Log ""
  Log ("{0} - {1}" -f $t, $spec.who) 'Cyan'
  $cols = Columns-Of $t
  $buckets = @($cols | Where-Object { $_ -match '^BAL' })
  Log ("  balance columns: " + ($buckets -join ', '))
  foreach ($b in $buckets) {
    try {
      $r = Get-Rows "SELECT SUM(CAST($b AS DOUBLE PRECISION)) AS S FROM $t"
      $v = $(if ($null -eq $r[0].S) { 0 } else { [double]$r[0].S })
      Log ("    {0,-12} {1,16:N2}" -f $b, $v)
    } catch { Log ("    {0,-12} (unreadable)" -f $b) }
  }
  # The biggest balances, to sanity-check against the balance sheet.
  try {
    $rows = Get-Rows ("SELECT FIRST 5 " + $spec.key + ", " + $spec.nm + ", BALANCE, BALANCE30, BALANCE60, BALANCE90 FROM $t ORDER BY BALANCE DESC")
    Log "  largest balances:"
    foreach ($r in $rows) {
      Log ("    {0,-10} {1,-30} bal {2,12:N2}  30 {3,10:N2}  60 {4,10:N2}  90 {5,10:N2}" -f `
        $r.($spec.key), ([string]$r.($spec.nm)).Trim(), [double]$r.BALANCE, [double]$r.BALANCE30, [double]$r.BALANCE60, [double]$r.BALANCE90)
    }
  } catch { Log ("  sample failed: {0}" -f $_.Exception.Message) 'Yellow' }
}

$conn.Close()
[System.IO.File]::WriteAllText($OutFile, ($script:buffer -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ("Saved to: {0}" -f $OutFile) -ForegroundColor Green
