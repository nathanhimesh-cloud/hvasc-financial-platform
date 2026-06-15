<#
  05-build-snapshot.ps1  —  READ-ONLY: build FinancialSnapshot JSON from Practical
  ---------------------------------------------------------------------------
  Assembles the dashboard's FinancialSnapshot (src/data/snapshot.json shape)
  straight from the Civica Practical GL via ODBC. No report exports needed.

  Basis (proven in discovery rounds 1-4, validated against the known figures):
    - Classification:  GLMST.ACCNTTYPE  (5 = revenue, 6 = expense)
    - Function:        GLMST.L1ACCNT -> parent account DESCRIPT (8 GL-native funcs)
    - Period balances: GLBAL.BALANCE (cumulative YTD) at the current period MTH
    - Prior year:      GLBAL.LASTYEAR (FY25 actuals = baseline; FY26 budget = 0)
    - Operating spend EXCLUDES depreciation (type 6, ISCONTROL='N') so the net
      result ties to the council's income statement (~$6.67M, not the $1.7M you
      get if depreciation is left in).

  STRICTLY READ-ONLY (SELECT only). Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\05-build-snapshot.ps1
  Writes snapshot.json next to the script and prints a validation summary.
  Add  -Push  later (06) to ship it to the dashboard.
#>

param(
  [string]$OutFile = (Join-Path $PSScriptRoot 'snapshot.json')
)

# DB password comes from the PRACTICAL_PWD env var (set it on APP02 / in the
# scheduled task) so no credential is stored in the repo.
$DSN = "DSN=Practical_Plus;UID=PCSACCESS;PWD=$($env:PRACTICAL_PWD);"

# ── display config: GL function header (L1ACCNT) -> dashboard presentation ────
$FUNCS = [ordered]@{
  '1000-0001-0000' = @{ name = 'Administration';               slug = 'administration';              icon = 'landmark';  color = 'gold'   }
  '5000-0001-0000' = @{ name = 'Housing & Construction';       slug = 'housing-construction';        icon = 'home';      color = 'blue'   }
  '7000-0001-0000' = @{ name = 'Health & Social Welfare';      slug = 'health-social-welfare';       icon = 'users';     color = 'violet' }
  '4000-0001-0000' = @{ name = 'Essential Services';           slug = 'essential-services';          icon = 'zap';       color = 'amber'  }
  '3000-0001-0000' = @{ name = 'Education, Youth & Recreation'; slug = 'education-youth-recreation';  icon = 'trophy';    color = 'teal'   }
  '8100-0001-0000' = @{ name = 'Economic Development';         slug = 'economic-development';        icon = 'briefcase'; color = 'indigo' }
  '6000-0001-0000' = @{ name = 'Land & Sea Management';        slug = 'land-sea-management';         icon = 'leaf';      color = 'green'  }
  '2000-0001-0000' = @{ name = 'CDEP';                         slug = 'cdep';                        icon = 'warehouse'; color = 'red'    }
}
$MONTHS = @('Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun')

