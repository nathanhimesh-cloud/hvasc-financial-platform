<#
  17-probe-fr-income.ps1  -  READ-ONLY: find the FR report that ACTUALLY carries
                             the operating/capital split, and prove it.
  ---------------------------------------------------------------------------
  WHY THIS EXISTS.

  The statutory sustainability ratios need operating revenue and expenses split
  from capital. I took that from FR reports 743/744 because their section titles
  read "Operating income:" / "Capital income:". The figures came out wrong:

      FY2025-26 per report 743/744 :  operating revenue   9,997,222
                                      capital revenue             0.00
      the same year straight from GL:  total income       29,443,422

  So 743 classifies barely a third of the Council's income and claims capital
  income is exactly zero - impossible for a council that received disaster
  recovery capital grants. It produced an operating surplus ratio of -30.25%
  against an audited FY2025 figure of +23.20%.

  743/744 are the BY-FUNCTION note (the segment analysis), not the income
  statement, and - like report 739 - their account links are stale.

  RPTKY 804 looks like the real Statement of Comprehensive Income:
        1.1.1 Recurrent revenue      <- operating revenue
        1.1.2 Capital revenue
        2.1   Recurrent expenses     <- operating expenses
        2.2   Capital expenses

  THE POINT OF THIS SCRIPT is not to assume that. It is to RECONCILE each
  candidate report against the general ledger and print how much of the Council's
  income and expenditure each one actually accounts for. A report that leaves
  $19M unclassified must not feed a statutory ratio, and we should be able to see
  that at a glance rather than discover it from an absurd percentage.

  It also dumps RPTKY 787 section "(d) Capital commitments" - the C4 deliverable
  I had written off as unobtainable.

  Writes fr-income-probe.txt next to the script. SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\17-probe-fr-income.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$OutFile = Join-Path $scriptDir 'fr-income-probe.txt'

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
function D([object]$x) { if ($null -eq $x -or $x -is [DBNull]) { return 0.0 } return [double]$x }

# -- the ledger, for both years ------------------------------------------------
$cur = [int](Get-Rows 'SELECT MTH FROM GLCON')[0].MTH
$yr  = [int](Get-Rows 'SELECT YR FROM GLCON')[0].YR
$pyLabel = "FY$($yr-2)-" + (($yr-1).ToString().Substring(2))
Log ("Period: month {0} of FY{1}.  Prior full year = {2}" -f $cur, $yr, $pyLabel) 'Cyan'

# Per-account: this year's YTD balance, last year's full-year close, and its type.
$balNow = @{}; $balLy = @{}; $accType = @{}; $accName = @{}
foreach ($r in (Get-Rows "SELECT b.GLACCOUNT, m.DESCRIPT, m.ACCNTTYPE, m.ISCONTROL, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL, CAST(b.LASTYEAR AS DOUBLE PRECISION) AS LY FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH = $cur AND m.RECACTIVE='Y'")) {
  $a = ([string]$r.GLACCOUNT).Trim()
  $balNow[$a] = D $r.BAL
  $accType[$a] = [int]$r.ACCNTTYPE
  $accName[$a] = ([string]$r.DESCRIPT).Trim()
}
# LASTYEAR must be read at period 12 - that is last year's CLOSE, not its month-1.
foreach ($r in (Get-Rows "SELECT b.GLACCOUNT, CAST(b.LASTYEAR AS DOUBLE PRECISION) AS LY FROM GLBAL b WHERE b.MTH = 12")) {
  $balLy[([string]$r.GLACCOUNT).Trim()] = D $r.LY
}

# The totals every candidate report must be measured against.
$glIncomeLy = 0.0; $glExpenseLy = 0.0
foreach ($a in $accType.Keys) {
  if (-not $balLy.ContainsKey($a)) { continue }
  if ($accType[$a] -eq 5) { $glIncomeLy  += $balLy[$a] }
  if ($accType[$a] -eq 6) { $glExpenseLy += $balLy[$a] }   # INCLUDING depreciation
}
Log ""
Log ("GL ground truth for {0} (what any report must add up to):" -f $pyLabel) 'Cyan'
Log ("  Total income   (ACCNTTYPE 5)          : {0,16:N2}" -f $glIncomeLy)
Log ("  Total expenses (ACCNTTYPE 6, incl dep): {0,16:N2}" -f $glExpenseLy)

# -- report structure ----------------------------------------------------------
function Report-Sections([int]$rptky) {
  return (Get-Rows "SELECT KY, SECTNO, TITLE FROM FRSECTION WHERE RPTKY = $rptky ORDER BY SECTNO")
}

# Every account linked under a section, with its INVERT flag.
function Section-Accounts([int]$sectKy) {
  $out = @()
  $lines = Get-Rows "SELECT KY, DESCRIPT FROM FRLINE WHERE SECTKY = $sectKy ORDER BY LINENO"
  foreach ($ln in $lines) {
    $links = Get-Rows ("SELECT GLACCOUNT, INVERT FROM FRACCNTLINK WHERE LNKY = " + [int]$ln.KY)
    foreach ($a in $links) {
      $out += [pscustomobject]@{
        acc    = ([string]$a.GLACCOUNT).Trim()
        invert = (([string]$a.INVERT).Trim().ToUpper() -eq 'Y')
        line   = ([string]$ln.DESCRIPT).Trim()
      }
    }
  }
  return ,$out
}

