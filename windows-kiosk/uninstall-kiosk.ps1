<#
.SYNOPSIS
    DiwaliPlay Windows Kiosk Uninstaller
.DESCRIPTION
    Stops watchdog, keyboard guardian, and kiosk server processes,
    removes Scheduled Tasks, cleans up startup and desktop shortcuts,
    and restores normal PC configuration.
#>

[CmdletBinding()]
param()

$KioskDir = $PSScriptRoot
$WatchdogTaskName = "DiwaliPlayKioskWatchdog"
$GuardianTaskName = "DiwaliPlayKioskGuardian"
$BridgeTaskName = "DiwaliPlayKioskBridge"
$LogFile = Join-Path $KioskDir "logs\kiosk-watchdog.log"

function Write-KioskLog {
    param([string]$Message, [string]$Level = "INFO")
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
    try {
        Add-Content -Path $LogFile -Value "[$ts] [$Level] [UNINSTALLER] $Message" -ErrorAction SilentlyContinue
    } catch {}
}

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "     DIWALIPLAY WINDOWS KIOSK SYSTEM UNINSTALLER       " -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Cyan

# -------------------------------------------------------------
# 1. Stop background processes
# -------------------------------------------------------------
Write-Host "`n[1/4] Stopping active Watchdog, Guardian, and Server processes..." -ForegroundColor Cyan

# Stop wscript runners
try {
    $wscriptProcs = Get-CimInstance Win32_Process -Filter "Name = 'wscript.exe'" -ErrorAction Stop
    foreach ($p in $wscriptProcs) {
        if ($p.CommandLine -and ($p.CommandLine -match "watchdog-runner\.vbs" -or $p.CommandLine -match "guardian-runner\.vbs" -or $p.CommandLine -match "kiosk-bridge-runner\.vbs")) {
            Write-Host "  * Terminating silent runner (PID: $($p.ProcessId))" -ForegroundColor Yellow
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
} catch {}

# Stop powershell background scripts
try {
    $powershellProcs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction Stop
    foreach ($p in $powershellProcs) {
        if ($p.CommandLine -and ($p.CommandLine -match "watchdog\.ps1" -or $p.CommandLine -match "guardian-keys\.ps1" -or $p.CommandLine -match "kiosk-bridge\.ps1" -or $p.CommandLine -match "admin-kiosk-server\.ps1")) {
            # Make sure not to kill the uninstaller itself if invoked through one of these names
            if ($p.ProcessId -ne $PID) {
                Write-Host "  * Terminating kiosk process (PID: $($p.ProcessId))" -ForegroundColor Yellow
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    }
} catch {}

Write-KioskLog "Terminated all active kiosk processes." "INFO"

# -------------------------------------------------------------
# 2. Unregister Scheduled Tasks
# -------------------------------------------------------------
Write-Host "`n[2/4] Removing Scheduled Tasks..." -ForegroundColor Cyan

$tasksToRemove = @($WatchdogTaskName, $GuardianTaskName, $BridgeTaskName)
foreach ($taskName in $tasksToRemove) {
    try {
        $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($existing) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop | Out-Null
            Write-Host "  * Scheduled task '$taskName' removed successfully." -ForegroundColor Green
            Write-KioskLog "Removed Scheduled Task: $taskName" "INFO"
        } else {
            Write-Host "  * Scheduled task '$taskName' was not found (already clean)." -ForegroundColor Gray
        }
    } catch {
        Write-Host "  * Task removal note for '$taskName': $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# -------------------------------------------------------------
# 3. Remove Startup and Desktop Shortcuts
# -------------------------------------------------------------
Write-Host "`n[3/4] Removing Startup & Desktop Shortcuts..." -ForegroundColor Cyan
$startupFolder = [Environment]::GetFolderPath("Startup")
$startupShortcuts = @(
    (Join-Path $startupFolder "DiwaliPlayKioskWatchdog.lnk"),
    (Join-Path $startupFolder "DiwaliPlayKioskGuardian.lnk"),
    (Join-Path $startupFolder "DiwaliPlayKioskBridge.lnk")
)

foreach ($sc in $startupShortcuts) {
    if (Test-Path $sc) {
        try {
            Remove-Item $sc -Force -ErrorAction Stop
            Write-Host "  * Removed startup shortcut: $(Split-Path $sc -Leaf)" -ForegroundColor Green
            Write-KioskLog "Removed startup shortcut: $sc" "INFO"
        } catch {
            Write-Host "  * Failed to remove shortcut $sc : $_" -ForegroundColor Yellow
        }
    }
}

$desktopFolder = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktopFolder "DiwaliPlay Kiosk Admin.lnk"
if (Test-Path $desktopShortcut) {
    try {
        Remove-Item $desktopShortcut -Force -ErrorAction Stop
        Write-Host "  * Removed desktop shortcut: DiwaliPlay Kiosk Admin.lnk" -ForegroundColor Green
        Write-KioskLog "Removed desktop shortcut: $desktopShortcut" "INFO"
    } catch {
        Write-Host "  * Failed to remove desktop shortcut: $_" -ForegroundColor Yellow
    }
}

# -------------------------------------------------------------
# 4. Reset config to safe OFF mode
# -------------------------------------------------------------
Write-Host "`n[4/4] Resetting configuration to Normal PC mode (OFF)..." -ForegroundColor Cyan
$configPath = Join-Path $KioskDir "kiosk-config.json"
if (Test-Path $configPath) {
    try {
        $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
        $cfg.backProtection = $false
        $cfg.lastStateChange = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $cfg.lastStateChangeReason = "Uninstaller reset to Normal PC mode"
        $cfg | ConvertTo-Json -Depth 5 | Set-Content $configPath -Force
        Write-Host "  * Config set to backProtection: false." -ForegroundColor Green
        Write-KioskLog "Configuration reset to backProtection: false." "INFO"
    } catch {
        Write-Host "  * Failed to reset config: $_" -ForegroundColor Yellow
    }
}

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "UNINSTALLATION COMPLETE!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "DiwaliPlay Kiosk auto-restart, scheduled tasks, and restrictions have been completely removed." -ForegroundColor White
Write-Host "Windows will now operate in 100% normal PC mode.`n" -ForegroundColor Cyan
