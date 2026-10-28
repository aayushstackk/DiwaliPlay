/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface CountdownOverlayProps {
  countdownValue: number | 'GO!';
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ countdownValue }) => {
  const isGo = countdownValue === 'GO!';

  return (
    <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none z-20">
      <div className="relative flex items-center justify-center">
        {/* Glowing Aura Ring */}
        <div
          className={`absolute rounded-full transition-all duration-500 ${
            isGo
              ? 'w-72 h-72 bg-emerald-500/25 blur-2xl animate-ping'
              : 'w-64 h-64 bg-amber-500/25 blur-2xl animate-pulse'
          }`}
        />

        {/* Outer Festive Ring */}
        <div
          className={`w-48 h-48 sm:w-56 sm:h-56 rounded-full border-4 flex items-center justify-center transition-all duration-300 shadow-[0_0_50px_rgba(245,158,11,0.5)] ${
            isGo
              ? 'border-emerald-400 bg-neutral-950/80 shadow-[0_0_60px_rgba(16,185,129,0.8)]'
              : 'border-amber-400/80 bg-neutral-950/80'
          }`}
        >
          <span
            key={String(countdownValue)}
            className={`font-['Cinzel',serif] font-black tracking-tight select-none transform animate-[scale_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)] ${
              isGo
                ? 'text-5xl sm:text-7xl text-emerald-300 drop-shadow-[0_0_25px_rgba(52,211,153,0.9)]'
                : 'text-7xl sm:text-9xl text-amber-300 drop-shadow-[0_0_30px_rgba(251,191,36,0.9)]'
            }`}
          >
            {countdownValue}
          </span>
        </div>
      </div>

      <p className="mt-6 text-amber-200 font-mono text-sm sm:text-base tracking-widest uppercase font-bold drop-shadow">
        {isGo ? 'BURST THE CRACKERS!' : 'GET READY'}
      </p>
    </div>
  );
};
