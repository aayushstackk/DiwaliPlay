/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SystemSettings, AdminRole, GameplayInteractionMode } from '../../types/backend';
import { adminApi } from '../../services/api';
import { useAdminTheme } from '../AdminThemeContext';
import {
  Sliders,
  Clock,
  Repeat,
  Save,
  CheckCircle2,
  AlertCircle,
  Camera,
  Touchpad,
  Target,
  Shield,
  ShieldCheck,
  Unlock,
  RefreshCw,
  Power,
  Key
} from 'lucide-react';

interface KioskStatusState {
  available: boolean;
  backProtection: boolean;
  autoLaunch: boolean;
  lastStateChange?: string;
  lastStateChangeReason?: string;
  loading: boolean;
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

  // Windows Kiosk Subsystem State
  const [kioskStatus, setKioskStatus] = useState<KioskStatusState>({
    available: false,
    backProtection: false,
    autoLaunch: true,
    loading: true
  });
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isKioskUpdating, setIsKioskUpdating] = useState(false);
  const [kioskFeedback, setKioskFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchKioskStatus = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronDesktop?.getKioskStatus) {
        const res = await (window as any).electronDesktop.getKioskStatus();
        if (res && res.success) {
          setKioskStatus({
            available: true,
            backProtection: Boolean(res.backProtection),
            autoLaunch: Boolean(res.autoLaunch),
            lastStateChange: res.lastStateChange,
            lastStateChangeReason: res.lastStateChangeReason,
            loading: false
          });
          return;
        }
      }

      if (
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ) {
        try {
          const res = await fetch('http://127.0.0.1:8536/api/status');
          if (res.ok) {
            const data = await res.json();
            setKioskStatus({
              available: true,
              backProtection: Boolean(data.backProtection),
              autoLaunch: Boolean(data.autoLaunch),
              lastStateChange: data.lastStateChange,
              lastStateChangeReason: data.lastStateChangeReason,
              loading: false
            });
            return;
          }
        } catch {}
      }

      setKioskStatus(prev => ({ ...prev, available: false, loading: false }));
    } catch {
      setKioskStatus(prev => ({ ...prev, available: false, loading: false }));
    }
  };

  useEffect(() => {
    fetchKioskStatus();
  }, []);

  const handleToggleKiosk = async (targetState: boolean) => {
    if (currentUserRole !== 'superadmin') {
      setKioskFeedback({
        type: 'error',
        message: 'Superadmin permissions are required to modify Kiosk Protection settings.'
      });
      return;
    }

    if (!targetState && kioskStatus.backProtection) {
      setEnteredPasscode('');
      setPasscodeError(null);
      setShowPasscodeModal(true);
      return;
    }

    await applyKioskState(targetState);
  };

  const applyKioskState = async (targetState: boolean, passcode?: string) => {
    setIsKioskUpdating(true);
    setKioskFeedback(null);

    try {
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

      if (
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ) {
        const res = await fetch('http://127.0.0.1:8536/api/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: targetState ? 'ON' : 'OFF',
            passcode: passcode || ''
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
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

      throw new Error('Kiosk control IPC bridge is only available in the Windows Electron application.');
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

  const handleConfirmPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredPasscode.trim()) {
      setPasscodeError('Please enter the admin passcode.');
      return;
    }
    applyKioskState(false, enteredPasscode.trim());
  };

  const handleTestExit = () => {
    if (typeof window !== 'undefined' && (window as any).electronDesktop?.exit) {
      (window as any).electronDesktop.exit();
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
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b gap-2 ${
              isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Shield className={`w-4 h-4 ${
                  kioskStatus.backProtection
                    ? 'text-emerald-400'
                    : isLight ? 'text-[#B36D4E]' : 'text-cyan-400'
                }`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${primaryText}`}>
                  Auto Launch & Back Protection
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                  isLight
                    ? 'bg-[#76513D]/10 text-[#76513D] border-[#76513D]/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  Windows Kiosk
                </span>
              </div>

              {/* Status Badge & Toggle Switch */}
              <div className="flex items-center gap-3">
                {/* Status Indicator */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
                  kioskStatus.backProtection
                    ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                    : isLight
                      ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58]'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    kioskStatus.backProtection ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`} />
                  <span>
                    {kioskStatus.backProtection ? 'PROTECTED MODE' : 'NORMAL MODE'}
                  </span>
                </div>

                {/* ON / OFF Toggle Buttons */}
                <div className={`inline-flex p-0.5 rounded-xl border ${cardSubBg}`}>
                  <button
                    type="button"
                    disabled={isKioskUpdating}
                    onClick={() => handleToggleKiosk(true)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      kioskStatus.backProtection
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
                    disabled={isKioskUpdating}
                    onClick={() => handleToggleKiosk(false)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      !kioskStatus.backProtection
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
              </div>
            </div>

            {/* Description & Operational Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${cardSubBg}`}>
                <div className={`font-bold flex items-center gap-1.5 ${
                  kioskStatus.backProtection ? 'text-emerald-400' : primaryText
                }`}>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>When ON (Protected Mode)</span>
                </div>
                <ul className={`text-[11px] space-y-1 list-disc list-inside ${secondaryText}`}>
                  <li>Watchdog monitors DiwaliPlay and auto-relaunches on exit or crash.</li>
                  <li>Blocks accidental exit keys (Alt+F4, Windows Key, Alt+Tab, Ctrl+Esc).</li>
                  <li>Emergency admin unlock: <span className="font-mono font-bold text-amber-400">Ctrl + Alt + Shift + D</span>.</li>
                </ul>
              </div>

              <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${cardSubBg}`}>
                <div className={`font-bold flex items-center gap-1.5 ${
                  !kioskStatus.backProtection ? (isLight ? 'text-[#B36D4E]' : 'text-cyan-400') : primaryText
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

          {/* Footer bar with diagnostics and safe exit test */}
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t text-[10px] ${
            isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800/80'
          } ${secondaryText}`}>
            <div>
              <span>Engine: </span>
              <span className={`font-mono ${isLight ? 'text-[#76513D]' : 'text-cyan-400'}`}>
                windows-kiosk (Watchdog + Guardian)
              </span>
              {kioskStatus.lastStateChange && (
                <span className="ml-2 font-mono text-[9px] opacity-75">
                  Last updated: {new Date(kioskStatus.lastStateChange).toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={fetchKioskStatus}
                className="hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Status</span>
              </button>

              {typeof window !== 'undefined' && (window as any).electronDesktop?.exit && (
                <button
                  type="button"
                  onClick={handleTestExit}
                  className="px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                  title="Test App Exit: If Back Protection is ON, watchdog will recover and relaunch within 2s; if OFF, app exits normally."
                >
                  <Power className="w-2.5 h-2.5" />
                  <span>Test Exit</span>
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
    </div>
  );
};
