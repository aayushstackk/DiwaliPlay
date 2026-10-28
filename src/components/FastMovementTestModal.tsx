/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrackedHand, PerformanceMetrics } from '../types/motion';
import { Zap, CheckCircle2, AlertOctagon, RotateCcw, X } from 'lucide-react';

interface FastMovementTestModalProps {
  leftHand: TrackedHand;
  rightHand: TrackedHand;
  metrics: PerformanceMetrics;
  onResetStats: () => void;
  onClose: () => void;
}

export const FastMovementTestModal: React.FC<FastMovementTestModalProps> = ({
  leftHand,
  rightHand,
  metrics,
  onResetStats,
  onClose,
}) => {
  const leftStatus = leftHand.detected ? 'GOOD' : 'LOST';
  const rightStatus = rightHand.detected ? 'GOOD' : 'LOST';

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-2xl bg-neutral-950/95 border border-amber-500/50 rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl animate-[scale_0.2s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-wider text-amber-100 font-['Cinzel',serif]">
              FAST MOVEMENT TEST
            </h2>
            <p className="text-[11px] text-amber-300/70 font-mono">
              High-Speed Dual-Hand Stability & Gesture Stress Benchmark
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onResetStats}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-neutral-700/80 rounded transition-all cursor-pointer"
            title="Reset loss counters & benchmark stats"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Counters</span>
          </button>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 p-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close Test"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Live Status Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Left Hand Card */}
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            leftHand.detected
              ? 'bg-neutral-900/80 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
              : 'bg-rose-950/30 border-rose-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-bold text-amber-200">LEFT HAND TRACKING</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-black ${
                leftStatus === 'GOOD'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              {leftStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-neutral-950/60 p-2 rounded">
              <span className="text-neutral-400 block text-[10px]">Speed:</span>
              <span className="text-amber-300 font-bold">{leftHand.movementSpeed} px/s</span>
            </div>
            <div className="bg-neutral-950/60 p-2 rounded">
              <span className="text-neutral-400 block text-[10px]">Gesture:</span>
              <span className="text-amber-200 font-bold">{leftHand.gesture.replace('_', ' ')}</span>
            </div>
            <div className="bg-neutral-950/60 p-2 rounded col-span-2 flex justify-between">
              <span className="text-neutral-400">Temporary Tracking Losses:</span>
              <span className="text-rose-400 font-bold">{metrics.leftTrackingLosses}</span>
            </div>
          </div>
        </div>

        {/* Right Hand Card */}
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            rightHand.detected
              ? 'bg-neutral-900/80 border-pink-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
              : 'bg-rose-950/30 border-rose-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-bold text-pink-200">RIGHT HAND TRACKING</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-black ${
                rightStatus === 'GOOD'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              {rightStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-neutral-950/60 p-2 rounded">
              <span className="text-neutral-400 block text-[10px]">Speed:</span>
              <span className="text-pink-300 font-bold">{rightHand.movementSpeed} px/s</span>
            </div>
            <div className="bg-neutral-950/60 p-2 rounded">
              <span className="text-neutral-400 block text-[10px]">Gesture:</span>
              <span className="text-pink-200 font-bold">{rightHand.gesture.replace('_', ' ')}</span>
            </div>
            <div className="bg-neutral-950/60 p-2 rounded col-span-2 flex justify-between">
              <span className="text-neutral-400">Temporary Tracking Losses:</span>
              <span className="text-rose-400 font-bold">{metrics.rightTrackingLosses}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Benchmark Summary Bar */}
      <div className="flex items-center justify-between bg-neutral-900/90 border border-neutral-800 rounded-xl px-4 py-2.5 mb-4 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">Max Speed Recorded:</span>
          <span className="text-amber-300 font-bold">{metrics.maxSpeedRecorded} px/s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">Total Tracking Losses:</span>
          <span
            className={`font-bold ${
              metrics.trackingLossCount === 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {metrics.trackingLossCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">Engine Rate:</span>
          <span className="text-emerald-400 font-bold">{metrics.processingFps} FPS</span>
        </div>
      </div>

      {/* User Challenge Checklist */}
      <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-xl p-3.5">
        <p className="text-xs font-bold text-amber-200 tracking-wider uppercase mb-2 font-mono flex items-center gap-1.5">
          <span>Test Routine Challenges</span>
          <span className="text-[10px] text-neutral-400 font-normal">
            (Verify tracker remains stable during fast movement)
          </span>
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2 bg-neutral-950/60 p-2 rounded border border-neutral-800">
            <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] flex items-center justify-center font-bold">
              1
            </span>
            <span className="text-neutral-300 text-[11px]">Move hands slowly</span>
          </div>
          <div className="flex items-center gap-2 bg-neutral-950/60 p-2 rounded border border-neutral-800">
            <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] flex items-center justify-center font-bold">
              2
            </span>
            <span className="text-neutral-300 text-[11px]">Move hands normally</span>
          </div>
          <div className="flex items-center gap-2 bg-neutral-950/60 p-2 rounded border border-neutral-800">
            <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] flex items-center justify-center font-bold">
              3
            </span>
            <span className="text-amber-200 font-semibold text-[11px]">Move very quickly</span>
          </div>
          <div className="flex items-center gap-2 bg-neutral-950/60 p-2 rounded border border-neutral-800">
            <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] flex items-center justify-center font-bold">
              4
            </span>
            <span className="text-neutral-300 text-[11px]">Make tight fists</span>
          </div>
          <div className="flex items-center gap-2 bg-neutral-950/60 p-2 rounded border border-neutral-800">
            <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] flex items-center justify-center font-bold">
              5
            </span>
            <span className="text-neutral-300 text-[11px]">Open palms wide</span>
          </div>
          <div className="flex items-center gap-2 bg-neutral-950/60 p-2 rounded border border-neutral-800">
            <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] flex items-center justify-center font-bold">
              6
            </span>
            <span className="text-amber-200 font-semibold text-[11px]">Rapid punch / wave</span>
          </div>
        </div>
      </div>
    </div>
  );
};
