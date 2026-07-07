<#
  05b-balance-sheet.ps1  —  READ-ONLY: build a live Balance Sheet from Practical
  ---------------------------------------------------------------------------
  Reads the GL balances at the current period and assembles a Statement of
  Financial Position (BalanceSheet shape in src/lib/types.ts). Run it AFTER
  05-build-snapshot.ps1 — it opens the snapshot.json that 05 wrote, injects the
  live `balanceSheet`, and writes it back, so 06-push.ps1 ships everything in one
  PUT.

  Classification (from schema discovery — VALIDATE before trusting, see below):
     GLMST.ACCNTTYPE   7 = current assets
                       8 = non-current assets
                       9 = current liabilities
                      10 = non-current liabilities
                      11 = equity
  Balances: GLBAL.BALANCE (cumulative) at the current period MTH.

  ⚠ VALIDATE ON FIRST RUN. Totals are reliable; the *split* of 9 vs 10 (current
  vs non-current liabilities) and the cash-line match are the two things to check
  against a Balance Sheet you trust before enabling this in the scheduled feed.
  The script prints the totals so you can eyeball them:
     Total Assets = Total Liabilities + Total Equity  (must balance)

  Presentation caveat: without the FR module unlocked, lines are the raw GL
  accounts grouped by type — the TOTALS match Practical, the line labels are the
  account descriptions rather than Practical's summarised statement lines.

  STRICTLY READ-ONLY (SELECT only). Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\05b-balance-sheet.ps1
#>

param(
  [string]$SnapshotFile = (Join-Path $PSScriptRoot 'snapshot.json'),
  [switch]$StandaloneOnly   # print + write balance-sheet.json only; don't touch snapshot.json
)

$ErrorActionPreference = 'Stop'
$DSN = "DSN=Practical_Plus;UID=PCSACCESS;PWD=$($env:PRACTICAL_PWD);"

# Which ACCNTTYPE maps to which balance-sheet section. Adjust here after validation.
$SECTIONS = @(
  @{ key = 'currentAssets';        label = 'Current assets';        types = @(7)  }
  @{ key = 'nonCurrentAssets';     label = 'Non-current assets';    types = @(8)  }
  @{ key = 'currentLiabilities';   label = 'Current liabilities';   types = @(9)  }
  @{ key = 'nonCurrentLiabilities';label = 'Non-current liabilities';types = @(10) }
  @{ key = 'equity';               label = 'Community equity';      types = @(11) }
)
$MONTHS = @('Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun')

$conn = New-Object System.Data.Odbc.OdbcConnection($DSN)
$conn.Open()
Write-Host "Connected: $($conn.ServerVersion)" -ForegroundColor Green

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader(); $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $r.GetValue($i); $o[$r.GetName($i)] = ($(if ($v -is [DBNull]) { $null } else { $v }))
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
function R2([object]$x) { if ($null -eq $x) { return 0 } return [math]::Round([double]$x, 2) }

# ── period ────────────────────────────────────────────────────────────────────
$cur = [int](Invoke-Scalar 'SELECT MTH FROM GLCON')
$yr  = [int](Invoke-Scalar 'SELECT YR FROM GLCON')
if ($cur -lt 1 -or $cur -gt 12) { $cur = 12 }
# FY runs Jul(1)..Jun(12). Months 1-6 (Jul-Dec) fall in calendar year (yr-1);
# months 7-12 (Jan-Jun) fall in calendar year (yr). yr = FY-ending year.
$asAtCal = if ($cur -le 6) { "$($MONTHS[$cur-1]) $($yr-1)" } else { "$($MONTHS[$cur-1]) $yr" }
Write-Host "Balance Sheet as at period $cur, FY$yr  ($asAtCal)" -ForegroundColor Cyan

# ── pull account balances for the balance-sheet types ─────────────────────────
$allTypes = ($SECTIONS | ForEach-Object { $_.types }) -join ','
# NOTE: no ABS() in the SQL — Firebird 1.5 has no built-in ABS (error -804).
# Sort each section's lines by size in PowerShell instead (below).
$rows = Invoke-Rows @"
SELECT m.ACCNTTYPE, m.GLACCOUNT, m.DESCRIPT, b.BALANCE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y'
  AND m.ACCNTTYPE IN ($allTypes) AND b.BALANCE <> 0
