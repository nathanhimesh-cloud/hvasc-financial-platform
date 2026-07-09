<#
  09-probe-jcmst.ps1  -  READ-ONLY: does JCMST have the columns the job budget
                          report needs?
  ---------------------------------------------------------------------------
  Run this BEFORE 05 the first time, to confirm the job register is readable and
  to see which optional columns this Practical build actually has.

      powershell -ExecutionPolicy Bypass -File .\09-probe-jcmst.ps1

  The DSN "Practical_Plus" stores its own Firebird login - that is how the
  scheduled task has always run unattended, with PRACTICAL_PWD unset and 05
  building its connection string as "PWD=;". So we try the DSN on its own FIRST.
  Supplying a password only overrides (and can break) a login that already works.

  A password is used only if the DSN alone is refused:
    1. the PRACTICAL_PWD environment variable
    2. -PasswordFile <path>, a text file holding only the password
    3. an interactive prompt

  In the legacy console, Ctrl+V does NOT paste - right-click does, and RDP
  clipboard sharing must be on.

  SELECT only. Touches nothing.
#>

param(
  # A file containing ONLY the password. Only needed if the DSN is refused.
  [string]$PasswordFile
)

$ErrorActionPreference = 'Stop'

function Open-Practical {
  # 1. The DSN's own stored login. This is the path the scheduled task uses.
  try {
    $c = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;')
    $c.Open()
    Write-Host "CONNECTED via the DSN's own login (no password needed)." -ForegroundColor Green
    return $c
  } catch {
    Write-Host "DSN alone was refused: $($_.Exception.Message)" -ForegroundColor Yellow
  }

  # 2. Fall back to an explicit login.
  $dbPwd = $env:PRACTICAL_PWD
  if (-not $dbPwd) { $dbPwd = [Environment]::GetEnvironmentVariable('PRACTICAL_PWD', 'Machine') }
  if ((-not $dbPwd) -and $PasswordFile) {
    if (-not (Test-Path $PasswordFile)) { throw "PasswordFile not found: $PasswordFile" }
    $dbPwd = (Get-Content $PasswordFile -Raw).Trim()   # Trim strips the editor's trailing CRLF
  }
  $tries = 0
  while ((-not $dbPwd) -and $tries -lt 3) {
    $tries++
    Write-Host "Right-click to paste (Ctrl+V does nothing here)." -ForegroundColor DarkGray
    $sec = Read-Host 'Practical password (PCSACCESS)' -AsSecureString
    $dbPwd = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
               [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    if (-not $dbPwd) { Write-Host "  nothing received - try again ($tries of 3)" -ForegroundColor Yellow }
  }
  if (-not $dbPwd) { throw 'The DSN was refused and no password was supplied.' }
  Write-Host ("Trying an explicit login, password length {0}" -f $dbPwd.Length) -ForegroundColor DarkGray

  # Concatenated, never interpolated: the password may contain $ & ( \ which a
  # double-quoted PowerShell string would expand.
  $c = New-Object System.Data.Odbc.OdbcConnection('DSN=Practical_Plus;UID=PCSACCESS;PWD=' + $dbPwd + ';')
  $c.Open()
  Write-Host "CONNECTED with an explicit login." -ForegroundColor Green
  return $c
}

$conn = Open-Practical
Write-Host ("Server: {0}" -f $conn.ServerVersion) -ForegroundColor Green

function Get-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Sql
  $r = $cmd.ExecuteReader()
  $rows = @()
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $v = $r.GetValue($i)
      $o[$r.GetName($i)] = $(if ($v -is [DBNull]) { $null } else { $v })
    }
    $rows += [pscustomobject]$o
  }
  $r.Close()
  return ,$rows
}

