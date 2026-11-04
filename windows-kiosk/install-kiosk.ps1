<#
.SYNOPSIS
    DiwaliPlay Windows Kiosk Installer
.DESCRIPTION
    Installs the Windows AutoLaunch, Watchdog, and Keyboard Guardian services.
    Configures automatic launch upon Windows user logon via Scheduled Tasks.
    Configures resilient Startup folder fallback and Admin desktop shortcut.
    Starts background services upon installation and prevents duplicate instances.
#>

[CmdletBinding()]
param(
    [switch]$SkipStartServices = $false
)

$KioskDir = $PSScriptRoot
$WatchdogRunner = Join-Path $KioskDir "watchdog-runner.vbs"
$GuardianRunner = Join-Path $KioskDir "guardian-runner.vbs"
$WatchdogScript = Join-Path $KioskDir "watchdog.ps1"
$GuardianScript = Join-Path $KioskDir "guardian-keys.ps1"
$ToggleBat = Join-Path $KioskDir "toggle-protection.bat"
$ConfigPath = Join-Path $KioskDir "kiosk-config.json"
$WatchdogTaskName = "DiwaliPlayKioskWatchdog"
$GuardianTaskName = "DiwaliPlayKioskGuardian"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "     DIWALIPLAY WINDOWS KIOSK SYSTEM INSTALLER         " -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "Target Directory: $KioskDir" -ForegroundColor Gray

