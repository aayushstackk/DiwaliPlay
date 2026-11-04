# DiwaliPlay Windows Kiosk & Back Protection Module

A dedicated, self-contained Windows AutoLaunch, Back Protection, and Watchdog subsystem for DiwaliPlay on Windows PCs and TV displays.

---

## 🛡️ Overview

This module is designed to ensure DiwaliPlay runs reliably in unattended event, kiosk, and exhibition environments without requiring changes to the core game application.

```
                              ┌──────────────────────────────────┐
                              │  Windows Startup / Boot / Login  │
                              └─────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │  Windows Task Scheduler / WSH   │
                               │  (watchdog-runner.vbs)          │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │  watchdog.ps1 (Background Loop) │
                               │  Reads: kiosk-config.json       │
                               └────────────────┬────────────────┘
                                                │
                      ┌─────────────────────────┴─────────────────────────┐
                      │                                                   │
         [Back Protection: OFF]                              [Back Protection: ON]
             (Normal PC Mode)                                  (Protected Kiosk)
                      │                                                   │
        * Launches once at boot                            * Launches DiwaliPlay in fullscreen
        * User can exit normally                           * Continuous process watchdog
        * No watchdog relaunch                             * Auto-restarts within 2s on exit
        * Standard Windows operation                       * Traps Alt+F4 / Win / Alt+Tab
                                                           * Admin unlock: Ctrl+Alt+Shift+D
```

---

## ⚙️ Operational Modes

### 1. OFF Mode — Normal PC
- **Configuration**: `"backProtection": false`
- **Behavior**:
  - DiwaliPlay launches automatically on Windows logon (if `autoLaunch` is true).
  - The user can close DiwaliPlay normally at any time (via window close, Alt+F4, or exit buttons).
  - The watchdog detects the exit, records it in the log, and **does NOT relaunch** the application.
  - Windows behaves 100% normally with no kiosk restrictions.

### 2. ON Mode — Protected Kiosk
- **Configuration**: `"backProtection": true`
- **Behavior**:
  - Automatically launches DiwaliPlay in fullscreen kiosk mode on Windows boot/logon.
  - The watchdog continuously monitors `DiwaliPlay.exe`. If the application crashes, hangs, or is terminated, it is **automatically relaunched within 2 seconds**.
  - Single-instance enforcement prevents duplicate windows.
  - Touch navigation cannot swipe away from the app.
  - Accidental exits via keyboard shortcuts (Alt+F4, Windows Key, Alt+Tab, Ctrl+Esc) are guarded by `guardian-keys.ps1`.
  - Crash-loop protection prevents CPU thrashing if an underlying system fault occurs.

---

## ⚡ Power Loss Recovery (BIOS Configuration)

In public and mall event venues, sudden power cuts or breaker trips can shut down the PC. To enable 100% autonomous recovery without manual intervention:

### Step 1: Configure BIOS/UEFI Power Settings
1. Turn on the PC and repeatedly press the BIOS setup key (`F2`, `Del`, or `F12` depending on manufacturer).
2. Navigate to the **Power Management** / **Advanced Power Options** section.
3. Locate the setting named:
   - **Restore on AC Power Loss** (or **AC Back**, **State After G3**, **After Power Failure**).
4. Change the setting to:
   - **`Power On`** (or **`Always On`** / **`Last State`**).
5. Save changes and exit (`F10`).

> **Result**: When electricity is restored after an outage, the PC automatically powers on without pressing the physical power button.

### Step 2: Configure Windows Automatic Logon
1. Press `Win + R`, type `netplwiz` and press Enter.
2. Uncheck **"Users must enter a user name and password to use this computer"**.
3. Click **Apply**, enter the kiosk account password, and click **OK**.
4. *(Alternative for Windows 11 Enterprise/Pro)*: Use Microsoft Sysinternals `Autologon.exe`.

> **Result**: Windows boots straight to the desktop on power restoration, Task Scheduler fires `watchdog-runner.vbs`, and DiwaliPlay launches automatically in fullscreen kiosk mode.

---

## 🎛️ How to Control & Toggle Protection

### Option A: Desktop Shortcut / Interactive Menu
Double-click the **DiwaliPlay Kiosk Admin** shortcut on your Desktop (or run `toggle-protection.bat`).

```
=======================================================
     DIWALIPLAY BACK PROTECTION CONTROLLER             
=======================================================
Current Status: ON (PROTECTED KIOSK)

Select an option:
  [1] Turn Back Protection ON  (Protect Kiosk, Auto-Restart)
  [2] Turn Back Protection OFF (Normal PC Mode, Normal Exit)
  [3] Show Status Details
  [Q] Cancel / Exit
```

### Option B: Command Line (PowerShell)
```powershell
# Turn Protection ON
.\toggle-protection.ps1 -State ON

# Turn Protection OFF (requires passcode; default: 8536)
.\toggle-protection.ps1 -State OFF -Passcode 8536

# Check Live Status
.\toggle-protection.ps1 -State STATUS
```

### Option C: Web Admin Dashboard
Run the included zero-dependency controller server:
```powershell
powershell -ExecutionPolicy Bypass -File .\admin-kiosk-server.ps1
```
Open **http://127.0.0.1:8536/kiosk-admin** in your browser to view the live dashboard and toggle switch.

---

## 🔐 Emergency Admin Unlock from Keyboard

If the kiosk is in **Protected ON Mode** and you need to access Windows:
1. Press **`Ctrl + Alt + Shift + D`** on the keyboard.
2. The administrative toggle prompt will appear over the game.
3. Enter the Admin Passcode (Default: **`8536`**).
4. Select **[2] Turn Back Protection OFF**.
5. You can now close or minimize DiwaliPlay freely.

---

## 📦 File Inventory

| File | Description |
|---|---|
| `kiosk-config.json` | Persistent JSON configuration file (state, timeouts, passcode). |
| `watchdog.ps1` | Core PowerShell monitoring engine with single-instance and crash protection. |
| `watchdog-runner.vbs` | Zero-flicker background launcher that runs watchdog with hidden window. |
| `guardian-keys.ps1` | Windows Low-Level Keyboard Hook intercepting Alt+F4 / Win / Alt+Tab. |
| `guardian-runner.vbs` | Zero-flicker background launcher that runs guardian with hidden window. |
| `toggle-protection.ps1` | Administrative CLI tool to toggle Back Protection ON/OFF with passcode check. |
| `toggle-protection.bat` | Double-clickable batch wrapper for Windows Explorer / Desktop. |
| `install-kiosk.ps1` | Installs Task Scheduler auto-launch tasks and desktop shortcuts. |
| `install-kiosk.bat` | Double-clickable installer. |
| `uninstall-kiosk.ps1` | Uninstaller stopping all kiosk tasks and restoring 100% normal PC state. |
| `uninstall-kiosk.bat` | Double-clickable uninstaller. |
| `admin-kiosk-ui.html` | Standalone DiwaliPlay-themed web UI for Admin Panel toggle. |
| `admin-kiosk-server.ps1` | Micro HTTP server (port 8536) serving the Admin Panel toggle API. |
| `test-kiosk-system.ps1` | Comprehensive 23-point automated test suite for ON/OFF behaviors and syntax. |
| `logs/kiosk-watchdog.log` | Rotated event log with timestamps and status transitions. |
| `ADMIN_INTEGRATION_GUIDE.md`| Architectural report on the admin panel integration layer. |

