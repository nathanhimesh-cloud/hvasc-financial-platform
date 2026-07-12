<#
  21-probe-debtors.ps1  -  find where debtor (customer) invoice history actually lives.
  ---------------------------------------------------------------------------
  ONE-OFF PROBE. Not scheduled. Read-only. SELECT only.

  Run it, then send Nathan:  scripts\odbc\probe-debtors.txt

  ---------------------------------------------------------------------------
  WHAT PROBE 20 TAUGHT US, AND WHY THIS ONE EXISTS

  Probe 20 found the creditor side is perfect: CRTRN has 205,597 rows going back to
  2005, with dates, references, suppliers, due dates, pay dates, payment status and
  an ORDERNO linking each bill to its purchase order. The supplier-bill report can be
  built from that alone.

  The DEBTOR side was a dead end, twice over:

    * DRINV has TWO ROWS. Not 59,527 -- two. One of them literally says
      SUMMARY=Test, and both are RECACTIVE=N. It is a data-ENTRY staging table,
      not a history table. Anyone building an "invoice report" on it would ship a
      page showing one test invoice.

    * DRTRN does not exist. That was my guess at the name and it was wrong.

  The real table is DRTRAN (one letter different), and there are three other
  candidates worth a look. This probe reads all four so the customer-invoice report
  gets built against the table that actually holds the invoices.

  Firebird 1.5: SELECT FIRST (no TOP/LIMIT), no ABS(), ASCII only.
#>

$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'probe-debtors.txt'
if (Test-Path $out) { Remove-Item $out -Force }

# ASCII. Tee-Object writes UTF-16 by default and the file comes back as spaced-out letters.
function Log($m) {
  Write-Host $m
  $m | Out-File -FilePath $out -Append -Encoding ascii
}

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus')
$conn.Open()
Log "Connected to Practical_Plus"
Log ""

function Get-Table($sql) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 180
  $da = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
  $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt)
  return ,$dt          # the comma stops PowerShell unrolling the table into rows
}

# DRTRAN is the likely one. The others are read so we choose on evidence rather
# than on the most plausible-sounding name -- which is exactly how DRINV wasted a run.
foreach ($table in @('DRTRAN', 'DRACCTRAN', 'DRPAYHIST', 'DRINVGL')) {

  Log "==============================================================="
  Log "TABLE: $table"
  Log "==============================================================="

  try {
    $c = Get-Table "SELECT COUNT(*) AS N FROM $table"
    Log ("  row count: {0}" -f $c.Rows[0].N)
  } catch {
    Log ("  TABLE NOT READABLE: " + $_.Exception.Message.Split("`n")[0])
    Log ""
    continue
  }

  try {
    $dt = Get-Table "SELECT FIRST 5 * FROM $table"

    Log ("  {0} columns:" -f $dt.Columns.Count)
    foreach ($col in $dt.Columns) {
      Log ("    {0,-22} {1}" -f $col.ColumnName, $col.DataType.Name)
    }
    Log ""

    # The column list says what EXISTS. The rows say what is FILLED IN -- a
    # different question, and the one that matters. DRINV has 23 perfectly good
    # columns and two rows of test data.
    Log "  5 sample rows (empty columns omitted):"
    $n = 0
    foreach ($r in $dt.Rows) {
      $n++
      $pairs = @()
      foreach ($col in $dt.Columns) {
        $v = $r[$col.ColumnName]
        if ($null -ne $v -and "$v".Trim() -ne '' -and "$v" -ne 'System.DBNull') {
          $pairs += ("{0}={1}" -f $col.ColumnName, "$v".Trim())
        }
      }
      Log ("    [$n] " + ($pairs -join '  |  '))
      Log ""
    }
  } catch {
    Log ("  SAMPLE FAILED: " + $_.Exception.Message.Split("`n")[0])
  }
  Log ""
}

# ---- The creditor side: what do the type/status codes mean? ----------------
# CRTRN.TRNT was D, W and I in the sample, and HOLDPAYMENT was PAID and CANC.
# A supplier-bill report has to filter on these, and guessing what they mean is
# how you accidentally report cancelled cheques as money owed.
Log "==============================================================="
Log "CRTRN CODE MEANINGS - needed before the report can filter correctly"
Log "==============================================================="

foreach ($q in @(
  @{ label = 'TRNT (transaction type)';    sql = 'SELECT TRNT AS CODE, COUNT(*) AS N FROM CRTRN GROUP BY TRNT ORDER BY 2 DESC' },
  @{ label = 'HOLDPAYMENT (status)';       sql = 'SELECT HOLDPAYMENT AS CODE, COUNT(*) AS N FROM CRTRN GROUP BY HOLDPAYMENT ORDER BY 2 DESC' },
  @{ label = 'PAYTYPE';                    sql = 'SELECT PAYTYPE AS CODE, COUNT(*) AS N FROM CRTRN GROUP BY PAYTYPE ORDER BY 2 DESC' }
)) {
  Log ""
  Log ("-- " + $q.label)
  try {
    $dt = Get-Table $q.sql
    foreach ($r in $dt.Rows) {
      $code = "$($r.CODE)".Trim()
      if ($code -eq '') { $code = '(blank)' }
      Log ("    {0,-12} {1,8} rows" -f $code, $r.N)
    }
  } catch {
    Log ("    FAILED: " + $_.Exception.Message.Split("`n")[0])
  }
}

# How much of CRTRN is recent? A report over 21 years of history is useless;
# we need to know the last 12 months is a sane volume.
Log ""
Log "-- CRTRN volume by financial year (last few)"
try {
  $dt = Get-Table @'
SELECT FIRST 8 EXTRACT(YEAR FROM TRNDATE) AS YR, COUNT(*) AS N
FROM CRTRN
GROUP BY EXTRACT(YEAR FROM TRNDATE)
ORDER BY 1 DESC
'@
  foreach ($r in $dt.Rows) { Log ("    {0}  {1,8} rows" -f $r.YR, $r.N) }
} catch {
  Log ("    FAILED: " + $_.Exception.Message.Split("`n")[0])
}

$conn.Close()
Log ""
Log "==============================================================="
Log "DONE. Send Nathan: scripts\odbc\probe-debtors.txt"
Log "==============================================================="
Write-Host ""
Write-Host "Wrote $out" -ForegroundColor Green
