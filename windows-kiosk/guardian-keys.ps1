<#
.SYNOPSIS
    DiwaliPlay Windows Kiosk Key & Focus Guardian
.DESCRIPTION
    Intercepts accidental exit combinations (Alt+F4, Windows Key, Alt+Tab, Ctrl+Esc)
    when Back Protection is ON.
    Passes all input normally when Back Protection is OFF.
    Includes emergency Admin key combo: Ctrl+Alt+Shift+D.
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = "",
    [switch]$TestHook = $false
)

$KioskDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $KioskDir "kiosk-config.json"
}
$LogDir = Join-Path $KioskDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$LogFile = Join-Path $LogDir "kiosk-watchdog.log"

function Write-KioskLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
    try {
        Add-Content -Path $LogFile -Value "[$ts] [$Level] [GUARDIAN] $Message" -ErrorAction SilentlyContinue
    } catch {}
}

# 1. Prevent duplicate guardian instances (using Named Mutex + safe process scan)
if (-not $TestHook) {
    $script:guardianMutexCreated = $false
    try {
        $script:guardianMutex = New-Object System.Threading.Mutex($true, "Local\DiwaliPlayKioskGuardianMutex", [ref]$script:guardianMutexCreated)
        if (-not $script:guardianMutexCreated) {
            Write-KioskLog "Another instance of Kiosk Key Guardian is already active (Mutex owned). Duplicate prevented." "WARN"
            exit 0
        }
    } catch {}

    # Secondary check via processes if available
    $myPid = $PID
    try {
        $existingProcs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction Stop |
            Where-Object { $_.ProcessId -ne $myPid -and $_.CommandLine -and $_.CommandLine -match "guardian-keys\.ps1" }

        if ($existingProcs) {
            Write-KioskLog "Another instance of Kiosk Key Guardian is already running (PID: $($existingProcs[0].ProcessId)). Duplicate prevented. Exiting." "WARN"
            exit 0
        }
    } catch {}
}

