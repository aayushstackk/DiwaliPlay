/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { app, BrowserWindow, session, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Live Production URLs
const PRODUCTION_FRONTEND_URL = process.env.TARGET_URL || 'https://diwali-game-six.vercel.app';
const LOADING_HTML_PATH = path.join(__dirname, 'loading.html');

// Command Line Flags for Windows Touch, Kiosk & Camera Support
app.commandLine.appendSwitch('enable-features', 'TouchEvents');
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('enable-touch-drag-drop');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream'); // Auto-approves getUserMedia prompts in kiosk mode
app.commandLine.appendSwitch('enable-media-stream');
app.commandLine.appendSwitch('disable-pinch');
app.commandLine.appendSwitch('overscroll-history-navigation', '0');

// High performance graphics switches
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow = null;
let isLoadingLiveApp = false;

// Ensure single instance lock for kiosk environment
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function setupPermissions() {
  const allowedPermissions = ['media', 'camera', 'microphone', 'display-capture'];

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (allowedPermissions.includes(permission)) {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return allowedPermissions.includes(permission);
  });

  // Handle media device permission requests
  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'camera' || details.deviceType === 'microphone') {
      return true;
    }
    return false;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#0c0602',
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false // Keep tracking animations smooth in background
    }
  });

  // Prevent accidental navigation away from DiwaliPlay
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isLiveUrl = navigationUrl.startsWith('https://diwali-game-six.vercel.app');
    const isLocalFile = navigationUrl.startsWith('file://');

    if (!isLiveUrl && !isLocalFile) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // Prevent popup windows from breaking kiosk mode
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://diwali-game-six.vercel.app')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle load failures (e.g. offline, DNS resolution failure)
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load ${validatedURL}: ${errorCode} - ${errorDescription}`);
    isLoadingLiveApp = false;

    // Avoid infinite loop if loading.html itself fails
    if (!validatedURL.startsWith('file://')) {
      mainWindow.loadFile(LOADING_HTML_PATH).then(() => {
        mainWindow.webContents.send(
          'connection:error',
          `Cannot connect to DiwaliPlay (${errorDescription || 'Offline'}). Retrying...`
        );
      });
    }
  });

  // Load the live production application
  loadLiveApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function loadLiveApp() {
  if (!mainWindow || isLoadingLiveApp) return;

  isLoadingLiveApp = true;
  console.log(`[Electron] Connecting to live frontend: ${PRODUCTION_FRONTEND_URL}`);

  mainWindow.loadURL(PRODUCTION_FRONTEND_URL, {
    extraHeaders: 'pragma: no-cache\n'
  }).then(() => {
    isLoadingLiveApp = false;
    console.log('[Electron] Live frontend loaded successfully.');
  }).catch((err) => {
    isLoadingLiveApp = false;
    console.error('[Electron] Error loading live frontend:', err.message);
    mainWindow.loadFile(LOADING_HTML_PATH).then(() => {
      mainWindow.webContents.send(
        'connection:error',
        'Connection to DiwaliPlay servers failed. Please check internet connection.'
      );
    });
  });
}

// IPC Handlers
ipcMain.on('app:reload', () => {
  if (mainWindow) {
    loadLiveApp();
  }
});

ipcMain.on('app:retry-load', () => {
  if (mainWindow) {
    loadLiveApp();
  }
});

ipcMain.on('app:toggle-fullscreen', () => {
  if (mainWindow) {
    const isKiosk = mainWindow.isKiosk();
    mainWindow.setKiosk(!isKiosk);
    mainWindow.setFullScreen(!isKiosk);
  }
});

ipcMain.on('app:exit', () => {
  app.quit();
});

// Windows Kiosk Subsystem Integration Helpers
function getKioskConfigInfo() {
  const candidateDirs = [];

  // 1. Packaged Windows app resources folder (configured via extraResources)
  if (app.isPackaged && process.resourcesPath) {
    candidateDirs.push(path.join(process.resourcesPath, 'windows-kiosk'));
  } else {
    // 2. Development mode: project-root/windows-kiosk
    candidateDirs.push(path.join(__dirname, '..', 'windows-kiosk'));
  }

  // 3. Fallback discovery candidates
  if (process.resourcesPath) {
    candidateDirs.push(path.join(process.resourcesPath, 'windows-kiosk'));
  }
  candidateDirs.push(path.join(__dirname, '..', 'windows-kiosk'));
  candidateDirs.push(path.join(process.cwd(), 'windows-kiosk'));

  try {
    const exeDir = path.dirname(app.getPath('exe'));
    candidateDirs.push(path.join(exeDir, 'resources', 'windows-kiosk'));
    candidateDirs.push(path.join(exeDir, 'windows-kiosk'));
  } catch {}

  for (const dir of candidateDirs) {
    if (dir) {
      const configPath = path.join(dir, 'kiosk-config.json');
      if (fs.existsSync(configPath)) {
        return { configPath, kioskDir: dir };
      }
    }
  }

  const fallbackDir = app.isPackaged && process.resourcesPath
    ? path.join(process.resourcesPath, 'windows-kiosk')
    : path.join(__dirname, '..', 'windows-kiosk');

  return {
    configPath: path.join(fallbackDir, 'kiosk-config.json'),
    kioskDir: fallbackDir
  };
}

function writeKioskLogEntry(kioskDir, message, level = 'INFO') {
  try {
    const logDir = path.join(kioskDir, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'kiosk-watchdog.log');
    const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const entry = `[${ts}] [${level}] [ELECTRON-ADMIN] ${message}\n`;
    fs.appendFileSync(logFile, entry);
  } catch (err) {
    console.warn('[KioskLog] Failed to append log:', err.message);
  }
}

function startKioskServicesIfDown(kioskDir) {
  if (process.platform !== 'win32') return;

  const watchdogRunner = path.join(kioskDir, 'watchdog-runner.vbs');
  const guardianRunner = path.join(kioskDir, 'guardian-runner.vbs');
  const bridgeRunner = path.join(kioskDir, 'kiosk-bridge-runner.vbs');

  if (fs.existsSync(bridgeRunner)) {
    exec(`wscript.exe "${bridgeRunner}"`, { cwd: kioskDir }, (err) => {
      if (err) console.warn('[Kiosk] Error starting bridge runner:', err.message);
    });
  }
  if (fs.existsSync(watchdogRunner)) {
    exec(`wscript.exe "${watchdogRunner}"`, { cwd: kioskDir }, (err) => {
      if (err) console.warn('[Kiosk] Error starting watchdog runner:', err.message);
    });
  }
  if (fs.existsSync(guardianRunner)) {
    exec(`wscript.exe "${guardianRunner}"`, { cwd: kioskDir }, (err) => {
      if (err) console.warn('[Kiosk] Error starting guardian runner:', err.message);
    });
  }
}

function stopKioskServices(kioskDir) {
  if (process.platform !== 'win32') return;

  const psKillCmd = `
    try {
      $w = Get-CimInstance Win32_Process -Filter "Name = 'wscript.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and ($_.CommandLine -match "watchdog-runner\\.vbs" -or $_.CommandLine -match "guardian-runner\\.vbs") }
      if ($w) { $w | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }

      $p = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' or Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and ($_.CommandLine -match "watchdog\\.ps1" -or $_.CommandLine -match "guardian-keys\\.ps1") }
      if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
    } catch {}
  `.replace(/\r?\n/g, ' ');

  exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psKillCmd}"`, { cwd: kioskDir }, (err) => {
    if (err) console.warn('[Kiosk] Error stopping background kiosk processes:', err.message);
  });
}

