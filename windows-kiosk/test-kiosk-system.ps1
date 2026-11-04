<#
.SYNOPSIS
    DiwaliPlay Windows Kiosk Automated Test Suite
.DESCRIPTION
    Validates configuration persistence, ON/OFF toggle enforcement,
    passcode security, executable resolution & process matching,
    guardian hook compilation & handle validity, watchdog restart logic,
    and PowerShell syntax across all module scripts.
#>

[CmdletBinding()]
param()

$KioskDir = $PSScriptRoot
$ConfigPath = Join-Path $KioskDir "kiosk-config.json"
$LogFile = Join-Path $KioskDir "logs\kiosk-watchdog.log"

$testsPassed = 0
$testsFailed = 0

function Assert-Test {
    param(
        [string]$TestName,
        [bool]$Condition,
        [string]$Details = ""
    )
    if ($Condition) {
        Write-Host "  [PASS] $TestName" -ForegroundColor Green
        if ($Details) { Write-Host "         $Details" -ForegroundColor DarkGray }
        $script:testsPassed++
    } else {
        Write-Host "  [FAIL] $TestName" -ForegroundColor Red
        if ($Details) { Write-Host "         $Details" -ForegroundColor Yellow }
        $script:testsFailed++
    }
}

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "     DIWALIPLAY WINDOWS KIOSK AUTOMATED TEST SUITE     " -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Cyan

# Backup current config
$backupContent = Get-Content $ConfigPath -Raw

