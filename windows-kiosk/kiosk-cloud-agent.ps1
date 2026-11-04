<#
.SYNOPSIS
    DiwaliPlay Remote Kiosk Cloud Relay Agent
.DESCRIPTION
    Maintains an authenticated outbound persistent WebSocket connection to the Render backend.
    Enables remote administration of DiwaliPlay Kiosk Protection from anywhere on the internet.
    - Zero inbound port forwarding; never exposes 127.0.0.1:8537 publicly.
    - Dispatches commands (status, enable, disable, test-exit) to the local Kiosk Bridge.
    - Sends authenticated heartbeats with real-time protection status.
    - Automatically reconnects after network dropouts and system restarts.
#>

[CmdletBinding()]
param(
    [string]$RelayUrl = "https://diwaliplay.onrender.com",
    [string]$PairingCode = "",
    [string]$DeviceName = "",
    [switch]$PairOnly,
    [switch]$Foreground
)

$ErrorActionPreference = "Continue"
$KioskDir = $PSScriptRoot
$LogDir = Join-Path $KioskDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$LogFile = Join-Path $LogDir "cloud-agent.log"
$ConfigFile = Join-Path $KioskDir "kiosk-cloud-device.json"
$TokenFile = Join-Path $KioskDir ".bridge-token"
$LocalBridgeUrl = "http://127.0.0.1:8537"

function Write-AgentLog {
    param([string]$Message, [string]$Level = "INFO")
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
    $entry = "[$ts] [$Level] [CLOUD-AGENT] $Message"
    try {
        Add-Content -Path $LogFile -Value $entry -ErrorAction SilentlyContinue
    } catch {}
    if ($Foreground -or [Environment]::UserInteractive) {
        $color = switch ($Level) {
            "ERROR" { "Red" }
            "WARN"  { "Yellow" }
            "SUCCESS" { "Green" }
            default { "Cyan" }
        }
        Write-Host $entry -ForegroundColor $color
    }
}

# 1. Enforce single-instance via Named Mutex
$mutexCreated = $false
try {
    $agentMutex = New-Object System.Threading.Mutex($true, "Local\DiwaliPlayKioskCloudAgentMutex", [ref]$mutexCreated)
    if (-not $mutexCreated) {
        Write-AgentLog "Another instance of Kiosk Cloud Agent is already running. Exiting." "WARN"
        exit 0
    }
} catch {
    Write-AgentLog "Notice checking agent mutex: $_" "WARN"
}

# 2. Compile High-Performance C# WebSocket Relay Client
$csharpSource = @"
using System;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

public class DiwaliPlayCloudClient {
    private readonly string _wsUrl;
    private readonly string _deviceId;
    private readonly string _deviceToken;
    private readonly string _localBridgeUrl;
    private readonly string _localTokenFile;
    private readonly Action<string, string> _logger;
    private ClientWebSocket _ws;
    private CancellationTokenSource _cts;
    private volatile bool _running = false;

    public DiwaliPlayCloudClient(
        string wsUrl,
        string deviceId,
        string deviceToken,
        string localBridgeUrl,
        string localTokenFile,
        Action<string, string> logger
    ) {
        _wsUrl = wsUrl;
        _deviceId = deviceId;
        _deviceToken = deviceToken;
        _localBridgeUrl = localBridgeUrl;
        _localTokenFile = localTokenFile;
        _logger = logger;
    }

    public void Start() {
        _running = true;
        _cts = new CancellationTokenSource();
        Task.Run(() => ConnectionLoopAsync(_cts.Token));
    }

    public void Stop() {
        _running = false;
        try {
            _cts?.Cancel();
            _ws?.Dispose();
        } catch {}
    }

