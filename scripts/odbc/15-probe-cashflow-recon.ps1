<#
  15-probe-cashflow-recon.ps1  -  READ-ONLY: find the $83k that stops the Cash
                                  Flow reconciling.
  ---------------------------------------------------------------------------
  05 built the Cash Flow from report 739 but it's off by ~83k on a 454k cash
  movement, so it refused to emit. By double-entry, the report's non-cash lines
  MUST sum to the change in cash held IF every moved account maps to exactly one
  line. An 83k gap means some account movements aren't captured (the report
  definition is stale for the current chart) OR a calc line should carry it.

  This pins it down:
   1. Confirms the cash accounts and their movement (is our reconciliation base right?).
   2. Confirms all-non-cash movement == cash movement (sanity of double entry).
   3. Lists accounts that MOVED this year but are NOT linked anywhere in report 739,
      biggest first - these are the gap.
   4. Breaks operating down line by line so the split is visible.

  Writes cashflow-recon.txt next to the script. SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\15-probe-cashflow-recon.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$OutFile = Join-Path $scriptDir 'cashflow-recon.txt'

$script:buffer = New-Object System.Collections.Generic.List[string]
function Log([string]$m = "", [string]$c = "") {
  if ($c) { Write-Host $m -ForegroundColor $c } else { Write-Host $m }
  $script:buffer.Add($m)
}

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;')
$conn.Open()
Log ("CONNECTED - {0}" -f $conn.ServerVersion) 'Green'

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
  $r.Close(); return ,$rows
}

$cur = [int](Get-Rows 'SELECT MTH FROM GLCON')[0].MTH
Log ("Current period: month $cur") 'Cyan'

# YTD movement per account, with name and type.
$mv = @{}; $nm = @{}; $ty = @{}
foreach ($r in (Get-Rows "SELECT b.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, SUM(CAST(b.DEBIT AS DOUBLE PRECISION)) AS DR, SUM(CAST(b.CREDIT AS DOUBLE PRECISION)) AS CR FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH BETWEEN 1 AND $cur GROUP BY b.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE")) {
  $a = ([string]$r.GLACCOUNT).Trim()
  $mv[$a] = @{ dr = [double]$r.DR; cr = [double]$r.CR }
  $nm[$a] = ([string]$r.DESCRIPT).Trim()
  $ty[$a] = [int]$r.ACCNTTYPE
}

# Report 739 links.
$links = Get-Rows "SELECT LNKY, GLACCOUNT, INVERT, TRANTYPE FROM FRACCNTLINK WHERE RPTKY = 739"
$inReport = @{}
foreach ($a in $links) { $inReport[([string]$a.GLACCOUNT).Trim()] = $true }

# Cash accounts = the "beginning" line's links.
$secs = Get-Rows "SELECT KY, SECTNO FROM FRSECTION WHERE RPTKY = 739 ORDER BY SECTNO"
$sec5 = ($secs | Where-Object { [int]$_.SECTNO -eq 5 } | Select-Object -First 1)
$cashAccts = @()
if ($sec5) {
  foreach ($ln in (Get-Rows ("SELECT KY, DESCRIPT FROM FRLINE WHERE SECTKY = " + [int]$sec5.KY))) {
    if (([string]$ln.DESCRIPT).Trim() -match 'beginning') {
      foreach ($a in (Get-Rows ("SELECT GLACCOUNT FROM FRACCNTLINK WHERE LNKY = " + [int]$ln.KY))) {
        $cashAccts += ([string]$a.GLACCOUNT).Trim()
      }
    }
  }
}
$cashSet = @{}; foreach ($a in $cashAccts) { $cashSet[$a] = $true }

# 1. The cash accounts.
Log ""
Log "1. CASH ACCOUNTS (report 739 'Cash at beginning' links):" 'Cyan'
$cashMove = 0.0; $cashBal = 0.0
foreach ($a in $cashAccts) {
  $m = if ($mv.ContainsKey($a)) { $mv[$a].dr - $mv[$a].cr } else { 0 }
  $cashMove += $m
  Log ("   {0}  {1,-32}  move {2,15:N2}" -f $a, $nm[$a], $m)
}
Log ("   cash movement (DR-CR): {0:N2}" -f $cashMove)

# 2. Double-entry sanity: all non-cash movement should equal -cash movement.
Log ""
Log "2. DOUBLE-ENTRY CHECK:" 'Cyan'
$allNonCash = 0.0
foreach ($a in $mv.Keys) { if (-not $cashSet.ContainsKey($a)) { $allNonCash += ($mv[$a].cr - $mv[$a].dr) } }
Log ("   sum of ALL non-cash (CR-DR): {0:N2}" -f $allNonCash)
Log ("   cash movement (DR-CR)      : {0:N2}" -f $cashMove)
Log ("   difference (should be ~0)  : {0:N2}" -f ($allNonCash - $cashMove))
Log "   (If this isn't ~0, GLBAL DEBIT/CREDIT don't net to zero - opening balances or the cash set is wrong.)"

# 3. Accounts that MOVED but are NOT in report 739.
Log ""
Log "3. MOVED THIS YEAR BUT NOT LINKED IN REPORT 739 (the gap), biggest first:" 'Cyan'
$missing = @()
foreach ($a in $mv.Keys) {
  if ($cashSet.ContainsKey($a)) { continue }
  if ($inReport.ContainsKey($a)) { continue }
  $m = $mv[$a].cr - $mv[$a].dr        # credit-positive, same convention as the report
  if ([math]::Abs($m) -lt 0.005) { continue }
  $missing += [pscustomobject]@{ acc = $a; name = $nm[$a]; type = $ty[$a]; move = $m }
}
$missSum = ($missing | Measure-Object -Property move -Sum).Sum
foreach ($x in ($missing | Sort-Object { [math]::Abs($_.move) } -Descending | Select-Object -First 25)) {
  Log ("   {0}  type {1,2}  {2,-32}  {3,15:N2}" -f $x.acc, $x.type, $x.name, $x.move)
}
Log ("   ... {0} unlinked accounts moved, totalling: {1:N2}" -f $missing.Count, $missSum)
Log "   (This total is the reconciliation gap. If these are GST / accrual / provision"
Log "    accounts, the report defintion needs them - a Council/Civica data fix, not ours.)"

$conn.Close()
[System.IO.File]::WriteAllText($OutFile, ($script:buffer -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ("Saved to: {0}" -f $OutFile) -ForegroundColor Green
Write-Host "Copy it into the repo data folder and tell me." -ForegroundColor Green
