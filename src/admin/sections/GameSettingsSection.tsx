/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SystemSettings, AdminRole, GameplayInteractionMode } from '../../types/backend';
import { adminApi } from '../../services/api';
import {
  Sliders,
  Shield,
  Clock,
  Repeat,
  Save,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Camera,
  Touchpad,
  Target
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
      setTargetScore(typeof settings.targetScore === 'number' && settings.targetScore > 0 ? settings.targetScore : 5000);
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

    // If changing interaction mode, multiple plays policy, target score, or game duration significantly, prompt confirmation
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
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Settings Card */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-7 shadow-xl">
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-neutral-800">
          <Sliders className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
              Gameplay Rules & Session Parameters
            </h2>
            <p className="text-xs text-neutral-400">
              Operational parameters enforced by the backend API and kiosk engine
            </p>
          </div>
        </div>

        {successMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleInitiateSave} className="space-y-6">
          {/* Setting 0: Gameplay Interaction Mode */}
          <div className="p-5 rounded-2xl bg-neutral-900/80 border border-amber-500/25 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                    gameplayMode === 'touch'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {gameplayMode === 'touch' ? <Touchpad className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                </div>
                <div>
                  <label className="text-sm font-bold text-neutral-100 uppercase tracking-wide">
                    Gameplay Interaction Mode
                  </label>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Choose whether players interact using webcam hand tracking or direct screen touch & clicks
                  </p>
                </div>
              </div>

              <span
                className={`self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider border ${
                  gameplayMode === 'touch'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {gameplayMode === 'touch' ? 'ACTIVE: TOUCH GAMEPLAY' : 'ACTIVE: CAMERA INTERACTIVE'}
              </span>
            </div>

            {/* Two Card Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {/* Card A: Camera Interactive */}
              <div
                onClick={() => setGameplayMode('camera')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  gameplayMode === 'camera'
                    ? 'bg-amber-500/10 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700 opacity-80 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Camera className={`w-4 h-4 ${gameplayMode === 'camera' ? 'text-amber-400' : 'text-neutral-400'}`} />
                      <span className={`text-xs font-bold ${gameplayMode === 'camera' ? 'text-amber-200' : 'text-neutral-200'}`}>
                        Camera Interactive
                      </span>
                    </div>
                    <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-300">
                      Webcam Hand Tracking
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed mb-3">
                    Control the game using hand movements detected by the camera. Players position their hands in calibration zones, see animated fire flames on their palms, and burst bombs with hand motions.
                  </p>
                </div>
                <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10.5px]">
                  <span className="text-amber-400/90 font-medium">✓ Hand-Centred Fire Flames</span>
                  <span className="text-neutral-500 font-mono">Webcam Required</span>
                </div>
              </div>

              {/* Card B: Touch Gameplay */}
              <div
                onClick={() => setGameplayMode('touch')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  gameplayMode === 'touch'
                    ? 'bg-emerald-500/10 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700 opacity-80 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Touchpad className={`w-4 h-4 ${gameplayMode === 'touch' ? 'text-emerald-400' : 'text-neutral-400'}`} />
                      <span className={`text-xs font-bold ${gameplayMode === 'touch' ? 'text-emerald-200' : 'text-neutral-200'}`}>
                        Touch Gameplay
                      </span>
                    </div>
                    <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-300">
                      Screen Tap & Mouse Click
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed mb-3">
                    Tap or click bombs directly on the screen. Ideal for touch displays, tablets, laptops, and desktop computers. Bypasses hand calibration and requires zero webcam access.
                  </p>
                </div>
                <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10.5px]">
                  <span className="text-emerald-400/90 font-medium">✓ Zero Camera Needed</span>
                  <span className="text-neutral-500 font-mono">Touchscreen & Mouse</span>
                </div>
              </div>
            </div>

            <p className="text-[10.5px] text-neutral-500 pt-1">
              Note: The saved gameplay interaction mode persists across server restarts and takes effect on subsequent game rounds.
            </p>
          </div>

          {/* Setting 1: Game Duration */}
          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <label className="text-xs font-bold text-neutral-200">
                  Game Duration (Seconds)
                </label>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Duration of the active hand-tracking round after 3-second calibration. Standard tournament length is 35 seconds.
              </p>
            </div>

            <div className="flex items-center gap-2 sm:self-center">
              <input
                type="number"
                min="15"
                max="120"
                value={gameDurationSeconds}
                onChange={(e) => setGameDurationSeconds(Number(e.target.value))}
                className="w-24 px-3 py-2 bg-neutral-950 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-100 text-xs font-mono font-bold text-center outline-none"
                required
              />
              <span className="text-xs text-neutral-400 font-mono">sec</span>
            </div>
          </div>

          {/* Setting 2: Code Expiry Seconds */}
          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <label className="text-xs font-bold text-neutral-200">
                  4-Digit Code TTL (Seconds)
                </label>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Time-to-live for generated mobile registration codes before they expire. Default is 120s (2 minutes).
              </p>
            </div>

            <div className="flex items-center gap-2 sm:self-center">
              <input
                type="number"
                min="30"
                max="600"
                value={codeExpirySeconds}
                onChange={(e) => setCodeExpirySeconds(Number(e.target.value))}
                className="w-24 px-3 py-2 bg-neutral-950 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-100 text-xs font-mono font-bold text-center outline-none"
                required
              />
              <span className="text-xs text-neutral-400 font-mono">sec</span>
            </div>
          </div>

          {/* Setting 3: Multiple Plays Per Mobile Policy */}
          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-amber-400" />
                <label className="text-xs font-bold text-neutral-200">
                  Allow Multiple Plays Per User
                </label>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                When disabled (strict single-play protection), each mobile number can complete only one game. If enabled, players can generate new codes for re-entry.
              </p>
            </div>

            <div className="flex items-center sm:self-center">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowMultiplePlaysPerUser}
                  onChange={(e) => setAllowMultiplePlaysPerUser(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          </div>

          {/* Setting 4: Target Score & Goal Progress */}
          <div className="p-5 rounded-2xl bg-neutral-900/80 border border-amber-500/25 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                    targetScoreEnabled
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-neutral-800/60 border-neutral-700 text-neutral-400'
                  }`}
                >
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <label className="text-sm font-bold text-neutral-100 uppercase tracking-wide">
                    Target Score & Goal Progress
                  </label>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Set a benchmark score for players to reach with a live HUD progress bar and celebratory achievement popup
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider border ${
                    targetScoreEnabled
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                  }`}
                >
                  {targetScoreEnabled ? `TARGET: ${targetScore.toLocaleString()} PTS` : 'TARGET DISABLED'}
                </span>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={targetScoreEnabled}
                    onChange={(e) => setTargetScoreEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
            </div>

            {targetScoreEnabled ? (
              <div className="space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-950/70 p-3.5 rounded-xl border border-neutral-800">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-neutral-200">
                      Benchmark Target Score (Points)
                    </span>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Players see their real-time progress toward this score on the top HUD during active play.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="500"
                      max="100000"
                      step="500"
                      value={targetScore}
                      onChange={(e) => setTargetScore(Math.max(100, Number(e.target.value) || 0))}
                      className="w-32 px-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-amber-200 text-xs font-mono font-bold text-center outline-none"
                      required
                    />
                    <span className="text-xs text-neutral-400 font-mono">pts</span>
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10.5px] text-neutral-400 font-mono">Quick Presets:</span>
                  {[3000, 5000, 7500, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTargetScore(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono transition-all cursor-pointer ${
                        targetScore === preset
                          ? 'bg-amber-500/20 border border-amber-400 text-amber-200 font-bold'
                          : 'bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300'
                      }`}
                    >
                      {preset.toLocaleString()} pts
                    </button>
                  ))}
                </div>

                <div className="text-[10.5px] text-neutral-400 leading-relaxed pt-1 flex items-center gap-1.5">
                  <span className="text-amber-400">✓</span>
                  <span>
                    When enabled, the top HUD renders a sleek animated progress bar and shows a celebratory <strong>TARGET ACHIEVED!</strong> fanfare when reached.
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-neutral-400 leading-relaxed italic">
                Target Score is currently OFF. The in-game HUD displays only the timer and score, and no target progress bar or target-achieved popups will appear.
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-[11px] text-neutral-500">
              {currentUserRole === 'superadmin' ? (
                <span>Superadmin authorized to update server runtime configuration.</span>
              ) : (
                <span className="text-amber-400/80">
                  Operator role: Read-only access to system settings.
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving || currentUserRole !== 'superadmin'}
              className="w-full sm:w-auto py-2.5 px-6 rounded-xl font-semibold text-xs tracking-wide bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-neutral-950 shadow-[0_4px_20px_rgba(245,158,11,0.25)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Changes...' : 'Save Game Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal for Sensitive Changes */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#14101F] border border-amber-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-sm font-bold text-neutral-100 font-['Cinzel',serif]">
                Confirm Configuration Change
              </h3>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-6">
              You are about to modify system gameplay settings (e.g., interaction mode to{' '}
              <strong className="text-amber-300 uppercase">
                {gameplayMode === 'touch' ? 'Touch Gameplay' : 'Camera Interactive'}
              </strong>, duration to{' '}
              <strong className="text-amber-300">{gameDurationSeconds}s</strong>, target score to{' '}
              <strong className="text-amber-300">
                {targetScoreEnabled ? `${targetScore.toLocaleString()} pts` : 'DISABLED'}
              </strong>, or multiple play policy to{' '}
              <strong className="text-amber-300">
                {allowMultiplePlaysPerUser ? 'ALLOWED' : 'STRICT SINGLE-PLAY'}
              </strong>).
              This immediately affects upcoming game rounds.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSave}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold cursor-pointer shadow-md"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
