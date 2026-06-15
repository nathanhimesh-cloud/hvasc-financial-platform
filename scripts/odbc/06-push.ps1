<#
  06-push.ps1  —  push snapshot.json to the dashboard's runtime store
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
  [string]$File = (Join-Path $PSScriptRoot 'snapshot.json')
)

$ErrorActionPreference = 'Stop'

# Vercel requires TLS 1.2; Windows PowerShell on Server 2012 R2 defaults to 1.0.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $File)) { throw "Snapshot file not found: $File. Run 05-build-snapshot.ps1 first." }
$endpoint = ($Url.TrimEnd('/')) + '/api/feed/snapshot'
$body = [System.IO.File]::ReadAllText($File)

Write-Host "Pushing $File -> $endpoint" -ForegroundColor Cyan
$headers = @{ 'x-upload-password' = $Password }
try {
  $resp = Invoke-RestMethod -Method Put -Uri $endpoint -ContentType 'application/json; charset=utf-8' -Headers $headers -Body $body
  Write-Host "OK." -ForegroundColor Green
  $resp | ConvertTo-Json -Depth 6 | Write-Host
} catch {
  Write-Host "PUSH FAILED: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    Write-Host $reader.ReadToEnd() -ForegroundColor Red
  }
  exit 1
}
