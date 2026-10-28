/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrackedHand } from '../types/motion';
import { evaluateGameMapping } from '../utils/motionMath';
import {
  Activity,
  Compass,
  AlertCircle,
  CheckCircle2,
  Hand,
  Flame,
  ArrowUpRight,
  Zap,
} from 'lucide-react';

interface TelemetryHudProps {
  leftHand: TrackedHand;
  rightHand: TrackedHand;
}

export const TelemetryHud: React.FC<TelemetryHudProps> = ({ leftHand, rightHand }) => {
  const bothDetected = leftHand.detected && rightHand.detected;

  let overallStatusText = 'BOTH HANDS DETECTED';
  let statusTone = 'emerald';

  if (!leftHand.detected && !rightHand.detected) {
    overallStatusText = 'WAITING FOR BOTH HANDS';
    statusTone = 'amber';
  } else if (!leftHand.detected) {
    overallStatusText = 'LEFT HAND: NOT DETECTED';
    statusTone = 'rose';
  } else if (!rightHand.detected) {
    overallStatusText = 'RIGHT HAND: NOT DETECTED';
    statusTone = 'rose';
  }

  // Future cracker game preview mapping
  const gamePreview = evaluateGameMapping(
    leftHand.movementSpeed,
    rightHand.movementSpeed,
    leftHand.gesture,
    rightHand.gesture
  );

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Primary Status Banner */}
      <div className="w-full flex justify-center">
        <div
          className={`px-5 py-2 rounded-lg border backdrop-blur-md transition-all duration-200 flex items-center gap-3 shadow-lg ${
            bothDetected
              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
              : statusTone === 'rose'
              ? 'bg-rose-950/70 border-rose-500/50 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
              : 'bg-amber-950/70 border-amber-500/50 text-amber-200'
          }`}
        >
          {bothDetected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span className="font-mono text-xs sm:text-sm font-bold tracking-wider uppercase">
            STATUS: {overallStatusText}
          </span>
          {gamePreview.isComboActive && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/40 animate-pulse">
              <Zap className="w-3 h-3 text-amber-400" />
              COMBO ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Side-by-Side Dual Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-4xl mx-auto">
        {/* LEFT HAND TELEMETRY */}
        <div
          className={`p-3.5 rounded-xl border transition-all duration-300 backdrop-blur-md relative overflow-hidden ${
            leftHand.detected
              ? 'bg-neutral-950/80 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
              : 'bg-neutral-950/60 border-neutral-800 text-neutral-500'
          }`}
        >
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              leftHand.detected ? 'bg-amber-500' : 'bg-neutral-800'
            }`}
          />

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
              <h3 className="font-bold text-sm tracking-widest text-amber-100 font-mono">
                LEFT HAND
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {leftHand.isPredicted && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  INTERPOLATED
                </span>
              )}
              <span
                className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                  leftHand.detected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {leftHand.detected ? 'DETECTED' : 'NOT DETECTED'}
              </span>
            </div>
          </div>

          {/* Gesture Badge */}
          <div className="mb-2.5 bg-neutral-900/90 p-2 rounded-lg border border-neutral-800 flex items-center justify-between font-mono">
            <span className="text-neutral-400 text-xs flex items-center gap-1.5">
              <Hand className="w-3.5 h-3.5 text-amber-400" />
              LEFT GESTURE:
            </span>
            <span
              className={`font-black text-xs px-2 py-0.5 rounded tracking-wide ${
                leftHand.detected && leftHand.gesture !== 'UNKNOWN'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-neutral-500'
              }`}
            >
              {leftHand.detected
                ? leftHand.gesture.replace('_', ' ')
                : '—'}
            </span>
          </div>

          {/* Kinematics Grid */}
          <div className="grid grid-cols-3 gap-2 font-mono text-xs">
            {/* Position */}
            <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800/80 flex flex-col justify-between">
              <span className="text-neutral-400 text-[10px] uppercase flex items-center gap-1">
                <Compass className="w-3 h-3 text-amber-400" /> POS (X, Y)
              </span>
              <span className="text-sm font-bold text-amber-200 mt-1">
                {leftHand.detected ? `${leftHand.percentX}%, ${leftHand.percentY}%` : '—'}
              </span>
              <span className="text-[10px] text-neutral-500">
                {leftHand.detected ? `${leftHand.pixelX}px, ${leftHand.pixelY}px` : 'null'}
              </span>
            </div>

            {/* Velocity / Speed */}
            <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800/80 flex flex-col justify-between">
              <span className="text-neutral-400 text-[10px] uppercase flex items-center gap-1">
                <Activity className="w-3 h-3 text-amber-400" /> SPEED
              </span>
              <span className="text-sm font-bold text-amber-200 mt-1">
                {leftHand.detected ? `${leftHand.movementSpeed} px/s` : '—'}
              </span>
              <span
                className={`text-[10px] font-semibold ${
                  leftHand.movementCategory === 'Fast'
                    ? 'text-rose-400'
                    : leftHand.movementCategory === 'Moderate'
                    ? 'text-amber-400'
                    : 'text-neutral-500'
                }`}
              >
                {leftHand.detected ? leftHand.movementCategory : 'null'}
              </span>
            </div>

            {/* Direction & Acceleration */}
            <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800/80 flex flex-col justify-between">
              <span className="text-neutral-400 text-[10px] uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-amber-400" /> DIRECTION
              </span>
              <span className="text-sm font-bold text-amber-200 mt-1">
                {leftHand.detected ? leftHand.direction.replace('_', ' ') : '—'}
              </span>
              <span className="text-[10px] text-neutral-500">
                {leftHand.detected ? `${leftHand.acceleration} px/s²` : 'null'}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT HAND TELEMETRY */}
        <div
          className={`p-3.5 rounded-xl border transition-all duration-300 backdrop-blur-md relative overflow-hidden ${
            rightHand.detected
              ? 'bg-neutral-950/80 border-pink-500/40 shadow-[0_0_20px_rgba(236,72,153,0.15)]'
              : 'bg-neutral-950/60 border-neutral-800 text-neutral-500'
          }`}
        >
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              rightHand.detected ? 'bg-pink-500' : 'bg-neutral-800'
            }`}
          />

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-400 shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
              <h3 className="font-bold text-sm tracking-widest text-pink-100 font-mono">
                RIGHT HAND
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {rightHand.isPredicted && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                  INTERPOLATED
                </span>
              )}
              <span
                className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                  rightHand.detected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {rightHand.detected ? 'DETECTED' : 'NOT DETECTED'}
              </span>
            </div>
          </div>

          {/* Gesture Badge */}
          <div className="mb-2.5 bg-neutral-900/90 p-2 rounded-lg border border-neutral-800 flex items-center justify-between font-mono">
            <span className="text-neutral-400 text-xs flex items-center gap-1.5">
              <Hand className="w-3.5 h-3.5 text-pink-400" />
              RIGHT GESTURE:
            </span>
            <span
              className={`font-black text-xs px-2 py-0.5 rounded tracking-wide ${
                rightHand.detected && rightHand.gesture !== 'UNKNOWN'
                  ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                  : 'text-neutral-500'
              }`}
            >
              {rightHand.detected
                ? rightHand.gesture.replace('_', ' ')
                : '—'}
            </span>
          </div>

          {/* Kinematics Grid */}
          <div className="grid grid-cols-3 gap-2 font-mono text-xs">
            {/* Position */}
            <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800/80 flex flex-col justify-between">
              <span className="text-neutral-400 text-[10px] uppercase flex items-center gap-1">
                <Compass className="w-3 h-3 text-pink-400" /> POS (X, Y)
              </span>
              <span className="text-sm font-bold text-pink-200 mt-1">
                {rightHand.detected ? `${rightHand.percentX}%, ${rightHand.percentY}%` : '—'}
              </span>
              <span className="text-[10px] text-neutral-500">
                {rightHand.detected ? `${rightHand.pixelX}px, ${rightHand.pixelY}px` : 'null'}
              </span>
            </div>

            {/* Velocity / Speed */}
            <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800/80 flex flex-col justify-between">
              <span className="text-neutral-400 text-[10px] uppercase flex items-center gap-1">
                <Activity className="w-3 h-3 text-pink-400" /> SPEED
              </span>
              <span className="text-sm font-bold text-pink-200 mt-1">
                {rightHand.detected ? `${rightHand.movementSpeed} px/s` : '—'}
              </span>
              <span
                className={`text-[10px] font-semibold ${
                  rightHand.movementCategory === 'Fast'
                    ? 'text-rose-400'
                    : rightHand.movementCategory === 'Moderate'
                    ? 'text-pink-400'
                    : 'text-neutral-500'
                }`}
              >
                {rightHand.detected ? rightHand.movementCategory : 'null'}
              </span>
            </div>

            {/* Direction & Acceleration */}
            <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800/80 flex flex-col justify-between">
              <span className="text-neutral-400 text-[10px] uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-pink-400" /> DIRECTION
              </span>
              <span className="text-sm font-bold text-pink-200 mt-1">
                {rightHand.detected ? rightHand.direction.replace('_', ' ') : '—'}
              </span>
              <span className="text-[10px] text-neutral-500">
                {rightHand.detected ? `${rightHand.acceleration} px/s²` : 'null'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Game Action Readiness Bar (Future Diwali Cracker Hook) */}
      <div className="w-full max-w-4xl mx-auto bg-neutral-950/70 border border-amber-500/25 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs font-mono backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="text-neutral-400">Future Cracker Mapping:</span>
          <span className="font-bold text-amber-200 uppercase">
            Action: {gamePreview.crackerAction.replace('_', ' ')}
          </span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">Rate:</span>
          <span
            className={`font-bold ${
              gamePreview.crackerSpawnRate === 'OVERDRIVE'
                ? 'text-rose-400 animate-pulse'
                : 'text-amber-300'
            }`}
          >
            {gamePreview.crackerSpawnRate}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">Motion Intensity:</span>
          <div className="w-20 bg-neutral-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full transition-all duration-100"
              style={{ width: `${gamePreview.intensityPercent}%` }}
            />
          </div>
          <span className="font-bold text-amber-300">{gamePreview.intensityPercent}%</span>
        </div>
      </div>
    </div>
  );
};
