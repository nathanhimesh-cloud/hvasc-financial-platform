<#
  22-probe-bs-recon.ps1  -  diagnose the balance-sheet line variances an
                           independent reviewer found (System Reports vs Dashboard V5).
  ---------------------------------------------------------------------------
  ONE-OFF PROBE. Not scheduled. Read-only. SELECT only.

  Run it, then send Nathan:  scripts\odbc\probe-bs-recon.txt

  ---------------------------------------------------------------------------
  THE QUESTION THIS ANSWERS

  A line-by-line reconciliation found the dashboard's balance sheet is ~$42,000 off
  Practical's, concentrated in six accounts. The biggest:

     Account 0405-5000 Accounts Payable - Control
        dashboard shows  +220,495.43
        reviewer says Practical is -15,846.94  (opening 110,146 less 125,992 July payments)

  The dashboard reads GLBAL.BALANCE at the current period. So there are only two
  possibilities, and this probe decides between them:

    (A) GLBAL.BALANCE really is +220,495 in Practical. Then GLBAL is OUT OF STEP with
        the live transactions (GLTRN) -- the July payment run posted to GLTRN but
        GLBAL hasn't caught up. The dashboard is faithfully reporting a stale GLBAL.
        FIX: derive the balance from opening + GLTRN movement instead of GLBAL.

    (B) GLBAL.BALANCE is -15,847 (correct) but the dashboard shows +220,495. Then the
        BUG IS OURS -- a sign or period error in the balance-sheet builder.
        FIX: in 05-build-snapshot.ps1.

  For each flagged account the probe prints, side by side:
    * GLBAL.BALANCE at the current period      <- what the dashboard reads
    * GLBAL.LASTYEAR at period 12              <- last year's close = this year's opening
    * SUM of GLTRN debit/credit this FY         <- the live movement
    * opening + live movement                   <- the "true" current balance
  If GLBAL.BALANCE == opening+movement, the data is self-consistent and the bug is
  ours. If they DIFFER, GLBAL is stale and that is the whole story.

  Firebird 1.5: SELECT FIRST (no TOP/LIMIT), no ABS(), ASCII only.
#>

$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'probe-bs-recon.txt'
if (Test-Path $out) { Remove-Item $out -Force }
function Log($m) { Write-Host $m; $m | Out-File -FilePath $out -Append -Encoding ascii }

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus')
$conn.Open()
Log "Connected to Practical_Plus"

function Get-Rows($sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 120
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null; try { $v = $r.GetValue($i) } catch { $v = $null }
      $o[$r.GetName($i)] = ($(if ($v -is [DBNull]) { $null } else { $v }))
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}
function N($x) { if ($null -eq $x -or $x -is [DBNull]) { return 0.0 } return [double]$x }

$cur = [int](Get-Rows 'SELECT MTH FROM GLCON')[0].MTH
$yr  = [int](Get-Rows 'SELECT YR FROM GLCON')[0].YR
$fyStart = ("{0}-07-01" -f ($yr - 1))
$fyEnd   = ("{0}-06-30" -f $yr)
Log ("Period: MTH {0}, YR {1}  (FY {2} to {3})" -f $cur, $yr, $fyStart, $fyEnd)
Log ""

# The six accounts the reconciliation flagged, with the dashboard figure for context.
$accts = @(
  @{ code = '0405-5000-0000'; name = 'Accounts Payable - Control'; dash = 220495.43;  practical = -15846.94 }
  @{ code = '0415-5000-0000'; name = 'Payroll Suspense';           dash = -102915.92; practical = 5285.48 }
  @{ code = '0407-5000-0000'; name = 'Accrued Creditors';          dash = -303076.65; practical = -140360.37 }
  @{ code = '0130-3000-0000'; name = 'Accounts Receivable - General'; dash = 1961443.54; practical = 1876055.95 }
  @{ code = '0105-3000-0000'; name = 'Cash at Bank';               dash = 1172338.73; practical = 1292173.50 }
  @{ code = '0115-3000-0000'; name = 'ANZ Cash at Bank';           dash = 1141658.76; practical = 1141658.76 }
)

