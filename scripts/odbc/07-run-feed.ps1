<#
  07-run-feed.ps1  —  the hands-off feed: build then push, with logging
  ---------------------------------------------------------------------------
  This is what the Windows Scheduled Task runs (as sandsservice on HVASC-APP02).
  It builds the snapshot from Practical and pushes it to the dashboard, writing
  a timestamped log so failures are visible after the fact.

  Usage (and the Scheduled Task action):
      powershell -ExecutionPolicy Bypass -File .\07-run-feed.ps1 -Url https://<app>.vercel.app -Password <pwd>
#>

param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Password = $env:HVASC_UPLOAD_PASSWORD
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("feed-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")

function Log($m) { $line = "$(Get-Date -Format 's')  $m"; $line | Tee-Object -FilePath $log -Append }

try {
  Log "=== HVASC feed run starting ==="
  # 05 now builds the COMPLETE snapshot in one pass — P&L, departments, grants,
  # revenue, monthly + daily trend, transactions, AND the live Balance Sheet.
  Log "Building snapshot from Practical..."
  & (Join-Path $PSScriptRoot '05-build-snapshot.ps1') *>> $log
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "build step exited $LASTEXITCODE" }

  Log "Pushing snapshot to $Url ..."
  & (Join-Path $PSScriptRoot '06-push.ps1') -Url $Url -Password $Password *>> $log
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "push step exited $LASTEXITCODE" }

  Log "=== Feed run OK ==="
} catch {
  Log "!!! FEED RUN FAILED: $($_.Exception.Message)"
  exit 1
}

# Keep only the most recent 30 logs.
Get-ChildItem $logDir -Filter 'feed-*.log' | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 | Remove-Item -Force -ErrorAction SilentlyContinue