    private async Task ConnectionLoopAsync(CancellationToken ct) {
        int backoffSeconds = 2;
        while (_running && !ct.IsCancellationRequested) {
            try {
                _logger("Connecting outbound to cloud relay: " + _wsUrl, "INFO");
                using (_ws = new ClientWebSocket()) {
                    var uri = new Uri(_wsUrl);
                    _ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);

                    await _ws.ConnectAsync(uri, ct);
                    _logger("Connected successfully to Cloud Relay. Remote control active.", "SUCCESS");
                    backoffSeconds = 2; // Reset backoff on successful connect

                    // Send initial heartbeat immediately
                    await SendHeartbeatAsync(ct);

                    // Launch background heartbeat task
                    var heartbeatTask = Task.Run(() => HeartbeatLoopAsync(ct), ct);

                    // Receive loop
                    var buffer = new byte[16384];
                    while (_ws.State == WebSocketState.Open && !ct.IsCancellationRequested) {
                        var ms = new MemoryStream();
                        WebSocketReceiveResult result;
                        do {
                            result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                            if (result.MessageType == WebSocketMessageType.Close) {
                                _logger("Cloud Relay requested connection close.", "WARN");
                                await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", ct);
                                break;
                            }
                            ms.Write(buffer, 0, result.Count);
                        } while (!result.EndOfMessage);

                        if (result.MessageType == WebSocketMessageType.Close) {
                            break;
                        }

                        string messageText = Encoding.UTF8.GetString(ms.ToArray());
                        ProcessIncomingMessage(messageText);
                    }
                }
            } catch (Exception ex) {
                if (!_running || ct.IsCancellationRequested) break;
                _logger("Relay connection interrupted: " + ex.Message, "WARN");
            }

            if (_running && !ct.IsCancellationRequested) {
                _logger("Reconnecting to Cloud Relay in " + backoffSeconds + " seconds...", "INFO");
                try {
                    await Task.Delay(TimeSpan.FromSeconds(backoffSeconds), ct);
                } catch { break; }
                backoffSeconds = Math.Min(backoffSeconds * 2, 30);
            }
        }
    }

    private async Task HeartbeatLoopAsync(CancellationToken ct) {
        while (_running && _ws != null && _ws.State == WebSocketState.Open && !ct.IsCancellationRequested) {
            try {
                await Task.Delay(TimeSpan.FromSeconds(20), ct);
                if (_ws.State == WebSocketState.Open) {
                    await SendHeartbeatAsync(ct);
                }
            } catch {
                break;
            }
        }
    }

    private async Task SendHeartbeatAsync(CancellationToken ct) {
        try {
            string localStatusJson = QueryLocalBridge("/api/kiosk/status", "GET", null);
            long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            string heartbeatPacket = "{\"type\":\"heartbeat\",\"deviceId\":\"" + _deviceId +
                "\",\"timestamp\":" + nowMs + ",\"status\":" + localStatusJson + "}";

            byte[] bytes = Encoding.UTF8.GetBytes(heartbeatPacket);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct);
        } catch (Exception ex) {
            _logger("Failed to send heartbeat: " + ex.Message, "WARN");
        }
    }

    private void ProcessIncomingMessage(string json) {
        Task.Run(async () => {
            try {
                if (string.IsNullOrWhiteSpace(json)) return;

                // Match message type
                var matchType = Regex.Match(json, "\"type\"\\s*:\\s*\"([^\"]+)\"");
                if (!matchType.Success) return;
                string type = matchType.Groups[1].Value;

                if (type == "ping") {
                    long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    string pong = "{\"type\":\"pong\",\"timestamp\":" + now + "}";
                    byte[] pBytes = Encoding.UTF8.GetBytes(pong);
                    if (_ws != null && _ws.State == WebSocketState.Open) {
                        await _ws.SendAsync(new ArraySegment<byte>(pBytes), WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                    return;
                }

                if (type == "heartbeat_ack") {
                    return;
                }

                if (type == "command") {
                    var matchReq = Regex.Match(json, "\"requestId\"\\s*:\\s*\"([^\"]+)\"");
                    var matchAct = Regex.Match(json, "\"action\"\\s*:\\s*\"([^\"]+)\"");

                    string reqId = matchReq.Success ? matchReq.Groups[1].Value : "unknown";
                    string action = matchAct.Success ? matchAct.Groups[1].Value : "status";

                    _logger("Received remote command: [" + action + "] (Request: " + reqId + ")", "INFO");

                    // Extract optional passcode
                    string passcode = "";
                    var matchPass = Regex.Match(json, "\"passcode\"\\s*:\\s*\"([^\"]*)\"");
                    if (matchPass.Success) {
                        passcode = matchPass.Groups[1].Value;
                    }

                    // Dispatch to local bridge
                    string endpoint = "/api/kiosk/status";
                    string httpMethod = "GET";
                    string postBody = null;

                    if (action == "enable") {
                        endpoint = "/api/kiosk/enable";
                        httpMethod = "POST";
                        postBody = "{}";
                    } else if (action == "disable") {
                        endpoint = "/api/kiosk/disable";
                        httpMethod = "POST";
                        postBody = "{\"passcode\":\"" + EscapeJson(passcode) + "\"}";
                    } else if (action == "test-exit") {
                        endpoint = "/api/kiosk/test-exit";
                        httpMethod = "POST";
                        postBody = "{}";
                    }

                    string resultJson = null;
                    bool success = false;
                    string errorMsg = null;

                    try {
                        resultJson = QueryLocalBridge(endpoint, httpMethod, postBody);
                        success = resultJson.Contains("\"success\":true") || resultJson.Contains("\"available\":true");
                    } catch (Exception ex) {
                        success = false;
                        errorMsg = ex.Message;
                    }

                    // Always fetch latest status to report back
                    string latestStatus = "null";
                    try {
                        latestStatus = QueryLocalBridge("/api/kiosk/status", "GET", null);
                    } catch {}

                    long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    string ackPacket = "{\"type\":\"ack\",\"requestId\":\"" + reqId +
                        "\",\"action\":\"" + action +
                        "\",\"success\":" + (success ? "true" : "false") +
                        ",\"timestamp\":" + nowMs +
                        ",\"status\":" + latestStatus +
                        (errorMsg != null ? ",\"error\":\"" + EscapeJson(errorMsg) + "\"" : "") +
                        "}";

                    byte[] ackBytes = Encoding.UTF8.GetBytes(ackPacket);
                    if (_ws != null && _ws.State == WebSocketState.Open) {
                        await _ws.SendAsync(new ArraySegment<byte>(ackBytes), WebSocketMessageType.Text, true, CancellationToken.None);
                        _logger("Acknowledged command [" + action + "] -> " + (success ? "SUCCESS" : "FAILED"), success ? "SUCCESS" : "WARN");
                    }
                }
            } catch (Exception ex) {
                _logger("Error processing incoming frame: " + ex.Message, "ERROR");
            }
        });
    }

    private string QueryLocalBridge(string endpoint, string method, string postBody) {
        string url = _localBridgeUrl + endpoint;
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = method;
        request.Timeout = 8000;
        request.ReadWriteTimeout = 8000;

        // Attach local bridge token
        string token = "";
        try {
            if (File.Exists(_localTokenFile)) {
                token = File.ReadAllText(_localTokenFile).Trim();
            }
        } catch {}

        if (!string.IsNullOrEmpty(token)) {
            request.Headers["X-Kiosk-Token"] = token;
        }

        if (method == "POST") {
            request.ContentType = "application/json";
            byte[] bytes = Encoding.UTF8.GetBytes(postBody ?? "{}");
            request.ContentLength = bytes.Length;
            using (var stream = request.GetRequestStream()) {
                stream.Write(bytes, 0, bytes.Length);
            }
        }

        try {
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream())) {
                return reader.ReadToEnd();
            }
        } catch (WebException wex) {
            if (wex.Response != null) {
                using (var reader = new StreamReader(wex.Response.GetResponseStream())) {
                    return reader.ReadToEnd();
                }
            }
            throw;
        }
    }

    private static string EscapeJson(string s) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
    }
}
"@

