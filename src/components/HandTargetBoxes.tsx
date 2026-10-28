/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, Minus } from 'lucide-react';
import { TrackedHand } from '../types/motion';
import { LEFT_TARGET_AREA, RIGHT_TARGET_AREA } from '../utils/motionMath';

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
                  : 'PLACE BOTH HANDS IN MARKED ZONES'}
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

      {/* Target Alignment Zones */}
      <div className="relative w-full h-full my-auto flex items-center justify-between pointer-events-none">
        {/* LEFT HAND TARGET ZONE */}
        <div
          className="absolute flex flex-col items-center justify-center transition-all duration-300"
          style={{
            left: `${LEFT_TARGET_AREA.xMin * 100}%`,
            width: `${(LEFT_TARGET_AREA.xMax - LEFT_TARGET_AREA.xMin) * 100}%`,
            top: `${LEFT_TARGET_AREA.yMin * 100}%`,
            height: `${(LEFT_TARGET_AREA.yMax - LEFT_TARGET_AREA.yMin) * 100}%`,
          }}
        >
          {/* Header Tag */}
          <div
            className={`mb-3 px-3 py-1 rounded-xl text-xs sm:text-sm font-bold tracking-wider uppercase border transition-all duration-300 flex items-center gap-1.5 ${
              leftActive
                ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                : 'bg-neutral-950/80 border-amber-500/40 text-amber-300'
            }`}
          >
            <span>LEFT HAND</span>
            {leftActive ? (
              <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
            ) : (
              <Minus className="w-4 h-4 text-neutral-400 stroke-[3]" />
            )}
          </div>

          {/* Guide Aura & Hand Silhouette */}
          <div
            className={`w-full h-full relative rounded-3xl transition-all duration-300 flex flex-col items-center justify-center ${
              leftActive
                ? 'bg-emerald-500/10 border-2 border-emerald-400/80 shadow-[0_0_40px_rgba(16,185,129,0.25)]'
                : 'border-2 border-dashed border-amber-500/35 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
            }`}
          >
            {!leftActive && (
              <div className="flex flex-col items-center gap-2 text-amber-300/40 animate-pulse">
                <svg
                  className="w-16 h-16 sm:w-20 sm:h-20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                </svg>
                <span className="font-mono text-xs uppercase tracking-widest text-amber-400/60">
                  Left Hand
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT HAND TARGET ZONE */}
        <div
          className="absolute flex flex-col items-center justify-center transition-all duration-300"
          style={{
            left: `${RIGHT_TARGET_AREA.xMin * 100}%`,
            width: `${(RIGHT_TARGET_AREA.xMax - RIGHT_TARGET_AREA.xMin) * 100}%`,
            top: `${RIGHT_TARGET_AREA.yMin * 100}%`,
            height: `${(RIGHT_TARGET_AREA.yMax - RIGHT_TARGET_AREA.yMin) * 100}%`,
          }}
        >
          {/* Header Tag */}
          <div
            className={`mb-3 px-3 py-1 rounded-xl text-xs sm:text-sm font-bold tracking-wider uppercase border transition-all duration-300 flex items-center gap-1.5 ${
              rightActive
                ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                : 'bg-neutral-950/80 border-amber-500/40 text-amber-300'
            }`}
          >
            <span>RIGHT HAND</span>
            {rightActive ? (
              <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
            ) : (
              <Minus className="w-4 h-4 text-neutral-400 stroke-[3]" />
            )}
          </div>

          {/* Guide Aura & Hand Silhouette */}
          <div
            className={`w-full h-full relative rounded-3xl transition-all duration-300 flex flex-col items-center justify-center ${
              rightActive
                ? 'bg-emerald-500/10 border-2 border-emerald-400/80 shadow-[0_0_40px_rgba(16,185,129,0.25)]'
                : 'border-2 border-dashed border-amber-500/35 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
            }`}
          >
            {!rightActive && (
              <div className="flex flex-col items-center gap-2 text-amber-300/40 animate-pulse">
                <svg
                  className="w-16 h-16 sm:w-20 sm:h-20 transform -scale-x-100"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                </svg>
                <span className="font-mono text-xs uppercase tracking-widest text-amber-400/60">
                  Right Hand
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
