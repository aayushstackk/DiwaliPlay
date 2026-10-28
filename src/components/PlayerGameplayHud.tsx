/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { formatGameTimer } from '../utils/scoreSystem';

interface PlayerGameplayHudProps {
  score: number;
  remainingSeconds: number;
}

export const PlayerGameplayHud: React.FC<PlayerGameplayHudProps> = ({
  score,
  remainingSeconds
}) => {
  const isUrgent = remainingSeconds <= 10 && remainingSeconds > 0;
  const timeDisplay = formatGameTimer(remainingSeconds);

  return (
    <div className="fixed inset-x-0 top-0 z-30 pointer-events-none p-4 sm:p-6 md:p-8 flex items-start justify-between select-none">
      {/* 1. SCORE HUD (Safe Top-Left Corner) */}
      <div className="flex flex-col items-start bg-neutral-950/75 backdrop-blur-md border border-amber-500/40 rounded-2xl px-5 py-2.5 sm:px-7 sm:py-3.5 shadow-[0_0_35px_rgba(0,0,0,0.8)]">
        <span className="text-[11px] sm:text-xs md:text-sm font-mono font-bold uppercase tracking-[0.25em] text-amber-300/90 mb-0.5">
          SCORE
        </span>
        <span className="font-['Cinzel',serif] font-black text-3xl sm:text-4xl md:text-5xl text-amber-100 tracking-wider drop-shadow-[0_2px_12px_rgba(245,158,11,0.5)] leading-tight">
          {score}
        </span>
      </div>

      {/* 2. TIME HUD (Safe Top-Right Corner) */}
      <div
        className={`flex flex-col items-end backdrop-blur-md rounded-2xl px-5 py-2.5 sm:px-7 sm:py-3.5 shadow-[0_0_35px_rgba(0,0,0,0.8)] border transition-colors duration-200 ${
          isUrgent
            ? 'bg-rose-950/80 border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]'
            : 'bg-neutral-950/75 border-amber-500/40'
        }`}
      >
        <span className="text-[11px] sm:text-xs md:text-sm font-mono font-bold uppercase tracking-[0.25em] text-amber-300/90 mb-0.5">
          TIME
        </span>
        <span
          className={`font-mono font-black text-3xl sm:text-4xl md:text-5xl tracking-wider leading-tight drop-shadow-[0_2px_12px_rgba(245,158,11,0.5)] ${
            isUrgent ? 'text-rose-200 animate-pulse' : 'text-amber-100'
          }`}
        >
          {timeDisplay}
        </span>
      </div>
    </div>
  );
};