# -- 1. which columns does JCMST have? ---------------------------------------
$cols = @()
foreach ($c in (Get-Rows @'
SELECT RDB$FIELD_NAME AS FLD FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'JCMST'
'@)) { $cols += ([string]$c.FLD).Trim().ToUpper() }

Write-Host ""
Write-Host ("JCMST has {0} columns:" -f $cols.Count) -ForegroundColor Cyan
Write-Host ("  " + ($cols -join ', '))

Write-Host ""
Write-Host "What the job budget report needs:" -ForegroundColor Cyan
# JOBBUDGET is a Y/N FLAG, not an amount - the money is in the estimate columns.
$needed = [ordered]@{
  'JCACCOUNT' = 'REQUIRED - the job code'
  'PYGLACC'   = 'IMPORTANT - groups each job under its GL account'
  'JCDESC'    = 'job name'
  'RACTIVE'   = 'active flag'
  'NEWEST'    = 'current estimate = the job budget we use'
  'ESTIMATE'  = 'original estimate (fallback)'
  'COMTOT'    = 'committed (expect 0 - Hope Vale does not record these)'
}
foreach ($k in $needed.Keys) {
  $has = $cols -contains $k
  $mark = $(if ($has) { 'YES' } else { 'no ' })
  $col  = $(if ($has) { 'Green' } else { 'Yellow' })
  Write-Host ("  [{0}] {1,-10} {2}" -f $mark, $k, $needed[$k]) -ForegroundColor $col
}

# -- 2. how many jobs, and do the codes line up with JCTRN? -------------------
Write-Host ""
$n = (Get-Rows 'SELECT COUNT(*) AS N FROM JCMST')[0].N
Write-Host ("JCMST rows: {0}" -f $n) -ForegroundColor Cyan

if ($cols -contains 'PYGLACC') {
  $sample = Get-Rows @'
SELECT FIRST 5 JCACCOUNT, JCDESC, PYGLACC FROM JCMST ORDER BY JCACCOUNT
'@
  Write-Host "Sample (job code -> GL account):" -ForegroundColor Cyan
  foreach ($s in $sample) {
    Write-Host ("  {0}  {1,-32}  -> {2}" -f `
      ([string]$s.JCACCOUNT).Trim(), ([string]$s.JCDESC).Trim(), ([string]$s.PYGLACC).Trim())
  }
}

# -- 3. are the estimate columns really the budget? ---------------------------
# Cross-check against the FY26 "Total Job Costs" report, whose Estimates grand
# totals were: Original 18,737,856.00   Current 19,528,856.00
if (($cols -contains 'NEWEST') -and ($cols -contains 'ESTIMATE')) {
  Write-Host ""
  $e = (Get-Rows 'SELECT COUNT(*) AS N, SUM(ESTIMATE) AS ORIG, SUM(NEWEST) AS CUR FROM JCMST WHERE ESTIMATE <> 0 OR NEWEST <> 0')[0]
  Write-Host "Jobs carrying an estimate (= the job budget):" -ForegroundColor Cyan
  Write-Host ("  jobs: {0}" -f $e.N)
  Write-Host ("  SUM(ESTIMATE)  original : {0:N2}" -f [double]$e.ORIG)
  Write-Host ("  SUM(NEWEST)    current  : {0:N2}" -f [double]$e.CUR)
  Write-Host "  (FY26 report showed original 18,737,856.00 / current 19,528,856.00)" -ForegroundColor DarkGray
}

# JOBBUDGET is a flag - prove it, so nobody re-adds it as an amount later.
if ($cols -contains 'JOBBUDGET') {
  Write-Host ""
  Write-Host "JCMST.JOBBUDGET distinct values (expect Y / N, NOT amounts):" -ForegroundColor Cyan
  foreach ($v in (Get-Rows 'SELECT JOBBUDGET, COUNT(*) AS N FROM JCMST GROUP BY JOBBUDGET')) {
    Write-Host ("  '{0}' x {1}" -f ([string]$v.JOBBUDGET).Trim(), $v.N)
  }
}

$conn.Close()
Write-Host ""
Write-Host "Done. Nothing was written." -ForegroundColor Green
