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

# An OpenSSL-built curl carries no Windows certificate store, so it needs a CA
# bundle to verify Vercel's certificate. The curl.se builds ship one next to the
# exe. Point at it explicitly rather than relying on a compiled-in default path
# that won't exist on this machine - otherwise the scheduled run fails at 06:00
# with "SSL certificate problem" and nobody sees it until the data goes stale.
$caBundle = Join-Path $scriptDir 'curl-ca-bundle.crt'
$curlArgs = @()
if ($curlExe -and (Test-Path $caBundle)) {
  $curlArgs += @('--cacert', $caBundle)
  Write-Output "Using CA bundle: $caBundle"
}

Write-Output "Pushing $File -> $endpoint"

# The snapshot carries an INCREMENTAL transaction batch: everything with
# GLTRN.KY in (meta.sinceKy, meta.maxKy]. Advance the cursor ONLY after the
# server accepts the push. A failed push leaves the cursor where it was, so the
# next build re-sends the same rows rather than skipping them. The dashboard
# UPSERTs on ky, so a re-send costs nothing but bandwidth.
$cursorFile = Join-Path $scriptDir 'sync-cursor.json'
function Save-SyncCursor([string]$SnapshotPath, $Response) {
  try {
    $s = Get-Content $SnapshotPath -Raw | ConvertFrom-Json
    if ($null -eq $s.meta.maxKy) { return }   # older snapshot, no cursor to keep

    $sent = @($s.transactions).Count
    $r = $(if ($Response -is [string]) { $Response | ConvertFrom-Json } else { $Response })
    $ingested = [int]$r.transactionsIngested

    # HTTP 200 is not enough. The route accepts a push even when Postgres is
    # unreachable (a database hiccup must never lose a sync), and reports
    # transactionsIngested = 0. Advancing the cursor on that would drop these
    # rows permanently: the next build would ask for ky > maxKy and never see
    # them again. Only advance when the ledger confirms it stored them.
    if ($sent -gt 0 -and $ingested -lt $sent) {
      Write-Output ("CURSOR HELD: sent $sent transactions, the server stored $ingested.")
      Write-Output ("             The ledger did not accept them (is DATABASE_URL set on Vercel?).")
      Write-Output ("             Cursor left at its previous value; the next build re-sends them.")
      return
    }

    $payload = [ordered]@{
      fyLabel  = [string]$s.period.fyLabel
      maxKy    = [int64]$s.meta.maxKy
      pushedAt = (Get-Date -Format 's')
    }
    ($payload | ConvertTo-Json) | Set-Content -Path $cursorFile -Encoding ASCII
    Write-Output ("Sync cursor advanced to ky {0} ({1}); {2} transaction(s) stored." -f $payload.maxKy, $payload.fyLabel, $ingested)
  } catch {
    Write-Output "WARNING: could not write sync-cursor.json: $($_.Exception.Message)"
    Write-Output "         The next build will re-send this batch. Harmless (upsert), just slower."
  }
}

if ($curlExe) {
  # --data-binary @file sends the exact bytes (no BOM, no newline munging).
  # -o body-file, -w http_code so we can report status; -sS = quiet but show errors.
  $respFile = Join-Path $scriptDir 'push-response.json'
  $status = & $curlExe @curlArgs -sS -o $respFile -w '%{http_code}' -X PUT $endpoint `
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
    Save-SyncCursor $File $respBody
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
    Save-SyncCursor $File $resp
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
