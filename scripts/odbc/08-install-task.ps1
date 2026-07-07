<#
  08-install-task.ps1  —  install the thrice-daily feed as a Windows Scheduled Task
  ---------------------------------------------------------------------------
  Registers a task on HVASC-APP02 that runs 07-run-feed.ps1 (build + balance
  sheet + push) at three times each day, as the service account, whether or not
  anyone is logged in.
  Also stores the two secrets it needs as machine environment variables so the
  unattended run can read them (nothing secret is written into the task itself).

  Run ONCE, interactively, as an administrator on HVASC-APP02:

      powershell -ExecutionPolicy Bypass -File .\08-install-task.ps1 `
          -Url https://<your-app>.vercel.app

  It will prompt (securely) for:
    - the read-only Practical DB password  (-> PRACTICAL_PWD)
    - the website UPLOAD_PASSWORD          (-> HVASC_UPLOAD_PASSWORD)
    - the service-account password         (to run the task as sandsservice)

  Defaults to 06:00, 12:30 and 18:00 (Hope Vale time / AEST — QLD has no DST).
  Change with  -Times "07:00","12:30","19:00".
#>

param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$TaskName = "HVASC Financial Feed",
  [string]$ServiceAccount = "hvasc\sandsservice",
  [string[]]$Times = @("06:00", "12:30", "18:00"),
  [string]$ScriptDir = ""
)

$ErrorActionPreference = "Stop"

# $PSScriptRoot can be empty as a param default on Windows PowerShell 4.0, so
# resolve the script's own folder here instead.
if (-not $ScriptDir) {
  $ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
}

# ── 1. store the two secrets as machine env vars (read by 05 and 06) ─────────
function Set-MachineSecret([string]$Name, [string]$Prompt) {
  $sec = Read-Host -AsSecureString -Prompt $Prompt
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  [Environment]::SetEnvironmentVariable($Name, $plain, "Machine")
  Write-Host "  set $Name (machine scope)" -ForegroundColor DarkGray
}
Write-Host "Storing secrets as machine environment variables..." -ForegroundColor Cyan
Set-MachineSecret "PRACTICAL_PWD"         "Read-only Practical DB password (PCSACCESS)"
Set-MachineSecret "HVASC_UPLOAD_PASSWORD" "Website UPLOAD_PASSWORD (must match Vercel)"

# ── 2. build the task ────────────────────────────────────────────────────────
$feed = Join-Path $ScriptDir "07-run-feed.ps1"
if (-not (Test-Path $feed)) { throw "Can't find 07-run-feed.ps1 next to this script ($feed)." }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$feed`" -Url `"$Url`"" `
  -WorkingDirectory $ScriptDir

# One daily trigger per time → runs twice a day.
$triggers = @($Times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew

# ── 3. register it as the service account (prompts for its password) ─────────
$cred = Get-Credential -UserName $ServiceAccount `
  -Message "Password for $ServiceAccount (runs the scheduled task)"

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
  -Settings $settings -RunLevel Highest -Force `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password | Out-Null

Write-Host "`nInstalled '$TaskName' - runs daily at $($Times -join ' and ')." -ForegroundColor Green
Write-Host "Test it now with:" -ForegroundColor Cyan
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Logs go to: $ScriptDir\logs"