ORDER BY m.ACCNTTYPE
"@

function Build-Section($def) {
  $lines = @()
  $total = 0.0
  $matching = @($rows | Where-Object { $def.types -contains [int]$_.ACCNTTYPE }) |
    Sort-Object { [math]::Abs([double]$_.BALANCE) } -Descending
  foreach ($row in $matching) {
    $amt = R2 $row.BALANCE
    $lines += [ordered]@{ label = ([string]$row.DESCRIPT).Trim(); amount = $amt }
    $total += $amt
  }
  return @{ section = [ordered]@{ label = $def.label; lines = $lines; total = (R2 $total) }; total = (R2 $total) }
}

$sec = @{}
foreach ($def in $SECTIONS) { $sec[$def.key] = Build-Section $def }

$totalAssets      = R2 ($sec.currentAssets.total + $sec.nonCurrentAssets.total)
$totalLiabilities = R2 ($sec.currentLiabilities.total + $sec.nonCurrentLiabilities.total)
$totalEquity      = R2 $sec.equity.total
$netCommunity     = R2 ($totalAssets - $totalLiabilities)

# cash line: first current-asset line whose description mentions cash
$cashLine = $sec.currentAssets.section.lines | Where-Object { $_.label -match '(?i)cash' } | Select-Object -First 1
$cash = if ($cashLine) { $cashLine.amount } else { 0 }

$balanceSheet = [ordered]@{
  currentAssets        = $sec.currentAssets.section
  nonCurrentAssets     = $sec.nonCurrentAssets.section
  totalAssets          = $totalAssets
  currentLiabilities   = $sec.currentLiabilities.section
  nonCurrentLiabilities= $sec.nonCurrentLiabilities.section
  totalLiabilities     = $totalLiabilities
  netCommunityAssets   = $netCommunity
  equity               = $sec.equity.section
  totalEquity          = $totalEquity
  asAt                 = $asAtCal
}

$conn.Close()

# ── validation summary ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Balance Sheet (live) ── VALIDATE THESE:" -ForegroundColor Cyan
Write-Host ("  Total Assets       : {0,18:N2}" -f $totalAssets)
Write-Host ("  Total Liabilities  : {0,18:N2}" -f $totalLiabilities)
Write-Host ("  Total Equity       : {0,18:N2}" -f $totalEquity)
Write-Host ("  Liab + Equity      : {0,18:N2}" -f ($totalLiabilities + $totalEquity))
$gap = [math]::Round($totalAssets - ($totalLiabilities + $totalEquity), 2)
$col = if ([math]::Abs($gap) -le 1) { 'Green' } else { 'Red' }
Write-Host ("  BALANCE CHECK gap  : {0,18:N2}  (should be 0)" -f $gap) -ForegroundColor $col
Write-Host ("  Cash & equivalents : {0,18:N2}  (matched line: {1})" -f $cash, $(if ($cashLine) { $cashLine.label } else { 'NONE — check!' }))
Write-Host ""

# ── write out ─────────────────────────────────────────────────────────────────
if ($StandaloneOnly) {
  $out = Join-Path $PSScriptRoot 'balance-sheet.json'
  [System.IO.File]::WriteAllText($out, ($balanceSheet | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Wrote $out (standalone)." -ForegroundColor Green
} else {
  if (-not (Test-Path $SnapshotFile)) { throw "snapshot.json not found ($SnapshotFile). Run 05-build-snapshot.ps1 first." }
  $snap = Get-Content $SnapshotFile -Raw | ConvertFrom-Json
  $snap | Add-Member -NotePropertyName balanceSheet -NotePropertyValue $balanceSheet -Force
  [System.IO.File]::WriteAllText($SnapshotFile, ($snap | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Injected live balanceSheet into $SnapshotFile — 06-push will ship it." -ForegroundColor Green
}
