<#
  02-discover.ps1  —  READ-ONLY round 2: confirm the FNKY -> function mapping
  ---------------------------------------------------------------------------
  Round 1 confirmed GLBAL/GLCON semantics but found FUNCTDESC is NOT the 9
  council functions. The real link is GLMST.FNKY -> FRFUNCTIONS. This round
  proves whether FNKY groups expenses into the 9 functions, and validates the
  council-wide income/expense totals against the known figures.

  STRICTLY READ-ONLY (SELECT only). Run on HVASC-APP02:
      powershell -ExecutionPolicy Bypass -File .\02-discover.ps1 *> discovery2-output.txt
#>

# DB password comes from the PRACTICAL_PWD env var (set it on APP02 / in the
# scheduled task) so no credential is stored in the repo.
$DSN = "DSN=Practical_Plus;UID=PCSACCESS;PWD=$($env:PRACTICAL_PWD);"
$conn = New-Object System.Data.Odbc.OdbcConnection($DSN)
$conn.Open()
Write-Host "Connected: $($conn.ServerVersion)`n" -ForegroundColor Green

function Q {
    param([string]$Title, [string]$Sql, [int]$Max = 30)
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
        if ($rows.Count) { $rows | Format-Table -AutoSize | Out-String -Width 200 | Write-Host }
        else { Write-Host "(no rows)`n" -ForegroundColor Yellow }
    } catch { Write-Host "ERROR: $($_.Exception.Message)`n" -ForegroundColor Red }
}

# A. How many distinct FNKY values? (the function count)
Q 'A. GLMST.FNKY distribution (active, non-control accounts)' @'
SELECT FNKY, COUNT(*) AS N_ACCTS
FROM GLMST
WHERE RECACTIVE = 'Y' AND ISCONTROL = 'N'
GROUP BY FNKY
ORDER BY FNKY
'@

# B. THE TEST — YTD expense by FNKY. Should reproduce the 9 Note 3a function
#    totals (Governance 8,631,875 / Community Services 3,155,840 / Housing
#    777,304 / Water 388,109 / Youth&Rec 278,888 / Sewerage 152,305 /
#    Essential 76,784 / Environment 13,632 / Economic Dev 0).
Q 'B. YTD EXPENSE by FNKY at MTH=11 (match against Note 3a totals)' @'
SELECT m.FNKY, COUNT(*) AS N_ACCTS, SUM(b.BALANCE) AS YTD_EXPENSE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = 11 AND m.ISCONTROL = 'N'
  AND m.ACCNT2 BETWEEN 2000 AND 2999
GROUP BY m.FNKY
ORDER BY 3 DESC
'@

# C. YTD REVENUE by FNKY (revenue is credit-natured → negate BALANCE)
Q 'C. YTD REVENUE by FNKY at MTH=11 (Governance ~4.8M, Community ~3.17M, Housing ~1.63M)' @'
SELECT m.FNKY, COUNT(*) AS N_ACCTS, -SUM(b.BALANCE) AS YTD_REVENUE
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = 11 AND m.ISCONTROL = 'N'
  AND m.ACCNT2 BETWEEN 1000 AND 1999
GROUP BY m.FNKY
ORDER BY 3 DESC
'@

# D. Can we read FRFUNCTIONS.FNNO without the blocked DESCRIPT column?
Q 'D. FRFUNCTIONS.FNNO only (is the number column readable?)' 'SELECT FNNO FROM FRFUNCTIONS ORDER BY FNNO' 40

# E. For each FNKY, a representative account (helps hand-label FNKY -> name if
#    FRFUNCTIONS stays blocked: cross-ref these accounts against Note 3a).
Q 'E. Sample expense accounts per FNKY (for hand-labelling)' @'
SELECT m.FNKY, MIN(m.GLACCOUNT) AS SAMPLE_ACCT, MIN(m.DESCRIPT) AS SAMPLE_DESC,
       MAX(m.GLACCOUNT) AS SAMPLE_ACCT2, MAX(m.DESCRIPT) AS SAMPLE_DESC2
FROM GLMST m
WHERE m.RECACTIVE = 'Y' AND m.ISCONTROL = 'N' AND m.ACCNT2 BETWEEN 2000 AND 2999
GROUP BY m.FNKY
ORDER BY m.FNKY
'@

# F. Council-wide income statement totals via ACCNT2 ranges (validate vs the
#    known ~$25.0M income / ~$18.3M expense). Note: this includes grants in
#    revenue (1400-1499 is a subset of 1000-1999).
Q 'F. Council-wide YTD totals at MTH=11 (validate vs ~$25.0M income / ~$18.3M expense)' @'
SELECT
  (SELECT -SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=11 AND m.ISCONTROL='N' AND m.ACCNT2 BETWEEN 1000 AND 1999) AS REVENUE_TOTAL,
  (SELECT -SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=11 AND m.ISCONTROL='N' AND m.ACCNT2 BETWEEN 1400 AND 1499) AS GRANTS_TOTAL,
  (SELECT SUM(b.BALANCE) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=11 AND m.ISCONTROL='N' AND m.ACCNT2 BETWEEN 2000 AND 2999) AS EXPENSE_TOTAL
FROM RDB$DATABASE
'@

# G. Confirm budget is empty and lastyear is populated (council-wide, expenses)
Q 'G. GLBAL.BUDGET vs LASTYEAR for expense accounts at MTH=11 (BUDGET should be ~0)' @'
SELECT SUM(b.BUDGET) AS BUDGET_TOTAL, SUM(b.LASTYEAR) AS LASTYEAR_TOTAL
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
WHERE b.MTH=11 AND m.ISCONTROL='N' AND m.ACCNT2 BETWEEN 2000 AND 2999
'@

# H. Monthly expense trend: council-wide movement per period (drives monthlySpend)
Q 'H. Monthly expense movement by MTH (DEBIT-CREDIT, expense accounts) = trend' @'
SELECT b.MTH, SUM(b.DEBIT - b.CREDIT) AS NET_EXPENSE_MOVEMENT
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
WHERE m.ISCONTROL='N' AND m.ACCNT2 BETWEEN 2000 AND 2999 AND b.MTH BETWEEN 1 AND 12
GROUP BY b.MTH
ORDER BY b.MTH
'@ 15

$conn.Close()
Write-Host "`nDone." -ForegroundColor Green