# Check for elevation
$isAdmin = $false
try {
    $currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {}

if (-not $isAdmin) {
    Write-Host "Notice: Installer is running in standard user mode." -ForegroundColor Yellow
    Write-Host "If Task Scheduler requires elevation, run as Administrator." -ForegroundColor Gray
}

# -------------------------------------------------------------
# 1. Register Scheduled Tasks for Watchdog & Keyboard Guardian
# -------------------------------------------------------------
Write-Host "`n[1/4] Registering Windows Scheduled Tasks at User Logon..." -ForegroundColor Cyan

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -Priority 4

# 1a. Watchdog Task
$watchdogAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$WatchdogRunner`"" -WorkingDirectory $KioskDir
$watchdogTaskSuccess = $false

try {
    Register-ScheduledTask -TaskName $WatchdogTaskName -Action $watchdogAction -Trigger $trigger -Settings $settings -Description "DiwaliPlay Kiosk AutoLaunch & Watchdog Service" -Force -ErrorAction Stop | Out-Null
    $watchdogTaskSuccess = $true
    Write-Host "  * Scheduled task '$WatchdogTaskName' registered successfully." -ForegroundColor Green
} catch {
    Write-Host "  * Task registration failed for '$WatchdogTaskName': $($_.Exception.Message)" -ForegroundColor Red
}

# 1b. Keyboard Guardian Task
$guardianAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$GuardianRunner`"" -WorkingDirectory $KioskDir
$guardianTaskSuccess = $false

try {
    Register-ScheduledTask -TaskName $GuardianTaskName -Action $guardianAction -Trigger $trigger -Settings $settings -Description "DiwaliPlay Kiosk Keyboard & Focus Guardian Service" -Force -ErrorAction Stop | Out-Null
    $guardianTaskSuccess = $true
    Write-Host "  * Scheduled task '$GuardianTaskName' registered successfully." -ForegroundColor Green
} catch {
    Write-Host "  * Task registration failed for '$GuardianTaskName': $($_.Exception.Message)" -ForegroundColor Red
}

$taskRegistrationSuccess = ($watchdogTaskSuccess -and $guardianTaskSuccess)

# -------------------------------------------------------------
# 2. Resilient Startup Folder Shortcuts
# -------------------------------------------------------------
Write-Host "`n[2/4] Configuring Windows User Startup Fallback..." -ForegroundColor Cyan
$startupFolder = [Environment]::GetFolderPath("Startup")

try {
    $wsh = New-Object -ComObject WScript.Shell

    # Watchdog shortcut
    $watchdogLnk = Join-Path $startupFolder "DiwaliPlayKioskWatchdog.lnk"
    $scWatchdog = $wsh.CreateShortcut($watchdogLnk)
    $scWatchdog.TargetPath = "wscript.exe"
    $scWatchdog.Arguments = "`"$WatchdogRunner`""
    $scWatchdog.WorkingDirectory = $KioskDir
    $scWatchdog.Description = "DiwaliPlay Kiosk Watchdog"
    $scWatchdog.Save()
    Write-Host "  * Startup shortcut created: $watchdogLnk" -ForegroundColor Green

    # Guardian shortcut
    $guardianLnk = Join-Path $startupFolder "DiwaliPlayKioskGuardian.lnk"
    $scGuardian = $wsh.CreateShortcut($guardianLnk)
    $scGuardian.TargetPath = "wscript.exe"
    $scGuardian.Arguments = "`"$GuardianRunner`""
    $scGuardian.WorkingDirectory = $KioskDir
    $scGuardian.Description = "DiwaliPlay Kiosk Keyboard Guardian"
    $scGuardian.Save()
    Write-Host "  * Startup shortcut created: $guardianLnk" -ForegroundColor Green
} catch {
    Write-Host "  * Startup shortcuts warning: $_" -ForegroundColor Yellow
}

# -------------------------------------------------------------
# 3. Create Admin Controller Desktop Shortcut
# -------------------------------------------------------------
Write-Host "`n[3/4] Creating Desktop Admin Controller Shortcut..." -ForegroundColor Cyan
$desktopFolder = [Environment]::GetFolderPath("Desktop")
$desktopShortcutPath = Join-Path $desktopFolder "DiwaliPlay Kiosk Admin.lnk"

try {
    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($desktopShortcutPath)
    $shortcut.TargetPath = $ToggleBat
    $shortcut.WorkingDirectory = $KioskDir
    $shortcut.Description = "DiwaliPlay Back Protection ON/OFF Controller"
    $shortcut.Save()
    Write-Host "  * Desktop shortcut created: $desktopShortcutPath" -ForegroundColor Green
} catch {
    Write-Host "  * Desktop shortcut warning: $_" -ForegroundColor Yellow
}

# -------------------------------------------------------------
# 4. Start Background Services (Preventing Duplicates)
# -------------------------------------------------------------
if (-not $SkipStartServices) {
    Write-Host "`n[4/4] Starting Kiosk background services..." -ForegroundColor Cyan

    # Check and start Watchdog
    $watchdogRunning = $false
    try {
        $existingWatchdog = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -and $_.CommandLine -match "watchdog\.ps1" -and -not ($_.CommandLine -match "SingleCheck") }
        if ($existingWatchdog) { $watchdogRunning = $true }
    } catch {}

    if ($watchdogRunning) {
        Write-Host "  * Watchdog service is already active. Duplicate prevented." -ForegroundColor Yellow
    } else {
        try {
            $wProc = Start-Process "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$WatchdogScript`"" -WorkingDirectory $KioskDir -PassThru
            Write-Host "  * Watchdog service started successfully (PID: $($wProc.Id))." -ForegroundColor Green
        } catch {
            Write-Host "  * Failed to start Watchdog service: $_" -ForegroundColor Red
        }
    }

    # Check and start Guardian
    $guardianRunning = $false
    try {
        $existingGuardian = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -and $_.CommandLine -match "guardian-keys\.ps1" -and -not ($_.CommandLine -match "TestHook") }
        if ($existingGuardian) { $guardianRunning = $true }
    } catch {}

    if ($guardianRunning) {
        Write-Host "  * Guardian service is already active. Duplicate prevented." -ForegroundColor Yellow
    } else {
        try {
            $gProc = Start-Process "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$GuardianScript`"" -WorkingDirectory $KioskDir -PassThru
            Write-Host "  * Guardian service started successfully (PID: $($gProc.Id))." -ForegroundColor Green
        } catch {
            Write-Host "  * Failed to start Guardian service: $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host "`n[4/4] Skipping service startup as requested (-SkipStartServices)." -ForegroundColor DarkGray
}

# -------------------------------------------------------------
# Final Installation Verification & Exit Status
# -------------------------------------------------------------
Write-Host "`n=======================================================" -ForegroundColor Cyan
if (-not $taskRegistrationSuccess) {
    Write-Host "INSTALLATION INCOMPLETE: TASK SCHEDULER REGISTRATION FAILED" -ForegroundColor Red
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "One or more Scheduled Tasks could not be registered in Windows Task Scheduler." -ForegroundColor Yellow
    Write-Host "Action Required:" -ForegroundColor Yellow
    Write-Host "  1. Right-click 'install-kiosk.bat' and select 'Run as Administrator'." -ForegroundColor White
    Write-Host "  2. Startup folder shortcuts have been created as a user-level fallback." -ForegroundColor White
    Write-Host "=======================================================`n" -ForegroundColor Cyan
    exit 1
} else {
    Write-Host "INSTALLATION COMPLETE!" -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "Both Watchdog and Guardian Scheduled Tasks are active and registered at user logon." -ForegroundColor Green
    Write-Host "Current Configuration: Back Protection is OFF (Safe Normal PC Mode)." -ForegroundColor Yellow
    Write-Host "`nHow to use:" -ForegroundColor White
    Write-Host "  1. To toggle Back Protection ON/OFF: double-click 'DiwaliPlay Kiosk Admin' on Desktop"
    Write-Host "  2. Emergency Admin key combo to unlock: Ctrl + Alt + Shift + D (Passcode: 8536)"
    Write-Host "  3. To access local web dashboard: run 'admin-kiosk-server.ps1' -> http://127.0.0.1:8536/kiosk-admin"
    Write-Host "=======================================================`n" -ForegroundColor Cyan
    exit 0
}
