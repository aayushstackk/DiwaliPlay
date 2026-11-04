<#
.SYNOPSIS
    DiwaliPlay Windows Kiosk Watchdog Service
.DESCRIPTION
    Monitors DiwaliPlay.exe process and enforces Back Protection / Kiosk Auto-Restart.
    - When Back Protection is OFF: Allows normal user exit; never forces the app open.
    - When Back Protection is ON: Automatically relaunches the app if closed or crashed.
    - Handles power restoration and Windows startup auto-launch.
    - Safe single-instance enforcement via Named Mutex & process checks.
    - Rotated logging in windows-kiosk\logs\kiosk-watchdog.log.
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = "",
    [switch]$SingleCheck = $false,
    [switch]$VerboseLog = $false
)

$ErrorActionPreference = "Continue"

# Setup Paths
$KioskDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $KioskDir "kiosk-config.json"
}
$LogDir = Join-Path $KioskDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$LogFile = Join-Path $LogDir "kiosk-watchdog.log"

# Rotate log if larger than 5 MB
if (Test-Path $LogFile) {
    try {
        $fileItem = Get-Item $LogFile
        if ($fileItem.Length -gt 5MB) {
            $ArchiveLog = Join-Path $LogDir "kiosk-watchdog-old-$((Get-Date).ToString('yyyyMMdd-HHmmss')).log"
            Rename-Item -Path $LogFile -NewName $ArchiveLog -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

function Write-KioskLog {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ALERT", "ERROR", "DEBUG")]
        [string]$Level = "INFO"
    )
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
    $logEntry = "[$timestamp] [$Level] $Message"
    
    # Write to log file
    try {
        Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
    } catch {}

    # Write to console if running interactively
    if ($Host.UI.RawUI.KeyAvailable -or $VerboseLog -or $env:DEBUG -eq "true") {
        switch ($Level) {
            "INFO"  { Write-Host $logEntry -ForegroundColor Cyan }
            "WARN"  { Write-Host $logEntry -ForegroundColor Yellow }
            "ALERT" { Write-Host $logEntry -ForegroundColor Magenta }
            "ERROR" { Write-Host $logEntry -ForegroundColor Red }
            "DEBUG" { if ($VerboseLog) { Write-Host $logEntry -ForegroundColor DarkGray } }
        }
    }
}

# 1. Prevent duplicate Watchdog instances (using Named Mutex + safe process check)
if (-not $SingleCheck) {
    $script:watchdogMutexCreated = $false
    try {
        $script:watchdogMutex = New-Object System.Threading.Mutex($true, "Local\DiwaliPlayKioskWatchdogMutex", [ref]$script:watchdogMutexCreated)
        if (-not $script:watchdogMutexCreated) {
            Write-KioskLog "Another instance of Watchdog is already active (Mutex owned). Duplicate prevented." "WARN"
            exit 0
        }
    } catch {}

    # Secondary process check
    $myPid = $PID
    try {
        $existingProcs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction Stop |
            Where-Object { $_.ProcessId -ne $myPid -and $_.CommandLine -and $_.CommandLine -match "watchdog\.ps1" -and -not ($_.CommandLine -match "SingleCheck") }

        if ($existingProcs) {
            Write-KioskLog "Another instance of Watchdog is already running (PID: $($existingProcs[0].ProcessId)). Duplicate prevented. Exiting." "WARN"
            exit 0
        }
    } catch {}
}

function Read-KioskConfig {
    if (-not (Test-Path $ConfigPath)) {
        Write-KioskLog "Config file not found at $ConfigPath. Using safe defaults (Protection OFF)." "WARN"
        return [PSCustomObject]@{
            backProtection = $false
            autoLaunch = $true
            appName = "DiwaliPlay"
            executablePath = "dist-electron\win-unpacked\DiwaliPlay.exe"
            fallbackExecutablePath = "electron\main.cjs"
            checkIntervalSeconds = 3
            restartDelaySeconds = 2
            maxCrashCountInWindow = 5
            crashWindowMinutes = 5
        }
    }
    try {
        $raw = Get-Content -Path $ConfigPath -Raw -ErrorAction Stop
        return $raw | ConvertFrom-Json
    } catch {
        Write-KioskLog "Error parsing config JSON: $_. Using safe fallback (Protection OFF)." "ERROR"
        return [PSCustomObject]@{
            backProtection = $false
            autoLaunch = $true
            checkIntervalSeconds = 3
            restartDelaySeconds = 2
        }
    }
}

function Resolve-ExecutablePath {
    param([PSCustomObject]$Config)

    $WorkspaceRoot = (Resolve-Path "$KioskDir\..").Path
    $candidatePaths = @(
        # 1. Packaged installation parent: <install_dir>\resources\windows-kiosk\..\..\DiwaliPlay.exe
        (Join-Path $KioskDir "..\..\DiwaliPlay.exe"),
        # 2. Configured path relative to workspace
        (Join-Path $WorkspaceRoot $Config.executablePath),
        # 3. Configured path relative to kiosk folder
        (Join-Path $KioskDir $Config.executablePath),
        # 4. Direct path if absolute
        $Config.executablePath,
        # 5. Standard unpacked electron build
        (Join-Path $WorkspaceRoot "dist-electron\win-unpacked\DiwaliPlay.exe"),
        # 6. Installed user location (case variations)
        "$env:LOCALAPPDATA\Programs\DiwaliPlay\DiwaliPlay.exe",
        "$env:LOCALAPPDATA\Programs\diwaliplay\DiwaliPlay.exe",
        # 7. Installed system location
        "$env:ProgramFiles\DiwaliPlay\DiwaliPlay.exe",
        "${env:ProgramFiles(x86)}\DiwaliPlay\DiwaliPlay.exe"
    )

    foreach ($path in $candidatePaths) {
        if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path $path -PathType Leaf)) {
            return (Resolve-Path $path).Path
        }
    }

    return $null
}

