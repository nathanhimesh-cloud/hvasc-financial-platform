<#
  20-probe-invoices.ps1  -  discover DRINV (debtor invoices) and CRTRN (creditor
                            transactions) so the invoice + supplier-bill reports (B4)
                            can be written against real columns instead of guesses.
  ---------------------------------------------------------------------------
  ONE-OFF PROBE. Not scheduled. Read-only. SELECT only.

  Run it, then send Nathan the file it writes:
      scripts\odbc\probe-invoices.txt

  ---------------------------------------------------------------------------
  WHY v2: the first version of this script failed on every table.

  It queried the RDB$ system catalogue and wrote RDB\$FIELD_NAME inside a
  double-quoted here-string. In PowerShell the escape character is a BACKTICK, not
  a backslash -- so the backslash went to Firebird literally and it died with
  "Token unknown - line 1, column 14", which is exactly where the RDB\$ sits.

  The fix is better than escaping it correctly: DON'T QUERY THE CATALOGUE AT ALL.
  `SELECT FIRST 1 *` hands back a DataTable that already knows its own column
  names and types. The system catalogue was never needed.

  It also wrote UTF-16 (Tee-Object's default), which is why the output arrived as
  s p a c e d   o u t   l e t t e r s. Forced to ASCII below.
  ---------------------------------------------------------------------------

  Firebird 1.5 rules this script obeys (they are not optional):
    * SELECT FIRST n     -- there is no TOP and no LIMIT
    * no ABS()           -- it does not exist
    * ASCII only         -- non-ASCII characters break parsing on the server
#>

$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'probe-invoices.txt'
if (Test-Path $out) { Remove-Item $out -Force }

# ASCII, explicitly. Tee-Object defaults to UTF-16 and the file comes back unreadable.
function Log($m) {
  Write-Host $m
  $m | Out-File -FilePath $out -Append -Encoding ascii
}

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus')
$conn.Open()
Log "Connected to Practical_Plus"
Log ""

# Returns the DataTable itself, so the caller can read .Columns AND .Rows.
function Get-Table($sql) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 180
  $da = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
  $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt)
  return ,$dt          # comma stops PowerShell unrolling the table into rows
}

foreach ($table in @('DRINV', 'CRTRN', 'DRMST', 'CRMST', 'DRTRN')) {

  Log "==============================================================="
  Log "TABLE: $table"
  Log "==============================================================="

  # ---- Row count --------------------------------------------------------
  try {
    $c = Get-Table "SELECT COUNT(*) AS N FROM $table"
    Log ("  row count: {0}" -f $c.Rows[0].N)
  } catch {
    Log ("  TABLE NOT READABLE: " + $_.Exception.Message.Split("`n")[0])
    Log ""
    continue
  }

  # ---- Columns, straight off the result set ------------------------------
  # No system catalogue, no escaping, nothing to get wrong.
  try {
    $dt = Get-Table "SELECT FIRST 5 * FROM $table"

    Log ("  {0} columns:" -f $dt.Columns.Count)
    foreach ($col in $dt.Columns) {
      Log ("    {0,-22} {1}" -f $col.ColumnName, $col.DataType.Name)
    }
    Log ""

    # ---- What is actually POPULATED ---------------------------------------
    # The column list says what EXISTS. This says what is FILLED IN, which is a
    # different question and the one that matters. Practical is full of columns
    # that are defined and never used: COMMITBAL was zero on all 8,919 order
    # lines, and the grant register's date columns are empty on all 89 rows.
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

$conn.Close()
Log "==============================================================="
Log "DONE. Send Nathan this file: scripts\odbc\probe-invoices.txt"
Log "==============================================================="
Write-Host ""
Write-Host "Wrote $out" -ForegroundColor Green
Write-Host "Send that file to Nathan." -ForegroundColor Green