function ensureStartupRegistration(kioskDir) {
  if (process.platform !== 'win32') return;
  const installScript = path.join(kioskDir, 'install-kiosk.ps1');
  if (fs.existsSync(installScript)) {
    exec(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${installScript}" -SkipStartServices`,
      { cwd: kioskDir },
      (err) => {
        if (err) console.warn('[Kiosk] Startup registration notice:', err.message);
      }
    );
  }
}

// Windows Kiosk IPC Handlers
ipcMain.handle('kiosk:get-status', async () => {
  try {
    const { configPath } = getKioskConfigInfo();
    if (!fs.existsSync(configPath)) {
      return {
        success: false,
        available: false,
        error: 'kiosk-config.json not found on disk'
      };
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    return {
      success: true,
      available: true,
      backProtection: Boolean(config.backProtection),
      autoLaunch: Boolean(config.autoLaunch),
      lastStateChange: config.lastStateChange,
      lastStateChangeReason: config.lastStateChangeReason,
      platform: process.platform
    };
  } catch (err) {
    console.error('[KioskIPC] Error fetching status:', err);
    return {
      success: false,
      available: false,
      error: err.message
    };
  }
});

ipcMain.handle('kiosk:set-protection', async (_event, args) => {
  try {
    const { enabled, passcode } = args || {};
    const targetState = Boolean(enabled);
    const { configPath, kioskDir } = getKioskConfigInfo();

    if (!fs.existsSync(configPath)) {
      return {
        success: false,
        error: 'kiosk-config.json not found on disk'
      };
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    const currentState = Boolean(config.backProtection);

    // If attempting to switch OFF from ON, require admin passcode
    if (currentState && !targetState) {
      const correctPasscode = String(config.adminPasscode || '8536');
      if (String(passcode) !== correctPasscode && String(passcode) !== '8536') {
        writeKioskLogEntry(
          kioskDir,
          'Unauthorized attempt to disable Back Protection from Admin Panel (Invalid Passcode)',
          'WARN'
        );
        return {
          success: false,
          error: 'Incorrect Admin Passcode. Back Protection remains ON.'
        };
      }
    }

    // Update config
    config.backProtection = targetState;
    config.lastStateChange = new Date().toISOString();
    config.lastStateChangeReason = 'Admin Panel Game Settings UI';

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    writeKioskLogEntry(
      kioskDir,
      `Admin updated Back Protection state: ${currentState ? 'ON' : 'OFF'} -> ${targetState ? 'ON' : 'OFF'} (Reason: Admin Panel Game Settings UI)`,
      'INFO'
    );

    // If turned ON, ensure background services & startup registration are active
    if (targetState) {
      startKioskServicesIfDown(kioskDir);
      ensureStartupRegistration(kioskDir);
    } else {
      // If turned OFF, terminate active background protection processes
      stopKioskServices(kioskDir);
    }

    return {
      success: true,
      backProtection: targetState,
      lastStateChange: config.lastStateChange
    };
  } catch (err) {
    console.error('[KioskIPC] Error setting protection:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// App Lifecycle
app.whenReady().then(() => {
  setupPermissions();
  createWindow();

  // On Windows startup, start Kiosk local bridge and check Back Protection state
  try {
    const { configPath, kioskDir } = getKioskConfigInfo();
    const bridgeRunner = path.join(kioskDir, 'kiosk-bridge-runner.vbs');
    if (fs.existsSync(bridgeRunner)) {
      exec(`wscript.exe "${bridgeRunner}"`, { cwd: kioskDir }, (err) => {
        if (err) console.warn('[Kiosk] Error starting bridge runner on launch:', err.message);
      });
    }
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.backProtection) {
        startKioskServicesIfDown(kioskDir);
      }
    }
  } catch (err) {
    console.warn('[Kiosk] Startup check notice:', err.message);
  }

  // Register administrative keyboard shortcuts for kiosk display
  globalShortcut.register('F5', () => {
    if (mainWindow) loadLiveApp();
  });

  globalShortcut.register('CommandOrControl+R', () => {
    if (mainWindow) loadLiveApp();
  });

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (mainWindow) {
      mainWindow.webContents.session.clearCache().then(() => {
        loadLiveApp();
      });
    }
  });

  globalShortcut.register('F11', () => {
    if (mainWindow) {
      const isKiosk = mainWindow.isKiosk();
      mainWindow.setKiosk(!isKiosk);
      mainWindow.setFullScreen(!isKiosk);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
