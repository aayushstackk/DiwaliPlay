/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SoundStats } from '../types/motion';
import {
  CrackerSoundType,
  SOUND_PROFILES_META,
} from '../utils/soundEngine';
import {
  Volume2,
  VolumeX,
  Volume1,
  X,
  Play,
  Flame,
  Music,
  Sliders,
  Sparkles,
  Info,
} from 'lucide-react';

interface AudioTestLabModalProps {
  soundStats: SoundStats;
  onUnlockAudio: () => Promise<boolean> | void;
  onToggleMute: () => void;
  onSetMasterVolume: (vol: number) => void;
  onSetEffectVolume: (vol: number) => void;
  onSetMusicVolume: (vol: number) => void;
  onPlaySound: (type: CrackerSoundType) => void;
  onClose: () => void;
}

export const AudioTestLabModal: React.FC<AudioTestLabModalProps> = ({
  soundStats,
  onUnlockAudio,
  onToggleMute,
  onSetMasterVolume,
  onSetEffectVolume,
  onSetMusicVolume,
  onPlaySound,
  onClose,
}) => {
  const [playingType, setPlayingType] = useState<CrackerSoundType | null>(null);

  const handleTestPlay = async (type: CrackerSoundType) => {
    if (!soundStats.isUnlocked) {
      await onUnlockAudio();
    }
    setPlayingType(type);
    onPlaySound(type);

    const meta = SOUND_PROFILES_META.find((m) => m.type === type);
    const dur = meta ? meta.durationSec : 1.5;
    setTimeout(() => {
      setPlayingType((curr) => (curr === type ? null : curr));
    }, dur * 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-3xl bg-neutral-950/95 border border-amber-500/50 rounded-2xl p-5 sm:p-6 shadow-[0_12px_50px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <Volume2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-wider text-amber-100 font-['Cinzel',serif]">
                AUDIO TEST LAB
              </h2>
              <p className="text-[11px] text-amber-300/70">
                Diwali Cracker Acoustic Synthesizer & Sound Profile Testing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!soundStats.isUnlocked && (
              <button
                onClick={onUnlockAudio}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse"
              >
                Unlock Audio
              </button>
            )}
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-100 p-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Close Audio Lab"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Audio Status Banner */}
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded font-bold text-[11px] border ${
                soundStats.isUnlocked
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/80 border-amber-500/40 text-amber-300'
              }`}
            >
              {soundStats.isUnlocked ? 'AUDIO: READY ✓' : 'AUDIO: LOCKED (CLICK UNLOCK)'}
            </span>
            <span className="text-neutral-400 text-[11px]">
              Active Voices: <span className="text-emerald-400 font-bold">{soundStats.activeVoices}</span>
            </span>
            <span className="text-neutral-400 text-[11px]">
              Last Event: <span className="text-amber-300 font-bold">{soundStats.lastSoundName}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleMute}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold border transition-colors cursor-pointer ${
                soundStats.isMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
              }`}
            >
              {soundStats.isMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  <span>UNMUTE</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>MUTE</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Audio Mixing Sliders */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-3.5 mb-5">
          <p className="text-xs font-bold text-amber-200 tracking-wider uppercase mb-2.5 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>Audio Mixing & Gain Staging</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Master Volume */}
            <div className="flex flex-col gap-1.5 bg-neutral-950/60 p-2.5 rounded border border-neutral-800/80">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-neutral-400">Master Volume:</span>
                <span className="text-amber-300 font-bold">
                  {soundStats.isMuted ? '0% (Muted)' : `${Math.round(soundStats.masterVolume * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundStats.isMuted ? 0 : soundStats.masterVolume}
                onChange={(e) => onSetMasterVolume(parseFloat(e.target.value))}
                className="accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
              />
            </div>

            {/* Effect Volume */}
            <div className="flex flex-col gap-1.5 bg-neutral-950/60 p-2.5 rounded border border-neutral-800/80">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-neutral-400">Effect Volume:</span>
                <span className="text-amber-300 font-bold">
                  {Math.round(soundStats.effectVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundStats.effectVolume}
                onChange={(e) => onSetEffectVolume(parseFloat(e.target.value))}
                className="accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
              />
            </div>

            {/* Music Volume */}
            <div className="flex flex-col gap-1.5 bg-neutral-950/60 p-2.5 rounded border border-neutral-800/80">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-neutral-400">Music Volume:</span>
                <span className="text-amber-300 font-bold">
                  {Math.round(soundStats.musicVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundStats.musicVolume}
                onChange={(e) => onSetMusicVolume(parseFloat(e.target.value))}
                className="accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* The 8 Cracker Sound Event Buttons */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-amber-200 tracking-wider uppercase flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Multi-Stage Cracker Sound Profiles</span>
            </h3>
            <span className="text-[10px] text-neutral-500">
              Click any button to audition the acoustic event
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SOUND_PROFILES_META.map((profile) => {
              const isPlaying = playingType === profile.type;

              return (
                <button
                  key={profile.type}
                  onClick={() => handleTestPlay(profile.type)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                    isPlaying
                      ? 'bg-amber-500/25 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.35)] scale-[1.01]'
                      : 'bg-neutral-900/80 hover:bg-neutral-850 hover:border-amber-500/40 border-neutral-800'
                  }`}
                >
                  {/* Playing progress bar */}
                  {isPlaying && (
                    <div
                      className="absolute top-0 left-0 right-0 h-1 bg-amber-400 animate-pulse"
                    />
                  )}

                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-amber-100 flex items-center gap-1.5">
                      <Play
                        className={`w-3.5 h-3.5 ${
                          isPlaying ? 'text-amber-400 fill-amber-400 animate-spin' : 'text-neutral-400'
                        }`}
                      />
                      {profile.label}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-neutral-950/80 text-amber-300 border border-neutral-800">
                      Duration: {profile.durationLabel}
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-400 leading-snug">
                    {profile.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Architecture Note */}
        <div className="mt-4 p-2.5 rounded-lg bg-neutral-900/40 border border-neutral-800 text-[10px] text-neutral-400 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Audio Engine: Web Audio synthesis with +5dB makeup gain, soft-clipping distortion curve, and brickwall limiter. Structure ready for custom licensed files in <code>/audio/</code>.
          </span>
        </div>
      </div>
    </div>
  );
};
