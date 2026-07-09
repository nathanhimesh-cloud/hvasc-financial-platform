<#
  06-push.ps1  -  push snapshot.json to the dashboard's runtime store
  ---------------------------------------------------------------------------
  PUTs the snapshot produced by 05-build-snapshot.ps1 to /api/feed/snapshot on
  the live site, which writes it to Vercel Blob. The dashboard then serves it
  immediately (no redeploy).

  Usage:
      .\06-push.ps1 -Url https://<your-app>.vercel.app -Password <UPLOAD_PASSWORD>
      # optional: -File <path to snapshot.json>  (default: next to this script)

  Set UPLOAD_PASSWORD as an env var on Vercel AND pass the same value here.
#>

param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Password = $env:HVASC_UPLOAD_PASSWORD,
  [string]$File = ""
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is empty in a param default on Windows PowerShell 4.0, so resolve
# the script's own folder here (same fix as 08-install-task.ps1) and default the
# snapshot path from it. This is what caused the scheduled push to die at
# Join-Path before it ever attempted the PUT.
if (-not $File) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $File = Join-Path $scriptDir 'snapshot.json'
}

if (-not (Test-Path $File)) { throw "Snapshot file not found: $File. Run 05-build-snapshot.ps1 first." }
$endpoint = ($Url.TrimEnd('/')) + '/api/feed/snapshot'

# -- Prefer curl.exe if it's here ----------------------------------------------
# Windows Server 2012 R2's SChannel can no longer negotiate TLS with Vercel, so
# .NET's Invoke-RestMethod fails with "Could not create SSL/TLS secure channel".
# An OpenSSL-based curl.exe carries its own TLS stack and bypasses SChannel.
# Drop an OpenSSL curl.exe next to this script (verify with `curl.exe -V` - it
# must say OpenSSL, NOT Schannel). If it's absent we fall back to .NET.
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$localCurl = Join-Path $scriptDir 'curl.exe'
$curlExe = if (Test-Path $localCurl) { $localCurl }
           elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) { 'curl.exe' }
           else { $null }

Write-Output "Pushing $File -> $endpoint"

if ($curlExe) {
  # --data-binary @file sends the exact bytes (no BOM, no newline munging).
  # -o body-file, -w http_code so we can report status; -sS = quiet but show errors.
  $respFile = Join-Path $scriptDir 'push-response.json'
  $status = & $curlExe -sS -o $respFile -w '%{http_code}' -X PUT $endpoint `
              -H "x-upload-password: $Password" `
              -H 'Content-Type: application/json' `
              --data-binary "@$File"
  $exit = $LASTEXITCODE
  $respBody = if (Test-Path $respFile) { (Get-Content $respFile -Raw) } else { '' }

  if ($exit -ne 0) {
    Write-Output "PUSH FAILED: curl transport error (exit $exit) - likely TLS. Run '.\curl.exe -V' (needs OpenSSL, not Schannel)."
    exit 1
  }
  if ([int]$status -ge 200 -and [int]$status -lt 300) {
    Write-Output "PUSH OK (HTTP $status)."
    Write-Output $respBody
  } else {
    Write-Output "PUSH FAILED: HTTP $status"
    Write-Output ("RESPONSE BODY: " + $respBody)
    exit 1
  }
}
else {
  # -- .NET fallback (works where SChannel/TLS is healthy) ---------------------
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $body = [System.IO.File]::ReadAllBytes($File)   # raw bytes, no BOM
  $headers = @{ 'x-upload-password' = $Password }
  try {
    $resp = Invoke-RestMethod -Method Put -Uri $endpoint -ContentType 'application/json' -Headers $headers -Body $body
    Write-Output "PUSH OK."
    Write-Output ($resp | ConvertTo-Json -Depth 6)
  } catch {
    $err = $_
    Write-Output "PUSH FAILED: $($err.Exception.Message)"
    $r = $err.Exception.Response
    if ($r) {
      try { Write-Output ("HTTP STATUS: " + [int]$r.StatusCode + " " + $r.StatusCode) } catch {}
      try {
        $reader = New-Object System.IO.StreamReader($r.GetResponseStream())
        Write-Output ("RESPONSE BODY: " + $reader.ReadToEnd())
      } catch {}
    }
    exit 1
  }
}
