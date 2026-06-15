<#
  03-discover.ps1  —  READ-ONLY round 3: nail classification + function rollup
  ---------------------------------------------------------------------------
  Round 2 disproved two assumptions:
    - FNKY is flat (one value for all accounts) -> useless for functions.
    - ACCNT2 range + ISCONTROL='N' caught only depreciation (5 accts / $4.9M),
      because the real posting expense accounts are ISCONTROL='Y' here.
  This round finds the TRUE classification (ACCNTTYPE) and a READABLE function
  field (REPORTGROUP / FRACCNTLINK / account hierarchy), validated against:
      Income statement: income ~$25.0M, expenses ~$18.3M
      Note 3a by-function expenses: $13.47M  (difference = depreciation ~$4.9M)

  STRICTLY READ-ONLY (SELECT only). Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\03-discover.ps1 *> discovery3-output.txt
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

# 1. THE CLASSIFICATION TEST — YTD balance by ACCNTTYPE (no ISCONTROL filter).
#    Expect one type ~ -$25M (revenue), one ~ +$18.3M (expenses). Counts help
#    identify them (round 1: type 5 = 415 accts, type 6 = 576 accts).
Q '1. SUM(BALANCE) at MTH=11 by ACCNTTYPE (RECACTIVE=Y, NO iscontrol filter)' @'
SELECT m.ACCNTTYPE, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_BALANCE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = 11 AND m.RECACTIVE = 'Y'
GROUP BY m.ACCNTTYPE
ORDER BY m.ACCNTTYPE
'@

# 2. Does ISCONTROL double-count? Same split, broken out by ISCONTROL.
#    If the expense type's total is the SAME with/without ISCONTROL='Y', then
#    control accounts are empty (safe). If including them doubles it, we must
#    pick one level (ISITEM='Y' postings only).
Q '2. ACCNTTYPE x ISCONTROL at MTH=11 (check for double-counting)' @'
SELECT m.ACCNTTYPE, m.ISCONTROL, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_BALANCE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = 11 AND m.RECACTIVE = 'Y'
GROUP BY m.ACCNTTYPE, m.ISCONTROL
ORDER BY m.ACCNTTYPE, m.ISCONTROL
'@

# 3. REPORTGROUP — candidate function field. How many distinct, what do they look like?
Q '3. GLMST.REPORTGROUP distinct values + counts (function candidate)' @'
SELECT REPORTGROUP, COUNT(*) AS N_ACCTS
FROM GLMST WHERE RECACTIVE = 'Y'
GROUP BY REPORTGROUP ORDER BY 2 DESC
'@ 60

# 4. If REPORTGROUP looks like functions: expense by REPORTGROUP (match Note 3a:
#    Governance 8.63M / Community 3.16M / Housing 0.78M / Water 0.39M / ...).
#    NOTE: set the ACCNTTYPE below to whatever query 1 shows as the expense type.
Q '4. Expense (ACCNTTYPE=6) by REPORTGROUP at MTH=11 (match vs Note 3a)' @'
SELECT m.REPORTGROUP, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_EXPENSE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = 11 AND m.RECACTIVE = 'Y' AND m.ACCNTTYPE = 6
GROUP BY m.REPORTGROUP ORDER BY 3 DESC
'@ 60

# 5. Program-segment clustering — expense by ACCNT1 (the leading code segment).
#    In Note 3a, Governance used programs 1155-1282. If functions map to ACCNT1
#    bands, this shows the bands.
Q '5. Expense (ACCNTTYPE=6) by ACCNT1 program at MTH=11 (top 40)' @'
SELECT m.ACCNT1, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_EXPENSE
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = 11 AND m.RECACTIVE = 'Y' AND m.ACCNTTYPE = 6
GROUP BY m.ACCNT1 ORDER BY 3 DESC
'@ 40

# 6. Is FRACCNTLINK readable? (account -> report section map; an alt function source)
Q '6. FRACCNTLINK readable? (account -> section/report link)' @'
SELECT FIRST 8 GLACCOUNT, SECTKY, RPTKY, COLKY, LNKY, TRANTYPE FROM FRACCNTLINK
'@

# 7. GLMST structure for expense accounts — see which fields carry the rollup.
Q '7. GLMST structure sample (expense accounts) — hierarchy + grouping fields' @'
SELECT FIRST 15 GLACCOUNT, ACCNT1, ACCNT2, REPORTGROUP, MASTERACCNT,
       L1ACCNT, L2ACCNT, ISITEM, ISCONTROL, HASITEMS
FROM GLMST
WHERE RECACTIVE = 'Y' AND ACCNTTYPE = 6
ORDER BY GLACCOUNT
'@

# 8. Council-wide income statement check, by ACCNTTYPE (no iscontrol filter).
#    Revenue type total should be ~ -$25.0M, expense type ~ +$18.3M.
Q '8. Income-statement validation: revenue type vs expense type totals @ MTH=11' @'
SELECT
  (SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=11 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=5) AS TYPE5_REVENUE,
  (SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=11 AND m.RECACTIVE='Y' AND m.ACCNTTYPE=6) AS TYPE6_EXPENSE
FROM RDB$DATABASE
'@

$conn.Close()
Write-Host "`nDone." -ForegroundColor Green
