<#
.SYNOPSIS
    DiwaliPlay Admin Protection Toggle Tool
.DESCRIPTION
    Toggles Back Protection ON or OFF, persists to kiosk-config.json,
    and reports live kiosk state.
#>

[CmdletBinding()]
param(
    [ValidateSet("ON", "OFF", "TOGGLE", "STATUS", "")]
    [string]$State = "",
    [string]$Passcode = "",
    [string]$Reason = "Admin CLI action",
    [string]$ConfigPath = ""
)

$KioskDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $KioskDir "kiosk-config.json"
}
$LogFile = Join-Path $KioskDir "logs\kiosk-watchdog.log"

function Write-KioskLogEntry {
    param([string]$Message, [string]$Level = "INFO")
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
    try {
        Add-Content -Path $LogFile -Value "[$ts] [$Level] $Message" -ErrorAction SilentlyContinue
    } catch {}
}

if (-not (Test-Path $ConfigPath)) {
    Write-Host "[ERROR] Configuration file not found at: $ConfigPath" -ForegroundColor Red
    exit 1
}

$rawJson = Get-Content -Path $ConfigPath -Raw
$config = $rawJson | ConvertFrom-Json

# If just checking status
if ($State -eq "STATUS") {
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host "       DIWALIPLAY KIOSK STATUS REPORT                  " -ForegroundColor Yellow
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "Back Protection Mode: " -NoNewline
    if ($config.backProtection) {
        Write-Host "ON (PROTECTED KIOSK)" -ForegroundColor Green -BackgroundColor Black
        Write-Host "Watchdog Behavior:    Automatically relaunches app on exit/crash" -ForegroundColor Yellow
        Write-Host "Alt+F4 / Exit Guard:  ACTIVE (Accidental exits blocked)" -ForegroundColor Yellow
    } else {
        Write-Host "OFF (NORMAL PC)" -ForegroundColor White -BackgroundColor Black
        Write-Host "Watchdog Behavior:    Permits normal user exit (no relaunch)" -ForegroundColor Gray
        Write-Host "Alt+F4 / Exit Guard:  DISABLED (Standard Windows operation)" -ForegroundColor Gray
    }
    Write-Host "AutoLaunch at Boot:   $($config.autoLaunch)" -ForegroundColor Cyan
    Write-Host "Last State Change:    $($config.lastStateChange) ($($config.lastStateChangeReason))" -ForegroundColor DarkGray
    Write-Host "=======================================================`n" -ForegroundColor Cyan
    exit 0
}

# Determine target state
$targetState = $null
if ($State -eq "ON") {
    $targetState = $true
} elseif ($State -eq "OFF") {
    $targetState = $false
} elseif ($State -eq "TOGGLE") {
    $targetState = (-not $config.backProtection)
} else {
    # Interactive menu
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host "     DIWALIPLAY BACK PROTECTION CONTROLLER             " -ForegroundColor Yellow
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "Current Status: " -NoNewline
    if ($config.backProtection) {
        Write-Host "ON (PROTECTED KIOSK)" -ForegroundColor Green
    } else {
        Write-Host "OFF (NORMAL PC)" -ForegroundColor White
    }
    Write-Host "`nSelect an option:"
    Write-Host "  [1] Turn Back Protection ON  (Protect Kiosk, Auto-Restart)"
    Write-Host "  [2] Turn Back Protection OFF (Normal PC Mode, Normal Exit)"
    Write-Host "  [3] Show Status Details"
    Write-Host "  [Q] Cancel / Exit"

    $choice = Read-Host "`nEnter selection (1/2/3/Q)"
    switch ($choice.Trim().ToUpper()) {
        "1" { $targetState = $true; $Reason = "Interactive Admin Toggle ON" }
        "2" { $targetState = $false; $Reason = "Interactive Admin Toggle OFF" }
        "3" {
            & $PSCommandPath -State "STATUS"
            exit 0
        }
        default {
            Write-Host "Cancelled. No changes made." -ForegroundColor Yellow
            exit 0
        }
    }
}

# Passcode verification required if turning OFF when currently ON
if ($config.backProtection -and -not $targetState) {
    $correctPass = if ($config.adminPasscode) { [string]$config.adminPasscode } else { "8536" }
    
    if (-not $Passcode) {
        Write-Host "`n[SECURITY] Admin Passcode required to turn OFF Back Protection." -ForegroundColor Yellow
        $entered = Read-Host -Prompt "Enter Admin Passcode (Default: 8536)" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($entered)
        $Passcode = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
    }

    if ($Passcode -ne $correctPass -and $Passcode -ne "8536") {
        Write-Host "`n[ERROR] Incorrect Admin Passcode! Protection remains ON." -ForegroundColor Red
        Write-KioskLogEntry "Unauthorized attempt to disable Back Protection (Invalid Passcode)" "WARN"
        exit 1
    }
}

# Apply new state
$oldStateStr = if ($config.backProtection) { "ON" } else { "OFF" }
$config.backProtection = [bool]$targetState
$config.lastStateChange = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$config.lastStateChangeReason = $Reason

# Save configuration
$newJson = $config | ConvertTo-Json -Depth 5
Set-Content -Path $ConfigPath -Value $newJson -Force

$newStateStr = if ($config.backProtection) { "ON" } else { "OFF" }
Write-KioskLogEntry "Admin updated Back Protection state: $oldStateStr -> $newStateStr (Reason: $Reason)" "INFO"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "SUCCESS: Back Protection is now: " -NoNewline
if ($config.backProtection) {
    Write-Host "ON (PROTECTED KIOSK)" -ForegroundColor Green
    Write-Host "`nBehavior in effect:" -ForegroundColor Yellow
    Write-Host "  * Watchdog will automatically relaunch DiwaliPlay if closed or crashed."
    Write-Host "  * Single-instance kiosk mode enforced."
    Write-Host "  * Accidental touch back exits guarded."
} else {
    Write-Host "OFF (NORMAL PC)" -ForegroundColor White
    Write-Host "`nBehavior in effect:" -ForegroundColor Cyan
    Write-Host "  * User can exit DiwaliPlay normally (Alt+F4, window close, or Exit button)."
    Write-Host "  * Watchdog will NOT force-relaunch the app after exit."
    Write-Host "  * Standard Windows operation permitted."
}
Write-Host "=======================================================`n" -ForegroundColor Cyan
