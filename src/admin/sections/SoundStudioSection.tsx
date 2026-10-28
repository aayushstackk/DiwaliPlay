/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AssetRecord } from '../../types/backend';
import { adminApi } from '../../services/api';
import {
  Music,
  Volume2,
  Sparkles,
  Info,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Upload,
  Trash2,
  Play,
  Pause
} from 'lucide-react';

export const SoundStudioSection: React.FC = () => {
  const [audioAssets, setAudioAssets] = useState<AssetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAudioAssets = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.listAssets('audio_tracks');
      if (res.success) {
        setAudioAssets(res.assets);
      }
    } catch (err) {
      console.warn('[Sound Studio] Failed to load audio tracks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAudioAssets();
  }, []);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFeedback(null);
    setIsUploading(true);

    try {
      const res = await adminApi.uploadAsset(file, 'audio_tracks', file.name.replace(/\.[^/.]+$/, ''));
      if (res.success && res.asset) {
        setFeedback({
          type: 'success',
          message: `Audio track "${res.asset.displayName || file.name}" uploaded successfully.`
        });
        await loadAudioAssets();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to upload audio.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.data?.message || err.message || 'Upload error.' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAudio = async (asset: AssetRecord) => {
    if (!confirm(`Delete audio track "${asset.displayName || asset.originalFilename}"?`)) return;

    try {
      const res = await adminApi.deleteAsset(asset.id);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Audio track deleted safely.' });
        await loadAudioAssets();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.data?.message || err.message || 'Delete error.' });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Informational Notice */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sm mb-1 text-amber-100">
            Phase 4A Persistent Audio Storage & Sound Studio
          </h3>
          <p className="text-amber-300/80 leading-relaxed">
            In-game Web Audio oscillators provide zero-latency procedural cues. Operators can now upload custom audio files (MP3, WAV, OGG up to 12 MB) into persistent object storage for upcoming festive multi-track sound combinations.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/60 border-red-500/40 text-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Audio Cues Architecture */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
              <Volume2 className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                Active Procedural Sound Synthesis
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-start justify-between">
                <div>
                  <span className="font-bold text-neutral-100 block">1. 3-2-1 Countdown Chime</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Resonant sine wave harmonics signaling kiosk motion calibration.
                  </p>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">Synthesizer Active</span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-start justify-between">
                <div>
                  <span className="font-bold text-neutral-100 block">2. Rocket Launch Whistle</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Frequency-ramped upward sweep triggered by fast vertical hand thrusts.
                  </p>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">Synthesizer Active</span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-start justify-between">
                <div>
                  <span className="font-bold text-neutral-100 block">3. Crackle Bursts & Explosions</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Low-pass filtered white noise burst with sub-bass kick on fist punches.
                  </p>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">Synthesizer Active</span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-start justify-between">
                <div>
                  <span className="font-bold text-neutral-100 block">4. Sparkler Continuous Hiss</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    High-frequency pink noise modulated by pointer hand tracking velocity.
                  </p>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">Synthesizer Active</span>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500">
            Procedural synthesizer runs zero-latency in client Web Audio context.
          </div>
        </div>

        {/* Upload Audio Tracks Card */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
              <Upload className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                Upload Audio Track
              </h2>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              Upload festive audio recordings, celebratory fanfares, or background music. Files are stored on object storage and streamed on-demand.
            </p>

            <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-2 mb-5 text-[11px] text-neutral-400">
              <div className="flex items-center justify-between">
                <span>Supported Formats:</span>
                <span className="font-mono text-neutral-200 font-semibold">MP3, WAV, OGG</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Maximum File Size:</span>
                <span className="font-mono text-neutral-200 font-semibold">12 MB</span>
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAudioUpload}
              accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
              className="hidden"
            />

            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 px-4 rounded-xl border-2 border-dashed border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/5 text-amber-200 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Music className="w-6 h-6 text-amber-400" />
              <span>{isUploading ? 'Validating Audio File...' : 'Click to Upload Audio File'}</span>
            </button>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500 text-center">
            Uploaded tracks will appear in the library below.
          </div>
        </div>
      </div>

      {/* Uploaded Audio Library */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 shadow-xl">
        <h3 className="text-sm font-bold text-neutral-100 font-['Cinzel',serif] tracking-wide mb-4 pb-3 border-b border-neutral-800">
          Stored Audio Tracks ({audioAssets.length})
        </h3>

        {audioAssets.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            No custom audio tracks uploaded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {audioAssets.map((asset) => (
              <div
                key={asset.id}
                className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-semibold text-neutral-200">
                    {asset.displayName || asset.originalFilename}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2 font-mono">
                    <span>{(asset.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                    <span>·</span>
                    <span>{asset.mimeType}</span>
                    <span>·</span>
                    <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <audio controls src={asset.url} className="h-8 max-w-[220px]" />
                  <button
                    type="button"
                    onClick={() => handleDeleteAudio(asset)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                    title="Delete audio track"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