# 2. Compile Windows API Hook Type in Memory
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class KioskKeyInterceptor {
    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    public const int WH_KEYBOARD_LL = 13;
    public const int WM_KEYDOWN = 0x0100;
    public const int WM_SYSKEYDOWN = 0x0104;

    public const int VK_TAB = 0x09;
    public const int VK_ESCAPE = 0x1B;
    public const int VK_SPACE = 0x20;
    public const int VK_F4 = 0x73;
    public const int VK_LWIN = 0x5B;
    public const int VK_RWIN = 0x5C;
    public const int VK_MENU = 0x12; // Alt
    public const int VK_CONTROL = 0x11;
    public const int VK_SHIFT = 0x10;
    public const int VK_D = 0x44;

    public static bool ProtectionEnabled = false;
    public static bool AdminUnlockTriggered = false;
    public static int LastWin32Error = 0;

    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;

    public static IntPtr HookHandle {
        get { return _hookID; }
    }

    public static bool IsHookActive {
        get { return _hookID != IntPtr.Zero; }
    }

    public static bool StartHook() {
        if (_hookID != IntPtr.Zero) {
            return true;
        }
        _proc = HookCallback; // Maintain static GC reference to callback delegate
        _hookID = SetHook(_proc);
        if (_hookID == IntPtr.Zero) {
            LastWin32Error = Marshal.GetLastWin32Error();
            return false;
        }
        LastWin32Error = 0;
        return true;
    }

    public static void StopHook() {
        if (_hookID != IntPtr.Zero) {
            UnhookWindowsHookEx(_hookID);
            _hookID = IntPtr.Zero;
        }
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            IntPtr hMod = GetModuleHandle(curModule.ModuleName);
            if (hMod == IntPtr.Zero) {
                hMod = GetModuleHandle(null);
            }
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, hMod, 0);
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
            int vkCode = Marshal.ReadInt32(lParam);

            bool altPressed = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
            bool ctrlPressed = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
            bool shiftPressed = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;

            // Admin Emergency Unlock: Ctrl + Alt + Shift + D
            if (ctrlPressed && altPressed && shiftPressed && vkCode == VK_D) {
                AdminUnlockTriggered = true;
                return (IntPtr)1; // Block keypress from reaching underlying app
            }

            // Only block exit keys if Back Protection is actively enabled
            if (ProtectionEnabled) {
                // Block Alt + F4
                if (altPressed && vkCode == VK_F4) {
                    return (IntPtr)1;
                }
                // Block Alt + Tab
                if (altPressed && vkCode == VK_TAB) {
                    return (IntPtr)1;
                }
                // Block Windows Keys
                if (vkCode == VK_LWIN || vkCode == VK_RWIN) {
                    return (IntPtr)1;
                }
                // Block Ctrl + Esc (Start menu)
                if (ctrlPressed && vkCode == VK_ESCAPE) {
                    return (IntPtr)1;
                }
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
}
"@

# Verify and compile C# Type
if (-not ([System.Management.Automation.PSTypeName]'KioskKeyInterceptor').Type) {
    try {
        Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Windows.Forms" -ErrorAction Stop
    } catch {
        $err = $_.Exception.Message
        Write-KioskLog "Failed to compile KioskKeyInterceptor C# code: $err" "ERROR"
        Write-Error "Add-Type compilation failed for KioskKeyInterceptor: $err"
        exit 1
    }
}

# 3. Hook Installation & Validation
Write-KioskLog "Initializing Kiosk Key Guardian hook..." "INFO"
$hookSuccess = [KioskKeyInterceptor]::StartHook()
$isHookActive = [KioskKeyInterceptor]::IsHookActive

if (-not $hookSuccess -or -not $isHookActive) {
    $errCode = [KioskKeyInterceptor]::LastWin32Error
    Write-KioskLog "SetWindowsHookEx failed with Win32 Error: $errCode. Hook is not active." "ERROR"
    Write-Error "SetWindowsHookEx failed with Win32 Error: $errCode. Guardian cannot protect keys."
    exit 1
}

Write-KioskLog "Kiosk Key Guardian hook installed successfully (Handle: $([KioskKeyInterceptor]::HookHandle))." "INFO"

# If invoked for hook verification/test only
if ($TestHook) {
    Write-KioskLog "TestHook switch detected. Unhooking and returning success." "INFO"
    [KioskKeyInterceptor]::StopHook()
    exit 0
}

# 4. Background message pump and live configuration watcher
$timer = [System.Diagnostics.Stopwatch]::StartNew()

# Load initial configuration state
if (Test-Path $ConfigPath) {
    try {
        $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        [KioskKeyInterceptor]::ProtectionEnabled = [bool]$cfg.backProtection
        Write-KioskLog "Initial protection state: $(if ([KioskKeyInterceptor]::ProtectionEnabled) {'ON (Enforcing key guards)'} else {'OFF (Passing all keys)'})" "INFO"
    } catch {
        [KioskKeyInterceptor]::ProtectionEnabled = $false
    }
}

try {
    while ($true) {
        # Process Windows message queue
        [System.Windows.Forms.Application]::DoEvents()

        # Check config every 2 seconds
        if ($timer.ElapsedMilliseconds -gt 2000) {
            $timer.Restart()

            if (Test-Path $ConfigPath) {
                try {
                    $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
                    $newEnabled = [bool]$cfg.backProtection
                    if ($newEnabled -ne [KioskKeyInterceptor]::ProtectionEnabled) {
                        [KioskKeyInterceptor]::ProtectionEnabled = $newEnabled
                        Write-KioskLog "Live protection state changed to: $(if ($newEnabled) {'ON (Enforcing key guards)'} else {'OFF (Passing all keys)'})" "INFO"
                    }
                } catch {}
            }

            # If admin secret unlock key was triggered (Ctrl+Alt+Shift+D)
            if ([KioskKeyInterceptor]::AdminUnlockTriggered) {
                [KioskKeyInterceptor]::AdminUnlockTriggered = $false
                Write-KioskLog "Admin Emergency Unlock Key Combo Triggered (Ctrl+Alt+Shift+D)" "ALERT"

                # Check if toggle-protection is already open to avoid spamming windows
                $isToggleOpen = $false
                try {
                    $existingToggle = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction Stop |
                        Where-Object { $_.CommandLine -and $_.CommandLine -match "toggle-protection\.ps1" }
                    if ($existingToggle) { $isToggleOpen = $true }
                } catch {}

                if (-not $isToggleOpen) {
                    Start-Process "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$KioskDir\toggle-protection.ps1`"" -WorkingDirectory $KioskDir
                }
            }
        }

        Start-Sleep -Milliseconds 40
    }
} finally {
    Write-KioskLog "Stopping Kiosk Key Guardian and unhooking..." "INFO"
    [KioskKeyInterceptor]::StopHook()
    if ($script:guardianMutexCreated -and $script:guardianMutex) {
        try {
            $script:guardianMutex.ReleaseMutex()
            $script:guardianMutex.Dispose()
        } catch {}
    }
}
