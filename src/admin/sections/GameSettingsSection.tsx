/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SystemSettings, AdminRole, GameplayInteractionMode } from '../../types/backend';
import { adminApi } from '../../services/api';
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
  Key
} from 'lucide-react';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sliders className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-base font-bold text-slate-100 tracking-wide">
              Game Settings
            </h1>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Core gameplay parameters, interaction mode, and session policies
          </p>
        </div>

        <button
          type="button"
          onClick={handleInitiateSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50 self-start sm:self-auto"
        >
          {isSaving ? (
            <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
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
        <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                  Interaction Mode
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  gameplayMode === 'touch'
                    ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                }`}
              >
                {gameplayMode === 'touch' ? 'TOUCH MODE' : 'CAMERA MODE'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mt-2">
              Select how players interact with bombs during the active round.
            </p>

            <div className="grid grid-cols-2 gap-2.5 mt-3">
              {/* Option A: Camera */}
              <button
                type="button"
                onClick={() => setGameplayMode('camera')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameplayMode === 'camera'
                    ? 'bg-cyan-500/15 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-200">
                  <Camera className={`w-3.5 h-3.5 ${gameplayMode === 'camera' ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>Camera Motion</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Hand tracking, animated fire flames & physical motion bursting.
                </div>
              </button>

              {/* Option B: Touch */}
              <button
                type="button"
                onClick={() => setGameplayMode('touch')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gameplayMode === 'touch'
                    ? 'bg-teal-500/15 border-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.2)]'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-200">
                  <Touchpad className={`w-3.5 h-3.5 ${gameplayMode === 'touch' ? 'text-teal-400' : 'text-slate-500'}`} />
                  <span>Direct Touch</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Direct touchscreen taps & mouse clicks. Zero webcam required.
                </div>
              </button>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
            Affects both kiosk terminals and personal devices immediately on new game sessions.
          </div>
        </div>

        {/* CARD 2: Target Score Goal */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                  Target Score Challenge
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTargetScoreEnabled(!targetScoreEnabled)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors ${
                  targetScoreEnabled
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                {targetScoreEnabled ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mt-2">
              Shows a live target progress bar in HUD and special target achieved badge on Game Over.
            </p>

            <div className="mt-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-200 block">
                  Target Points Goal
                </label>
                <span className="text-[10px] text-slate-400">
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
                  className="w-24 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs font-bold text-right outline-none focus:border-amber-400 disabled:opacity-40"
                />
                <span className="text-xs font-mono text-slate-400">pts</span>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
            Recommended value: 3,000 to 6,000 points for a 35-second round.
          </div>
        </div>

        {/* CARD 3: Timing & Durations */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                  Timing Parameters
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">SESSION RULES</span>
            </div>

            <div className="space-y-2.5 mt-3">
              {/* Game Duration */}
              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    Gameplay Round Duration
                  </div>
                  <div className="text-[10px] text-slate-400">
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
                    className="w-18 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs font-bold text-right outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs font-mono text-slate-400">sec</span>
                </div>
              </div>

              {/* Code Validity */}
              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    Game Code Expiry Window
                  </div>
                  <div className="text-[10px] text-slate-400">
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
                    className="w-18 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs font-bold text-right outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs font-mono text-slate-400">sec</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
            Standard: 35 seconds play duration, 120 seconds kiosk code lifetime.
          </div>
        </div>

        {/* CARD 4: Player Policies & Access */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                  Player Replay Policy
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAllowMultiplePlaysPerUser(!allowMultiplePlaysPerUser)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors ${
                  allowMultiplePlaysPerUser
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {allowMultiplePlaysPerUser ? 'MULTIPLE PLAYS' : 'SINGLE PLAY ONLY'}
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Allow Multiple Plays per User
                </span>
                <input
                  type="checkbox"
                  checked={allowMultiplePlaysPerUser}
                  onChange={(e) => setAllowMultiplePlaysPerUser(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                {allowMultiplePlaysPerUser
                  ? 'Participants can re-register with the same phone number to generate a new game code and play multiple times.'
                  : 'Participants can only play once per mobile number. Subsequent attempts show their previous score.'}
              </p>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
            Security audit logs record every settings change made by authenticated admins.
          </div>
        </div>
      </form>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0F1B2E] border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Confirm Game Settings Update
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  You are about to modify core gameplay parameters. This takes effect on subsequent games.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Interaction Mode:</span>
                <span className="text-cyan-300 font-bold uppercase">{gameplayMode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Round Duration:</span>
                <span className="text-slate-200">{gameDurationSeconds} seconds</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Target Score:</span>
                <span className="text-amber-300 font-bold">
                  {targetScoreEnabled ? `${targetScore} pts` : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Multiple Plays:</span>
                <span className="text-slate-200">{allowMultiplePlaysPerUser ? 'Allowed' : 'Disallowed'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSave}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                Confirm & Persist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
