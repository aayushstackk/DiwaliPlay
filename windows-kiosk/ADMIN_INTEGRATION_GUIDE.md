# Admin Panel Integration Guide & Verification Report

This document reports the direct integration of the **Auto Launch & Back Protection** controls into the existing **Admin Panel → Game Settings** section.

---

## 1. Integrated Architecture

The control is embedded directly into `src/admin/sections/GameSettingsSection.tsx` and communicates via a secure, local-only IPC bridge in Electron:

```
┌─────────────────────────────────────────────────────────────────┐
│     Existing Admin Panel: Game Settings Section (React UI)      │
│  CARD 5: "Auto Launch & Back Protection" (ON / OFF + Status)   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
           window.electronDesktop.setKioskProtection()
           window.electronDesktop.getKioskStatus()
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│           Electron Preload Bridge (electron/preload.cjs)        │
│          Exposes contextIsolated API to renderer window        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                ipcRenderer.invoke('kiosk:*')
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│             Electron Main Process (electron/main.cjs)           │
│       - Validates admin passcode (8536) on disable              │
│       - Atomic write to windows-kiosk/kiosk-config.json         │
│       - Starts watchdog & guardian if down upon enable          │
│       - ZERO public/internet network endpoint exposure          │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│          windows-kiosk Subsystem (Watchdog + Guardian)          │
│  - watchdog.ps1: 2s poll, auto-relaunches on exit/crash if ON   │
│  - guardian-keys.ps1: low-level Win32 hook blocks exit keys     │
│  - Ctrl+Alt+Shift+D: emergency keyboard unlock                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Modified Existing Files

As explicitly authorized for this integration, the minimal required changes were made to these 3 files:

1. **`src/admin/sections/GameSettingsSection.tsx`**:
   - Added **CARD 5: "Auto Launch & Back Protection"** to the Game Settings form grid.
   - Live visual status badge: `PROTECTED MODE` (green pulse) vs `NORMAL MODE` (neutral).
   - Interactive `ON` / `OFF` toggle button group.
   - Admin Passcode prompt modal when switching protection `OFF` (preventing unauthorized deactivation).
   - "Test Exit" diagnostic button to demonstrate watchdog restart behavior in real time.
   - Graceful fallback for non-desktop environments (Android / web browsers outside Electron).

2. **`electron/preload.cjs`**:
   - Extended `window.electronDesktop` bridge with:
     - `getKioskStatus()`
     - `setKioskProtection({ enabled, passcode })`

3. **`electron/main.cjs`**:
   - Added `kiosk:get-status` IPC handler (reads and returns config state from disk).
   - Added `kiosk:set-protection` IPC handler:
     - Enforces passcode `8536` verification before turning `OFF`.
     - Atomically writes state to `windows-kiosk/kiosk-config.json`.
     - Appends audit log to `windows-kiosk/logs/kiosk-watchdog.log` without leaking passcode.
     - Automatically launches background services (`watchdog-runner.vbs` and `guardian-runner.vbs`) if disabled.

---

## 3. Security & Safety Compliance

- **No Remote Filesystem Writing**: No public or cloud endpoint was created. All configuration changes happen strictly inside the local Windows Electron process via internal IPC channels.
- **Passcode Protection**: Turning protection `OFF` requires the administrator passcode (`8536`). Incorrect passcodes are rejected immediately with an error and logged without revealing the input in logs.
- **Multi-Platform Safety**: Standard Android and Web builds continue functioning normally. `GameSettingsSection.tsx` verifies runtime platform capabilities without throwing errors or breaking other form fields.
- **Engine Isolation**: All PowerShell and VBS kiosk scripts remain isolated inside `windows-kiosk/`.