try {
    Add-Type -TypeDefinition $csharpSource -Language CSharp
} catch {
    Write-AgentLog "Compilation note (type may already be loaded): $_" "INFO"
}

# 3. Resolve or Perform Pairing
$deviceConfig = $null
if (Test-Path $ConfigFile) {
    try {
        $raw = Get-Content -Path $ConfigFile -Raw
        $deviceConfig = ConvertFrom-Json $raw
    } catch {}
}

# Check if PairingCode was supplied via CLI
if (-not [string]::IsNullOrWhiteSpace($PairingCode)) {
    Write-AgentLog "Attempting pairing with code: $PairingCode" "INFO"
    try {
        $pairBody = @{
            pairingCode = $PairingCode.Trim()
            hostname = $env:COMPUTERNAME
        } | ConvertTo-Json

        $pairEndpoint = "$RelayUrl/api/kiosk-relay/device-pair"
        $pairRes = Invoke-RestMethod -Uri $pairEndpoint -Method Post -Body $pairBody -ContentType "application/json" -TimeoutSec 15

        if ($pairRes.success) {
            $deviceConfig = [PSCustomObject]@{
                relayUrl = $RelayUrl
                deviceId = $pairRes.deviceId
                deviceToken = $pairRes.deviceToken
                name = if ($DeviceName) { $DeviceName } else { $pairRes.name }
                pairedAt = (Get-Date).ToString("o")
            }
            $deviceConfig | ConvertTo-Json -Depth 5 | Set-Content -Path $ConfigFile -Force
            Write-AgentLog "Device paired successfully! Assigned DeviceId: $($pairRes.deviceId) ($($deviceConfig.name))" "SUCCESS"

            if ($PairOnly) {
                exit 0
            }
        } else {
            Write-AgentLog "Pairing failed: $($pairRes.message)" "ERROR"
            if ($PairOnly) { exit 1 }
        }
    } catch {
        Write-AgentLog "Pairing network error: $_" "ERROR"
        if ($PairOnly) { exit 1 }
    }
}

