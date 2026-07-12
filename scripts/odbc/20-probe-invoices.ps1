<#
  20-probe-invoices.ps1  -  discover DRINV (debtor invoices) and CRTRN (creditor
                            transactions) so the invoice + supplier-bill reports (B4)
                            can be written against real columns instead of guesses.
  ---------------------------------------------------------------------------
  ONE-OFF PROBE. Not scheduled. Read-only. SELECT only.

  Run it, then send Nathan the file it writes:
      scripts\odbc\probe-invoices.txt

  We already know both tables are readable and that CRTRN carries an ORDERNO.
  What we do NOT know is their column names -- and every Practical trap that has
  cost this project time came from assuming a column instead of looking at it.

  Firebird 1.5 rules this script obeys (they are not optional):
    * SELECT FIRST n     -- there is no TOP and no LIMIT
    * no ABS()           -- it does not exist
    * user tables have RDB$SYSTEM_FLAG = NULL, not 0
    * ASCII only         -- non-ASCII characters break parsing on the server
#>

$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'probe-invoices.txt'
if (Test-Path $out) { Remove-Item $out -Force }

function Log($m) { $m | Tee-Object -FilePath $out -Append }

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus')
$conn.Open()
Log "Connected to Practical_Plus"
Log ""

function Get-Rows($sql) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 120
  $da = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
  $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt)
  # ASSIGN, then return. Piping a returned array hands the WHOLE array over as one
  # object -- that trap once string-joined 914 table names into a single blob and
  # reported the count as "1".
  $rows = @($dt.Rows)
  return $rows
}

foreach ($table in @('DRINV', 'CRTRN', 'DRMST', 'CRMST')) {

  Log "==============================================================="
  Log "TABLE: $table"
  Log "==============================================================="

  # ---- 1. Columns -------------------------------------------------------
  # RDB$RELATION_FIELDS is the column catalogue. RDB$FIELD_SOURCE points at the
  # domain that carries the actual type.
  try {
    $cols = Get-Rows @"
SELECT rf.RDB\$FIELD_NAME AS COLNAME,
       f.RDB\$FIELD_TYPE  AS FTYPE,
       f.RDB\$FIELD_LENGTH AS FLEN,
       f.RDB\$FIELD_SCALE  AS FSCALE
FROM RDB\$RELATION_FIELDS rf
JOIN RDB\$FIELDS f ON f.RDB\$FIELD_NAME = rf.RDB\$FIELD_SOURCE
WHERE rf.RDB\$RELATION_NAME = '$table'
ORDER BY rf.RDB\$FIELD_POSITION
"@
    Log ("  {0} columns:" -f $cols.Count)
    foreach ($c in $cols) {
      $n = ([string]$c.COLNAME).Trim()
      Log ("    {0,-22} type={1,-4} len={2,-6} scale={3}" -f $n, $c.FTYPE, $c.FLEN, $c.FSCALE)
    }
  } catch {
    Log ("  COLUMN READ FAILED: " + $_.Exception.Message)
    Log ""
    continue
  }
  Log ""

  # ---- 2. Row count -----------------------------------------------------
  try {
    $n = Get-Rows "SELECT COUNT(*) AS N FROM $table"
    Log ("  row count: {0}" -f $n[0].N)
  } catch {
    Log ("  COUNT FAILED: " + $_.Exception.Message)
  }
  Log ""

  # ---- 3. Five real rows ------------------------------------------------
  # The column list tells you what exists. The DATA tells you what is actually
  # populated -- which is a different question, and the one that matters. Half of
  # Practical's columns are defined and never filled in (COMMITBAL was zero on all
  # 8,919 order lines; the grant register's date columns are empty on all 89 rows).
  try {
    $sample = Get-Rows "SELECT FIRST 5 * FROM $table"
    Log "  5 sample rows:"
    foreach ($r in $sample) {
      $pairs = @()
      foreach ($c in $r.Table.Columns) {
        $v = $r[$c.ColumnName]
        if ($v -ne $null -and "$v".Trim() -ne '') {
          $pairs += ("{0}={1}" -f $c.ColumnName, ("$v".Trim()))
        }
      }
      Log ("    " + ($pairs -join '  |  '))
      Log ""
    }
  } catch {
    Log ("  SAMPLE FAILED: " + $_.Exception.Message)
  }
  Log ""
}

# ---- 4. The specific questions the reports need answered -----------------
Log "==============================================================="
Log "WHAT THE REPORTS ACTUALLY NEED"
Log "==============================================================="

# An invoice report needs: who, how much, when, paid or not.
# A supplier report needs the same, plus which purchase order it came from.
$questions = @(
  @{ q = "DRINV rows in the last 12 months";
     s = "SELECT COUNT(*) AS N FROM DRINV WHERE INVDATE >= '2025-07-01'" },
  @{ q = "CRTRN rows in the last 12 months";
     s = "SELECT COUNT(*) AS N FROM CRTRN WHERE TRANDATE >= '2025-07-01'" },
  @{ q = "CRTRN rows carrying an ORDERNO (links a bill to a purchase order)";
     s = "SELECT COUNT(*) AS N FROM CRTRN WHERE ORDERNO IS NOT NULL AND ORDERNO <> ''" }
)

foreach ($item in $questions) {
  Log ""
  Log ("Q: " + $item.q)
  try {
    $r = Get-Rows $item.s
    Log ("   -> {0}" -f $r[0].N)
  } catch {
    # A failure here is INFORMATION, not an error. It means the column is named
    # something else -- and the column list printed above will show what.
    Log ("   -> column guess was wrong: " + $_.Exception.Message)
    Log ("      (check the column list above for the real date/order column)")
  }
}

$conn.Close()
Log ""
Log "==============================================================="
Log "DONE. Send Nathan this file: scripts\odbc\probe-invoices.txt"
Log "==============================================================="
Write-Host ""
Write-Host "Wrote $out" -ForegroundColor Green
Write-Host "Send that file to Nathan." -ForegroundColor Green