function Section-Total($accts, $balMap) {
  $t = 0.0
  foreach ($x in $accts) {
    if (-not $balMap.ContainsKey($x.acc)) { continue }
    $v = $balMap[$x.acc]
    if ($x.invert) { $v = -$v }
    $t += $v
  }
  return $t
}

# -- reconcile each candidate --------------------------------------------------
# For each report: what does it classify, and how much of the ledger does it MISS?
$candidates = @(804, 743, 744, 745)
foreach ($rpt in $candidates) {
  Log ""
  Log ("================ RPTKY $rpt ================") 'Cyan'
  $secs = Report-Sections $rpt
  if (-not $secs.Count) { Log "  report not found / no sections readable" 'Yellow'; continue }

  $seenIncome = @{}; $seenExpense = @{}
  foreach ($s in $secs) {
    $title = ([string]$s.TITLE).Trim()
    if (-not $title) { $title = '(untitled)' }
    $accts = Section-Accounts ([int]$s.KY)
    $tNow = Section-Total $accts $balNow
    $tLy  = Section-Total $accts $balLy
    Log ("  [{0}] {1}" -f $s.SECTNO, $title)
    Log ("        accounts linked: {0,4}   YTD: {1,15:N2}   {2}: {3,15:N2}" -f $accts.Count, $tNow, $pyLabel, $tLy)
    foreach ($x in $accts) {
      if ($accType.ContainsKey($x.acc)) {
        if ($accType[$x.acc] -eq 5) { $seenIncome[$x.acc]  = $true }
        if ($accType[$x.acc] -eq 6) { $seenExpense[$x.acc] = $true }
      }
    }
  }

  # THE TEST. How much of the ledger does this report leave on the floor?
  $missInc = 0.0; $missIncN = 0; $missExp = 0.0; $missExpN = 0
  $worst = @()
  foreach ($a in $accType.Keys) {
    if (-not $balLy.ContainsKey($a)) { continue }
    $v = $balLy[$a]
    if ([math]::Abs($v) -lt 0.005) { continue }
    if ($accType[$a] -eq 5 -and -not $seenIncome.ContainsKey($a))  { $missInc += $v; $missIncN++; $worst += [pscustomobject]@{ acc=$a; name=$accName[$a]; v=$v; k='income'  } }
    if ($accType[$a] -eq 6 -and -not $seenExpense.ContainsKey($a)) { $missExp += $v; $missExpN++; $worst += [pscustomobject]@{ acc=$a; name=$accName[$a]; v=$v; k='expense' } }
  }
  $covInc = if ($glIncomeLy  -ne 0) { 100 * (1 - $missInc / $glIncomeLy) }  else { 0 }
  $covExp = if ($glExpenseLy -ne 0) { 100 * (1 - $missExp / $glExpenseLy) } else { 0 }

  Log ""
  Log ("  RECONCILIATION to the GL for {0}:" -f $pyLabel)
  $ci = if ([math]::Abs($covInc) -ge 99) { 'Green' } else { 'Red' }
  $ce = if ([math]::Abs($covExp) -ge 99) { 'Green' } else { 'Red' }
  Log ("    income  accounted for: {0,7:N1}%   unclassified {1,15:N2} across {2} account(s)" -f $covInc, $missInc, $missIncN) $ci
  Log ("    expense accounted for: {0,7:N1}%   unclassified {1,15:N2} across {2} account(s)" -f $covExp, $missExp, $missExpN) $ce
  if ($missIncN + $missExpN -gt 0) {
    Log "    biggest unclassified accounts:"
    foreach ($w in (@($worst | Sort-Object { -[math]::Abs($_.v) } | Select-Object -First 8))) {
      Log ("      {0,-16} {1,-34} {2,14:N2}  ({3})" -f $w.acc, $w.name, $w.v, $w.k)
    }
  }
}

# -- RPTKY 787 : capital commitments (deliverable C4) --------------------------
Log ""
Log "================ RPTKY 787 - commitments (C4) ================" 'Cyan'
try {
  foreach ($s in (Report-Sections 787)) {
    $title = ([string]$s.TITLE).Trim(); if (-not $title) { $title = '(untitled)' }
    Log ("  [{0}] {1}" -f $s.SECTNO, $title)
    foreach ($ln in (Get-Rows ("SELECT KY, DESCRIPT FROM FRLINE WHERE SECTKY = " + [int]$s.KY + " ORDER BY LINENO"))) {
      $ldesc = ([string]$ln.DESCRIPT).Trim()
      $links = Get-Rows ("SELECT GLACCOUNT, INVERT FROM FRACCNTLINK WHERE LNKY = " + [int]$ln.KY)
      $t = 0.0
      foreach ($a in $links) {
        $acc = ([string]$a.GLACCOUNT).Trim()
        if (-not $balNow.ContainsKey($acc)) { continue }
        $v = $balNow[$acc]
        if (([string]$a.INVERT).Trim().ToUpper() -eq 'Y') { $v = -$v }
        $t += $v
      }
      if ($ldesc -or $links.Count) {
        Log ("        {0,-52} {1,14:N2}   [{2} acct]" -f $ldesc, $t, $links.Count)
      }
    }
  }
} catch {
  Log ("  787 unreadable: {0}" -f $_.Exception.Message) 'Yellow'
}

$conn.Close()
[System.IO.File]::WriteAllText($OutFile, ($script:buffer -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ("Saved to: {0}" -f $OutFile) -ForegroundColor Green
Write-Host "Copy it into the repo data folder. The number that matters is which report" -ForegroundColor Green
Write-Host "accounts for ~100% of income AND expenses - that one feeds the ratios." -ForegroundColor Green
