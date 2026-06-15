<#
  01-discover.ps1  —  READ-ONLY Practical (Firebird) schema discovery
  ---------------------------------------------------------------------------
  Run on HVASC-APP02 as sandsservice. Confirms the semantics we need before
  writing the snapshot query (see ../../../reports/practical_schema/SCHEMA-MAPPING.md).

  STRICTLY READ-ONLY: only SELECT statements. Does not modify Practical data,
  schema, settings, or the DSN.

  Usage (64-bit PowerShell on APP02) — redirect ALL output to a file:
      powershell -ExecutionPolicy Bypass -File .\01-discover.ps1 *> discovery-output.txt
      # `*>` captures every stream (incl. Write-Host) to discovery-output.txt.
      # (Start-Transcript is intentionally NOT used — it throws on Windows
      #  PowerShell 4.0 / Server 2012 R2 when output is redirected.)
#>

# DB password comes from the PRACTICAL_PWD env var (set it on APP02 / in the
# scheduled task) so no credential is stored in the repo.
$DSN = "DSN=Practical_Plus;UID=PCSACCESS;PWD=$($env:PRACTICAL_PWD);"

$conn = New-Object System.Data.Odbc.OdbcConnection($DSN)
$conn.Open()
Write-Host "Connected: $($conn.ServerVersion)`n" -ForegroundColor Green

