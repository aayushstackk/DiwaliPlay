<#
.SYNOPSIS
    DiwaliPlay Local Windows Kiosk HTTP Control Bridge
.DESCRIPTION
    Lightweight, high-resilience local HTTP bridge running exclusively on 127.0.0.1:8537.
    Bridges browser-based Admin Panel (including https://diwali-game-six.vercel.app)
    with the local Windows Kiosk subsystem (Watchdog & Guardian).
    Features:
    - Chrome Private Network Access (PNA) and CORS compliance
    - Token-based cryptographic authentication & pairing
    - Superadmin passcode verification for disabling protection
    - Zero external runtime dependencies; resilient against missing http.sys
#>

[CmdletBinding()]
param(
    [int]$Port = 8537,
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Continue"
$KioskDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $KioskDir "kiosk-config.json"
}
$LogDir = Join-Path $KioskDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$LogFile = Join-Path $LogDir "kiosk-watchdog.log"
$TokenFile = Join-Path $KioskDir ".bridge-token"

function Write-BridgeLog {
    param([string]$Message, [string]$Level = "INFO")
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
    $entry = "[$ts] [$Level] [KIOSK-BRIDGE] $Message"
    try {
        Add-Content -Path $LogFile -Value $entry -ErrorAction SilentlyContinue
    } catch {}
    Write-Host $entry -ForegroundColor Cyan
}

# 1. Enforce single-instance via Named Mutex
$mutexCreated = $false
try {
    $bridgeMutex = New-Object System.Threading.Mutex($true, "Local\DiwaliPlayKioskBridgeMutex", [ref]$mutexCreated)
    if (-not $mutexCreated) {
        Write-BridgeLog "Another instance of Kiosk Bridge is already active. Exiting duplicate instance." "WARN"
        exit 0
    }
} catch {
    Write-BridgeLog "Notice checking instance mutex: $_" "WARN"
}

# 2. Manage Bridge Auth Token
$bridgeToken = ""
if (Test-Path $TokenFile) {
    try {
        $bridgeToken = (Get-Content -Path $TokenFile -Raw).Trim()
    } catch {}
}
if ([string]::IsNullOrWhiteSpace($bridgeToken) -or $bridgeToken.Length -lt 16) {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $bridgeToken = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
    Set-Content -Path $TokenFile -Value $bridgeToken -Force
    Write-BridgeLog "Generated new secure local bridge pairing token." "INFO"
} else {
    Write-BridgeLog "Loaded existing bridge pairing token." "INFO"
}

# 3. Compile High-Performance C# Socket Server
$csharpSource = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

public class DiwaliPlayBridgeServer {
    private TcpListener _listener;
    private volatile bool _running;
    private Thread _listenThread;
    private readonly int _port;
    private readonly string _kioskDir;
    private readonly string _configPath;
    private readonly string _bridgeToken;
    private readonly string _logFile;

    public DiwaliPlayBridgeServer(int port, string kioskDir, string configPath, string bridgeToken, string logFile) {
        _port = port;
        _kioskDir = kioskDir;
        _configPath = configPath;
        _bridgeToken = bridgeToken;
        _logFile = logFile;
    }

    public void Start() {
        _listener = new TcpListener(IPAddress.Loopback, _port);
        _listener.Start();
        _running = true;
        _listenThread = new Thread(ListenLoop);
        _listenThread.IsBackground = true;
        _listenThread.Start();
    }

    public void Stop() {
        _running = false;
        try { if (_listener != null) _listener.Stop(); } catch {}
    }

    private void Log(string msg) {
        try {
            string ts = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
            File.AppendAllText(_logFile, "[" + ts + "] [INFO] [KIOSK-BRIDGE-CORE] " + msg + "\r\n");
        } catch {}
    }

    private void ListenLoop() {
        while (_running) {
            try {
                TcpClient client = _listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(HandleClient, client);
            } catch {
                if (!_running) break;
            }
        }
    }

    private void HandleClient(object state) {
        TcpClient client = (TcpClient)state;
        try {
            client.ReceiveTimeout = 6000;
            client.SendTimeout = 6000;
            using (NetworkStream stream = client.GetStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8)) {
                string reqLine = reader.ReadLine();
                if (string.IsNullOrEmpty(reqLine)) return;

                string[] parts = reqLine.Split(' ');
                string method = parts[0].ToUpperInvariant();
                string rawUrl = parts.Length > 1 ? parts[1] : "/";
                string path = rawUrl.Split('?')[0].ToLowerInvariant();

                string origin = "*";
                bool isPna = false;
                string clientToken = "";
                int contentLength = 0;
                string line;

                while (!string.IsNullOrEmpty(line = reader.ReadLine())) {
                    int colon = line.IndexOf(':');
                    if (colon > 0) {
                        string name = line.Substring(0, colon).Trim();
                        string val = line.Substring(colon + 1).Trim();

                        if (name.Equals("Origin", StringComparison.OrdinalIgnoreCase)) {
                            origin = val;
                        } else if (name.Equals("Access-Control-Request-Private-Network", StringComparison.OrdinalIgnoreCase)) {
                            isPna = true;
                        } else if (name.Equals("X-Kiosk-Token", StringComparison.OrdinalIgnoreCase)) {
                            clientToken = val;
                        } else if (name.Equals("Authorization", StringComparison.OrdinalIgnoreCase)) {
                            if (val.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) {
                                clientToken = val.Substring(7).Trim();
                            }
                        } else if (name.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) {
                            int.TryParse(val, out contentLength);
                        }
                    }
                }

                // Check query params if token not in headers
                if (string.IsNullOrEmpty(clientToken) && rawUrl.Contains("token=")) {
                    var m = Regex.Match(rawUrl, @"[?&]token=([^&]+)");
                    if (m.Success) {
                        clientToken = Uri.UnescapeDataString(m.Groups[1].Value);
                    }
                }

                char[] bodyChars = new char[contentLength];
                if (contentLength > 0) {
                    reader.ReadBlock(bodyChars, 0, contentLength);
                }
                string body = new string(bodyChars);

                // Handle CORS / PNA Preflight
                if (method == "OPTIONS") {
                    SendResponse(stream, 204, "No Content", "", origin, isPna);
                    return;
                }

                // Route Endpoints
                if (path == "/" || path == "/api/kiosk/health") {
                    string json = "{\"success\":true,\"service\":\"DiwaliPlay Kiosk Bridge\",\"status\":\"healthy\",\"port\":" + _port + "}";
                    SendResponse(stream, 200, "OK", json, origin, isPna);
                    return;
                }

                if (path == "/api/kiosk/status" || path == "/api/status") {
                    bool paired = (!string.IsNullOrEmpty(clientToken) && clientToken.Equals(_bridgeToken, StringComparison.OrdinalIgnoreCase));
                    string json = GetStatusJson(paired);
                    SendResponse(stream, 200, "OK", json, origin, isPna);
                    return;
                }

                if (path == "/api/kiosk/pair" && method == "POST") {
                    string enteredPasscode = ExtractJsonString(body, "passcode");
                    string configPasscode = ReadConfigPasscode();
                    if (string.Equals(enteredPasscode, configPasscode, StringComparison.Ordinal) || enteredPasscode == "8536") {
                        Log("Pairing successful with browser client from origin: " + origin);
                        bool bp = ReadBackProtectionState();
                        string json = "{\"success\":true,\"paired\":true,\"token\":\"" + _bridgeToken + "\",\"backProtection\":" + (bp ? "true" : "false") + ",\"autoLaunch\":true,\"message\":\"Paired successfully\"}";
                        SendResponse(stream, 200, "OK", json, origin, isPna);
                    } else {
                        Log("Pairing failed: Invalid admin passcode attempted.");
                        string json = "{\"success\":false,\"message\":\"Invalid admin passcode\"}";
                        SendResponse(stream, 401, "Unauthorized", json, origin, isPna);
                    }
                    return;
                }

                if (path == "/api/kiosk/enable" && method == "POST") {
                    if (!ValidateToken(clientToken)) {
                        SendResponse(stream, 401, "Unauthorized", "{\"success\":false,\"message\":\"Unauthorized: invalid or missing bridge token\"}", origin, isPna);
                        return;
                    }
                    SetBackProtectionState(true, "Browser Admin Panel (Bridge API)");
                    EnsureKioskServicesStarted();
                    Log("Back Protection ENABLED via Bridge API");
                    string json = "{\"success\":true,\"backProtection\":true,\"message\":\"Auto Launch & Back Protection enabled (Protected Mode)\"}";
                    SendResponse(stream, 200, "OK", json, origin, isPna);
                    return;
                }

                if (path == "/api/kiosk/disable" && method == "POST") {
                    if (!ValidateToken(clientToken)) {
                        SendResponse(stream, 401, "Unauthorized", "{\"success\":false,\"message\":\"Unauthorized: invalid or missing bridge token\"}", origin, isPna);
                        return;
                    }
                    string enteredPasscode = ExtractJsonString(body, "passcode");
                    string configPasscode = ReadConfigPasscode();
                    if (!string.Equals(enteredPasscode, configPasscode, StringComparison.Ordinal) && enteredPasscode != "8536") {
                        Log("Disable rejected: Invalid admin passcode provided.");
                        SendResponse(stream, 401, "Unauthorized", "{\"success\":false,\"message\":\"Invalid admin passcode\"}", origin, isPna);
                        return;
                    }
                    SetBackProtectionState(false, "Browser Admin Panel (Bridge API)");
                    StopGuardianService();
                    Log("Back Protection DISABLED via Bridge API");
                    string json = "{\"success\":true,\"backProtection\":false,\"message\":\"Back Protection disabled (Normal Mode)\"}";
                    SendResponse(stream, 200, "OK", json, origin, isPna);
                    return;
                }

                if (path == "/api/kiosk/test-exit" && method == "POST") {
                    if (!ValidateToken(clientToken)) {
                        SendResponse(stream, 401, "Unauthorized", "{\"success\":false,\"message\":\"Unauthorized: invalid or missing bridge token\"}", origin, isPna);
                        return;
                    }
                    Log("Test Exit triggered via Bridge API");
                    KillDiwaliPlayProcess();
                    SendResponse(stream, 200, "OK", "{\"success\":true,\"message\":\"DiwaliPlay process terminated for exit test.\"}", origin, isPna);
                    return;
                }

                SendResponse(stream, 404, "Not Found", "{\"success\":false,\"message\":\"Endpoint not found\"}", origin, isPna);
            }
        } catch {
        } finally {
            try { client.Close(); } catch {}
        }
    }

    private bool ValidateToken(string token) {
        return (!string.IsNullOrEmpty(token) && string.Equals(token, _bridgeToken, StringComparison.OrdinalIgnoreCase));
    }

    private string GetStatusJson(bool paired) {
        if (!paired) {
            return "{\"success\":true,\"paired\":false,\"bridgeOnline\":true,\"port\":" + _port + ",\"message\":\"Pairing required\"}";
        }

        bool backProtection = ReadBackProtectionState();
        bool watchdogRunning = IsProcessRunning("watchdog.ps1");
        bool guardianRunning = IsProcessRunning("guardian-keys.ps1");
        bool appRunning = Process.GetProcessesByName("DiwaliPlay").Length > 0;
        string lastStateChange = ReadConfigValue("lastStateChange");
        string lastStateChangeReason = ReadConfigValue("lastStateChangeReason");

        StringBuilder sb = new StringBuilder();
        sb.Append("{");
        sb.Append("\"success\":true,");
        sb.Append("\"paired\":true,");
        sb.Append("\"bridgeOnline\":true,");
        sb.Append("\"backProtection\":").Append(backProtection ? "true," : "false,");
        sb.Append("\"autoLaunch\":true,");
        sb.Append("\"watchdogRunning\":").Append(watchdogRunning ? "true," : "false,");
        sb.Append("\"guardianRunning\":").Append(guardianRunning ? "true," : "false,");
        sb.Append("\"appRunning\":").Append(appRunning ? "true," : "false,");
        sb.Append("\"lastStateChange\":\"").Append(lastStateChange).Append("\",");
        sb.Append("\"lastStateChangeReason\":\"").Append(lastStateChangeReason).Append("\",");
        sb.Append("\"port\":").Append(_port);
        sb.Append("}");
        return sb.ToString();
    }

    private bool ReadBackProtectionState() {
        try {
            if (File.Exists(_configPath)) {
                string text = File.ReadAllText(_configPath);
                var m = Regex.Match(text, "\"backProtection\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
                if (m.Success) {
                    return bool.Parse(m.Groups[1].Value);
                }
            }
        } catch {}
        return false;
    }

    private string ReadConfigPasscode() {
        try {
            if (File.Exists(_configPath)) {
                string text = File.ReadAllText(_configPath);
                var m = Regex.Match(text, "\"adminPasscode\"\\s*:\\s*\"([^\"]+)\"");
                if (m.Success) {
                    return m.Groups[1].Value;
                }
            }
        } catch {}
        return "8536";
    }

    private string ReadConfigValue(string key) {
        try {
            if (File.Exists(_configPath)) {
                string text = File.ReadAllText(_configPath);
                var m = Regex.Match(text, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
                if (m.Success) {
                    return m.Groups[1].Value;
                }
            }
        } catch {}
        return "";
    }

    private void SetBackProtectionState(bool state, string reason) {
        try {
            if (File.Exists(_configPath)) {
                string text = File.ReadAllText(_configPath);
                text = Regex.Replace(text, "\"backProtection\"\\s*:\\s*(true|false)", "\"backProtection\": " + (state ? "true" : "false"), RegexOptions.IgnoreCase);
                string now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
                text = Regex.Replace(text, "\"lastStateChange\"\\s*:\\s*\"[^\"]*\"", "\"lastStateChange\": \"" + now + "\"");
                text = Regex.Replace(text, "\"lastStateChangeReason\"\\s*:\\s*\"[^\"]*\"", "\"lastStateChangeReason\": \"" + reason + "\"");
                File.WriteAllText(_configPath, text);
            }
        } catch (Exception ex) {
            Log("Error updating config: " + ex.Message);
        }
    }

    private void EnsureKioskServicesStarted() {
        try {
            string watchdogRunner = Path.Combine(_kioskDir, "watchdog-runner.vbs");
            string guardianRunner = Path.Combine(_kioskDir, "guardian-runner.vbs");

            if (File.Exists(watchdogRunner) && !IsProcessRunning("watchdog.ps1")) {
                Process.Start(new ProcessStartInfo {
                    FileName = "wscript.exe",
                    Arguments = "\"" + watchdogRunner + "\"",
                    WorkingDirectory = _kioskDir,
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
            }

            if (File.Exists(guardianRunner) && !IsProcessRunning("guardian-keys.ps1")) {
                Process.Start(new ProcessStartInfo {
                    FileName = "wscript.exe",
                    Arguments = "\"" + guardianRunner + "\"",
                    WorkingDirectory = _kioskDir,
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
            }
        } catch (Exception ex) {
            Log("Error starting kiosk services: " + ex.Message);
        }
    }

    private void StopGuardianService() {
        try {
            Process.Start(new ProcessStartInfo {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*guardian-keys.ps1*' } | Stop-Process -Force -ErrorAction SilentlyContinue\"",
                CreateNoWindow = true,
                UseShellExecute = false
            });
        } catch (Exception ex) {
            Log("Error stopping guardian service: " + ex.Message);
        }
    }

    private void KillDiwaliPlayProcess() {
        try {
            foreach (var p in Process.GetProcessesByName("DiwaliPlay")) {
                try { p.Kill(); } catch {}
            }
        } catch {}
    }

    private bool IsProcessRunning(string scriptName) {
        try {
            using (var searcher = new System.Management.ManagementObjectSearcher(
                "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'powershell.exe' OR Name = 'pwsh.exe'")) {
                foreach (var obj in searcher.Get()) {
                    string cmd = (string)obj["CommandLine"];
                    if (!string.IsNullOrEmpty(cmd) && cmd.Contains(scriptName) && !cmd.Contains("SingleCheck") && !cmd.Contains("TestHook")) {
                        return true;
                    }
                }
            }
        } catch {}
        return false;
    }

    private string ExtractJsonString(string json, string key) {
        try {
            var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
            if (m.Success) return m.Groups[1].Value;
        } catch {}
        return "";
    }

    private void SendResponse(NetworkStream stream, int statusCode, string statusText, string json, string origin, bool isPna) {
        byte[] bodyBytes = Encoding.UTF8.GetBytes(json);
        StringBuilder sb = new StringBuilder();
        sb.Append("HTTP/1.1 ").Append(statusCode).Append(" ").Append(statusText).Append("\r\n");
        sb.Append("Content-Type: application/json; charset=utf-8\r\n");
        sb.Append("Content-Length: ").Append(bodyBytes.Length).Append("\r\n");
        sb.Append("Access-Control-Allow-Origin: ").Append(string.IsNullOrEmpty(origin) ? "*" : origin).Append("\r\n");
        sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
        sb.Append("Access-Control-Allow-Headers: Content-Type, X-Kiosk-Token, Authorization, Access-Control-Request-Private-Network\r\n");
        sb.Append("Access-Control-Allow-Credentials: true\r\n");
        if (isPna) {
            sb.Append("Access-Control-Allow-Private-Network: true\r\n");
        }
        sb.Append("Connection: close\r\n\r\n");

        byte[] headerBytes = Encoding.ASCII.GetBytes(sb.ToString());
        stream.Write(headerBytes, 0, headerBytes.Length);
        if (bodyBytes.Length > 0) {
            stream.Write(bodyBytes, 0, bodyBytes.Length);
        }
        stream.Flush();
    }
}
"@

Write-BridgeLog "Compiling and initializing HTTP Bridge server..." "INFO"
Add-Type -TypeDefinition $csharpSource -ReferencedAssemblies "System.Management.dll", "System.Core.dll"

$server = New-Object DiwaliPlayBridgeServer($Port, $KioskDir, $ConfigPath, $bridgeToken, $LogFile)
$server.Start()

Write-BridgeLog "DiwaliPlay Kiosk Bridge listening on http://127.0.0.1:$Port/" "INFO"

# Keep the bridge running until cancellation or process termination
try {
    while ($true) {
        Start-Sleep -Seconds 10
    }
} finally {
    $server.Stop()
    Write-BridgeLog "DiwaliPlay Kiosk Bridge stopped." "INFO"
}

