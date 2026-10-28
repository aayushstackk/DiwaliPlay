/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PerformanceMetrics } from '../types/motion';
import { Gauge, X, Volume2, VolumeX, Play } from 'lucide-react';

interface DebugPerformancePanelProps {
  metrics: PerformanceMetrics;
  onUnlockAudio: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  onTestGameOver?: () => void;
}

export const DebugPerformancePanel: React.FC<DebugPerformancePanelProps> = ({
  metrics,
  onUnlockAudio,
  onToggleMute,
  onClose,
  onTestGameOver,
}) => {
  return (
    <div className="absolute top-14 right-4 z-40 bg-neutral-950/95 border border-amber-500/40 rounded-xl p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.85)] backdrop-blur-md font-mono text-xs w-84 transition-all max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
        <div className="flex items-center gap-1.5 text-amber-300 font-bold tracking-wider">
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
          <span>PERFORMANCE & AUDIO DEBUG</span>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-100 p-0.5 rounded hover:bg-neutral-800 cursor-pointer transition-colors"
          title="Close Debug Panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Metrics List */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center py-0.5">
          <span className="text-neutral-400">Camera FPS:</span>
          <span className="font-bold text-amber-200">
            {metrics.cameraFps > 0 ? `${metrics.cameraFps} fps` : '...'}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-neutral-400">Processing FPS:</span>
          <span
            className={`font-bold ${
              metrics.processingFps >= 25
                ? 'text-emerald-400'
                : metrics.processingFps >= 15
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {metrics.processingFps > 0 ? `${metrics.processingFps} fps` : '...'}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5 border-t border-neutral-900 pt-1.5">
          <span className="text-neutral-400">Left Hand Detection:</span>
          <span
            className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${
              metrics.leftDetected
                ? 'text-emerald-400 bg-emerald-950/60'
                : 'text-rose-400 bg-rose-950/60'
            }`}
          >
            {metrics.leftDetected ? 'DETECTED' : 'NOT DETECTED'}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-neutral-400">Right Hand Detection:</span>
          <span
            className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${
              metrics.rightDetected
                ? 'text-emerald-400 bg-emerald-950/60'
                : 'text-rose-400 bg-rose-950/60'
            }`}
          >
            {metrics.rightDetected ? 'DETECTED' : 'NOT DETECTED'}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5 border-t border-neutral-900 pt-1.5">
          <span className="text-neutral-400">Left Hand Speed:</span>
          <span className="font-bold text-amber-200">{metrics.leftSpeed} px/s</span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-neutral-400">Right Hand Speed:</span>
          <span className="font-bold text-pink-200">{metrics.rightSpeed} px/s</span>
        </div>

        <div className="flex justify-between items-center py-0.5 border-t border-neutral-900 pt-1.5">
          <span className="text-neutral-400">Left Gesture:</span>
          <span className="font-bold text-amber-300">
            {metrics.leftGesture !== 'UNKNOWN' ? metrics.leftGesture.replace('_', ' ') : '—'}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-neutral-400">Right Gesture:</span>
          <span className="font-bold text-pink-300">
            {metrics.rightGesture !== 'UNKNOWN' ? metrics.rightGesture.replace('_', ' ') : '—'}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5 border-t border-neutral-900 pt-1.5">
          <span className="text-neutral-400">Tracking Loss Count:</span>
          <span
            className={`font-bold ${
              metrics.trackingLossCount === 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.trackingLossCount} (L: {metrics.leftTrackingLosses}, R: {metrics.rightTrackingLosses})
          </span>
        </div>

        {/* ---------------- AUDIO ENGINE SECTION ---------------- */}
        <div className="border-t border-amber-500/30 pt-2 mt-2">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1.5">
            <Volume2 className="w-3.5 h-3.5" />
            <span>REALISTIC SOUND SYSTEM</span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-neutral-400">Audio State:</span>
            <span
              className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${
                metrics.audioReady
                  ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-500/40'
                  : 'text-amber-300 bg-amber-950/60 border border-amber-500/40'
              }`}
            >
              {metrics.audioReady ? 'READY ✓' : 'NOT READY'}
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-neutral-400">Last Sound:</span>
            <span className="font-bold text-amber-300">{metrics.lastSound}</span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-neutral-400">Active Sounds:</span>
            <span className="font-bold text-emerald-400">{metrics.activeSounds} voices</span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-neutral-400">Master Volume:</span>
            <span className="font-bold text-neutral-200">
              {metrics.isMuted ? 'MUTED (0%)' : `${metrics.masterVolume}%`}
            </span>
          </div>

          {/* Sound Action Buttons */}
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            <button
              onClick={onUnlockAudio}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 rounded font-bold transition-all cursor-pointer text-[11px]"
            >
              <Play className="w-3 h-3" />
              <span>START SOUND TEST</span>
            </button>

            <button
              onClick={onToggleMute}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded font-bold transition-all cursor-pointer text-[11px] border ${
                metrics.isMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-700'
              }`}
            >
              {metrics.isMuted ? (
                <>
                  <VolumeX className="w-3 h-3 text-rose-400" />
                  <span>UNMUTE</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3 h-3 text-emerald-400" />
                  <span>MUTE</span>
                </>
              )}
            </button>
          </div>

          {onTestGameOver && (
            <div className="mt-2 pt-2 border-t border-neutral-800">
              <button
                onClick={onTestGameOver}
                className="w-full py-1.5 px-2 bg-gradient-to-r from-amber-600/30 to-yellow-600/30 hover:from-amber-600/50 hover:to-yellow-600/50 text-amber-200 border border-amber-400/50 rounded font-bold transition-all cursor-pointer text-[11px] flex items-center justify-center gap-1.5"
              >
                <span>🎆 Trigger Game Over & Live Photo</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
