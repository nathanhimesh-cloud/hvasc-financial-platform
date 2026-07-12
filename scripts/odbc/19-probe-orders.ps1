<#
  19-probe-orders.ps1  -  READ-ONLY: why did OPDET.COMMITBAL come back empty?
  ---------------------------------------------------------------------------
  05 reported:
        Commitments (C4): capital 0.00, operating 0.00 across 0 open order line(s)
  ...from a table with 8,919 rows. That is not "no commitments"; that is a bug.
  Two candidates, and the first one is mine:

    1. I filtered  WHERE d.COMMITBAL <> 0.  In SQL, NULL <> 0 is UNKNOWN, not
       TRUE - so if COMMITBAL is NULL on open lines, my own WHERE clause threw
       every one of them away. This is the same class of mistake as the Firebird
       RDB$SYSTEM_FLAG = 0 filter that made 16-probe find "1 table".

    2. COMMITBAL is zeroed when an order is receipted, and the outstanding
       commitment must be derived instead:  ESTVALUE - AMTINV  on lines that
       aren't yet complete (COMPIND / STATUS).

  So COUNT the shape of the data before filtering on it. Nulls, zeros, non-zeros,
  and what STATUS / COMPIND actually contain. Then show the arithmetic both ways
  and let the numbers say which is right.

  Also checks JCMST.COMTOT, which 05 already reads as a job "committed" figure -
  if that is populated it is a second, independent source for the same answer.

  Writes orders-probe.txt next to the script. SELECT only. Touches nothing.

      powershell -ExecutionPolicy Bypass -File .\19-probe-orders.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$OutFile = Join-Path $scriptDir 'orders-probe.txt'

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
function N([object]$x) { if ($null -eq $x) { return 0.0 } return [double]$x }

# ---------------------------------------------------------------------------
# 1. The SHAPE of OPDET. Count before filtering.
# ---------------------------------------------------------------------------
Log ""
Log "############ OPDET - the shape of the data ############" 'Cyan'
$total = [int](Get-Rows "SELECT COUNT(*) AS N FROM OPDET")[0].N
Log ("total rows                          : {0}" -f $total)

foreach ($c in @('COMMITBAL','ESTVALUE','AMTINV','QTYORDERED','QTYDELIV','QTYINV','UNITCOST')) {
  $nul = [int](Get-Rows "SELECT COUNT(*) AS N FROM OPDET WHERE $c IS NULL")[0].N
  $zer = [int](Get-Rows "SELECT COUNT(*) AS N FROM OPDET WHERE $c = 0")[0].N
  $non = [int](Get-Rows "SELECT COUNT(*) AS N FROM OPDET WHERE $c <> 0")[0].N
  $sum = N (Get-Rows "SELECT SUM(CAST($c AS DOUBLE PRECISION)) AS S FROM OPDET")[0].S
  Log ("{0,-12}  null {1,6}   zero {2,6}   non-zero {3,6}   SUM {4,16:N2}" -f $c, $nul, $zer, $non, $sum)
}
Log ""
Log "  If COMMITBAL is all-null or all-zero, my 'WHERE COMMITBAL <> 0' was never"
Log "  going to match anything, and the commitment has to be derived instead."

