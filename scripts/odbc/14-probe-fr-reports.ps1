<#
  14-probe-fr-reports.ps1  -  READ-ONLY: which report is the Cash Flow Statement?
  ---------------------------------------------------------------------------
  FRSECTION/FRLINE/FRACCNTLINK are keyed by RPTKY (a report id). There are many
  reports. Before building the Cash Flow we must know its RPTKY - guessing would
  produce a confident, wrong statement.

  This lists every report with its section headings, so the Cash Flow report is
  identifiable by eye. It then dumps that report's full section -> line ->
  account tree for whichever RPTKY you pass in.

  Everything printed is ALSO written to a text file (default: fr-report-dump.txt
  next to this script), so you can drop it into the repo and I can read it
  directly instead of from a screenshot.

  Step 1 - list the reports:
      powershell -ExecutionPolicy Bypass -File .\14-probe-fr-reports.ps1
      -> writes fr-reports-list.txt

  Step 2 - dump the Cash Flow report's tree once you've found its number:
      powershell -ExecutionPolicy Bypass -File .\14-probe-fr-reports.ps1 -Rptky <number>
      -> writes fr-report-<number>.txt

  SELECT only. Touches nothing.
#>

param(
  [int]$Rptky = 0,
  [string]$OutFile = ""
)

$ErrorActionPreference = 'Stop'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $OutFile) {
  $OutFile = if ($Rptky -le 0) { Join-Path $scriptDir 'fr-reports-list.txt' }
             else               { Join-Path $scriptDir ("fr-report-{0}.txt" -f $Rptky) }
}

# Log = print to screen (for live feedback) AND buffer for the text file.
$script:buffer = New-Object System.Collections.Generic.List[string]
function Log([string]$msg = "", [string]$color = "") {
  if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg }
  $script:buffer.Add($msg)
}
function Save-Out {
  [System.IO.File]::WriteAllText($OutFile, ($script:buffer -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ""
  Write-Host ("Saved to: {0}" -f $OutFile) -ForegroundColor Green
  Write-Host "Copy that file into the repo and tell me - I'll read it." -ForegroundColor Green
}

$conn = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;')
$conn.Open()
Log ("CONNECTED - {0}" -f $conn.ServerVersion) 'Green'

function Get-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $null
      try { $v = $r.GetValue($i) } catch { try { $v = $r.GetString($i) } catch { $v = $null } }
      $o[$r.GetName($i)] = $(if ($v -is [DBNull]) { $null } else { $v })
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}
function TryGet([string]$Sql) { try { return Get-Rows $Sql } catch { return $null } }

if ($Rptky -le 0) {
  # -- Is there a report-master table with report names? ----------------------
  Log ""
  Log "Looking for a report-master table..." 'Cyan'
  foreach ($t in @('FRREPORT','FRREPORTS','FRRPT','FRFUNCTIONS','FRDEF')) {
    $rows = TryGet "SELECT FIRST 40 * FROM $t"
    if ($null -ne $rows -and $rows.Count) {
      Log ("  $t is readable ({0} sample rows). Columns:" -f $rows.Count) 'Green'
      Log ("    " + (($rows[0].PSObject.Properties | ForEach-Object { $_.Name.Trim() }) -join ', '))
      foreach ($r in $rows) {
        $pairs = @()
        foreach ($p in $r.PSObject.Properties) {
          $v = [string]$p.Value; if ($v.Length -gt 40) { $v = $v.Substring(0,40)+'...' }
          if ($p.Name.Trim() -match 'KY|NO|NAME|TITLE|DESC|TYPE') { $pairs += ("{0}={1}" -f $p.Name.Trim(), $v) }
        }
        Log ("    " + ($pairs -join '  '))
      }
    }
  }

  # -- Fallback: group FRSECTION by report, showing section titles ------------
  Log ""
  Log "Reports present in FRSECTION, with their section headings:" 'Cyan'
  Log "(Look for one whose sections read like a Cash Flow: 'Operating activities',"
  Log " 'Investing activities', 'Financing activities', 'Cash at end of period'.)"
  $secs = Get-Rows @'
SELECT RPTKY, SECTNO, TITLE, TOTALDESC FROM FRSECTION ORDER BY RPTKY, SECTNO
'@
  $curRpt = -1
  foreach ($s in $secs) {
    $rk = [int]$s.RPTKY
    if ($rk -ne $curRpt) { Log ""; Log ("  RPTKY {0}" -f $rk) 'Yellow'; $curRpt = $rk }
    $title = ([string]$s.TITLE).Trim()
    $tot   = ([string]$s.TOTALDESC).Trim()
    $label = if ($title) { $title } elseif ($tot) { "(total: $tot)" } else { "(untitled)" }
    Log ("      {0,3}  {1}" -f [int]$s.SECTNO, $label)
  }
  Log ""
  Log "NEXT: find the Cash Flow report above, then re-run with -Rptky <its number>." 'Green'

} else {
  # -- Dump one report's full tree --------------------------------------------
  Log ""
  Log ("Full tree for RPTKY {0}:" -f $Rptky) 'Cyan'
  $sections = Get-Rows "SELECT KY, SECTNO, SECTTYPE, TITLE, TOTALDESC, SHOWTOTAL FROM FRSECTION WHERE RPTKY = $Rptky ORDER BY SECTNO"
  foreach ($s in $sections) {
    $sky = [int]$s.KY
    Log ""
    Log ("  SECTION {0} [KY {1}, type {2}]  {3}" -f [int]$s.SECTNO, $sky, [int]$s.SECTTYPE, ([string]$s.TITLE).Trim()) 'Yellow'
    if (([string]$s.TOTALDESC).Trim()) { Log ("           total: {0}" -f ([string]$s.TOTALDESC).Trim()) }

    $lines = Get-Rows "SELECT KY, LINENO, CALCTYPE, LINETYPE, DESCRIPT FROM FRLINE WHERE SECTKY = $sky ORDER BY LINENO"
    foreach ($ln in $lines) {
      $lky = [int]$ln.KY
      Log ("      line {0,3} [KY {1}, calc {2}, type {3}]  {4}" -f [int]$ln.LINENO, $lky, ([string]$ln.CALCTYPE).Trim(), [int]$ln.LINETYPE, ([string]$ln.DESCRIPT).Trim())
      $accts = Get-Rows "SELECT GLACCOUNT, INVERT, TRANTYPE, COMPONENT FROM FRACCNTLINK WHERE LNKY = $lky ORDER BY GLACCOUNT"
      foreach ($a in $accts) {
        Log ("          {0}  invert={1} trantype={2} comp={3}" -f ([string]$a.GLACCOUNT).Trim(), ([string]$a.INVERT).Trim(), ([string]$a.TRANTYPE).Trim(), ([string]$a.COMPONENT).Trim())
      }
    }
  }
}

$conn.Close()
Log ""
Log "Done. Nothing was written to Practical." 'Green'
Save-Out
