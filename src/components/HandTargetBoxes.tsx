/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check } from 'lucide-react';
import { TrackedHand } from '../types/motion';

interface HandTargetBoxesProps {
  leftHand: TrackedHand;
  rightHand: TrackedHand;
  holdProgress: number; // 0 to 1
  isReady: boolean;
  activeCode?: string | null;
  playerName?: string;
  onOpenKioskCode?: () => void;
  onClearPlayer?: () => void;
}

interface HandIndicatorProps {
  side: 'left' | 'right';
  isActive: boolean;
  holdProgress: number;
  isReady: boolean;
}

const HandIndicator: React.FC<HandIndicatorProps> = ({
  side,
  isActive,
  holdProgress,
  isReady,
}) => {
  const isLeft = side === 'left';
  const radius = 80;
  const circumference = 2 * Math.PI * radius; // ~502.65
  const strokeDashoffset = circumference - holdProgress * circumference;

  return (
    <div className="flex flex-col items-center select-none pointer-events-none transition-transform duration-300">
      {/* Circular Indicator Hub */}
      <div className="relative w-36 h-36 sm:w-44 sm:h-44 md:w-52 md:h-52 lg:w-60 lg:h-60 flex items-center justify-center">
        {/* Ambient Radial Aura */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-500 pointer-events-none ${
            isReady
              ? 'bg-[radial-gradient(circle,rgba(52,211,153,0.35)_0%,rgba(16,185,129,0.18)_50%,rgba(0,0,0,0)_72%)] scale-110 shadow-[0_0_50px_rgba(16,185,129,0.4)]'
              : isActive
              ? 'bg-[radial-gradient(circle,rgba(251,191,36,0.3)_0%,rgba(245,158,11,0.15)_48%,rgba(0,0,0,0)_70%)] scale-105 shadow-[0_0_40px_rgba(245,158,11,0.3)]'
              : 'bg-[radial-gradient(circle,rgba(245,158,11,0.1)_0%,rgba(0,0,0,0)_68%)] animate-pulse'
          }`}
        />

        {/* Circular Progress & Status Ring SVG */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
          viewBox="0 0 200 200"
        >
          <defs>
            <linearGradient id={`goldProgressGrad-${side}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="50%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
            <filter id={`goldGlow-${side}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Base Track Circle */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={
              isReady
                ? 'rgba(52, 211, 153, 0.6)'
                : isActive
                ? 'rgba(250, 204, 21, 0.4)'
                : 'rgba(245, 158, 11, 0.22)'
            }
            strokeWidth={isActive ? 3.5 : 2.5}
            strokeDasharray={isActive ? 'none' : '6 6'}
            className="transition-colors duration-300"
          />

          {/* Dynamic 1-Second Hold Progress Arc */}
          {isActive && holdProgress > 0 && (
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={`url(#goldProgressGrad-${side})`}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              filter={`url(#goldGlow-${side})`}
              className="transition-all duration-75 ease-out"
            />
          )}
        </svg>

        {/* Large Prominent Hand Icon */}
        <div
          className={`relative z-10 transition-all duration-300 flex items-center justify-center ${
            isReady
              ? 'scale-110 drop-shadow-[0_0_28px_rgba(52,211,153,0.95)]'
              : isActive
              ? 'scale-105 drop-shadow-[0_0_24px_rgba(251,191,36,0.95)]'
              : 'scale-100 opacity-60 animate-pulse drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill={
              isReady
                ? 'rgba(52, 211, 153, 0.25)'
                : isActive
                ? 'rgba(251, 191, 36, 0.22)'
                : 'rgba(245, 158, 11, 0.05)'
            }
            stroke={
              isReady
                ? '#6EE7B7'
                : isActive
                ? '#FDE047'
                : '#FBBF24'
            }
            strokeWidth={isActive ? 1.8 : 1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 lg:w-36 lg:h-36 transition-all duration-300 ${
              isLeft ? '-scale-x-100' : ''
            }`}
          >
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </div>

        {/* Status Checkmark Badge Directly on Hand Icon */}
        {isActive && (
          <div
            className={`absolute bottom-1 sm:bottom-2 ${
              isLeft ? 'right-1 sm:right-2' : 'left-1 sm:left-2'
            } bg-gradient-to-tr ${
              isReady ? 'from-emerald-600 to-emerald-400' : 'from-amber-500 to-yellow-300'
            } text-neutral-950 rounded-full p-1.5 sm:p-2 shadow-[0_0_18px_rgba(251,191,36,0.9)] border-2 ${
              isReady ? 'border-emerald-100' : 'border-yellow-100'
            } flex items-center justify-center animate-in zoom-in duration-200 z-20`}
          >
            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-950 stroke-[3.5]" />
          </div>
        )}
      </div>

      {/* Clean Status Caption Below Icon */}
      <div className="mt-3 sm:mt-4 flex flex-col items-center">
        <div
          className={`px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-bold tracking-widest uppercase transition-all duration-300 flex items-center gap-2 border ${
            isReady
              ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              : isActive
              ? 'bg-amber-950/80 border-amber-400/80 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.3)]'
              : 'bg-neutral-950/75 border-amber-500/30 text-amber-300/70 shadow-[0_0_12px_rgba(0,0,0,0.5)]'
          }`}
        >
          <span
            className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${
              isReady
                ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
                : isActive
                ? 'bg-yellow-400 shadow-[0_0_10px_#facc15]'
                : 'bg-amber-400/60 animate-pulse'
            }`}
          />
          <span className="font-['Cinzel',serif]">{isLeft ? 'LEFT HAND' : 'RIGHT HAND'}</span>
        </div>
        <span className="text-[10px] sm:text-[11px] font-mono mt-1 text-amber-200/60 tracking-wider">
          {isReady ? 'READY!' : isActive ? 'HOLD STEADY' : 'RAISE HAND'}
        </span>
      </div>
    </div>
  );
};

export const HandTargetBoxes: React.FC<HandTargetBoxesProps> = ({
  leftHand,
  rightHand,
  holdProgress,
  isReady,
  activeCode: _activeCode,
  playerName: _playerName,
  onOpenKioskCode: _onOpenKioskCode,
  onClearPlayer: _onClearPlayer,
}) => {
  const leftActive = leftHand.detected && leftHand.inTargetArea;
  const rightActive = rightHand.detected && rightHand.inTargetArea;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-6 z-10">
      {/* Top Banner Guide Message */}
      <div className="w-full flex flex-col items-center pt-2 sm:pt-4">
        <div
          className={`backdrop-blur-md px-6 py-2.5 sm:px-8 sm:py-3 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.6)] text-center max-w-md transition-all duration-300 border ${
            isReady
              ? 'bg-emerald-950/90 border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.35)]'
              : 'bg-neutral-950/80 border-amber-500/40'
          }`}
        >
          {isReady ? (
            <div className="flex flex-col items-center">
              <span className="text-emerald-300 text-sm sm:text-base font-bold font-['Cinzel',serif] tracking-wider animate-pulse">
                HANDS READY · GET READY!
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-amber-200 text-xs sm:text-sm font-bold font-['Cinzel',serif] tracking-wider uppercase">
                {leftActive && rightActive
                  ? 'HOLD BOTH HANDS TO BEGIN'
                  : 'RAISE BOTH HANDS TO BEGIN'}
              </span>
              <p className="text-amber-300/70 text-[11px] sm:text-xs font-mono mt-0.5">
                Hold for 1 second to start Diwali Fun Play
              </p>
            </div>
          )}

          {holdProgress > 0 && holdProgress < 1 && (
            <div className="mt-2 w-full bg-neutral-800 rounded-full h-2 overflow-hidden border border-amber-500/30">
              <div
                className="bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 h-full transition-all duration-75 ease-out shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                style={{ width: `${Math.round(holdProgress * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Symmetrical Left and Right Large Hand Indicators */}
      <div className="relative w-full my-auto flex items-center justify-between px-6 sm:px-12 md:px-20 lg:px-28 xl:px-36 pointer-events-none">
        {/* Left Hand Indicator */}
        <HandIndicator
          side="left"
          isActive={leftActive}
          holdProgress={holdProgress}
          isReady={isReady}
        />

        {/* Right Hand Indicator */}
        <HandIndicator
          side="right"
          isActive={rightActive}
          holdProgress={holdProgress}
          isReady={isReady}
        />
      </div>

      {/* Bottom Spacer to balance vertical centering */}
      <div className="h-6 sm:h-8" />
    </div>
  );
};
