/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SystemSettings, AdminRole, GameplayInteractionMode, SafeKioskDevice } from '../../types/backend';
import { adminApi } from '../../services/api';
import { useAdminTheme } from '../AdminThemeContext';
import {
  Sliders,
  Clock,
  Repeat,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Camera,
  Touchpad,
  Target,
  Shield,
  ShieldCheck,
  Unlock,
  RefreshCw,
  Power,
  Key,
  Link2,
  Tv,
  Monitor,
  Globe,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
  Radio
} from 'lucide-react';

const LOCAL_KIOSK_BRIDGE_URL = 'http://127.0.0.1:8537';
const KIOSK_TOKEN_STORAGE_KEY = 'diwaliplay_kiosk_bridge_token';

interface KioskStatusState {
  available: boolean;
  connected: boolean;
  paired: boolean;
  isElectron: boolean;
  backProtection: boolean;
  autoLaunch: boolean;
  watchdogRunning?: boolean;
  guardianRunning?: boolean;
  appRunning?: boolean;
  lastStateChange?: string;
  lastStateChangeReason?: string;
  loading: boolean;
  mixedContentBlocked?: boolean;
}

interface GameSettingsSectionProps {
  settings: SystemSettings | null;
  onSettingsUpdated: (updated: SystemSettings) => void;
  currentUserRole: AdminRole;
}