# ---------------------------------------------------------------------------
# 2. What do the STATUS / COMPIND flags actually contain?
# ---------------------------------------------------------------------------
Log ""
Log "############ OPDET.STATUS / COMPIND - what marks an OPEN line? ############" 'Cyan'
foreach ($c in @('STATUS','COMPIND','COSTTYPE','PRICETYPE','PAYTYPE')) {
  Log ""
  Log ("{0}:" -f $c)
  try {
    $rows = Get-Rows "SELECT $c AS V, COUNT(*) AS N, SUM(CAST(ESTVALUE AS DOUBLE PRECISION)) AS EST, SUM(CAST(AMTINV AS DOUBLE PRECISION)) AS INV FROM OPDET GROUP BY $c ORDER BY 2 DESC"
    foreach ($r in $rows) {
      $v = $(if ($null -eq $r.V) { '(null)' } else { ([string]$r.V).Trim() })
      if (-not $v) { $v = '(blank)' }
      Log ("    {0,-10} {1,7} rows   est {2,16:N2}   invoiced {3,16:N2}   OUTSTANDING {4,16:N2}" -f `
        $v, [int]$r.N, (N $r.EST), (N $r.INV), ((N $r.EST) - (N $r.INV)))
    }
  } catch { Log ("    (unreadable: {0})" -f $_.Exception.Message) 'Yellow' }
}

# ---------------------------------------------------------------------------
# 3. The commitment, computed BOTH ways.
# ---------------------------------------------------------------------------
Log ""
Log "############ The commitment, both ways ############" 'Cyan'
$sumCommit = N (Get-Rows "SELECT SUM(CAST(COMMITBAL AS DOUBLE PRECISION)) AS S FROM OPDET")[0].S
$sumEst    = N (Get-Rows "SELECT SUM(CAST(ESTVALUE AS DOUBLE PRECISION)) AS S FROM OPDET")[0].S
$sumInv    = N (Get-Rows "SELECT SUM(CAST(AMTINV AS DOUBLE PRECISION)) AS S FROM OPDET")[0].S
Log ("  (a) SUM(COMMITBAL)              : {0,16:N2}" -f $sumCommit)
Log ("  (b) SUM(ESTVALUE) - SUM(AMTINV) : {0,16:N2}   ({1:N2} ordered less {2:N2} invoiced)" -f ($sumEst - $sumInv), $sumEst, $sumInv)
Log ""
Log "  (b) over ALL history is meaningless - it includes every order ever closed."
Log "  The real question is which lines are still OPEN. See the STATUS breakdown above."

# Orders by year, so we can see whether the open ones are current or ancient junk.
Log ""
Log "OPMST orders by year (an 'open' order from 2009 is stale data, not a commitment):"
try {
  $rows = Get-Rows @"
SELECT EXTRACT(YEAR FROM m.ORDERDATE) AS YR, COUNT(*) AS N,
       SUM(CAST(d.ESTVALUE AS DOUBLE PRECISION)) AS EST,
       SUM(CAST(d.AMTINV AS DOUBLE PRECISION)) AS INV
FROM OPMST m JOIN OPDET d ON d.MSTKY = m.KY
GROUP BY EXTRACT(YEAR FROM m.ORDERDATE)
ORDER BY 1 DESC
"@
  foreach ($r in ($rows | Select-Object -First 12)) {
    Log ("    {0,-6} {1,6} lines   est {2,15:N2}   invoiced {3,15:N2}   outstanding {4,15:N2}" -f `
      $r.YR, [int]$r.N, (N $r.EST), (N $r.INV), ((N $r.EST) - (N $r.INV)))
  }
} catch { Log ("    (EXTRACT unsupported: {0})" -f $_.Exception.Message) 'Yellow' }

# ---------------------------------------------------------------------------
# 4. A look at real rows - the only way to be sure what the columns mean.
# ---------------------------------------------------------------------------
Log ""
Log "############ 10 recent order lines, in full ############" 'Cyan'
try {
  $rows = Get-Rows @"
SELECT FIRST 10 m.ORDERNUM, m.ORDERDATE, m.CREDNAME, d.GLACCOUNT, d.JCACCOUNT,
       d.ITEMDESC, d.STATUS, d.COMPIND,
       CAST(d.QTYORDERED AS DOUBLE PRECISION) AS QO,
       CAST(d.QTYDELIV AS DOUBLE PRECISION) AS QD,
       CAST(d.QTYINV AS DOUBLE PRECISION) AS QI,
       CAST(d.ESTVALUE AS DOUBLE PRECISION) AS EST,
       CAST(d.AMTINV AS DOUBLE PRECISION) AS INV,
       CAST(d.COMMITBAL AS DOUBLE PRECISION) AS CB
FROM OPMST m JOIN OPDET d ON d.MSTKY = m.KY
ORDER BY m.ORDERDATE DESC
"@
  foreach ($r in $rows) {
    Log "  ---"
    Log ("    order {0}  {1}  {2}" -f ([string]$r.ORDERNUM).Trim(), $r.ORDERDATE, ([string]$r.CREDNAME).Trim())
    Log ("    {0}  job {1}" -f ([string]$r.GLACCOUNT).Trim(), ([string]$r.JCACCOUNT).Trim())
    Log ("    item      : {0}" -f ([string]$r.ITEMDESC).Trim())
    Log ("    STATUS={0}  COMPIND={1}" -f ([string]$r.STATUS).Trim(), ([string]$r.COMPIND).Trim())
    Log ("    qty  ordered {0,10:N2}  delivered {1,10:N2}  invoiced {2,10:N2}" -f (N $r.QO), (N $r.QD), (N $r.QI))
    Log ("    val  estimate{0,12:N2}  invoiced {1,12:N2}  COMMITBAL {2,12:N2}" -f (N $r.EST), (N $r.INV), (N $r.CB))
  }
} catch { Log ("  failed: {0}" -f $_.Exception.Message) 'Yellow' }

# ---------------------------------------------------------------------------
# 5. JCMST.COMTOT - a second, independent source for the same number.
# ---------------------------------------------------------------------------
Log ""
Log "############ JCMST.COMTOT - committed cost per job ############" 'Cyan'
try {
  $nul = [int](Get-Rows "SELECT COUNT(*) AS N FROM JCMST WHERE COMTOT IS NULL")[0].N
  $non = [int](Get-Rows "SELECT COUNT(*) AS N FROM JCMST WHERE COMTOT <> 0")[0].N
  $sum = N (Get-Rows "SELECT SUM(CAST(COMTOT AS DOUBLE PRECISION)) AS S FROM JCMST")[0].S
  Log ("  null {0}   non-zero {1}   SUM {2:N2}" -f $nul, $non, $sum)
  if ($non -gt 0) {
    Log "  jobs with a committed balance:"
    foreach ($r in (Get-Rows "SELECT FIRST 15 JCACCOUNT, JCDESC, CAST(COMTOT AS DOUBLE PRECISION) AS C FROM JCMST WHERE COMTOT <> 0 ORDER BY COMTOT DESC")) {
      Log ("    {0,-16} {1,-38} {2,14:N2}" -f ([string]$r.JCACCOUNT).Trim(), ([string]$r.JCDESC).Trim(), (N $r.C))
    }
  }
} catch { Log ("  failed: {0}" -f $_.Exception.Message) 'Yellow' }

# ---------------------------------------------------------------------------
# 6. Non-current assets NOT covered by ARGROUP - the ~$32M gap.
# ---------------------------------------------------------------------------
Log ""
Log "############ Non-current assets outside the ARGROUP map ############" 'Cyan'
Log "05 found depreciable WDV 90.9M + land 3.8M = 94.7M, against ~127M of"
Log "non-current assets on the balance sheet. ~32M is unaccounted for. If that is"
Log "capital work in progress it is CORRECTLY excluded from the consumption ratio"
Log "(WIP isn't depreciated) - but that must be proven, not assumed."
Log ""
try {
  $cur = [int](Get-Rows 'SELECT MTH FROM GLCON')[0].MTH
  $mapped = @{}
  foreach ($g in (Get-Rows "SELECT DEFASSETGLACC, DEFREVALGLACC, DEFACCUMDEPGLACC FROM ARGROUP")) {
    foreach ($c in @($g.DEFASSETGLACC, $g.DEFREVALGLACC, $g.DEFACCUMDEPGLACC)) {
      $s = ([string]$c).Trim(); if ($s) { $mapped[$s] = $true }
    }
  }
  Log ("ARGROUP maps {0} distinct GL accounts." -f $mapped.Count)
  Log ""
  Log "Non-current asset accounts (ACCNTTYPE 8) NOT in that map:"
  $miss = 0.0
  foreach ($r in (Get-Rows "SELECT m.GLACCOUNT, m.DESCRIPT, CAST(b.BALANCE AS DOUBLE PRECISION) AS BAL FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT WHERE b.MTH=$cur AND m.RECACTIVE='Y' AND m.ISCONTROL='Y' AND m.ACCNTTYPE=8 AND b.BALANCE <> 0 ORDER BY b.BALANCE DESC")) {
    $a = ([string]$r.GLACCOUNT).Trim()
    if ($mapped.ContainsKey($a)) { continue }
    $v = N $r.BAL
    $miss += $v
    Log ("    {0,-16} {1,-40} {2,16:N2}" -f $a, ([string]$r.DESCRIPT).Trim(), $v)
  }
  Log ("    {0,-57} {1,16:N2}  TOTAL UNMAPPED" -f '', $miss)
} catch { Log ("  failed: {0}" -f $_.Exception.Message) 'Yellow' }

$conn.Close()
[System.IO.File]::WriteAllText($OutFile, ($script:buffer -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ("Saved to: {0}" -f $OutFile) -ForegroundColor Green
