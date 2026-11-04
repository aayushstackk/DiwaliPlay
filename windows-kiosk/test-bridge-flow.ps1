$KioskDir = $PSScriptRoot
$bridgeScript = Join-Path $KioskDir "kiosk-bridge.ps1"
$testPort = 8539

Write-Host "Starting kiosk-bridge.ps1 on port $testPort..." -ForegroundColor Cyan
$proc = Start-Process "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$bridgeScript`"", "-Port", "$testPort" -WorkingDirectory $KioskDir -PassThru

Start-Sleep -Seconds 3

$testsPassed = 0
$totalTests = 6

try {
    # 1. Test GET /api/kiosk/status (unpaired)
    Write-Host "`nTest 1: GET /api/kiosk/status (Unpaired)..." -ForegroundColor Yellow
    $wc = New-Object System.Net.WebClient
    $res1 = $wc.DownloadString("http://127.0.0.1:$testPort/api/kiosk/status")
    $json1 = $res1 | ConvertFrom-Json
    if ($json1.success -and $json1.bridgeOnline -and ($json1.paired -eq $false)) {
        Write-Host "  PASS: Bridge is online and reports pairing required." -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  FAIL: Unexpected status: $res1" -ForegroundColor Red
    }

    # 2. Test OPTIONS preflight for PNA and CORS
    Write-Host "`nTest 2: OPTIONS Preflight for PNA and CORS..." -ForegroundColor Yellow
    $optReq = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$testPort/api/kiosk/status")
    $optReq.Method = "OPTIONS"
    $optReq.Headers.Add("Origin", "https://diwali-game-six.vercel.app")
    $optReq.Headers.Add("Access-Control-Request-Private-Network", "true")
    $optResp = $optReq.GetResponse()
    $pnaHeader = $optResp.Headers["Access-Control-Allow-Private-Network"]
    $originHeader = $optResp.Headers["Access-Control-Allow-Origin"]
    if ([int]$optResp.StatusCode -eq 204 -and $pnaHeader -eq "true" -and $originHeader -eq "https://diwali-game-six.vercel.app") {
        Write-Host "  PASS: OPTIONS preflight returned 204 with PNA and Origin headers." -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  FAIL: PNA: $pnaHeader, Origin: $originHeader, Status: $([int]$optResp.StatusCode)" -ForegroundColor Red
    }
    $optResp.Close()

    # 3. Test POST /api/kiosk/pair with invalid passcode
    Write-Host "`nTest 3: POST /api/kiosk/pair with invalid passcode..." -ForegroundColor Yellow
    try {
        $badPairReq = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$testPort/api/kiosk/pair")
        $badPairReq.Method = "POST"
        $badPairReq.ContentType = "application/json"
        $badBytes = [System.Text.Encoding]::UTF8.GetBytes('{"passcode":"wrong"}')
        $badPairReq.ContentLength = $badBytes.Length
        $s = $badPairReq.GetRequestStream()
        $s.Write($badBytes, 0, $badBytes.Length)
        $s.Close()
        $badPairResp = $badPairReq.GetResponse()
        Write-Host "  FAIL: Expected 401 but got $($badPairResp.StatusCode)" -ForegroundColor Red
        $badPairResp.Close()
    } catch [System.Net.WebException] {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
            Write-Host "  PASS: Rejected invalid passcode with 401 Unauthorized." -ForegroundColor Green
            $testsPassed++
        } else {
            Write-Host "  FAIL: Unexpected exception: $_" -ForegroundColor Red
        }
    }

    # 4. Test POST /api/kiosk/pair with valid passcode (8536)
    Write-Host "`nTest 4: POST /api/kiosk/pair with valid passcode..." -ForegroundColor Yellow
    $pairReq = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$testPort/api/kiosk/pair")
    $pairReq.Method = "POST"
    $pairReq.ContentType = "application/json"
    $goodBytes = [System.Text.Encoding]::UTF8.GetBytes('{"passcode":"8536"}')
    $pairReq.ContentLength = $goodBytes.Length
    $s = $pairReq.GetRequestStream()
    $s.Write($goodBytes, 0, $goodBytes.Length)
    $s.Close()
    $pairResp = $pairReq.GetResponse()
    $sr = New-Object System.IO.StreamReader($pairResp.GetResponseStream())
    $pairJson = $sr.ReadToEnd() | ConvertFrom-Json
    $pairResp.Close()

    $receivedToken = $pairJson.token
    if ($pairJson.success -and $pairJson.paired -and -not [string]::IsNullOrEmpty($receivedToken)) {
        Write-Host "  PASS: Successfully paired, token received: $($receivedToken.Substring(0, 8))..." -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  FAIL: Pairing response: $pairJson" -ForegroundColor Red
    }

    # 5. Test GET /api/kiosk/status with token (Paired)
    Write-Host "`nTest 5: GET /api/kiosk/status (Paired with token)..." -ForegroundColor Yellow
    $statReq = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$testPort/api/kiosk/status")
    $statReq.Headers.Add("X-Kiosk-Token", $receivedToken)
    $statResp = $statReq.GetResponse()
    $sr = New-Object System.IO.StreamReader($statResp.GetResponseStream())
    $statJson = $sr.ReadToEnd() | ConvertFrom-Json
    $statResp.Close()

    if ($statJson.success -and $statJson.paired -eq $true -and $statJson.bridgeOnline -eq $true) {
        Write-Host "  PASS: Status returned full diagnostics (backProtection: $($statJson.backProtection))." -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  FAIL: Status response: $statJson" -ForegroundColor Red
    }

    # 6. Test POST /api/kiosk/enable and disable
    Write-Host "`nTest 6: POST /api/kiosk/enable and /api/kiosk/disable..." -ForegroundColor Yellow
    $enReq = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$testPort/api/kiosk/enable")
    $enReq.Method = "POST"
    $enReq.Headers.Add("X-Kiosk-Token", $receivedToken)
    $enReq.ContentLength = 0
    $enResp = $enReq.GetResponse()
    $sr = New-Object System.IO.StreamReader($enResp.GetResponseStream())
    $enJson = $sr.ReadToEnd() | ConvertFrom-Json
    $enResp.Close()

    $disReq = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$testPort/api/kiosk/disable")
    $disReq.Method = "POST"
    $disReq.ContentType = "application/json"
    $disReq.Headers.Add("X-Kiosk-Token", $receivedToken)
    $disBytes = [System.Text.Encoding]::UTF8.GetBytes('{"passcode":"8536"}')
    $disReq.ContentLength = $disBytes.Length
    $s = $disReq.GetRequestStream()
    $s.Write($disBytes, 0, $disBytes.Length)
    $s.Close()
    $disResp = $disReq.GetResponse()
    $sr = New-Object System.IO.StreamReader($disResp.GetResponseStream())
    $disJson = $sr.ReadToEnd() | ConvertFrom-Json
    $disResp.Close()

    if ($enJson.success -and $enJson.backProtection -eq $true -and $disJson.success -and $disJson.backProtection -eq $false) {
        Write-Host "  PASS: Enable and Disable endpoints successfully transitioned state." -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  FAIL: Enable: $enJson, Disable: $disJson" -ForegroundColor Red
    }

} finally {
    Write-Host "`nStopping test bridge process..." -ForegroundColor Cyan
    try {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    } catch {}
}

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "TEST RESULTS: $testsPassed / $totalTests tests passed." -ForegroundColor $(if ($testsPassed -eq $totalTests) { "Green" } else { "Red" })
Write-Host "=======================================================" -ForegroundColor Cyan

if ($testsPassed -eq $totalTests) { exit 0 } else { exit 1 }