# If still not configured, request pairing code and prompt
if ($null -eq $deviceConfig -or [string]::IsNullOrWhiteSpace($deviceConfig.deviceToken)) {
    Write-AgentLog "No paired cloud credentials found. Requesting new pairing code from Cloud Relay..." "WARN"
    try {
        $reqBody = @{
            hostname = $env:COMPUTERNAME
            suggestedName = if ($DeviceName) { $DeviceName } else { "TV ($env:COMPUTERNAME)" }
        } | ConvertTo-Json

        $reqRes = Invoke-RestMethod -Uri "$RelayUrl/api/kiosk-relay/device-request-code" -Method Post -Body $reqBody -ContentType "application/json" -TimeoutSec 15

        if ($reqRes.success) {
            $code = $reqRes.pairingCode
            $devId = $reqRes.deviceId

            Write-Host "`n==================================================================" -ForegroundColor Yellow
            Write-Host "             DIWALIPLAY TV PC CLOUD RELAY SETUP                  " -ForegroundColor Yellow
            Write-Host "==================================================================" -ForegroundColor Yellow
            Write-Host "  Pairing Code: " -NoNewline -ForegroundColor Cyan
            Write-Host "$code" -ForegroundColor Green
            Write-Host "  Valid for:    15 minutes" -ForegroundColor Gray
            Write-Host "------------------------------------------------------------------" -ForegroundColor DarkGray
            Write-Host "  1. Open Admin Panel in Chrome: https://diwali-game-six.vercel.app" -ForegroundColor White
            Write-Host "  2. Go to: Game Settings -> Windows Kiosk Protection" -ForegroundColor White
            Write-Host "  3. Click '+ Pair TV PC' and enter code: $code" -ForegroundColor White
            Write-Host "==================================================================`n" -ForegroundColor Yellow

            Write-AgentLog "Waiting for administrator to claim code $code in Admin Panel..." "INFO"

            # Poll for claim
            $claimed = $false
            $pollAttempts = 0
            while ($pollAttempts -lt 300) { # 15 minutes max
                Start-Sleep -Seconds 3
                $pollAttempts++
                try {
                    $checkBody = @{ deviceId = $devId } | ConvertTo-Json
                    $checkRes = Invoke-RestMethod -Uri "$RelayUrl/api/kiosk-relay/device-check-pairing" -Method Post -Body $checkBody -ContentType "application/json" -TimeoutSec 10
                    if ($checkRes.success -and $checkRes.paired) {
                        $deviceConfig = [PSCustomObject]@{
                            relayUrl = $RelayUrl
                            deviceId = $checkRes.deviceId
                            deviceToken = $checkRes.deviceToken
                            name = $checkRes.name
                            pairedAt = (Get-Date).ToString("o")
                        }
                        $deviceConfig | ConvertTo-Json -Depth 5 | Set-Content -Path $ConfigFile -Force
                        Write-AgentLog "Pairing claimed by Admin! Credentials saved to $ConfigFile" "SUCCESS"
                        $claimed = $true
                        break
                    }
                } catch {}
            }

            if (-not $claimed) {
                Write-AgentLog "Pairing timed out without administrator claim. Exiting." "WARN"
                exit 1
            }
        }
    } catch {
        Write-AgentLog "Unable to reach Cloud Relay at $RelayUrl. Check internet connection: $_" "ERROR"
        exit 1
    }
}

# 4. Formulate WebSocket Relay URL
$relayBase = $deviceConfig.relayUrl
if ([string]::IsNullOrWhiteSpace($relayBase)) {
    $relayBase = $RelayUrl
}
$wsProtocol = if ($relayBase -match "^https:") { "wss:" } else { "ws:" }
$wsHost = $relayBase -replace "^https?://", ""
$wsEndpoint = "$wsProtocol//$wsHost/ws/kiosk-relay?deviceId=$($deviceConfig.deviceId)&token=$($deviceConfig.deviceToken)"

Write-AgentLog "Starting Cloud Relay Agent for device: $($deviceConfig.name) ($($deviceConfig.deviceId))" "INFO"

# Ensure local bridge is running
try {
    $bridgeConn = Test-NetConnection -ComputerName "127.0.0.1" -Port 8537 -WarningAction SilentlyContinue
    if (-not $bridgeConn.TcpTestSucceeded) {
        Write-AgentLog "Local Kiosk Bridge is not listening on port 8537. Starting via runner..." "WARN"
        $bridgeRunner = Join-Path $KioskDir "kiosk-bridge-runner.vbs"
        if (Test-Path $bridgeRunner) {
            Start-Process -FilePath "wscript.exe" -ArgumentList "`"$bridgeRunner`"" -WindowStyle Hidden
            Start-Sleep -Seconds 2
        }
    }
} catch {}

# 5. Launch Persistent C# Client
$logCallback = [Action[string, string]]{
    param($msg, $level)
    Write-AgentLog $msg $level
}

$client = New-Object DiwaliPlayCloudClient(
    $wsEndpoint,
    $deviceConfig.deviceId,
    $deviceConfig.deviceToken,
    $LocalBridgeUrl,
    $TokenFile,
    $logCallback
)

$client.Start()

# Keep script running to maintain process and mutex
try {
    while ($true) {
        Start-Sleep -Seconds 60
    }
} finally {
    $client.Stop()
    Write-AgentLog "Cloud Relay Agent stopped." "INFO"
}

