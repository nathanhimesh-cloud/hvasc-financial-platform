<#
  04-discover.ps1  —  READ-ONLY round 4: function rollup via the L1-L4 hierarchy
  ---------------------------------------------------------------------------
  The FR module (FRFUNCTIONS/FRACCNTLINK) is permission-blocked, and FUNCTDESC/
  FNKY/REPORTGROUP are unusable. BUT GLMST carries an account hierarchy
  (L1ACCNT..L4ACCNT) whose parent accounts are themselves GLMST rows with a
  READABLE DESCRIPT. Round 3 showed Governance expense accounts all share
  L1ACCNT='1000-0001-0000'. This round checks whether some L-level groups the
  576 expense accounts into the 9 functions, by joining each level to its
  parent's DESCRIPT and matching totals against Note 3a:
      Governance 8,631,875 | Community Services 3,155,840 | Housing 777,304
      Water 388,109 | Youth & Rec 278,888 | Sewerage 152,305
      Essential Services 76,784 | Environment Mgmt 13,632 | Economic Dev 0

  STRICTLY READ-ONLY (SELECT only). Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\04-discover.ps1 *> discover4-output.txt
#>

# DB password comes from the PRACTICAL_PWD env var (set it on APP02 / in the
# scheduled task) so no credential is stored in the repo.
$DSN = "DSN=Practical_Plus;UID=PCSACCESS;PWD=$($env:PRACTICAL_PWD);"
$conn = New-Object System.Data.Odbc.OdbcConnection($DSN)
$conn.Open()
Write-Host "Connected: $($conn.ServerVersion)`n" -ForegroundColor Green

function Q {
    param([string]$Title, [string]$Sql, [int]$Max = 40)
    Write-Host ("=" * 78) -ForegroundColor DarkGray
    Write-Host $Title -ForegroundColor Cyan
    Write-Host $Sql -ForegroundColor DarkGray
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
        $r = $cmd.ExecuteReader()
        $rows = @()
        while ($r.Read() -and $rows.Count -lt $Max) {
            $o = [ordered]@{}
            for ($i = 0; $i -lt $r.FieldCount; $i++) { $o[$r.GetName($i)] = $r.GetValue($i) }
            $rows += [pscustomobject]$o
        }
        $r.Close()
        if ($rows.Count) { $rows | Format-Table -AutoSize | Out-String -Width 220 | Write-Host }
        else { Write-Host "(no rows)`n" -ForegroundColor Yellow }
    } catch { Write-Host "ERROR: $($_.Exception.Message)`n" -ForegroundColor Red }
}

# 1. How many distinct values at each L-level for expense accounts?
#    The function level should have ~9-12 distinct values.
Q '1. Distinct L1/L2/L3/L4 parents among expense accounts (which level ~ 9 groups?)' @'
SELECT
  COUNT(DISTINCT L1ACCNT) AS N_L1,
  COUNT(DISTINCT L2ACCNT) AS N_L2,
  COUNT(DISTINCT L3ACCNT) AS N_L3,
  COUNT(DISTINCT L4ACCNT) AS N_L4
FROM GLMST WHERE RECACTIVE='Y' AND ACCNTTYPE=6
'@

# 2. Expense by L1 parent DESCRIPT (join parent account for its name).
Q '2. Expense by L1ACCNT parent name at MTH=11 (match vs Note 3a functions)' @'
SELECT m.L1ACCNT, p.DESCRIPT AS L1_NAME, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_EXPENSE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
LEFT JOIN GLMST p ON p.GLACCOUNT = m.L1ACCNT
WHERE b.MTH=11 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=6
GROUP BY m.L1ACCNT, p.DESCRIPT
ORDER BY 4 DESC
'@

# 3. Expense by L2 parent DESCRIPT.
Q '3. Expense by L2ACCNT parent name at MTH=11' @'
SELECT m.L2ACCNT, p.DESCRIPT AS L2_NAME, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_EXPENSE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
LEFT JOIN GLMST p ON p.GLACCOUNT = m.L2ACCNT
WHERE b.MTH=11 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=6
GROUP BY m.L2ACCNT, p.DESCRIPT
ORDER BY 4 DESC
'@

# 4. Expense by L3 parent DESCRIPT.
Q '4. Expense by L3ACCNT parent name at MTH=11' @'
SELECT m.L3ACCNT, p.DESCRIPT AS L3_NAME, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_EXPENSE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
LEFT JOIN GLMST p ON p.GLACCOUNT = m.L3ACCNT
WHERE b.MTH=11 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=6
GROUP BY m.L3ACCNT, p.DESCRIPT
ORDER BY 4 DESC
'@

# 5. Expense by L4 parent DESCRIPT.
Q '5. Expense by L4ACCNT parent name at MTH=11' @'
SELECT m.L4ACCNT, p.DESCRIPT AS L4_NAME, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_EXPENSE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
LEFT JOIN GLMST p ON p.GLACCOUNT = m.L4ACCNT
WHERE b.MTH=11 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=6
GROUP BY m.L4ACCNT, p.DESCRIPT
ORDER BY 4 DESC
'@

# 6. The header/structure accounts themselves — do their names include the 9
#    functions? (ACCNTTYPE 1/2/3 = header/control accounts, 0 balance.)
Q '6. Header accounts (ACCNTTYPE 1,2,3) names — look for the 9 function names' @'
SELECT GLACCOUNT, ACCNTTYPE, DESCRIPT, ISCONTROL, HASITEMS
FROM GLMST
WHERE RECACTIVE='Y' AND ACCNTTYPE IN (1,2,3)
ORDER BY ACCNTTYPE, GLACCOUNT
'@ 60

$conn.Close()
Write-Host "`nDone." -ForegroundColor Green