function Get-DiwaliProcess {
    param(
        [string]$AppName = "DiwaliPlay",
        [string]$WorkspaceDir = ""
    )
    if ([string]::IsNullOrWhiteSpace($WorkspaceDir)) {
        $WorkspaceDir = (Resolve-Path "$KioskDir\..").Path
    }
    
    # 1. Check for compiled DiwaliPlay.exe
    $procs = Get-Process -Name $AppName -ErrorAction SilentlyContinue
    if ($procs -and $procs.Count -gt 0) {
        $matched = @()
        foreach ($p in $procs) {
            try {
                $exePath = $null
                try {
                    $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)" -ErrorAction Stop
                    $exePath = $procInfo.ExecutablePath
                } catch {
                    $exePath = $p.Path
                }
                if ($exePath -and ($exePath -like "*DiwaliPlay.exe*" -or $exePath -like "*$WorkspaceDir*")) {
                    $matched += $p
                } elseif (-not $exePath) {
                    $matched += $p
                }
            } catch {
                $matched += $p
            }
        }
        if ($matched.Count -gt 0) {
            return $matched
        }
    }

    # 2. Check for Electron process specifically running this DiwaliPlay project
    $electronProcs = Get-Process -Name "electron" -ErrorAction SilentlyContinue
    if ($electronProcs) {
        $matchedElectron = @()
        foreach ($p in $electronProcs) {
            try {
                $cmdLine = $null
                try {
                    $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)" -ErrorAction Stop
                    $cmdLine = $procInfo.CommandLine
                } catch {}

                if ($cmdLine) {
                    $normCmd = $cmdLine.Replace('/', '\').ToLowerInvariant()
                    $normWs = $WorkspaceDir.ToLowerInvariant()
                    if ($normCmd.Contains("electron\main.cjs") -or $normCmd.Contains($normWs) -or ($normCmd.Contains("diwali") -and $normCmd.Contains("main.cjs"))) {
                        $matchedElectron += $p
                    }
                }
            } catch {}
        }
        if ($matchedElectron.Count -gt 0) {
            return $matchedElectron
        }
    }

    return @()
}

function Ensure-GuardianRunning {
    param([PSCustomObject]$Config)
    if (-not $Config.backProtection) {
        return
    }
    $guardianRunning = $false
    try {
        $existing = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -and $_.CommandLine -match "guardian-keys\.ps1" }
        if ($existing) { $guardianRunning = $true }
    } catch {}

    if (-not $guardianRunning) {
        Write-KioskLog "Back Protection is ON but Guardian is not running. Launching Guardian..." "INFO"
        $guardianScript = Join-Path $KioskDir "guardian-keys.ps1"
        if (Test-Path $guardianScript) {
            try {
                Start-Process "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$guardianScript`"" -WorkingDirectory $KioskDir
            } catch {
                Write-KioskLog "Failed to launch Guardian: $_" "ERROR"
            }
        }
    }
}