# --- helper: run a SELECT and print rows as a table -------------------------
function Q {
    param([string]$Title, [string]$Sql, [int]$Max = 25)
    Write-Host ("=" * 78) -ForegroundColor DarkGray
    Write-Host $Title -ForegroundColor Cyan
    Write-Host $Sql -ForegroundColor DarkGray
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
        $r = $cmd.ExecuteReader()
        $rows = @()
        while ($r.Read() -and $rows.Count -lt $Max) {
            $o = [ordered]@{}
            for ($i = 0; $i -lt $r.FieldCount; $i++) {
                $o[$r.GetName($i)] = $r.GetValue($i)
            }
            $rows += [pscustomobject]$o
        }
        $r.Close()
        if ($rows.Count) { $rows | Format-Table -AutoSize | Out-String -Width 200 | Write-Host }
        else { Write-Host "(no rows)`n" -ForegroundColor Yellow }
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)`n" -ForegroundColor Red
    }
}

# 1. GLCON — current period/year + classification ranges + budget scenarios
Q '1. GLCON — control row (period, year, account-class ranges, budget cols)' @'
SELECT MTH, YR, APPFUNCT,
       REVSTART, REVEND, GRTSTART, GRTEND, EXPSTART, EXPEND,
       CASSTART, CASEND, NASSTART, NASEND,
       CLISTART, CLIEND, NLISTART, NLIEND, EQYSTART, EQYEND,
       BUDCOL1, BUDCOL2, BUDCOL3, MTHBUD
FROM GLCON
'@

# 2. GLMST — chart of accounts sample (active, non-control)
Q '2. GLMST — chart of accounts sample' @'
SELECT FIRST 15 GLACCOUNT, DESCRIPT, FUNCTDESC, ACCNTTYPE, FNKY,
       FUND, ISCAPEXP, HASJOB, ISCONTROL, RECACTIVE
FROM GLMST
WHERE RECACTIVE = 'Y' AND ISCONTROL = 'N'
ORDER BY GLACCOUNT
'@

# 3. Distinct FUNCTDESC (must match the 9 dashboard functions)
Q '3. GLMST.FUNCTDESC distinct values + account counts' @'
SELECT FUNCTDESC, COUNT(*) AS N_ACCTS
FROM GLMST
WHERE RECACTIVE = 'Y'
GROUP BY FUNCTDESC
ORDER BY 2 DESC
'@ 60

# 4. Distinct ACCNTTYPE — figure out the income/expense/asset class encoding
Q '4. GLMST.ACCNTTYPE distinct values + counts (with a sample account each)' @'
SELECT ACCNTTYPE, COUNT(*) AS N, MIN(GLACCOUNT) AS SAMPLE_ACCT, MIN(DESCRIPT) AS SAMPLE_DESC
FROM GLMST
WHERE RECACTIVE = 'Y'
GROUP BY ACCNTTYPE
ORDER BY 1
'@ 40

# 5. GLBAL — distinct MTH values present (is it current-FY only? how many periods?)
Q '5. GLBAL — periods present (row counts by MTH)' @'
SELECT MTH, COUNT(*) AS N_ROWS,
       SUM(DEBIT) AS SUM_DEBIT, SUM(CREDIT) AS SUM_CREDIT
FROM GLBAL
GROUP BY MTH
ORDER BY MTH
'@ 20

# 6. GLBAL — one expense account across all periods: BALANCE cumulative or movement?
#    Pick a real expense account from query 2 output and paste it below.
Q '6. GLBAL — one account across periods (CONFIRM cumulative vs movement)' @'
SELECT b.MTH, b.DEBIT, b.CREDIT, b.BALANCE, b.BUDGET, b.LASTYEAR
FROM GLBAL b
WHERE b.GLACCOUNT = (
    SELECT MIN(GLACCOUNT) FROM GLMST
    WHERE RECACTIVE = 'Y' AND ISCONTROL = 'N' AND HASJOB = 'Y'
)
ORDER BY b.MTH
'@ 20

# 7. THE MONEY SHOT — YTD expense by function at the current period.
#    Uses the latest MTH present in GLBAL. Validate the total against
#    FY26_Note3a_SpendByDepartment.XLS.
Q '7. YTD spend by FUNCTION at latest period (validate vs Note 3a export)' @'
SELECT m.FUNCTDESC,
       SUM(b.DEBIT)  AS TOT_DEBIT,
       SUM(b.CREDIT) AS TOT_CREDIT,
       SUM(b.BALANCE) AS TOT_BALANCE,
       SUM(b.LASTYEAR) AS TOT_LASTYEAR
FROM GLBAL b
JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.MTH = (SELECT MAX(MTH) FROM GLBAL)
  AND m.ISCONTROL = 'N'
GROUP BY m.FUNCTDESC
ORDER BY 4 DESC
'@ 60

# 8. Budget scenarios + whether FY26 budget is actually loaded
Q '8. GLBUDGETS — scenario list' @'
SELECT BUDGET, DESCRIPT, ISMTHBUD, DISPORDER FROM GLBUDGETS ORDER BY DISPORDER
'@ 40

Q '9. GLBUDGETSYR — non-zero rows per scenario (is FY26 budget loaded?)' @'
SELECT BUDGET, COUNT(*) AS N_ROWS,
       SUM(CASE WHEN TOTAL <> 0 THEN 1 ELSE 0 END) AS N_NONZERO,
       SUM(TOTAL) AS SUM_TOTAL
FROM GLBUDGETSYR
GROUP BY BUDGET
ORDER BY BUDGET
'@ 40

# 10. Income statement classification check via GLCON revenue/grant ranges
Q '10. Revenue vs Grants vs Expense totals by GLCON code range (current period)' @'
SELECT
  (SELECT SUM(b.CREDIT - b.DEBIT) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=(SELECT MAX(MTH) FROM GLBAL) AND m.ISCONTROL='N'
       AND b.GLACCOUNT BETWEEN (SELECT REVSTART FROM GLCON) AND (SELECT REVEND FROM GLCON)) AS REVENUE,
  (SELECT SUM(b.CREDIT - b.DEBIT) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=(SELECT MAX(MTH) FROM GLBAL) AND m.ISCONTROL='N'
       AND b.GLACCOUNT BETWEEN (SELECT GRTSTART FROM GLCON) AND (SELECT GRTEND FROM GLCON)) AS GRANTS,
  (SELECT SUM(b.DEBIT - b.CREDIT) FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT=b.GLACCOUNT
     WHERE b.MTH=(SELECT MAX(MTH) FROM GLBAL) AND m.ISCONTROL='N'
       AND b.GLACCOUNT BETWEEN (SELECT EXPSTART FROM GLCON) AND (SELECT EXPEND FROM GLCON)) AS EXPENSES
FROM RDB$DATABASE
'@

# 11. Job costing — register sample + this-FY spend per job
Q '11. JCMST — job register sample' @'
SELECT FIRST 10 JCACCOUNT, JCDESC, JOBTYPE, PYGLACC, RACTIVE, JOBBUDGET
FROM JCMST WHERE RACTIVE = 'Y' ORDER BY JCACCOUNT
'@

Q '12. JCCON — current job-costing period' 'SELECT KY, PERIOD, MAXTRNKY FROM JCCON'

Q '13. JCTRN — periods present + total cost (this FY spend shape)' @'
SELECT PERIOD, COUNT(*) AS N, SUM(TOTCOST) AS TOTCOST
FROM JCTRN GROUP BY PERIOD ORDER BY PERIOD
'@ 60

# 14. FRFUNCTIONS — Practical's own function list (cross-check FUNCTDESC)
Q '14. FRFUNCTIONS — function definitions' 'SELECT FNNO, DESCRIPT FROM FRFUNCTIONS ORDER BY FNNO' 40

$conn.Close()
Write-Host "`nDone." -ForegroundColor Green
