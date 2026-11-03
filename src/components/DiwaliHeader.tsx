/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw, Maximize, Minimize, Activity, Zap, Volume2 } from 'lucide-react';
import { ChallengePhase } from '../types/motion';
import { BrandLogo } from './BrandLogo';
import { useBranding } from '../hooks/useBranding';

interface DiwaliHeaderProps {
  phase: ChallengePhase;
  playerName?: string;
  onReset: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showDebug: boolean;
  onToggleDebug: () => void;
  showFastTest: boolean;
  onToggleFastTest: () => void;
  showAudioLab: boolean;
  onToggleAudioLab: () => void;
  onOpenKioskCode?: () => void;
}

export const DiwaliHeader: React.FC<DiwaliHeaderProps> = ({
  phase,
  playerName,
  onReset,
  isFullscreen,
  onToggleFullscreen,
  showDebug,
  onToggleDebug,
  showFastTest,
  onToggleFastTest,
  showAudioLab,
  onToggleAudioLab,
  onOpenKioskCode,
}) => {
  const branding = useBranding();

  return (
    <header className="w-full bg-neutral-950/80 backdrop-blur-md border-b border-amber-500/20 px-4 py-3 sm:px-6 flex items-center justify-between z-30 transition-colors">
      {/* Brand & Diya Motif */}
      <div className="flex items-center gap-3">
        {/* Stylized Diwali Diya Flame Icon */}
        <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
          <svg
            className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Clay base */}
            <path d="M4 14c0 3.3 3.6 6 8 6s8-2.7 8-6H4z" fill="currentColor" fillOpacity="0.2" />
            <path d="M3 14h18" />
            {/* Flame */}
            <path
              d="M12 2c-1.5 2.5-3.5 4.5-3.5 7 0 2 1.6 3.5 3.5 3.5s3.5-1.5 3.5-3.5c0-2.5-2-4.5-3.5-7z"
              fill="#F59E0B"
              stroke="#FDE68A"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold tracking-wider text-amber-100 font-['Cinzel',serif]">
                DIWALI FUN PLAY
              </h1>
              <span className="text-amber-300/80 font-serif italic text-xs lowercase">by</span>
              <BrandLogo
                size="compact"
                brandLogoUrl={branding.brandLogoUrl}
                brandName={branding.brandName}
                displayMode={branding.brandingDisplayMode}
              />
            </div>
            {playerName && (
              <span className="hidden sm:inline-flex text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-400/40 px-2 py-0.5 rounded">
                Player: {playerName}
              </span>
            )}
          </div>
          <p className="text-[11px] text-amber-200/50 hidden sm:block">
            {branding.gameDurationSeconds || 35}-second dual-hand cracker bursting fun play
          </p>
        </div>
      </div>

      {/* Phase Badge & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Exit to Kiosk Screen */}
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-amber-500/40 bg-neutral-900/90 hover:bg-neutral-800 text-amber-300 hover:text-amber-200 shadow-sm transition-all cursor-pointer active:scale-95"
          title="Return to Kiosk Registration Screen"
        >
          <span>← KIOSK HOME</span>
        </button>

        {/* Audio Lab Modal Button */}
        <button
          onClick={onToggleAudioLab}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-medium rounded border transition-all cursor-pointer ${
            showAudioLab
              ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.35)]'
              : 'bg-neutral-900 hover:bg-neutral-800 text-amber-300 hover:text-amber-200 border-amber-500/40'
          }`}
          title="Open Audio Test Lab (Acoustics & Sound Synthesizer)"
        >
          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">AUDIO LAB</span>
        </button>

        {/* Fast Movement Test Button */}
        <button
          onClick={onToggleFastTest}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-medium rounded border transition-all cursor-pointer ${
            showFastTest
              ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
              : 'bg-neutral-900 hover:bg-neutral-800 text-amber-400/90 hover:text-amber-300 border-amber-500/30'
          }`}
          title="Run Fast Movement Stress Test Benchmark"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline">FAST TEST</span>
        </button>

        {/* Debug Panel Toggle Button */}
        <button
          onClick={onToggleDebug}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-medium rounded border transition-all cursor-pointer ${
            showDebug
              ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
              : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-neutral-800'
          }`}
          title="Toggle Performance Debug Panel"
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">DEBUG</span>
        </button>

        {/* Game State Indicator */}
        {phase === 'PLAYING' ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/40 rounded text-emerald-300 text-xs font-semibold tracking-wider uppercase shadow-[0_0_12px_rgba(16,185,129,0.25)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>35S GAME ACTIVE</span>
          </div>
        ) : phase === 'GAME_OVER' ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/15 border border-rose-500/40 rounded text-rose-300 text-xs font-semibold tracking-wider uppercase shadow-[0_0_12px_rgba(244,63,94,0.25)]">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>GAME OVER</span>
          </div>
        ) : phase === 'COUNTDOWN' || phase === 'READY' || phase === 'HANDS_READY' ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 border border-amber-400/50 rounded text-amber-200 text-xs font-semibold tracking-wider uppercase animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>GET READY</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 text-xs font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>ALIGNMENT</span>
          </div>
        )}

        {/* Reset Button */}
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-amber-200 text-xs font-medium border border-neutral-700/80 hover:border-amber-500/40 rounded transition-all cursor-pointer shadow-sm active:scale-95"
          title="Reset tracking session"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>RESET</span>
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-amber-200 border border-neutral-700/80 hover:border-amber-500/40 rounded transition-all cursor-pointer shadow-sm active:scale-95"
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize className="w-4 h-4 text-amber-300" />
          ) : (
            <Maximize className="w-4 h-4 text-amber-300" />
          )}
        </button>
      </div>
    </header>
  );
};