function Launch-DiwaliPlay {
    param([PSCustomObject]$Config, [string]$Reason = "Startup")

    # Double check if already running to prevent duplicate instances
    $existing = Get-DiwaliProcess -AppName $Config.appName
    if ($existing.Count -gt 0) {
        Write-KioskLog "DiwaliPlay is already running (PID: $($existing[0].Id)). Skipping duplicate launch." "INFO"
        return $true
    }

    $exePath = Resolve-ExecutablePath -Config $Config
    $WorkspaceRoot = (Resolve-Path "$KioskDir\..").Path

    if ($exePath -and (Test-Path $exePath)) {
        Write-KioskLog "Launching DiwaliPlay EXE: $exePath [Reason: $Reason]" "INFO"
        try {
            $workingDir = Split-Path -Path $exePath -Parent
            $proc = Start-Process -FilePath $exePath -WorkingDirectory $workingDir -PassThru
            Write-KioskLog "DiwaliPlay started successfully with PID: $($proc.Id)" "INFO"
            return $true
        } catch {
            Write-KioskLog "Failed to launch executable: $_" "ERROR"
            return $false
        }
    }

    # Fallback to Electron runner if EXE not yet built
    $mainCjs = Join-Path $WorkspaceRoot "electron\main.cjs"
    if (Test-Path $mainCjs) {
        Write-KioskLog "EXE not found, launching fallback Electron shell: $mainCjs [Reason: $Reason]" "WARN"
        try {
            $npx = "npx.cmd"
            $proc = Start-Process -FilePath $npx -ArgumentList "electron", "electron/main.cjs" -WorkingDirectory $WorkspaceRoot -PassThru
            Write-KioskLog "Fallback Electron started with PID: $($proc.Id)" "INFO"
            return $true
        } catch {
            Write-KioskLog "Failed to launch fallback Electron: $_" "ERROR"
            return $false
        }
    }

    Write-KioskLog "No valid DiwaliPlay executable or fallback found." "ERROR"
    return $false
}

# --- Watchdog Main Execution Loop ---

Write-KioskLog "======================================================" "INFO"
Write-KioskLog "DiwaliPlay Windows Kiosk Watchdog Initializing..." "INFO"
Write-KioskLog "Watchdog Directory: $KioskDir" "INFO"
Write-KioskLog "Log File: $LogFile" "INFO"

$config = Read-KioskConfig
Write-KioskLog "Current State: Back Protection = $(if ($config.backProtection) {'ON (PROTECTED KIOSK)'} else {'OFF (NORMAL PC)'}) | AutoLaunch = $($config.autoLaunch)" "INFO"

# Startup AutoLaunch check
$initialProcs = Get-DiwaliProcess -AppName $config.appName
if ($initialProcs.Count -eq 0 -and $config.autoLaunch -and $config.backProtection) {
    Write-KioskLog "Startup: App not running, AutoLaunch enabled and Back Protection is ON. Starting initial instance..." "INFO"
    Launch-DiwaliPlay -Config $config -Reason "System Startup / AutoLaunch"
} elseif ($initialProcs.Count -gt 0) {
    Write-KioskLog "Startup: Detected existing DiwaliPlay running instance (PID: $($initialProcs[0].Id))." "INFO"
}

# SingleCheck mode for diagnostics & test suites
if ($SingleCheck) {
    $procs = Get-DiwaliProcess -AppName $config.appName
    $isRunning = ($procs.Count -gt 0)
    if ($config.backProtection) {
        Write-KioskLog "Single-check: Back Protection is ON (PROTECTED KIOSK). App running: $isRunning." "INFO"
        if (-not $isRunning) {
            Write-KioskLog "Back Protection is ON! Recovery would be triggered." "ALERT"
        }
    } else {
        Write-KioskLog "Single-check: Back Protection is OFF (NORMAL PC). App running: $isRunning. Standing by without relaunch." "INFO"
    }
    Write-KioskLog "Single-check completed. Exiting." "INFO"
    exit 0
}

# Crash tracking state
$crashTimestamps = New-Object System.Collections.Generic.List[datetime]
$wasRunning = ($initialProcs.Count -gt 0)
$lastStableTime = [datetime]::MinValue

if ($wasRunning) {
    $lastStableTime = [datetime]::UtcNow
}

