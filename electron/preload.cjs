/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { contextBridge, ipcRenderer } = require('electron');

// Ensure production backend API URL is available if needed by the frontend
contextBridge.exposeInMainWorld('electronDesktop', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  apiBaseUrl: 'https://diwaliplay.onrender.com/api',
  reload: () => ipcRenderer.send('app:reload'),
  toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
  exit: () => ipcRenderer.send('app:exit'),
  getKioskStatus: () => ipcRenderer.invoke('kiosk:get-status'),
  setKioskProtection: (args) => ipcRenderer.invoke('kiosk:set-protection', args)
});

// Bridge specifically for loading/offline screen
contextBridge.exposeInMainWorld('electronBridge', {
  retryLoad: () => ipcRenderer.send('app:retry-load'),
  onConnectionError: (callback) => {
    ipcRenderer.on('connection:error', (_event, message) => callback(message));
  },
  onConnectionProgress: (callback) => {
    ipcRenderer.on('connection:progress', (_event, message) => callback(message));
  }
});