try {
    # -------------------------------------------------------------
    # TEST 1: Config File & Schema
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 1] Configuration Schema & Read/Write" -ForegroundColor Cyan
    $cfg = $backupContent | ConvertFrom-Json
    Assert-Test "kiosk-config.json exists and is valid JSON" ($null -ne $cfg)
    Assert-Test "Required field 'backProtection' is defined" ($null -ne $cfg.backProtection)
    Assert-Test "Required field 'autoLaunch' is defined" ($null -ne $cfg.autoLaunch)
    Assert-Test "Required field 'adminPasscode' is set" ($cfg.adminPasscode -eq "8536")

    # -------------------------------------------------------------
    # TEST 2: Toggle Logic & Passcode Security
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 2] Toggle Protection & Passcode Security" -ForegroundColor Cyan
    
    # 2a. Toggle to ON
    & "$KioskDir\toggle-protection.ps1" -State "ON" -Reason "Automated Test ON" | Out-Null
    $cfgOn = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    Assert-Test "Toggle ON successfully persists to config" ($cfgOn.backProtection -eq $true)

    # 2b. Attempt Toggle OFF with invalid passcode
    $toggleProc = Start-Process "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$KioskDir\toggle-protection.ps1`"", "-State", "OFF", "-Passcode", "wrong_code" -PassThru -Wait
    $cfgAfterBadPass = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    Assert-Test "Toggle OFF rejects invalid passcode (Protection remains ON)" ($cfgAfterBadPass.backProtection -eq $true)

    # 2c. Toggle OFF with correct passcode
    & "$KioskDir\toggle-protection.ps1" -State "OFF" -Passcode "8536" -Reason "Automated Test OFF" | Out-Null
    $cfgOff = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    Assert-Test "Toggle OFF succeeds with correct passcode (8536)" ($cfgOff.backProtection -eq $false)

    # 2d. Security: Verify passcode is never leaked into logs
    $recentLogLines = (Get-Content $LogFile -Tail 20) -join "`n"
    $passcodeLeaked = ($recentLogLines -match "8536" -or $recentLogLines -match "wrong_code")
    Assert-Test "Admin passcode is never leaked into log files" (-not $passcodeLeaked)

    # -------------------------------------------------------------
    # TEST 3: Executable Path & Process Verification
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 3] Executable Path & Process Verification" -ForegroundColor Cyan
    $WorkspaceRoot = (Resolve-Path "$KioskDir\..").Path
    $expectedExe = Join-Path $WorkspaceRoot "dist-electron\win-unpacked\DiwaliPlay.exe"
    $expectedFallback = Join-Path $WorkspaceRoot "electron\main.cjs"
    $exeFound = (Test-Path $expectedExe)
    $fallbackFound = (Test-Path $expectedFallback)

    Assert-Test "Unpacked production EXE exists ($expectedExe)" $exeFound
    Assert-Test "Fallback Electron shell exists ($expectedFallback)" $fallbackFound

    # -------------------------------------------------------------
    # TEST 4: Watchdog Behavior in OFF Mode (Normal PC)
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 4] Watchdog Behavior in OFF Mode (Normal PC)" -ForegroundColor Cyan
    $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    $cfg.backProtection = $false
    $cfg | ConvertTo-Json -Depth 5 | Set-Content $ConfigPath -Force

    $watchdogOutput = & "$KioskDir\watchdog.ps1" -SingleCheck
    $logContent = (Get-Content $LogFile -Tail 15) -join "`n"
    $permittedExitLogged = ($logContent -match "Back Protection is OFF|Current State: Back Protection = OFF")
    Assert-Test "Watchdog detects OFF mode and stands by without relaunch" $permittedExitLogged

    # -------------------------------------------------------------
    # TEST 5: Watchdog Behavior in ON Mode (Protected Kiosk)
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 5] Watchdog Behavior in ON Mode (Protected Kiosk)" -ForegroundColor Cyan
    $cfg.backProtection = $true
    $cfg | ConvertTo-Json -Depth 5 | Set-Content $ConfigPath -Force

    $watchdogOnOutput = & "$KioskDir\watchdog.ps1" -SingleCheck
    $logContentOn = (Get-Content $LogFile -Tail 15) -join "`n"
    $onStateLogged = ($logContentOn -match "PROTECTED KIOSK")
    Assert-Test "Watchdog detects ON mode and enforces kiosk recovery" $onStateLogged

    # -------------------------------------------------------------
    # TEST 6: Guardian Key Interceptor & Hook Validation
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 6] Guardian Key Interceptor & Hook Validation" -ForegroundColor Cyan
    $guardianScriptPath = Join-Path $KioskDir "guardian-keys.ps1"
    $guardianProc = Start-Process "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $guardianScriptPath, "-TestHook" -PassThru -Wait
    Assert-Test "Guardian compiles C# and installs SetWindowsHookEx successfully (Exit 0)" ($guardianProc.ExitCode -eq 0) "ExitCode: $($guardianProc.ExitCode)"

    $guardianLog = (Get-Content $LogFile -Tail 15) -join "`n"
    $hookValid = ($guardianLog -match "Kiosk Key Guardian hook installed successfully")
    Assert-Test "Guardian reports valid non-zero hook handle in logs" $hookValid

    # -------------------------------------------------------------
    # TEST 7: PowerShell Script Syntax Verification
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 7] PowerShell Script Syntax Verification" -ForegroundColor Cyan
    $psFiles = Get-ChildItem -Path $KioskDir -Filter "*.ps1"
    foreach ($psFile in $psFiles) {
        $content = Get-Content $psFile.FullName -Raw
        $parseErrors = $null
        $tokens = $null
        $ast = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$parseErrors)
        $hasErrors = ($parseErrors -and $parseErrors.Count -gt 0)
        Assert-Test "Syntax valid: $($psFile.Name)" (-not $hasErrors) $(if ($hasErrors) { $parseErrors[0].Message } else { "" })
    }

    # -------------------------------------------------------------
    # TEST 8: Logging System Integrity
    # -------------------------------------------------------------
    Write-Host "`n[Test Group 8] Logging Format & Timestamp Integrity" -ForegroundColor Cyan
    Assert-Test "Log file exists at $LogFile" (Test-Path $LogFile)
    $sampleLine = (Get-Content $LogFile -Tail 1)
    $hasValidFormat = ($sampleLine -match '^\[\d{4}-\d{2}-\d{2} \d{2}[:\.]\d{2}[:\.]\d{2}\.\d{3}\] \[(INFO|WARN|ALERT|ERROR|DEBUG)\]')
    Assert-Test "Log entries follow standard timestamp and level format" $hasValidFormat "Sample: $sampleLine"

} finally {
    # Restore original config
    Set-Content -Path $ConfigPath -Value $backupContent -Force
    Write-Host "`nOriginal configuration safely restored." -ForegroundColor DarkGray
}

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "TEST RESULTS SUMMARY: $testsPassed Passed, $testsFailed Failed" -ForegroundColor $(if ($testsFailed -eq 0) { "Green" } else { "Red" })
Write-Host "=======================================================`n" -ForegroundColor Cyan

if ($testsFailed -gt 0) {
    exit 1
} else {
    exit 0
}
