/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrackedHand, CrackerStats, SoundStats, GameScoreState } from '../types/motion';
import { CrackerSoundType } from '../utils/soundEngine';
import { formatGameTimer } from '../utils/scoreSystem';
import {
  Flame,
  Sparkles,
  RotateCcw,
  Volume2,
  VolumeX,
  Play,
  Volume1,
  Music,
  Zap,
} from 'lucide-react';

interface CrackerInteractionHudProps {
  leftHand: TrackedHand;
  rightHand: TrackedHand;
  crackerStats: CrackerStats;
  soundStats: SoundStats;
  isCrackerModeActive: boolean;
  remainingSeconds?: number;
  gameScore?: GameScoreState;
  onToggleCrackerMode: () => void;
  onUnlockAudio: () => Promise<boolean> | void;
  onToggleMute: () => void;
  onSetMasterVolume: (vol: number) => void;
  onPlaySound: (type: CrackerSoundType) => void;
  onReset: () => void;
  onOpenAudioLab?: () => void;
}

export const CrackerInteractionHud: React.FC<CrackerInteractionHudProps> = ({
  leftHand,
  rightHand,
  crackerStats,
  soundStats,
  isCrackerModeActive,
  remainingSeconds,
  gameScore,
  onToggleCrackerMode,
  onUnlockAudio,
  onToggleMute,
  onSetMasterVolume,
  onPlaySound,
  onReset,
  onOpenAudioLab,
}) => {
  const handleTestSound = async (type: CrackerSoundType) => {
    if (!soundStats.isUnlocked) {
      await onUnlockAudio();
    }
    onPlaySound(type);
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-2.5">
      {/* COMBO BANNER (Shown when both hands are moving fast) */}
      {crackerStats.isCombo && (
        <div className="w-full flex justify-center animate-bounce">
          <div className="bg-gradient-to-r from-amber-500/90 via-rose-500/90 to-amber-500/90 text-neutral-950 font-black font-['Cinzel',serif] px-6 py-2 rounded-xl border border-amber-300 shadow-[0_0_35px_rgba(245,158,11,0.9)] tracking-widest text-sm sm:text-base flex items-center gap-2">
            <Flame className="w-5 h-5 text-neutral-950 fill-neutral-950 animate-pulse" />
            <span>🔥 COMBO! MEGA BLAST ACTIVE 🔥</span>
            <Flame className="w-5 h-5 text-neutral-950 fill-neutral-950 animate-pulse" />
          </div>
        </div>
      )}

      {/* Main Step 2 Cracker HUD Strip */}
      <div className="w-full bg-neutral-950/85 border border-amber-500/40 backdrop-blur-md rounded-xl p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.7)] flex flex-col gap-3 font-mono text-xs">
        {/* Core Metrics: TIME, SPEEDS, CRACKERS, COMBO, SOUND STATE */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full">
          {/* TIME */}
          <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800 flex flex-col">
            <span className="text-neutral-400 text-[10px] uppercase">TIME</span>
            <span className="text-amber-300 font-bold text-xs mt-0.5">
              {remainingSeconds !== undefined ? formatGameTimer(remainingSeconds) : '00:35'}
            </span>
          </div>

          {/* LEFT SPEED */}
          <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800 flex flex-col">
            <span className="text-neutral-400 text-[10px] uppercase">LEFT SPEED</span>
            <span className="text-amber-200 font-bold text-xs mt-0.5">
              {leftHand.detected ? `${leftHand.movementSpeed} px/s` : '0 px/s'}
            </span>
          </div>

          {/* RIGHT SPEED */}
          <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800 flex flex-col">
            <span className="text-neutral-400 text-[10px] uppercase">RIGHT SPEED</span>
            <span className="text-pink-200 font-bold text-xs mt-0.5">
              {rightHand.detected ? `${rightHand.movementSpeed} px/s` : '0 px/s'}
            </span>
          </div>

          {/* CRACKERS */}
          <div className="bg-neutral-900/80 p-2 rounded border border-amber-500/30 flex flex-col shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <span className="text-amber-400/90 text-[10px] uppercase flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> CRACKERS
            </span>
            <span className="text-amber-300 font-bold text-xs mt-0.5">
              {crackerStats.crackersBurst}
            </span>
          </div>

          {/* COMBO */}
          <div
            className={`p-2 rounded border flex flex-col col-span-2 sm:col-span-1 transition-all ${
              crackerStats.isCombo
                ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                : 'bg-neutral-900/80 border-neutral-800 text-neutral-400'
            }`}
          >
            <span className="text-[10px] uppercase flex items-center gap-1">
              <Flame className="w-2.5 h-2.5" /> COMBO
            </span>
            <span className="font-bold text-xs mt-0.5">
              {crackerStats.isCombo ? '🔥 ACTIVE (2x)' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Audio Status & Main Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-neutral-900">
          {/* Audio Status Tag & Unlock Button */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {soundStats.isUnlocked ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded font-bold text-xs shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>SOUND: READY ✓</span>
              </div>
            ) : (
              <button
                onClick={onUnlockAudio}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-300 rounded font-bold text-xs transition-all cursor-pointer animate-pulse"
                title="Click to unlock browser Web Audio"
              >
                <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                <span>SOUND: TAP START TO ENABLE</span>
              </button>
            )}

            {/* Volume slider & Mute */}
            <div className="flex items-center gap-2 bg-neutral-900/90 px-2.5 py-1 rounded border border-neutral-800">
              <button
                onClick={onToggleMute}
                className="text-neutral-400 hover:text-amber-300 transition-colors cursor-pointer"
                title={soundStats.isMuted ? 'Unmute' : 'Mute'}
              >
                {soundStats.isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume1 className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundStats.isMuted ? 0 : soundStats.masterVolume}
                onChange={(e) => onSetMasterVolume(parseFloat(e.target.value))}
                className="w-16 accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
                title={`Volume: ${Math.round(soundStats.masterVolume * 100)}%`}
              />
              <span className="text-[10px] text-neutral-400 w-7">
                {soundStats.isMuted ? '0%' : `${Math.round(soundStats.masterVolume * 100)}%`}
              </span>
            </div>
          </div>

          {/* Cracker Test Mode & Reset Actions */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onToggleCrackerMode}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95 ${
                isCrackerModeActive
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
              }`}
            >
              {isCrackerModeActive ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>CRACKER TEST ON</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>START CRACKER TEST</span>
                </>
              )}
            </button>

            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-amber-200 text-xs font-semibold border border-neutral-700 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
              title="Reset tracking and cracker counters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>RESET</span>
            </button>
          </div>
        </div>

        {/* Development Sound Test Buttons */}
        <div className="pt-2 border-t border-neutral-900">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Music className="w-2.5 h-2.5 text-amber-400" /> Diwali Sound Profiles (Click to Audition):
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500">
                Last: <span className="text-amber-300 font-bold">{soundStats.lastSoundName}</span>
              </span>
              {onOpenAudioLab && (
                <button
                  onClick={onOpenAudioLab}
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold uppercase transition-all cursor-pointer flex items-center gap-1"
                >
                  <Volume2 className="w-2.5 h-2.5" />
                  <span>Audio Lab ↗</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
            <button
              onClick={() => handleTestSound('ROCKET')}
              className="py-1 px-1.5 bg-neutral-900 hover:bg-amber-950/60 hover:border-amber-500/50 text-neutral-300 hover:text-amber-200 border border-neutral-800 rounded text-[10px] font-semibold transition-all cursor-pointer text-center"
              title="Rocket (~5.8s): 4.5s rising screaming whistle + celestial blast"
            >
              🚀 ROCKET (5.8s)
            </button>
            <button
              onClick={() => handleTestSound('BOMB')}
              className="py-1 px-1.5 bg-neutral-900 hover:bg-amber-950/60 hover:border-amber-500/50 text-neutral-300 hover:text-amber-200 border border-neutral-800 rounded text-[10px] font-semibold transition-all cursor-pointer text-center"
              title="Bomb: Fuse sizzle -> suspense gap -> heavy sub-bass DHAAAM"
            >
              💣 BOMB (DHAAM)
            </button>
            <button
              onClick={() => handleTestSound('LADI')}
              className="py-1 px-1.5 bg-neutral-900 hover:bg-amber-950/60 hover:border-amber-500/50 text-neutral-300 hover:text-amber-200 border border-neutral-800 rounded text-[10px] font-semibold transition-all cursor-pointer text-center"
              title="Ladi: Rapid 16-burst machine-gun firecracker sequence"
            >
              ⚡ LADI (16-POP)
            </button>
            <button
              onClick={() => handleTestSound('FLOWER_POT')}
              className="py-1 px-1.5 bg-neutral-900 hover:bg-amber-950/60 hover:border-amber-500/50 text-neutral-300 hover:text-amber-200 border border-neutral-800 rounded text-[10px] font-semibold transition-all cursor-pointer text-center"
              title="Flower Pot (Anaar): 3.2s continuous sparkling fountain spray"
            >
              🎆 ANAAR (3.2s)
            </button>
            <button
              onClick={() => handleTestSound('CHAKRI')}
              className="py-1 px-1.5 bg-neutral-900 hover:bg-amber-950/60 hover:border-amber-500/50 text-neutral-300 hover:text-amber-200 border border-neutral-800 rounded text-[10px] font-semibold transition-all cursor-pointer text-center"
              title="Chakri: Whirling rotary ground spinner sizzle"
            >
              🌀 CHAKRI (2.8s)
            </button>
            <button
              onClick={() => handleTestSound('SMALL_CRACKER')}
              className="py-1 px-1.5 bg-neutral-900 hover:bg-amber-950/60 hover:border-amber-500/50 text-neutral-300 hover:text-amber-200 border border-neutral-800 rounded text-[10px] font-semibold transition-all cursor-pointer text-center"
              title="Small Cracker: Crisp snappy pop (Tak/Pat/Pop/Crack)"
            >
              💥 SMALL POP
            </button>
            <button
              onClick={() => handleTestSound('BIG_FIREWORK')}
              className="py-1 px-1.5 bg-neutral-900 hover:bg-amber-950/60 hover:border-amber-500/50 text-neutral-300 hover:text-amber-200 border border-neutral-800 rounded text-[10px] font-semibold transition-all cursor-pointer text-center"
              title="Big Firework: Ascending whoosh -> massive peony burst"
            >
              ✨ SKY BURST
            </button>
            <button
              onClick={() => handleTestSound('MEGA_BLAST')}
              className="py-1 px-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold transition-all cursor-pointer text-center shadow-[0_0_8px_rgba(245,158,11,0.2)]"
              title="Mega Blast: Dual-hand combo firework barrage"
            >
              🔥 COMBO MEGA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