Write-KioskLog "Watchdog monitoring loop active (Poll interval: $($config.checkIntervalSeconds)s)." "INFO"

# Continuous Monitoring Loop
try {
    while ($true) {
        try {
            # Dynamically reload configuration each tick to respect live Admin Panel / CLI toggle changes
            $config = Read-KioskConfig
            $interval = [Math]::Max(1, [int]$config.checkIntervalSeconds)
            $restartDelay = [Math]::Max(1, [int]$config.restartDelaySeconds)
            $maxCrashes = [Math]::Max(2, [int]$config.maxCrashCountInWindow)
            $crashWindow = [Math]::Max(1, [int]$config.crashWindowMinutes)

            # Ensure keyboard guardian is active if protection is ON
            if ($config.backProtection) {
                Ensure-GuardianRunning -Config $config
            }

            $procs = Get-DiwaliProcess -AppName $config.appName
            $isRunning = ($procs.Count -gt 0)

            if ($isRunning) {
                # App is healthy and running
                if (-not $wasRunning) {
                    Write-KioskLog "DiwaliPlay process is now running (PID: $($procs[0].Id))." "INFO"
                    $lastStableTime = [datetime]::UtcNow
                } else {
                    # If running stably for more than 45 seconds, clear old crash history
                    if (([datetime]::UtcNow - $lastStableTime).TotalSeconds -gt 45 -and $crashTimestamps.Count -gt 0) {
                        Write-KioskLog "DiwaliPlay has been stable for > 45s. Resetting crash tracking buffer." "DEBUG"
                        $crashTimestamps.Clear()
                    }
                }
                $wasRunning = $true
            } else {
                # App is NOT running
                if ($wasRunning) {
                    # Process just stopped!
                    Write-KioskLog "DiwaliPlay process has stopped / closed." "WARN"
                    $wasRunning = $false

                    if (-not $config.backProtection) {
                        # --- MODE: OFF (Normal PC) ---
                        # User closed the app and Back Protection is OFF. DO NOT restart.
                        Write-KioskLog "Back Protection is OFF. Permitting normal exit. Watchdog standing by without relaunch." "INFO"
                    } else {
                        # --- MODE: ON (Protected Kiosk) ---
                        # Back Protection is ON! Relaunch immediately to guard kiosk.
                        $now = [datetime]::UtcNow
                        $crashTimestamps.Add($now)

                        # Filter timestamps within crash window
                        $cutoff = $now.AddMinutes(-$crashWindow)
                        $recentCrashes = @($crashTimestamps | Where-Object { $_ -ge $cutoff })
                        
                        Write-KioskLog "Back Protection is ON! Re-launching application (Event #$($recentCrashes.Count) in ${crashWindow}m window)..." "ALERT"

                        if ($recentCrashes.Count -ge $maxCrashes) {
                            Write-KioskLog "CRITICAL: Reached maximum crash threshold ($($recentCrashes.Count)/$maxCrashes) in ${crashWindow}m. Pausing 30s to prevent system lockup..." "ERROR"
                            Start-Sleep -Seconds 30
                            $crashTimestamps.Clear()
                        } else {
                            Start-Sleep -Seconds $restartDelay
                        }

                        # Re-launch
                        $launched = Launch-DiwaliPlay -Config $config -Reason "Kiosk Back Protection Auto-Restart"
                        if ($launched) {
                            $wasRunning = $true
                            $lastStableTime = [datetime]::UtcNow
                        }
                    }
                } else {
                    # App remains not running
                    if ($config.backProtection) {
                        Write-KioskLog "Back Protection is ON but DiwaliPlay is not running. Initiating kiosk recovery..." "ALERT"
                        Start-Sleep -Seconds $restartDelay
                        $launched = Launch-DiwaliPlay -Config $config -Reason "Kiosk Recovery"
                        if ($launched) {
                            $wasRunning = $true
                            $lastStableTime = [datetime]::UtcNow
                        }
                    }
                }
            }
        } catch {
            Write-KioskLog "Watchdog loop exception: $_" "ERROR"
        }

        Start-Sleep -Seconds $interval
    }
} finally {
    Write-KioskLog "Watchdog monitoring service terminating." "INFO"
    if ($script:watchdogMutexCreated -and $script:watchdogMutex) {
        try {
            $script:watchdogMutex.ReleaseMutex()
            $script:watchdogMutex.Dispose()
        } catch {}
    }
}