export const GameSettingsSection: React.FC<GameSettingsSectionProps> = ({
  settings,
  onSettingsUpdated,
  currentUserRole
}) => {
  const { isLight } = useAdminTheme();

  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_2px_8px_rgba(73,52,38,0.05)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 text-slate-100 shadow-sm';
  const cardSubBg = isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/80 border-slate-800';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';
  const secondaryText = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const inputBg = isLight
    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] placeholder-[#806B58]/60 focus:border-[#B36D4E]'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-400';

  const [gameDurationSeconds, setGameDurationSeconds] = useState(settings?.gameDurationSeconds || 35);
  const [allowMultiplePlaysPerUser, setAllowMultiplePlaysPerUser] = useState(
    settings?.allowMultiplePlaysPerUser || false
  );
  const [codeExpirySeconds, setCodeExpirySeconds] = useState(settings?.codeExpirySeconds || 120);
  const [gameplayMode, setGameplayMode] = useState<GameplayInteractionMode>(
    settings?.gameplayMode || 'camera'
  );
  const [targetScoreEnabled, setTargetScoreEnabled] = useState(
    settings?.targetScoreEnabled || false
  );
  const [targetScore, setTargetScore] = useState<number>(
    typeof settings?.targetScore === 'number' && settings.targetScore > 0 ? settings.targetScore : 5000
  );

  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Windows Kiosk Subsystem State (Local Loopback / Direct Electron)
  const [kioskStatus, setKioskStatus] = useState<KioskStatusState>({
    available: false,
    connected: false,
    paired: false,
    isElectron: false,
    backProtection: false,
    autoLaunch: true,
    loading: true
  });
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isKioskUpdating, setIsKioskUpdating] = useState(false);
  const [kioskFeedback, setKioskFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Local Bridge Pairing Modal State
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingPasscode, setPairingPasscode] = useState('');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);

  // Remote Kiosk Cloud Relay Devices State
  const [remoteDevices, setRemoteDevices] = useState<SafeKioskDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  // Cloud Pairing Modal State
  const [showCloudPairModal, setShowCloudPairModal] = useState(false);
  const [pairingTab, setPairingTab] = useState<'claim' | 'generate'>('claim');
  const [claimPairingCode, setClaimPairingCode] = useState('');
  const [claimDeviceName, setClaimDeviceName] = useState('');
  const [generatedCodeInfo, setGeneratedCodeInfo] = useState<{ code: string; expiresAt: string; deviceId: string } | null>(null);
  const [cloudPairError, setCloudPairError] = useState<string | null>(null);
  const [isCloudPairing, setIsCloudPairing] = useState(false);

  const formatHeartbeatAge = (iso?: string): string => {
    if (!iso) return 'Never';
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  };

  const fetchRemoteDevices = async () => {
    try {
      setIsLoadingDevices(true);
      const res = await adminApi.getKioskDevices();
      if (res && res.success && Array.isArray(res.devices)) {
        setRemoteDevices(res.devices);
        setSelectedDeviceId(prev => {
          if (prev && (prev === 'local' || res.devices.some(d => d.id === prev))) {
            return prev;
          }
          const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronDesktop?.getKioskStatus);
          if (isElectron && res.devices.length === 0) return 'local';
          const firstOnline = res.devices.find(d => d.isOnline);
          if (firstOnline) return firstOnline.id;
          if (res.devices.length > 0) return res.devices[0].id;
          return isElectron ? 'local' : '';
        });
      }
    } catch (err) {
      console.warn('Failed to fetch remote kiosk devices:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const fetchKioskStatus = async () => {
    try {
      // 1. Electron IPC mode
      if (typeof window !== 'undefined' && (window as any).electronDesktop?.getKioskStatus) {
        const res = await (window as any).electronDesktop.getKioskStatus();
        if (res && res.success) {
          setKioskStatus({
            available: true,
            connected: true,
            paired: true,
            isElectron: true,
            backProtection: Boolean(res.backProtection),
            autoLaunch: Boolean(res.autoLaunch),
            lastStateChange: res.lastStateChange,
            lastStateChangeReason: res.lastStateChangeReason,
            loading: false
          });
          return;
        }
      }

      // 2. Browser Environment: Connect to local PC bridge on 127.0.0.1:8537
      if (typeof window !== 'undefined') {
        const storedToken = localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY) || '';
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };
          if (storedToken) {
            headers['X-Kiosk-Token'] = storedToken;
          }

          const res = await fetch(`${LOCAL_KIOSK_BRIDGE_URL}/api/kiosk/status`, {
            method: 'GET',
            headers,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            setKioskStatus({
              available: true,
              connected: true,
              paired: Boolean(data.paired),
              isElectron: false,
              backProtection: Boolean(data.backProtection),
              autoLaunch: Boolean(data.autoLaunch),
              watchdogRunning: Boolean(data.watchdogRunning),
              guardianRunning: Boolean(data.guardianRunning),
              appRunning: Boolean(data.appRunning),
              lastStateChange: data.lastStateChange,
              lastStateChangeReason: data.lastStateChangeReason,
              loading: false,
              mixedContentBlocked: false
            });
            return;
          }
        } catch (fetchErr: any) {
          const isHttps = window.location.protocol === 'https:';
          setKioskStatus(prev => ({
            ...prev,
            available: false,
            connected: false,
            paired: false,
            isElectron: false,
            loading: false,
            mixedContentBlocked: isHttps
          }));
          return;
        }
      }

      setKioskStatus(prev => ({ ...prev, available: false, connected: false, loading: false }));
    } catch {
      setKioskStatus(prev => ({ ...prev, available: false, connected: false, loading: false }));
    }
  };

  useEffect(() => {
    fetchRemoteDevices();
    fetchKioskStatus();
    const interval = setInterval(() => {
      fetchRemoteDevices();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const currentRemoteDevice = remoteDevices.find(d => d.id === selectedDeviceId);

  const handleToggleKiosk = async (targetState: boolean) => {
    if (currentUserRole !== 'superadmin') {
      setKioskFeedback({
        type: 'error',
        message: 'Superadmin permissions are required to modify Kiosk Protection settings.'
      });
      return;
    }

    // Local loopback mode
    if (selectedDeviceId === 'local') {
      if (!kioskStatus.isElectron && !kioskStatus.paired) {
        setPairingPasscode('');
        setPairingError(null);
        setShowPairingModal(true);
        return;
      }

      if (!targetState && kioskStatus.backProtection) {
        setEnteredPasscode('');
        setPasscodeError(null);
        setShowPasscodeModal(true);
        return;
      }

      await applyKioskState(targetState);
      return;
    }

    // Remote Device Mode
    if (!currentRemoteDevice) {
      setShowCloudPairModal(true);
      return;
    }

    if (!currentRemoteDevice.isOnline) {
      setKioskFeedback({
        type: 'error',
        message: `Device "${currentRemoteDevice.name}" is OFFLINE. Ensure the TV PC is connected and the agent is running.`
      });
      return;
    }

    if (!targetState && currentRemoteDevice.status?.backProtection) {
      setEnteredPasscode('');
      setPasscodeError(null);
      setShowPasscodeModal(true);
      return;
    }

    await applyRemoteKioskState(targetState);
  };

  const applyRemoteKioskState = async (targetState: boolean, passcode?: string) => {
    if (!selectedDeviceId || selectedDeviceId === 'local') return;
    setIsKioskUpdating(true);
    setKioskFeedback(null);

    try {
      const action = targetState ? 'enable' : 'disable';
      const res = await adminApi.sendKioskCommand(selectedDeviceId, action, passcode);

      if (!res.success || !res.executed) {
        throw new Error(res.error || res.message || 'Execution failed on TV PC.');
      }

      setKioskFeedback({
        type: 'success',
        message: targetState
          ? `Auto Launch & Back Protection enabled on "${currentRemoteDevice?.name || 'TV PC'}" (Protected Mode: auto-restart active, exit shortcuts guarded).`
          : `Back Protection disabled on "${currentRemoteDevice?.name || 'TV PC'}" (Normal Mode: regular exit permitted, no auto-relaunch).`
      });

      setShowPasscodeModal(false);
      setEnteredPasscode('');
      await fetchRemoteDevices();
    } catch (err: any) {
      if (showPasscodeModal) {
        setPasscodeError(err.message || 'Invalid passcode');
      } else {
        setKioskFeedback({
          type: 'error',
          message: err.message || 'Failed to update remote kiosk protection.'
        });
      }
    } finally {
      setIsKioskUpdating(false);
    }
  };

  const applyKioskState = async (targetState: boolean, passcode?: string) => {
    setIsKioskUpdating(true);
    setKioskFeedback(null);

    try {
      // 1. Electron IPC mode
      if (typeof window !== 'undefined' && (window as any).electronDesktop?.setKioskProtection) {
        const res = await (window as any).electronDesktop.setKioskProtection({
          enabled: targetState,
          passcode: passcode || ''
        });

        if (!res.success) {
          throw new Error(res.error || 'Failed to update kiosk protection.');
        }

        setKioskStatus(prev => ({
          ...prev,
          backProtection: targetState,
          lastStateChange: res.lastStateChange || new Date().toISOString()
        }));

        setKioskFeedback({
          type: 'success',
          message: targetState
            ? 'Auto Launch & Back Protection enabled (Protected Mode: auto-restart active, exit shortcuts guarded).'
            : 'Back Protection disabled (Normal Mode: regular exit permitted, no auto-relaunch).'
        });
        setShowPasscodeModal(false);
        setEnteredPasscode('');
        return;
      }

      // 2. Browser HTTP Bridge mode
      if (typeof window !== 'undefined') {
        const storedToken = localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY) || '';
        if (!storedToken) {
          setShowPairingModal(true);
          throw new Error('Please pair this browser with your Windows PC before changing kiosk protection.');
        }

        const endpoint = targetState ? '/api/kiosk/enable' : '/api/kiosk/disable';
        const bodyObj = targetState ? {} : { passcode: passcode || '' };

        const res = await fetch(`${LOCAL_KIOSK_BRIDGE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Kiosk-Token': storedToken
          },
          body: JSON.stringify(bodyObj)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          if (res.status === 401 && data.message?.toLowerCase().includes('token')) {
            localStorage.removeItem(KIOSK_TOKEN_STORAGE_KEY);
            setShowPairingModal(true);
            throw new Error('Bridge session expired or invalid. Please re-pair with admin passcode.');
          }
          throw new Error(data.message || 'Failed to update kiosk protection.');
        }

        setKioskStatus(prev => ({
          ...prev,
          backProtection: targetState,
          lastStateChange: new Date().toISOString()
        }));

        setKioskFeedback({
          type: 'success',
          message: targetState
            ? 'Auto Launch & Back Protection enabled (Protected Mode: auto-restart active, exit shortcuts guarded).'
            : 'Back Protection disabled (Normal Mode: regular exit permitted, no auto-relaunch).'
        });
        setShowPasscodeModal(false);
        setEnteredPasscode('');
        return;
      }

      throw new Error('No kiosk communication bridge available.');
    } catch (err: any) {
      if (showPasscodeModal) {
        setPasscodeError(err.message || 'Invalid passcode');
      } else {
        setKioskFeedback({
          type: 'error',
          message: err.message || 'Failed to update kiosk protection.'
        });
      }
    } finally {
      setIsKioskUpdating(false);
    }
  };

  const handlePairBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPasscode.trim()) {
      setPairingError('Please enter the admin passcode.');
      return;
    }

    setIsPairing(true);
    setPairingError(null);
    try {
      const res = await fetch(`${LOCAL_KIOSK_BRIDGE_URL}/api/kiosk/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: pairingPasscode.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Invalid passcode');
      }

      localStorage.setItem(KIOSK_TOKEN_STORAGE_KEY, data.token);
      setShowPairingModal(false);
      setPairingPasscode('');
      setKioskFeedback({
        type: 'success',
        message: 'Browser paired successfully with Windows PC Kiosk Bridge!'
      });
      await fetchKioskStatus();
    } catch (err: any) {
      setPairingError(err.message || 'Failed to pair with bridge.');
    } finally {
      setIsPairing(false);
    }
  };

  const handleConfirmPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredPasscode.trim()) {
      setPasscodeError('Please enter the admin passcode.');
      return;
    }
    if (selectedDeviceId === 'local') {
      applyKioskState(false, enteredPasscode.trim());
    } else {
      applyRemoteKioskState(false, enteredPasscode.trim());
    }
  };

  const handleTestExit = async () => {
    if (selectedDeviceId === 'local') {
      if (typeof window !== 'undefined' && (window as any).electronDesktop?.exit) {
        (window as any).electronDesktop.exit();
        return;
      }

      try {
        const storedToken = localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY) || '';
        if (!storedToken) {
          setShowPairingModal(true);
          return;
        }
        const res = await fetch(`${LOCAL_KIOSK_BRIDGE_URL}/api/kiosk/test-exit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Kiosk-Token': storedToken
          }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setKioskFeedback({
            type: 'success',
            message: 'Test exit command delivered: DiwaliPlay application process closed.'
          });
        } else {
          throw new Error(data.message || 'Failed to execute test exit.');
        }
      } catch (err: any) {
        setKioskFeedback({
          type: 'error',
          message: err.message || 'Test exit failed.'
        });
      }
      return;
    }

    // Remote Device Mode
    if (!currentRemoteDevice) return;
    setIsKioskUpdating(true);
    setKioskFeedback(null);
    try {
      const res = await adminApi.sendKioskCommand(selectedDeviceId, 'test-exit');
      if (res.success && res.executed) {
        setKioskFeedback({
          type: 'success',
          message: `Test exit executed on "${currentRemoteDevice.name}": DiwaliPlay application process terminated.`
        });
      } else {
        throw new Error(res.error || res.message || 'Failed to execute test exit on remote PC.');
      }
      await fetchRemoteDevices();
    } catch (err: any) {
      setKioskFeedback({
        type: 'error',
        message: err.message || 'Test exit failed.'
      });
    } finally {
      setIsKioskUpdating(false);
    }
  };

  const handleRefreshStatus = async () => {
    setIsKioskUpdating(true);
    try {
      if (selectedDeviceId && selectedDeviceId !== 'local') {
        try {
          await adminApi.sendKioskCommand(selectedDeviceId, 'status');
        } catch {}
      }
      await fetchRemoteDevices();
      await fetchKioskStatus();
      setKioskFeedback({
        type: 'success',
        message: 'Kiosk status refreshed.'
      });
    } catch (err: any) {
      setKioskFeedback({
        type: 'error',
        message: err.message || 'Failed to refresh status.'
      });
    } finally {
      setIsKioskUpdating(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    const dev = remoteDevices.find(d => d.id === deviceId);
    if (!dev) return;
    if (!window.confirm(`Are you sure you want to revoke "${dev.name}"? It will be disconnected immediately.`)) {
      return;
    }
    try {
      await adminApi.deleteKioskDevice(deviceId);
      setKioskFeedback({
        type: 'success',
        message: `Device "${dev.name}" revoked.`
      });
      await fetchRemoteDevices();
    } catch (err: any) {
      setKioskFeedback({
        type: 'error',
        message: err.message || 'Failed to revoke device.'
      });
    }
  };

  const handleClaimPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimPairingCode.trim()) {
      setCloudPairError('Please enter the 6-digit code shown on the TV.');
      return;
    }
    setIsCloudPairing(true);
    setCloudPairError(null);
    try {
      const res = await adminApi.claimKioskPairingCode(claimPairingCode.trim(), claimDeviceName.trim() || undefined);
      if (res && res.success) {
        setShowCloudPairModal(false);
        setClaimPairingCode('');
        setClaimDeviceName('');
        setKioskFeedback({
          type: 'success',
          message: `Successfully paired "${res.device.name}"! Remote control is now active.`
        });
        await fetchRemoteDevices();
        setSelectedDeviceId(res.device.id);
      } else {
        throw new Error(res.message || 'Failed to pair device.');
      }
    } catch (err: any) {
      setCloudPairError(err.message || 'Invalid or expired pairing code.');
    } finally {
      setIsCloudPairing(false);
    }
  };

  const handleGeneratePairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCloudPairing(true);
    setCloudPairError(null);
    try {
      const res = await adminApi.requestKioskPairingCode(claimDeviceName.trim() || undefined);
      if (res && res.success) {
        setGeneratedCodeInfo({
          code: res.pairingCode,
          expiresAt: res.expiresAt,
          deviceId: res.deviceId
        });
        await fetchRemoteDevices();
      } else {
        throw new Error(res.message || 'Failed to generate code.');
      }
    } catch (err: any) {
      setCloudPairError(err.message || 'Failed to generate code.');
    } finally {
      setIsCloudPairing(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setGameDurationSeconds(settings.gameDurationSeconds || 35);
      setAllowMultiplePlaysPerUser(!!settings.allowMultiplePlaysPerUser);
      setCodeExpirySeconds(settings.codeExpirySeconds || 120);
      setGameplayMode(settings.gameplayMode || 'camera');
      setTargetScoreEnabled(Boolean(settings.targetScoreEnabled));
      setTargetScore(
        typeof settings.targetScore === 'number' && settings.targetScore > 0 ? settings.targetScore : 5000
      );
    }
  }, [settings]);

  const handleInitiateSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (currentUserRole !== 'superadmin') {
      setErrorMessage('Superadmin permissions are required to modify system settings.');
      return;
    }

    if (targetScoreEnabled && (isNaN(Number(targetScore)) || Number(targetScore) < 100)) {
      setErrorMessage('Target score must be a positive number of at least 100 points.');
      return;
    }

    if (
      gameplayMode !== (settings?.gameplayMode || 'camera') ||
      allowMultiplePlaysPerUser !== (settings?.allowMultiplePlaysPerUser || false) ||
      gameDurationSeconds !== (settings?.gameDurationSeconds || 35) ||
      targetScoreEnabled !== (settings?.targetScoreEnabled || false) ||
      targetScore !== (settings?.targetScore || 5000)
    ) {
      setShowConfirmModal(true);
    } else {
      executeSave();
    }
  };

  const executeSave = async () => {
    setShowConfirmModal(false);
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await adminApi.updateSettings({
        gameDurationSeconds: Number(gameDurationSeconds),
        allowMultiplePlaysPerUser: Boolean(allowMultiplePlaysPerUser),
        codeExpirySeconds: Number(codeExpirySeconds),
        gameplayMode: gameplayMode,
        targetScoreEnabled: Boolean(targetScoreEnabled),
        targetScore: Number(targetScore) > 0 ? Number(targetScore) : 5000
      });
      setIsSaving(false);
      setSuccessMessage('Gameplay and system settings successfully updated and persisted to database.');
      onSettingsUpdated(res.settings);
    } catch (err: any) {
      setIsSaving(false);
      setErrorMessage(err.data?.message || err.message || 'Failed to update system settings.');
    }
  };

  return (
    <div className="p-3 sm:p-5 max-w-6xl mx-auto space-y-4">
      {/* Compact Header Bar */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
        isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${
              isLight
                ? 'bg-[#76513D]/10 border-[#76513D]/30 text-[#76513D]'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
            }`}>
              <Sliders className="w-3.5 h-3.5" />
            </div>
            <h1 className={`text-base font-bold tracking-wide ${primaryText}`}>
              Game Settings
            </h1>
          </div>
          <p className={`text-[11px] mt-0.5 ${secondaryText}`}>
            Core gameplay parameters, interaction mode, and session policies
          </p>
        </div>

        <button
          type="button"
          onClick={handleInitiateSave}
          disabled={isSaving}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 self-start sm:self-auto cursor-pointer ${
            isLight
              ? 'bg-[#76513D] hover:bg-[#5D3F2E] text-[#FDF9F3] shadow-[0_2px_10px_rgba(118,81,61,0.25)]'
              : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
          }`}
        >
          {isSaving ? (
            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Status Messages */}
      {successMessage && (
        <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* One-Page Compact 2-Column Grid */}
      <form onSubmit={handleInitiateSave} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CARD 1: Gameplay Interaction Mode */}
        <div className={`border rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3 ${cardBg}`}>
          <div>
            <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2">
                <Camera className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${primaryText}`}>
                  Interaction Mode
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  isLight
                    ? gameplayMode === 'touch'
                      ? 'bg-[#58734B]/10 text-[#58734B] border-[#58734B]/30'
                      : 'bg-[#B36D4E]/10 text-[#B36D4E] border-[#B36D4E]/30'
                    : gameplayMode === 'touch'
                      ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                      : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                }`}
              >
                {gameplayMode === 'touch' ? 'TOUCH MODE' : 'CAMERA MODE'}
              </span>
            </div>

            <p className={`text-[11px] mt-2 ${secondaryText}`}>
              Select how players interact with bombs during the active round.
            </p>

            <div className="grid grid-cols-2 gap-2.5 mt-3">
              {/* Option A: Camera */}
              <button
                type="button"
                onClick={() => setGameplayMode('camera')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameplayMode === 'camera'
                    ? isLight
                      ? 'bg-[#FAF4E8] border-[#B36D4E] ring-2 ring-[#B36D4E]/25 shadow-[0_2px_8px_rgba(179,109,78,0.15)]'
                      : 'bg-cyan-500/15 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                    : isLight
                      ? 'bg-[#FAF4E8] border-[#D8C7AE] hover:border-[#B36D4E] text-[#806B58]'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className={`flex items-center gap-1.5 font-bold text-xs ${primaryText}`}>
                  <Camera className={`w-3.5 h-3.5 ${
                    gameplayMode === 'camera'
                      ? isLight ? 'text-[#B36D4E]' : 'text-cyan-400'
                      : isLight ? 'text-[#806B58]' : 'text-slate-500'
                  }`} />
                  <span>Camera Motion</span>
                </div>
                <div className={`text-[10px] mt-1 leading-snug ${secondaryText}`}>
                  Hand tracking, animated fire flames & physical motion bursting.
                </div>
              </button>

              {/* Option B: Touch */}
              <button
                type="button"
                onClick={() => setGameplayMode('touch')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameplayMode === 'touch'
                    ? isLight
                      ? 'bg-[#FAF4E8] border-[#58734B] ring-2 ring-[#58734B]/25 shadow-[0_2px_8px_rgba(88,115,75,0.15)]'
                      : 'bg-teal-500/15 border-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.2)]'
                    : isLight
                      ? 'bg-[#FAF4E8] border-[#D8C7AE] hover:border-[#58734B] text-[#806B58]'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className={`flex items-center gap-1.5 font-bold text-xs ${primaryText}`}>
                  <Touchpad className={`w-3.5 h-3.5 ${
                    gameplayMode === 'touch'
                      ? isLight ? 'text-[#58734B]' : 'text-teal-400'
                      : isLight ? 'text-[#806B58]' : 'text-slate-500'
                  }`} />
                  <span>Direct Touch</span>
                </div>
                <div className={`text-[10px] mt-1 leading-snug ${secondaryText}`}>
                  Direct touchscreen taps & mouse clicks. Zero webcam required.
                </div>
              </button>
            </div>
          </div>

          <div className={`text-[10px] pt-2 border-t ${isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800/80'} ${secondaryText}`}>
            Affects both kiosk terminals and personal devices immediately on new game sessions.
          </div>
        </div>

        {/* CARD 2: Target Score Goal */}
        <div className={`border rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3 ${cardBg}`}>
          <div>
            <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2">
                <Target className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-amber-400'}`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${primaryText}`}>
                  Target Score Challenge
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTargetScoreEnabled(!targetScoreEnabled)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                  targetScoreEnabled
                    ? isLight
                      ? 'bg-[#58734B]/15 text-[#58734B] border-[#58734B]/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : isLight
                      ? 'bg-[#FAF4E8] text-[#806B58] border-[#D8C7AE]'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                {targetScoreEnabled ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            <p className={`text-[11px] mt-2 ${secondaryText}`}>
              Shows a live target progress bar in HUD and special target achieved badge on Game Over.
            </p>

            <div className={`mt-3 p-3 rounded-xl border flex items-center justify-between gap-4 ${cardSubBg}`}>
              <div>
                <label className={`text-xs font-semibold block ${primaryText}`}>
                  Target Points Goal
                </label>
                <span className={`text-[10px] ${secondaryText}`}>
                  Points needed to complete challenge
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="100"
                  step="100"
                  disabled={!targetScoreEnabled}
                  value={targetScore}
                  onChange={(e) => setTargetScore(Math.max(100, Number(e.target.value)))}
                  className={`w-24 px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold text-right outline-none transition-colors disabled:opacity-40 border ${inputBg}`}
                />
                <span className={`text-xs font-mono ${secondaryText}`}>pts</span>
              </div>
            </div>
          </div>

          <div className={`text-[10px] pt-2 border-t ${isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800/80'} ${secondaryText}`}>
            Recommended value: 3,000 to 6,000 points for a 35-second round.
          </div>
        </div>

        {/* CARD 3: Timing & Durations */}
        <div className={`border rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3 ${cardBg}`}>
          <div>
            <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${primaryText}`}>
                  Timing Parameters
                </span>
              </div>
              <span className={`text-[10px] font-mono ${secondaryText}`}>SESSION RULES</span>
            </div>

            <div className="space-y-2.5 mt-3">
              {/* Game Duration */}
              <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${cardSubBg}`}>
                <div>
                  <div className={`text-xs font-semibold ${primaryText}`}>
                    Gameplay Round Duration
                  </div>
                  <div className={`text-[10px] ${secondaryText}`}>
                    Active bomb popping countdown timer
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="15"
                    max="120"
                    value={gameDurationSeconds}
                    onChange={(e) => setGameDurationSeconds(Math.max(15, Number(e.target.value)))}
                    className={`w-18 px-2 py-1 rounded-lg font-mono text-xs font-bold text-right outline-none transition-colors border ${inputBg}`}
                  />
                  <span className={`text-xs font-mono ${secondaryText}`}>sec</span>
                </div>
              </div>

              {/* Code Validity */}
              <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${cardSubBg}`}>
                <div>
                  <div className={`text-xs font-semibold ${primaryText}`}>
                    Game Code Expiry Window
                  </div>
                  <div className={`text-[10px] ${secondaryText}`}>
                    Time before 4-digit code expires at kiosk
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="30"
                    max="600"
                    value={codeExpirySeconds}
                    onChange={(e) => setCodeExpirySeconds(Math.max(30, Number(e.target.value)))}
                    className={`w-18 px-2 py-1 rounded-lg font-mono text-xs font-bold text-right outline-none transition-colors border ${inputBg}`}
                  />
                  <span className={`text-xs font-mono ${secondaryText}`}>sec</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`text-[10px] pt-2 border-t ${isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800/80'} ${secondaryText}`}>
            Standard: 35 seconds play duration, 120 seconds kiosk code lifetime.
          </div>
        </div>

        {/* CARD 4: Player Policies & Access */}
        <div className={`border rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3 ${cardBg}`}>
          <div>
            <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2">
                <Repeat className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${primaryText}`}>
                  Player Replay Policy
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAllowMultiplePlaysPerUser(!allowMultiplePlaysPerUser)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                  allowMultiplePlaysPerUser
                    ? isLight
                      ? 'bg-[#58734B]/15 text-[#58734B] border-[#58734B]/30'
                      : 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                    : isLight
                      ? 'bg-[#FAF4E8] text-[#806B58] border-[#D8C7AE]'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {allowMultiplePlaysPerUser ? 'MULTIPLE PLAYS' : 'SINGLE PLAY ONLY'}
              </button>
            </div>

            <div className={`p-3 rounded-xl border mt-3 space-y-2 ${cardSubBg}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${primaryText}`}>
                  Allow Multiple Plays per User
                </span>
                <input
                  type="checkbox"
                  checked={allowMultiplePlaysPerUser}
                  onChange={(e) => setAllowMultiplePlaysPerUser(e.target.checked)}
                  className={`w-4 h-4 rounded cursor-pointer ${
                    isLight ? 'accent-[#B36D4E]' : 'accent-cyan-400'
                  }`}
                />
              </div>
              <p className={`text-[11px] leading-snug ${secondaryText}`}>
                {allowMultiplePlaysPerUser
                  ? 'Participants can re-register with the same phone number to generate a new game code and play multiple times.'
                  : 'Participants can only play once per mobile number. Subsequent attempts show their previous score.'}
              </p>
            </div>
          </div>

          <div className={`text-[10px] pt-2 border-t ${isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800/80'} ${secondaryText}`}>
            Security audit logs record every settings change made by authenticated admins.
          </div>
        </div>

        {/* CARD 5: Windows Kiosk Auto Launch & Back Protection */}
        <div className={`border rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3 lg:col-span-2 ${cardBg}`}>
          <div>
            <div className={`flex flex-col lg:flex-row lg:items-center justify-between pb-3 border-b gap-3 ${
              isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
            }`}>
              {/* Title & Device Selector */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Shield className={`w-4 h-4 ${
                  (selectedDeviceId === 'local' ? kioskStatus.backProtection : currentRemoteDevice?.status?.backProtection)
                    ? 'text-emerald-400'
                    : isLight ? 'text-[#B36D4E]' : 'text-cyan-400'
                }`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${primaryText}`}>
                  Auto Launch & Back Protection
                </span>

                {/* Device Selector Dropdown */}
                <div className="flex items-center gap-1.5 ml-1">
                  <Tv className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        setClaimPairingCode('');
                        setClaimDeviceName('');
                        setGeneratedCodeInfo(null);
                        setCloudPairError(null);
                        setShowCloudPairModal(true);
                      } else {
                        setSelectedDeviceId(e.target.value);
                      }
                    }}
                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg border outline-none cursor-pointer transition-colors ${
                      isLight
                        ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426]'
                        : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    {remoteDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        📺 {d.name} {d.isOnline ? '🟢 (Online)' : '🔴 (Offline)'}
                      </option>
                    ))}
                    <option value="__add_new__">+ Pair New TV PC...</option>
                    <option value="local">💻 This PC (Direct 127.0.0.1)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setClaimPairingCode('');
                    setClaimDeviceName('');
                    setGeneratedCodeInfo(null);
                    setCloudPairError(null);
                    setShowCloudPairModal(true);
                  }}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Pair a new Windows TV PC"
                >
                  <Plus className="w-3 h-3" />
                  <span>Pair TV</span>
                </button>
              </div>

              {/* Status Badge & Toggle Switch */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {/* Heartbeat indicator for remote device */}
                {selectedDeviceId !== 'local' && currentRemoteDevice && (
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                    currentRemoteDevice.isOnline
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                    {currentRemoteDevice.isOnline ? (
                      <Wifi className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-3 h-3 text-slate-500" />
                    )}
                    <span>Heartbeat: {formatHeartbeatAge(currentRemoteDevice.lastHeartbeatAt)}</span>
                  </div>
                )}

                {/* Status Indicator */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
                  selectedDeviceId === 'local'
                    ? !kioskStatus.connected
                      ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                      : !kioskStatus.paired
                        ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                        : kioskStatus.backProtection
                          ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                          : isLight ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58]' : 'bg-slate-900 border-slate-800 text-slate-400'
                    : !currentRemoteDevice
                      ? 'bg-slate-900 border-slate-800 text-slate-400'
                      : !currentRemoteDevice.isOnline
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                        : currentRemoteDevice.status?.backProtection
                          ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                          : isLight ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58]' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    selectedDeviceId === 'local'
                      ? !kioskStatus.connected ? 'bg-rose-500' : !kioskStatus.paired ? 'bg-amber-400 animate-pulse' : kioskStatus.backProtection ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                      : !currentRemoteDevice ? 'bg-slate-500' : !currentRemoteDevice.isOnline ? 'bg-rose-500' : currentRemoteDevice.status?.backProtection ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`} />
                  <span>
                    {selectedDeviceId === 'local'
                      ? !kioskStatus.connected ? 'LOCAL PC NOT CONNECTED' : !kioskStatus.paired ? 'PAIRING REQUIRED' : kioskStatus.backProtection ? 'PROTECTED MODE' : 'NORMAL MODE'
                      : !currentRemoteDevice ? 'NO TV PAIRED' : !currentRemoteDevice.isOnline ? 'TV PC OFFLINE' : currentRemoteDevice.status?.backProtection ? 'PROTECTED MODE' : 'NORMAL MODE'}
                  </span>
                </div>

                {/* Local Browser Pair Button */}
                {selectedDeviceId === 'local' && kioskStatus.connected && !kioskStatus.paired && !kioskStatus.isElectron && (
                  <button
                    type="button"
                    onClick={() => {
                      setPairingPasscode('');
                      setPairingError(null);
                      setShowPairingModal(true);
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Link2 className="w-3 h-3" />
                    <span>Pair Local PC</span>
                  </button>
                )}

                {/* ON / OFF Toggle Buttons */}
                {(() => {
                  const isProtected = selectedDeviceId === 'local'
                    ? kioskStatus.backProtection
                    : Boolean(currentRemoteDevice?.status?.backProtection);
                  const isOperable = selectedDeviceId === 'local'
                    ? kioskStatus.connected
                    : Boolean(currentRemoteDevice?.isOnline);

                  return (
                    <div className={`inline-flex p-0.5 rounded-xl border ${cardSubBg}`}>
                      <button
                        type="button"
                        disabled={isKioskUpdating || !isOperable}
                        onClick={() => handleToggleKiosk(true)}
                        className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isProtected
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : isLight
                              ? 'text-[#806B58] hover:text-[#493426]'
                              : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        disabled={isKioskUpdating || !isOperable}
                        onClick={() => handleToggleKiosk(false)}
                        className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          !isProtected
                            ? isLight
                              ? 'bg-[#76513D] text-[#FDF9F3] shadow-sm'
                              : 'bg-slate-700 text-slate-100 shadow-sm'
                            : isLight
                              ? 'text-[#806B58] hover:text-[#493426]'
                              : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        OFF
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Remote Device Offline Warning */}
            {selectedDeviceId !== 'local' && currentRemoteDevice && !currentRemoteDevice.isOnline && (
              <div className="mt-3 p-2.5 rounded-xl border bg-rose-950/30 border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-[11px]">
                    <strong>{currentRemoteDevice.name}</strong> is currently OFFLINE. Ensure the TV PC has internet and <code>kiosk-cloud-agent.ps1</code> is running.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshStatus}
                  disabled={isKioskUpdating}
                  className="px-2.5 py-1 rounded-lg bg-rose-900/40 hover:bg-rose-900/60 text-rose-200 text-[11px] font-bold border border-rose-500/40 transition-colors cursor-pointer shrink-0"
                >
                  Check Online
                </button>
              </div>
            )}

            {/* No TV PC paired yet info banner */}
            {selectedDeviceId !== 'local' && remoteDevices.length === 0 && (
              <div className="mt-3 p-3 rounded-xl border bg-cyan-950/30 border-cyan-500/30 text-cyan-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Tv className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div>
                    <div className="font-bold text-cyan-300">No Remote TV PC Paired Yet</div>
                    <div className="text-[11px] text-cyan-200/80">
                      Pair your TV-connected Windows PC to control Auto Launch & Back Protection remotely from your laptop.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClaimPairingCode('');
                    setClaimDeviceName('');
                    setGeneratedCodeInfo(null);
                    setCloudPairError(null);
                    setShowCloudPairModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-colors cursor-pointer shrink-0"
                >
                  + Pair TV PC Now
                </button>
              </div>
            )}

            {/* Local Bridge Offline Info Banner (only shown when local mode is chosen) */}
            {selectedDeviceId === 'local' && !kioskStatus.connected && (
              <div className="mt-3 p-2.5 rounded-xl border bg-slate-900/60 border-slate-700/60 text-slate-300 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-[11px]">
                    Local PC Kiosk Bridge (<code>127.0.0.1:8537</code>) is not responding on this browser device. To control your TV PC remotely, select your TV PC from the device dropdown above.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={fetchKioskStatus}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-600 transition-colors cursor-pointer shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Description & Operational Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${cardSubBg}`}>
                <div className={`font-bold flex items-center gap-1.5 ${
                  (selectedDeviceId === 'local' ? kioskStatus.backProtection : currentRemoteDevice?.status?.backProtection)
                    ? 'text-emerald-400'
                    : primaryText
                }`}>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>When ON (Protected Mode)</span>
                </div>
                <ul className={`text-[11px] space-y-1 list-disc list-inside ${secondaryText}`}>
                  <li>Watchdog monitors DiwaliPlay and auto-relaunches on exit or crash.</li>
                  <li>Blocks accidental exit keys (Alt+F4, Windows Key, Alt+Tab, Ctrl+Esc).</li>
                  <li>Emergency admin unlock on TV PC: <span className="font-mono font-bold text-amber-400">Ctrl + Alt + Shift + D</span>.</li>
                </ul>
              </div>

              <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${cardSubBg}`}>
                <div className={`font-bold flex items-center gap-1.5 ${
                  !(selectedDeviceId === 'local' ? kioskStatus.backProtection : currentRemoteDevice?.status?.backProtection)
                    ? (isLight ? 'text-[#B36D4E]' : 'text-cyan-400')
                    : primaryText
                }`}>
                  <Unlock className={`w-3.5 h-3.5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                  <span>When OFF (Normal Mode)</span>
                </div>
                <ul className={`text-[11px] space-y-1 list-disc list-inside ${secondaryText}`}>
                  <li>Allows standard exit via Alt+F4, close button, or exit button.</li>
                  <li>Watchdog stands by without relaunching after app closure.</li>
                  <li>Switching OFF requires Admin Passcode (Default: <span className="font-mono font-bold">8536</span>).</li>
                </ul>
              </div>
            </div>

            {/* Live Kiosk Feedback */}
            {kioskFeedback && (
              <div className={`mt-3 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                kioskFeedback.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/60 border border-rose-500/40 text-rose-200'
              }`}>
                {kioskFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{kioskFeedback.message}</span>
              </div>
            )}
          </div>

          {/* Footer bar with diagnostics, safe exit test, and device management */}
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t text-[10px] ${
            isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800/80'
          } ${secondaryText}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span>Transport: </span>
              <span className={`font-mono font-bold ${isLight ? 'text-[#76513D]' : 'text-cyan-400'}`}>
                {selectedDeviceId === 'local'
                  ? kioskStatus.isElectron ? 'Electron IPC' : 'Local Bridge (127.0.0.1:8537)'
                  : 'Render Cloud Relay (Secure WSS)'}
              </span>
              {selectedDeviceId !== 'local' && currentRemoteDevice && (
                <span className="font-mono text-[9px] opacity-75">
                  Device: {currentRemoteDevice.id}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleRefreshStatus}
                disabled={isKioskUpdating}
                className="hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isKioskUpdating ? 'animate-spin' : ''}`} />
                <span>Refresh Status</span>
              </button>

              {/* Test Exit Button */}
              {((selectedDeviceId === 'local' && (kioskStatus.isElectron || (kioskStatus.connected && kioskStatus.paired))) ||
                (selectedDeviceId !== 'local' && currentRemoteDevice?.isOnline)) && (
                <button
                  type="button"
                  onClick={handleTestExit}
                  disabled={isKioskUpdating}
                  className="px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                  title="Test App Exit: If Back Protection is ON, watchdog will recover and relaunch within 2s; if OFF, app exits normally."
                >
                  <Power className="w-2.5 h-2.5" />
                  <span>Test Exit</span>
                </button>
              )}

              {/* Revoke Device Button */}
              {selectedDeviceId !== 'local' && currentRemoteDevice && currentUserRole === 'superadmin' && (
                <button
                  type="button"
                  onClick={() => handleDeleteDevice(currentRemoteDevice.id)}
                  disabled={isKioskUpdating}
                  className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800 hover:bg-rose-950/60 hover:border-rose-500/50 hover:text-rose-300 text-slate-400 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                  title="Revoke and delete this paired device"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>Revoke Device</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 ${
            isLight
              ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_20px_60px_rgba(73,52,38,0.3)]'
              : 'bg-[#0F1B2E] border-cyan-500/30 text-slate-100 shadow-2xl'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isLight
                  ? 'bg-[#B36D4E]/10 border-[#B36D4E]/30 text-[#B36D4E]'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              }`}>
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${primaryText}`}>
                  Confirm Game Settings Update
                </h3>
                <p className={`text-xs mt-1 ${secondaryText}`}>
                  You are about to modify core gameplay parameters. This takes effect on subsequent games.
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 font-mono ${cardSubBg}`}>
              <div className="flex items-center justify-between">
                <span className={secondaryText}>Interaction Mode:</span>
                <span className={`font-bold uppercase ${isLight ? 'text-[#B36D4E]' : 'text-cyan-300'}`}>{gameplayMode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={secondaryText}>Round Duration:</span>
                <span className={primaryText}>{gameDurationSeconds} seconds</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={secondaryText}>Target Score:</span>
                <span className={`font-bold ${isLight ? 'text-[#58734B]' : 'text-amber-300'}`}>
                  {targetScoreEnabled ? `${targetScore} pts` : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={secondaryText}>Multiple Plays:</span>
                <span className={primaryText}>{allowMultiplePlaysPerUser ? 'Allowed' : 'Disallowed'}</span>
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2.5 pt-2 border-t ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-[#FAF4E8] hover:bg-[#F1E8D9] border-[#D8C7AE] text-[#493426]'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSave}
                className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                  isLight
                    ? 'bg-[#76513D] hover:bg-[#5D3F2E] text-[#FDF9F3] shadow-[0_2px_10px_rgba(118,81,61,0.25)]'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                }`}
              >
                Confirm & Persist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Passcode Prompt Modal for Turning Protection OFF */}
      {showPasscodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 ${
            isLight
              ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_20px_60px_rgba(73,52,38,0.3)]'
              : 'bg-[#0F1B2E] border-cyan-500/30 text-slate-100 shadow-2xl'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${primaryText}`}>
                  Admin Passcode Required
                </h3>
                <p className={`text-xs mt-0.5 ${secondaryText}`}>
                  Enter passcode to disable Kiosk Back Protection and restore normal PC operation.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmPasscode} className="space-y-3">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${primaryText}`}>
                  Admin Passcode
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="Enter passcode (Default: 8536)"
                  value={enteredPasscode}
                  onChange={(e) => {
                    setEnteredPasscode(e.target.value);
                    setPasscodeError(null);
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-sm font-mono border outline-none transition-colors ${inputBg}`}
                />
                {passcodeError && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{passcodeError}</span>
                  </p>
                )}
              </div>

              <div className={`flex items-center justify-end gap-2 pt-2 border-t ${
                isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasscodeModal(false);
                    setEnteredPasscode('');
                    setPasscodeError(null);
                  }}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-[#FAF4E8] hover:bg-[#F1E8D9] border-[#D8C7AE] text-[#493426]'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isKioskUpdating}
                  className="px-4 py-2 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {isKioskUpdating ? 'Verifying...' : 'Unlock & Turn OFF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pairing Modal for Browser Admin Panel */}
      {showPairingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 ${
            isLight
              ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_20px_60px_rgba(73,52,38,0.3)]'
              : 'bg-[#0F1B2E] border-amber-500/30 text-slate-100 shadow-2xl'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${primaryText}`}>
                  Pair Browser with Local PC
                </h3>
                <p className={`text-xs mt-0.5 ${secondaryText}`}>
                  Authenticate this Chrome tab with the local Windows PC bridge on <code className="font-mono">127.0.0.1:8537</code>.
                </p>
              </div>
            </div>

            <form onSubmit={handlePairBridge} className="space-y-3">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${primaryText}`}>
                  Admin Passcode
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="Enter passcode (Default: 8536)"
                  value={pairingPasscode}
                  onChange={(e) => {
                    setPairingPasscode(e.target.value);
                    setPairingError(null);
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-sm font-mono border outline-none transition-colors ${inputBg}`}
                />
                {pairingError && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{pairingError}</span>
                  </p>
                )}
              </div>

              <div className={`flex items-center justify-end gap-2 pt-2 border-t ${
                isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPairingModal(false);
                    setPairingPasscode('');
                    setPairingError(null);
                  }}
                  className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-[#FAF4E8] hover:bg-[#F1E8D9] border-[#D8C7AE] text-[#493426]'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPairing}
                  className="px-4 py-2 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {isPairing ? 'Pairing...' : 'Pair Browser'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cloud Relay Remote TV PC Pairing Modal */}
      {showCloudPairModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 ${
            isLight
              ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_20px_60px_rgba(73,52,38,0.3)]'
              : 'bg-[#0F1B2E] border-cyan-500/30 text-slate-100 shadow-2xl'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${primaryText}`}>
                  Pair Remote Windows TV PC
                </h3>
                <p className={`text-xs mt-0.5 ${secondaryText}`}>
                  Connect your TV-connected Windows PC to the Render Cloud Relay so you can control it from any browser on any network.
                </p>
              </div>
            </div>

            {/* Mode Tabs */}
            <div className={`flex rounded-xl p-0.5 border ${cardSubBg}`}>
              <button
                type="button"
                onClick={() => {
                  setPairingTab('claim');
                  setCloudPairError(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  pairingTab === 'claim'
                    ? isLight
                      ? 'bg-[#76513D] text-[#FDF9F3] shadow-sm'
                      : 'bg-cyan-500 text-slate-950 shadow-sm'
                    : isLight
                      ? 'text-[#806B58] hover:text-[#493426]'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Enter TV Screen Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setPairingTab('generate');
                  setCloudPairError(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  pairingTab === 'generate'
                    ? isLight
                      ? 'bg-[#76513D] text-[#FDF9F3] shadow-sm'
                      : 'bg-cyan-500 text-slate-950 shadow-sm'
                    : isLight
                      ? 'text-[#806B58] hover:text-[#493426]'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Generate Code for TV
              </button>
            </div>

            {/* TAB 1: Claim code shown on TV screen */}
            {pairingTab === 'claim' && (
              <form onSubmit={handleClaimPairing} className="space-y-3 pt-1">
                <p className={`text-xs ${secondaryText}`}>
                  On your TV PC, run <code className="font-mono text-cyan-300">setup-cloud-relay.ps1</code> or launch DiwaliPlay. A 6-digit code will appear on screen.
                </p>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${primaryText}`}>
                    6-Digit TV Pairing Code
                  </label>
                  <input
                    type="text"
                    autoFocus
                    maxLength={6}
                    placeholder="e.g. 481920"
                    value={claimPairingCode}
                    onChange={(e) => {
                      setClaimPairingCode(e.target.value.replace(/\D/g, ''));
                      setCloudPairError(null);
                    }}
                    className={`w-full px-3 py-2 text-center text-lg tracking-widest font-mono font-bold rounded-xl border outline-none transition-colors ${inputBg}`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${primaryText}`}>
                    Device Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Main Stage TV Display"
                    value={claimDeviceName}
                    onChange={(e) => setClaimDeviceName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-colors ${inputBg}`}
                  />
                </div>

                {cloudPairError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{cloudPairError}</span>
                  </p>
                )}

                <div className={`flex items-center justify-end gap-2 pt-2 border-t ${
                  isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
                }`}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCloudPairModal(false);
                      setClaimPairingCode('');
                      setClaimDeviceName('');
                      setCloudPairError(null);
                    }}
                    className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      isLight
                        ? 'bg-[#FAF4E8] hover:bg-[#F1E8D9] border-[#D8C7AE] text-[#493426]'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCloudPairing || claimPairingCode.length !== 6}
                    className="px-4 py-2 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isCloudPairing ? 'Pairing...' : 'Pair TV PC'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: Generate code for TV PC */}
            {pairingTab === 'generate' && (
              <div className="space-y-3 pt-1">
                {!generatedCodeInfo ? (
                  <form onSubmit={handleGeneratePairingCode} className="space-y-3">
                    <div>
                      <label className={`block text-xs font-semibold mb-1 ${primaryText}`}>
                        Device Name
                      </label>
                      <input
                        type="text"
                        autoFocus
                        placeholder="e.g. Front Stage TV"
                        value={claimDeviceName}
                        onChange={(e) => setClaimDeviceName(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-colors ${inputBg}`}
                      />
                    </div>

                    {cloudPairError && (
                      <p className="text-[11px] text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{cloudPairError}</span>
                      </p>
                    )}

                    <div className={`flex items-center justify-end gap-2 pt-2 border-t ${
                      isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
                    }`}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCloudPairModal(false);
                          setCloudPairError(null);
                        }}
                        className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                          isLight
                            ? 'bg-[#FAF4E8] hover:bg-[#F1E8D9] border-[#D8C7AE] text-[#493426]'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCloudPairing}
                        className="px-4 py-2 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isCloudPairing ? 'Generating...' : 'Generate 6-Digit Code'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl border bg-slate-900/60 border-cyan-500/40 text-center space-y-1">
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                        Your TV Pairing Code
                      </div>
                      <div className="text-3xl font-mono font-extrabold text-cyan-300 tracking-widest py-1">
                        {generatedCodeInfo.code}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Expires in 15 minutes
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border bg-slate-950/70 border-slate-800 text-[11px] space-y-1.5 font-mono text-slate-300">
                      <div className="text-slate-400 font-sans font-bold">On the TV PC, open PowerShell and run:</div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-700/60 text-cyan-300 select-all overflow-x-auto">
                        powershell -File .\windows-kiosk\setup-cloud-relay.ps1 -PairingCode {generatedCodeInfo.code}
                      </div>
                    </div>

                    <div className={`flex items-center justify-end gap-2 pt-2 border-t ${
                      isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
                    }`}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCloudPairModal(false);
                          setGeneratedCodeInfo(null);
                          setClaimDeviceName('');
                        }}
                        className="px-4 py-2 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md cursor-pointer transition-all"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
