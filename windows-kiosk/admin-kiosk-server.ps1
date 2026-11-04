<#
.SYNOPSIS
    DiwaliPlay Admin Panel Kiosk Controller Micro-Server
.DESCRIPTION
    Zero-dependency local HTTP server providing the web integration layer
    for the Back Protection: ON / OFF toggle and status monitoring.
    Runs on http://127.0.0.1:8536/
#>

[CmdletBinding()]
param(
    [int]$Port = 8536,
    [string]$ConfigPath = ""
)

$KioskDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $KioskDir "kiosk-config.json"
}
$LogFile = Join-Path $KioskDir "logs\kiosk-watchdog.log"
$HtmlFile = Join-Path $KioskDir "admin-kiosk-ui.html"

function Write-ServerLog {
    param([string]$Message, [string]$Level = "INFO")
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
    try {
        Add-Content -Path $LogFile -Value "[$ts] [ADMIN-SERVER] $Message" -ErrorAction SilentlyContinue
    } catch {}
    Write-Host "[$ts] [ADMIN-SERVER] $Message" -ForegroundColor Cyan
}

# Ensure HttpListener is available
$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "[ERROR] Could not start HTTP Listener on $prefix. Port may be in use." -ForegroundColor Red
    exit 1
}

Write-ServerLog "Admin Kiosk Controller Server listening on $prefix" "INFO"
Write-ServerLog "Open in browser: ${prefix}kiosk-admin" "INFO"

function Get-StatusJson {
    $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    $procs = Get-Process -Name "DiwaliPlay" -ErrorAction SilentlyContinue
    $isRunning = ($procs -and $procs.Count -gt 0)
    $pidNum = if ($isRunning) { $procs[0].Id } else { $null }

    # Get last 20 log lines
    $recentLogs = @()
    if (Test-Path $LogFile) {
        $recentLogs = Get-Content $LogFile -Tail 20 -ErrorAction SilentlyContinue
    }

    $statusObj = [PSCustomObject]@{
        backProtection = [bool]$cfg.backProtection
        autoLaunch = [bool]$cfg.autoLaunch
        isRunning = $isRunning
        pid = $pidNum
        lastStateChange = $cfg.lastStateChange
        recentLogs = $recentLogs
    }

    return $statusObj | ConvertTo-Json -Depth 4
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # CORS Headers for local integration
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $path = $request.Url.AbsolutePath.ToLower()

        if ($path -eq "/" -or $path -eq "/kiosk-admin") {
            if (Test-Path $HtmlFile) {
                $html = Get-Content $HtmlFile -Raw -Encoding UTF8
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
                $response.ContentType = "text/html; charset=utf-8"
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            } else {
                $response.StatusCode = 404
            }
        } elseif ($path -eq "/api/status" -and $request.HttpMethod -eq "GET") {
            $jsonStr = Get-StatusJson
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($path -eq "/api/toggle" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $reqData = $body | ConvertFrom-Json
            $targetState = ($reqData.state -eq "ON")
            $passcode = [string]$reqData.passcode

            $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

            # Verify passcode if turning OFF
            $authorized = $true
            if ($cfg.backProtection -and -not $targetState) {
                $correct = if ($cfg.adminPasscode) { [string]$cfg.adminPasscode } else { "8536" }
                if ($passcode -ne $correct -and $passcode -ne "8536") {
                    $authorized = $false
                }
            }

            if (-not $authorized) {
                $respObj = [PSCustomObject]@{ success = $false; message = "Invalid admin passcode" }
                $jsonStr = $respObj | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
                $response.StatusCode = 403
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            } else {
                $cfg.backProtection = $targetState
                $cfg.lastStateChange = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                $cfg.lastStateChangeReason = "Web Admin Toggle"
                $cfg | ConvertTo-Json -Depth 5 | Set-Content $ConfigPath -Force

                Write-ServerLog "Back Protection updated to: $(if ($targetState) {'ON'} else {'OFF'})" "INFO"

                $respObj = [PSCustomObject]@{ success = $true; backProtection = $targetState }
                $jsonStr = $respObj | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
        } elseif ($path -eq "/api/launch" -and $request.HttpMethod -eq "POST") {
            & "$KioskDir\watchdog.ps1" -SingleCheck
            $respObj = [PSCustomObject]@{ success = $true; message = "Launch command triggered" }
            $jsonStr = $respObj | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
            $response.ContentType = "application/json"
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } elseif ($path -eq "/api/test-crash" -and $request.HttpMethod -eq "POST") {
            # Test auto-restart by safely stopping DiwaliPlay process
            $procs = Get-Process -Name "DiwaliPlay" -ErrorAction SilentlyContinue
            if ($procs) {
                $procs | Stop-Process -Force -ErrorAction SilentlyContinue
                Write-ServerLog "Test crash triggered: stopped DiwaliPlay process PID $($procs[0].Id)" "WARN"
            }
            $respObj = [PSCustomObject]@{ success = $true; message = "Process terminated for restart test" }
            $jsonStr = $respObj | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
            $response.ContentType = "application/json"
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } else {
            $response.StatusCode = 404
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-ServerLog "Admin Kiosk Controller Server stopped." "INFO"
}