foreach ($a in $accts) {
  $code = $a.code
  Log "==============================================================="
  Log ("ACCOUNT {0}  {1}" -f $code, $a.name)
  Log "==============================================================="

  # 1. GLBAL across every month of this FY, plus the account type.
  $gl = Get-Rows @"
SELECT b.MTH,
       CAST(b.BALANCE  AS DOUBLE PRECISION) AS BAL,
       CAST(b.DEBIT    AS DOUBLE PRECISION) AS DR,
       CAST(b.CREDIT   AS DOUBLE PRECISION) AS CR,
       CAST(b.LASTYEAR AS DOUBLE PRECISION) AS LY,
       m.ACCNTTYPE, m.ISCONTROL
FROM GLBAL b JOIN GLMST m ON m.GLACCOUNT = b.GLACCOUNT
WHERE b.GLACCOUNT = '$code'
ORDER BY b.MTH
"@
  if (-not $gl.Count) { Log "  (no GLBAL rows for this account)"; Log ""; continue }
  Log ("  type ACCNTTYPE={0}  ISCONTROL={1}" -f $gl[0].ACCNTTYPE, ([string]$gl[0].ISCONTROL).Trim())
  Log "  MTH   BALANCE          DEBIT           CREDIT          LASTYEAR"
  $balCur = 0.0; $lyClose = 0.0
  foreach ($g in $gl) {
    $mth = [int]$g.MTH
    Log ("  {0,3}   {1,14:N2}  {2,14:N2}  {3,14:N2}  {4,14:N2}" -f $mth, (N $g.BAL), (N $g.DR), (N $g.CR), (N $g.LY))
    if ($mth -eq $cur) { $balCur = (N $g.BAL) }
    if ($mth -eq 12)   { $lyClose = (N $g.LY) }   # last year's close at period 12 = opening
  }

  # 2. GLTRN live movement this FY.
  $tr = Get-Rows @"
SELECT COUNT(*) AS N,
       SUM(CAST(t.DEBIT  AS DOUBLE PRECISION)) AS DR,
       SUM(CAST(t.CREDIT AS DOUBLE PRECISION)) AS CR
FROM GLTRN t
WHERE t.GLACCOUNT = '$code' AND t.TRNDATE >= '$fyStart' AND t.TRNDATE <= '$fyEnd'
"@
  $trN = [int](N $tr[0].N); $trDr = (N $tr[0].DR); $trCr = (N $tr[0].CR)
  $trNet = $trDr - $trCr

  Log ""
  Log ("  GLBAL.BALANCE at MTH {0}            : {1,14:N2}   <- what the dashboard reads" -f $cur, $balCur)
  Log ("  GLBAL.LASTYEAR at MTH 12 (opening)  : {0,14:N2}" -f $lyClose)
  Log ("  GLTRN this FY: {0} txns, DR {1:N2}, CR {2:N2}, net {3:N2}" -f $trN, $trDr, $trCr, $trNet)
  Log ("  opening + GLTRN net                 : {0,14:N2}   <- the 'live' current balance" -f ($lyClose + $trNet))
  Log ""
  Log ("  For reference -- dashboard shows {0:N2}; reviewer says Practical is {1:N2}." -f $a.dash, $a.practical)

  # 3. The verdict for this account.
  $matchesGlbal = [math]::Abs($balCur - $a.dash) -lt 1
  $glbalVsLive  = [math]::Abs($balCur - ($lyClose + $trNet))
  Log ""
  if ($matchesGlbal) {
    Log "  => GLBAL.BALANCE matches the dashboard, so the dashboard is reading GLBAL faithfully."
    if ($glbalVsLive -ge 1) {
      Log ("     GLBAL.BALANCE and opening+GLTRN DIFFER by {0:N2}." -f $glbalVsLive)
      Log "     => CASE A: GLBAL is out of step with the live transactions. The fix is to"
      Log "        derive the balance from opening + GLTRN movement, not GLBAL.BALANCE."
    } else {
      Log "     GLBAL.BALANCE and opening+GLTRN AGREE. The GL is self-consistent, so the"
      Log "     reviewer's Practical figure came from a different report/period -- compare."
    }
  } else {
    Log "  => GLBAL.BALANCE does NOT match the dashboard figure. CASE B: the bug is in our"
    Log "     balance-sheet builder (sign or period). Fixable in 05-build-snapshot.ps1."
  }
  Log ""
}

$conn.Close()
Log "==============================================================="
Log "DONE. Send Nathan: scripts\odbc\probe-bs-recon.txt"
Log "==============================================================="
Write-Host ""
Write-Host "Wrote $out" -ForegroundColor Green