# ── ODBC plumbing ────────────────────────────────────────────────────────────
$conn = New-Object System.Data.Odbc.OdbcConnection($DSN)
$conn.Open()
Write-Host "Connected: $($conn.ServerVersion)" -ForegroundColor Green

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $r.GetValue($i)
      $o[$r.GetName($i)] = ($(if ($v -is [DBNull]) { $null } else { $v }))
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}
function Invoke-Scalar([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $v = $cmd.ExecuteScalar()
  if ($v -is [DBNull] -or $null -eq $v) { return 0 } else { return [double]$v }
}
function R2([object]$x) { if ($null -eq $x) { return 0 } return [math]::Round([double]$x, 2) }
function Slugify([string]$s) {
  $t = $s.ToLower() -replace '&','and' -replace '[^a-z0-9]+','-'
  return ($t.Trim('-'))
}

# ── 1. period ────────────────────────────────────────────────────────────────
$cur = [int](Invoke-Scalar 'SELECT MTH FROM GLCON')
$yr  = [int](Invoke-Scalar 'SELECT YR FROM GLCON')
if ($cur -lt 1 -or $cur -gt 12) { $cur = 11 }
$periodLabel = "$($MONTHS[$cur-1]) $yr"
$fyLabel     = "FY$($yr-1)-" + ($yr.ToString().Substring(2))   # FY2025-26
Write-Host "Period: $periodLabel  (month $cur of FY$yr)" -ForegroundColor Cyan

# ── 2. department rollup (operating; excludes depreciation ISCONTROL='N') ─────
$deptRows = Invoke-Rows @"
SELECT m.L1ACCNT,
       SUM(CASE WHEN m.ACCNTTYPE=6 THEN b.BALANCE  ELSE 0 END) AS YTD_EXP,
       SUM(CASE WHEN m.ACCNTTYPE=5 THEN b.BALANCE  ELSE 0 END) AS YTD_REV,
       SUM(CASE WHEN m.ACCNTTYPE=6 THEN b.LASTYEAR ELSE 0 END) AS LY_EXP,
       SUM(CASE WHEN m.ACCNTTYPE=6 THEN b.BUDGET   ELSE 0 END) AS BUD_EXP
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE IN (5,6)
GROUP BY m.L1ACCNT
"@

# GL detail lines per function (top expense accounts; operating only)
$glRows = Invoke-Rows @"
SELECT m.L1ACCNT, m.GLACCOUNT, m.DESCRIPT, b.BALANCE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y'
  AND m.ACCNTTYPE=6 AND b.BALANCE <> 0
ORDER BY m.L1ACCNT, b.BALANCE DESC
"@

$hasRealBudget = ($deptRows | Measure-Object -Property BUD_EXP -Sum).Sum -ne 0
$departments = @()
foreach ($key in $FUNCS.Keys) {
  $cfg = $FUNCS[$key]
  $d   = $deptRows | Where-Object { $_.L1ACCNT -eq $key } | Select-Object -First 1
  if (-not $d) { continue }
  $ytdActual = R2 $d.YTD_EXP
  $revenue   = R2 $d.YTD_REV
  if ($ytdActual -le 0 -and $revenue -le 0) { continue }

  $annualBudget = if ($hasRealBudget) { R2 $d.BUD_EXP } else { R2 $d.LY_EXP }
  if ($annualBudget -le 0) { $annualBudget = R2 ($ytdActual * 12 / $cur) }   # run-rate fallback
  $ytdBudget = R2 ($annualBudget * $cur / 12)
  $ratio = if ($ytdBudget -gt 0) { $ytdActual / $ytdBudget } else { 0 }
  $status = if ($ratio -gt 1.05) { 'over-budget' } elseif ($ratio -gt 1.0) { 'at-risk' } else { 'on-track' }

  $lines = @($glRows | Where-Object { $_.L1ACCNT -eq $key } | Select-Object -First 6)
  $glLines = @()
  $first = $true
  foreach ($l in $lines) {
    $amt = R2 $l.BALANCE
    $line = [ordered]@{ code = [string]$l.GLACCOUNT; account = ([string]$l.DESCRIPT).Trim(); amount = $amt }
    if ($first -and $amt -gt ($ytdActual * 0.4)) { $line.flagged = $true }
    $glLines += $line
    $first = $false
  }

  $departments += [ordered]@{
    id          = $cfg.slug
    slug        = $cfg.slug
    name        = $cfg.name
    icon        = $cfg.icon
    color       = $cfg.color
    kind        = $(if ($revenue -gt 0) { 'cost-revenue' } else { 'cost' })
    annualBudget = $annualBudget
    ytdActual   = $ytdActual
    ytdBudget   = $ytdBudget
    status      = $status
    glLines     = $glLines
  }
}
$departments = @($departments | Sort-Object { $_.ytdActual } -Descending)

# ── 3. council income statement (operating basis; ties to ~$6.67M net) ────────
$income   = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5")
$expenses = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6")
$deprec   = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ISCONTROL='N' AND m.ACCNTTYPE=6")
$netResult = R2 ($income - $expenses)

# ── 4. revenue lines: grants&subsidies (ACCNT2 1100-1199) + by-function rest ──
$grantsRevTotal = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND m.ACCNT2 BETWEEN 1100 AND 1199")
$revenueLines = @()
if ($grantsRevTotal -gt 0) {
  $revenueLines += [ordered]@{ id = 'grants-and-subsidies'; label = 'Grants & subsidies'; ytd = $grantsRevTotal }
}
# Non-grant revenue grouped by function
foreach ($key in $FUNCS.Keys) {
  $cfg = $FUNCS[$key]
  $rev = R2 (Invoke-Scalar "SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5 AND m.L1ACCNT='$key' AND NOT (m.ACCNT2 BETWEEN 1100 AND 1199)")
  if ($rev -gt 0) {
    $revenueLines += [ordered]@{ id = (Slugify ($cfg.name + ' revenue')); label = "$($cfg.name) revenue"; departmentId = $cfg.slug; ytd = $rev }
  }
}

# ── 5. grants register (funding received; ACCNT2 1100-1199 revenue accounts) ──
$grantRows = Invoke-Rows @"
SELECT m.GLACCOUNT, m.DESCRIPT, m.L1ACCNT, b.BALANCE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = $cur AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5
  AND m.ACCNT2 BETWEEN 1100 AND 1199 AND b.BALANCE <> 0
ORDER BY b.BALANCE DESC
"@
$grants = @()
foreach ($g in $grantRows) {
  $total = R2 $g.BALANCE
  if ($total -le 0) { continue }
  $deptCfg = $FUNCS[[string]$g.L1ACCNT]
  $deptId  = if ($deptCfg) { $deptCfg.slug } else { 'administration' }
  $grants += [ordered]@{
    id          = [string]$g.GLACCOUNT
    name        = ([string]$g.DESCRIPT).Trim()
    funder      = 'Grant'
    departmentId = $deptId
    total       = $total
    spent       = 0
    reportDue   = [ordered]@{ label = '—'; level = 'muted' }
    acquittal   = [ordered]@{ label = '—'; level = 'muted' }
    status      = 'not-started'
    statusChip  = [ordered]@{ label = 'FUNDING RECEIVED'; level = 'muted' }
  }
}

# ── 6. monthly trend + cumulative statements (from per-period balances) ───────
$movRows = Invoke-Rows @"
SELECT b.MTH, SUM(b.DEBIT - b.CREDIT) AS MOVE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=6 AND b.MTH BETWEEN 1 AND $cur
GROUP BY b.MTH ORDER BY b.MTH
"@
$monthlySpend = @()
for ($i = 1; $i -le $cur; $i++) {
  $m = $movRows | Where-Object { [int]$_.MTH -eq $i } | Select-Object -First 1
  $monthlySpend += [ordered]@{ month = $MONTHS[$i-1]; amount = R2 ($(if ($m) { $m.MOVE } else { 0 })) }
}

$cumRows = Invoke-Rows @"
SELECT b.MTH,
       SUM(CASE WHEN m.ACCNTTYPE=5 THEN b.BALANCE ELSE 0 END) AS INC,
       SUM(CASE WHEN m.ACCNTTYPE=6 AND m.ISCONTROL='Y' THEN b.BALANCE ELSE 0 END) AS EXP
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE m.RECACTIVE='Y' AND m.ACCNTTYPE IN (5,6) AND b.MTH BETWEEN 1 AND $cur
GROUP BY b.MTH ORDER BY b.MTH
"@
$monthlyStatements = @()
foreach ($c in $cumRows) {
  $inc = R2 $c.INC; $exp = R2 $c.EXP
  if ($inc -eq 0 -and $exp -eq 0) { continue }
  $idx = [int]$c.MTH
  $monthlyStatements += [ordered]@{
    idx = $idx; month = $MONTHS[$idx-1]
    totalIncome = $inc; totalExpenses = $exp; netResult = R2 ($inc - $exp)
    revenueLines = @()
  }
}

# ── 7. assemble + write ──────────────────────────────────────────────────────
$snapshot = [ordered]@{
  period = [ordered]@{
    label = $periodLabel; fyLabel = $fyLabel; monthOfYear = $cur; monthsInYear = 12
    live = $true
    budgetEstimated = (-not $hasRealBudget)
    budgetBasis = $(if ($hasRealBudget) { 'FY budget loaded in Practical vs actual' } else { 'Compared to FY25 actuals (prior year) - no FY26 budget loaded' })
    comparisonLabel = $(if ($hasRealBudget) { 'Budget' } else { 'FY25' })
    trendEstimated = $false
  }
  departments   = $departments
  grants        = $grants
  revenueLines  = $revenueLines
  monthlySpend  = $monthlySpend
  incomeTotals  = [ordered]@{ totalIncome = $income; totalExpenses = $expenses; netResult = $netResult; revenueLines = $revenueLines }
  monthlyStatements = $monthlyStatements
  meta = [ordered]@{
    source = "Civica Practical ODBC (live GL) - DSN=Practical_Plus"
    baseline = $(if ($hasRealBudget) { 'fy-budget' } else { 'fy25-actuals' })
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    notes = @(
      "Live read-only feed from the General Ledger (GLMST/GLBAL) at period $cur, FY$yr.",
      "Departments = GL-native functions (GLMST.L1ACCNT). Spend is operating expenditure; depreciation (`$$deprec) is excluded so the net result ties to the income statement.",
      "Budget baseline = FY25 actuals (GLBAL.LASTYEAR); FY26 budget not loaded in Practical.",
      "Grants list = grant/subsidy revenue received (funding received). Spend % + deadlines need the council's grants register + job costing."
    )
  }
}

$json = $snapshot | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
$conn.Close()

# ── validation summary ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "Wrote $OutFile" -ForegroundColor Green
Write-Host ("  departments : {0}" -f $departments.Count)
Write-Host ("  grants      : {0}" -f $grants.Count)
Write-Host ("  revenueLines: {0}" -f $revenueLines.Count)
Write-Host ""
Write-Host "Income statement (operating basis):" -ForegroundColor Cyan
Write-Host ("  Income   : {0,18:N2}   (known ~25,013,723)" -f $income)
Write-Host ("  Expenses : {0,18:N2}   (known ~18,343,558)" -f $expenses)
Write-Host ("  Net      : {0,18:N2}   (known ~ 6,670,164)" -f $netResult)
Write-Host ("  Deprec.  : {0,18:N2}   (excluded from operating)" -f $deprec)
Write-Host ""
Write-Host "Department spend (operating):" -ForegroundColor Cyan
$deptTotal = 0
foreach ($d in $departments) { Write-Host ("  {0,-30} {1,16:N2}" -f $d.name, $d.ytdActual); $deptTotal += [double]$d.ytdActual }
Write-Host ("  {0,-30} {1,16:N2}" -f 'TOTAL', $deptTotal)
Write-Host "`nDone." -ForegroundColor Green
