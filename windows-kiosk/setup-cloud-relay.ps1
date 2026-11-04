<#
.SYNOPSIS
    DiwaliPlay TV PC Cloud Relay Setup & Verification Tool
.DESCRIPTION
    Pairs the local TV PC with the DiwaliPlay Render backend for secure remote administration.
#>

[CmdletBinding()]
param(
    [string]$RelayUrl = "https://diwaliplay.onrender.com",
    [string]$PairingCode = "",
    [string]$DeviceName = "",
    [switch]$StartAgent
)

$KioskDir = $PSScriptRoot
$ConfigFile = Join-Path $KioskDir "kiosk-cloud-device.json"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "   DiwaliPlay TV PC Cloud Relay Setup & Pairing Tool   " -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan

# 1. Test connectivity to Render
Write-Host "[1/3] Testing outbound HTTPS connectivity to $RelayUrl..." -ForegroundColor Gray
try {
    $health = Invoke-RestMethod -Uri "$RelayUrl/api/health" -Method Get -TimeoutSec 10
    Write-Host "  * Render backend reachable (Status: $($health.status), Storage: $($health.storage))" -ForegroundColor Green
} catch {
    Write-Host "  ! Warning: Unable to reach $RelayUrl: $_" -ForegroundColor Yellow
    Write-Host "  Please verify network connectivity." -ForegroundColor Gray
}

# 2. Check existing config
if (Test-Path $ConfigFile) {
    try {
        $cfg = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
        if (-not [string]::IsNullOrWhiteSpace($cfg.deviceToken)) {
            Write-Host "`n[2/3] Existing Paired Device Credentials Found:" -ForegroundColor Green
            Write-Host "  Device ID:   $($cfg.deviceId)" -ForegroundColor White
            Write-Host "  Device Name: $($cfg.name)" -ForegroundColor White
            Write-Host "  Relay URL:   $($cfg.relayUrl)" -ForegroundColor White
            Write-Host "  Paired At:   $($cfg.pairedAt)" -ForegroundColor Gray

            $choice = Read-Host "`nDo you want to re-pair this device? (y/N)"
            if ($choice -ne "y" -and $choice -ne "Y") {
                Write-Host "Keeping existing pairing." -ForegroundColor Cyan
                if ($StartAgent) {
                    $runner = Join-Path $KioskDir "kiosk-cloud-agent-runner.vbs"
                    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$runner`"" -WindowStyle Hidden
                    Write-Host "Kiosk Cloud Agent started." -ForegroundColor Green
                }
                exit 0
            }
        }
    } catch {}
}

# 3. Pairing execution
Write-Host "`n[2/3] Pairing TV PC..." -ForegroundColor Gray
$agentScript = Join-Path $KioskDir "kiosk-cloud-agent.ps1"

if (-not [string]::IsNullOrWhiteSpace($PairingCode)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$agentScript" -RelayUrl $RelayUrl -PairingCode $PairingCode -DeviceName $DeviceName -PairOnly -Foreground
} else {
    Write-Host "Launching interactive pairing mode..." -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$agentScript" -RelayUrl $RelayUrl -DeviceName $DeviceName -Foreground
}

# 4. Start agent
if (Test-Path $ConfigFile) {
    Write-Host "`n[3/3] Starting Cloud Relay Agent in background..." -ForegroundColor Gray
    $runner = Join-Path $KioskDir "kiosk-cloud-agent-runner.vbs"
    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$runner`"" -WindowStyle Hidden
    Write-Host "  * Cloud Relay Agent active and listening for remote commands." -ForegroundColor Green
}

Write-Host "`nSetup complete! You can now control this TV PC from your laptop Admin Panel." -ForegroundColor Green
Write-Host "=======================================================`n" -ForegroundColor Cyan

