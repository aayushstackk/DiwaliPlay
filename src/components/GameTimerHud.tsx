/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Flame, Zap, Trophy, Timer } from 'lucide-react';
import { GameScoreState, TrackedHand } from '../types/motion';
import { formatGameTimer } from '../utils/scoreSystem';

interface GameTimerHudProps {
  remainingSeconds: number;
  scoreState: GameScoreState;
  leftHand: TrackedHand;
  rightHand: TrackedHand;
  isCombo: boolean;
}

export const GameTimerHud: React.FC<GameTimerHudProps> = ({
  remainingSeconds,
  scoreState,
  leftHand,
  rightHand,
  isCombo,
}) => {
  const isUrgent = remainingSeconds <= 10 && remainingSeconds > 0;
  const timerText = formatGameTimer(remainingSeconds);

  return (
    <div className="absolute top-3 inset-x-3 sm:inset-x-6 z-20 pointer-events-none flex items-center justify-between gap-2 sm:gap-4">
      {/* Left: Left Hand Speed & Gesture Pill */}
      <div className="flex items-center gap-2 bg-neutral-950/80 backdrop-blur-md border border-neutral-800 px-3 py-1.5 rounded-xl shadow-lg">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-neutral-400">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                leftHand.detected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
              }`}
            />
            <span>LEFT</span>
            {leftHand.detected && (
              <span className="text-amber-300 font-bold">{leftHand.gesture}</span>
            )}
          </div>
          <span className="text-xs sm:text-sm font-mono font-bold text-amber-200">
            {leftHand.detected ? `${leftHand.movementSpeed} px/s` : 'NOT DETECTED'}
          </span>
        </div>
      </div>

      {/* Center: Large High-Precision 35s Countdown Timer & Multiplier */}
      <div className="flex flex-col items-center">
        <div
          className={`flex items-center gap-2 px-5 py-1.5 sm:px-6 sm:py-2 rounded-2xl backdrop-blur-md border transition-all duration-200 shadow-[0_0_30px_rgba(0,0,0,0.8)] ${
            isUrgent
              ? 'bg-rose-950/85 border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.5)] animate-pulse'
              : 'bg-neutral-950/85 border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.2)]'
          }`}
        >
          <Timer
            className={`w-5 h-5 sm:w-6 sm:h-6 ${
              isUrgent ? 'text-rose-400 animate-bounce' : 'text-amber-400'
            }`}
          />
          <span
            className={`font-mono font-black text-2xl sm:text-4xl tracking-wider select-none ${
              isUrgent
                ? 'text-rose-200 drop-shadow-[0_0_12px_rgba(244,63,94,0.9)]'
                : 'text-amber-100 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]'
            }`}
          >
            {timerText}
          </span>
        </div>

        {/* Combo / Multiplier Banner */}
        {isCombo ? (
          <div className="mt-1 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-neutral-950 text-[11px] font-black tracking-wider uppercase animate-bounce shadow-[0_0_15px_rgba(245,158,11,0.6)]">
            <Trophy className="w-3 h-3" />
            <span>2X MEGA COMBO ACTIVE!</span>
          </div>
        ) : (
          <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-amber-300/80">
            BURST CRACKERS BY MOVING FAST
          </div>
        )}
      </div>

      {/* Right: Live Score & Crackers Counter */}
      <div className="flex items-center gap-2 bg-neutral-950/80 backdrop-blur-md border border-neutral-800 px-3 py-1.5 rounded-xl shadow-lg">
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 uppercase">
            <span>SCORE</span>
            {scoreState.lastDeltaLabel && (
              <span className="text-emerald-400 font-bold animate-pulse text-[9px]">
                {scoreState.lastDeltaLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-xl font-mono font-black text-amber-300">
              {scoreState.score.toLocaleString()}
            </span>
            <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-amber-400/80">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>{scoreState.crackersBurst}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
