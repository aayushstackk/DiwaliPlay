/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AssetRecord,
  GameAudioSettings,
  BackgroundMusicConfig,
  ComboAudioConfig
} from '../../types/backend';
import { adminApi } from '../../services/api';
import { SoundEngine } from '../../utils/soundEngine';
import {
  DEFAULT_AUDIO_SETTINGS,
  BGM_TRACK_OPTIONS,
  COMBO_SOUND_OPTIONS,
  SoundOptionMeta
} from '../../utils/audioDefaults';
import {
  Music,
  Volume2,
  VolumeX,
  Play,
  Square,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sliders,
  RotateCcw,
  Save,
  Radio,
  FileAudio,
  Plus,
  Flame,
  Check
} from 'lucide-react';

export const SoundStudioSection: React.FC = () => {
  // Audio Engine instance for previewing tracks and combo sounds
  const previewEngineRef = useRef<SoundEngine | null>(null);
  if (!previewEngineRef.current) {
    previewEngineRef.current = new SoundEngine({ masterVolume: 0.9 });
  }

  // Active Tab: ONLY two features as required
  type TabKey = 'bgm' | 'combo';
  const [activeTab, setActiveTab] = useState<TabKey>('bgm');

  // Current Audio Settings State
  const [audioSettings, setAudioSettings] = useState<GameAudioSettings>({ ...DEFAULT_AUDIO_SETTINGS });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Uploaded audio assets from storage
  const [audioAssets, setAudioAssets] = useState<AssetRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<'bgm' | 'combo'>('bgm');

  // Previewing playback state
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial settings and assets from database
  useEffect(() => {
    let mounted = true;
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const [settingsRes, assetsRes] = await Promise.all([
          adminApi.getSettings(),
          adminApi.listAssets('audio_tracks').catch(() => ({ success: false, assets: [] }))
        ]);

        if (mounted && settingsRes.success && settingsRes.settings.audioSettings) {
          const loaded = settingsRes.settings.audioSettings;
          const defaultCombo: ComboAudioConfig = { soundId: 'combo_ding', volume: 90 };
          setAudioSettings({
            ...DEFAULT_AUDIO_SETTINGS,
            ...loaded,
            bgm: { ...DEFAULT_AUDIO_SETTINGS.bgm, ...(loaded.bgm || {}) },
            combo: {
              ...defaultCombo,
              ...(loaded.combo || {}),
              soundId: loaded.combo?.soundId || defaultCombo.soundId,
              volume: loaded.combo?.volume ?? defaultCombo.volume
            }
          });
        }

        if (mounted && assetsRes.success && assetsRes.assets) {
          setAudioAssets(assetsRes.assets);
        }
      } catch (err: any) {
        console.error('Failed to load sound settings:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchSettings();
    return () => {
      mounted = false;
      stopCurrentPreview();
    };
  }, []);

  // Stop any active preview sound
  const stopCurrentPreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (previewEngineRef.current) {
      previewEngineRef.current.stopBgm();
    }
    setCurrentlyPlayingId(null);
  }, []);

  // Play preview for a BGM track or Combo sound
  const handlePreview = async (soundId: string, customUrl?: string | null, volume = 90) => {
    if (currentlyPlayingId === soundId) {
      stopCurrentPreview();
      return;
    }

    stopCurrentPreview();
    setCurrentlyPlayingId(soundId);

    try {
      if (previewEngineRef.current) {
        await previewEngineRef.current.previewSound(soundId, customUrl, volume);
      }

      // For procedural BGM, stop after 6 seconds preview automatically
      const duration = soundId.startsWith('bgm_') ? 6000 : 1800;
      previewTimerRef.current = setTimeout(() => {
        stopCurrentPreview();
      }, duration);
    } catch (err) {
      console.warn('Preview error:', err);
      stopCurrentPreview();
    }
  };

  // Save Audio Settings to Database
  const handleSaveSettings = async () => {
    stopCurrentPreview();
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await adminApi.updateSettings({
        audioSettings: {
          ...audioSettings
        }
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Sound Studio audio settings saved successfully! Changes are active in game.'
        });
      } else {
        setFeedback({ type: 'error', message: 'Failed to save audio settings.' });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.data?.message || err.message || 'Error saving audio configuration.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to Defaults
  const handleResetDefaults = () => {
    if (!confirm('Reset Background Music and Combo Sounds to default settings?')) return;
    stopCurrentPreview();
    setAudioSettings({
      ...DEFAULT_AUDIO_SETTINGS,
      bgm: { ...DEFAULT_AUDIO_SETTINGS.bgm },
      combo: { soundId: 'combo_ding', volume: 90 }
    });
    setFeedback({
      type: 'success',
      message: 'Reset to factory defaults. Click "Save Audio Settings" to persist.'
    });
  };

  // Upload custom audio file
  const handleTriggerUpload = (category: 'bgm' | 'combo') => {
    setUploadCategory(category);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
      setFeedback({ type: 'error', message: 'Please select a valid audio file (.mp3, .wav, .ogg, .m4a).' });
      return;
    }

    setFeedback(null);
    setIsUploading(true);

    try {
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const res = await adminApi.uploadAsset(file, 'audio_tracks', cleanName);

      if (res.success && res.asset) {
        setFeedback({
          type: 'success',
          message: `Audio track "${res.asset.displayName || file.name}" uploaded successfully!`
        });

        const assetsRes = await adminApi.listAssets('audio_tracks');
        if (assetsRes.success) {
          setAudioAssets(assetsRes.assets);
        }

        // Automatically set as active for the intended category
        if (uploadCategory === 'bgm') {
          setAudioSettings((prev) => ({
            ...prev,
            bgm: {
              ...prev.bgm,
              activeTrackId: res.asset!.id,
              activeTrackUrl: res.asset!.url,
              isMuted: false
            }
          }));
        } else {
          setAudioSettings((prev) => ({
            ...prev,
            combo: {
              ...(prev.combo || { soundId: 'combo_ding', volume: 90 }),
              soundId: 'custom',
              customAssetId: res.asset!.id,
              customUrl: res.asset!.url
            }
          }));
        }
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to upload audio file.' });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.data?.message || err.message || 'Error uploading audio file.'
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Delete uploaded audio asset
  const handleDeleteAsset = async (asset: AssetRecord) => {
    if (!confirm(`Delete audio "${asset.displayName || asset.originalFilename}" from storage?`)) return;

    try {
      const res = await adminApi.deleteAsset(asset.id);
      if (res.success) {
        setAudioAssets((prev) => prev.filter((a) => a.id !== asset.id));
        // Reset selection if active
        if (audioSettings.bgm.activeTrackUrl === asset.url) {
          setAudioSettings((prev) => ({
            ...prev,
            bgm: {
              ...prev.bgm,
              activeTrackId: 'bgm_festive_rhythm',
              activeTrackUrl: null
            }
          }));
        }
        if (audioSettings.combo?.customUrl === asset.url) {
          setAudioSettings((prev) => ({
            ...prev,
            combo: {
              soundId: 'combo_ding',
              volume: prev.combo?.volume ?? 90,
              customUrl: null,
              customAssetId: null
            }
          }));
        }
        setFeedback({ type: 'success', message: 'Audio file deleted successfully.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete audio file.' });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[350px] text-slate-400">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3 shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
        <p className="text-xs">Loading Sound Studio settings...</p>
      </div>
    );
  }

  const currentBgm = audioSettings.bgm;
  const currentCombo = audioSettings.combo || { soundId: 'combo_ding', volume: 90 };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Hidden File Input for Custom Uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Header & Save Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Music className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-wide">
              Sound Studio
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure gameplay Background Music and Combo celebration sounds
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Audio Settings'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Two-Feature Tab Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => {
            stopCurrentPreview();
            setActiveTab('bgm');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'bgm'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Background Music</span>
          {currentBgm.isMuted ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
              MUTED
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
              ACTIVE
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            stopCurrentPreview();
            setActiveTab('combo');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'combo'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Combo Sounds</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
            {currentCombo.soundId === 'custom' ? 'CUSTOM' : 'BUILT-IN'}
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* FEATURE 1: BACKGROUND MUSIC (BGM) */}
      {/* ==================================================================== */}
      {activeTab === 'bgm' && (
        <div className="space-y-6">
          {/* BGM Global Controls Card */}
          <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>BGM Playback & Master Volume</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Controls the looping soundtrack played during 35-second gameplay in both Touch & Camera modes.
                </p>
              </div>

              <div className="flex items-center gap-4">
                {/* Mute / Unmute Button */}
                <button
                  type="button"
                  onClick={() =>
                    setAudioSettings((prev) => ({
                      ...prev,
                      bgm: { ...prev.bgm, isMuted: !prev.bgm.isMuted }
                    }))
                  }
                  className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                    currentBgm.isMuted
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  }`}
                >
                  {currentBgm.isMuted ? (
                    <>
                      <VolumeX className="w-4 h-4 text-rose-400" />
                      <span>BGM Muted</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      <span>BGM Unmuted</span>
                    </>
                  )}
                </button>

                {/* Volume Slider */}
                <div className="flex items-center gap-2.5 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400">Volume:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentBgm.isMuted ? 0 : currentBgm.volume}
                    disabled={currentBgm.isMuted}
                    onChange={(e) => {
                      const vol = Number(e.target.value);
                      setAudioSettings((prev) => ({
                        ...prev,
                        bgm: { ...prev.bgm, volume: vol }
                      }));
                    }}
                    className="w-24 sm:w-32 accent-cyan-400 cursor-pointer disabled:opacity-40"
                  />
                  <span className="font-mono text-xs font-bold text-cyan-300 w-9 text-right">
                    {currentBgm.isMuted ? '0%' : `${currentBgm.volume}%`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 5 Predefined Background Music Tracks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  <span>5 Predefined Background Music Tracks</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Curated procedural celebratory soundtracks generated with Web Audio API. Zero external lag.
                </p>
              </div>

              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                5 Tracks Available
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {BGM_TRACK_OPTIONS.map((track) => {
                const isActive =
                  !currentBgm.activeTrackUrl && currentBgm.activeTrackId === track.id;
                const isPlaying = currentlyPlayingId === track.id;

                return (
                  <div
                    key={track.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      isActive
                        ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                        : 'bg-[#0F1B2E]/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-bold text-slate-100 text-sm">
                          {track.name}
                        </div>
                        {track.badge && (
                          <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            {track.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        {track.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      {/* Preview Button */}
                      <button
                        type="button"
                        onClick={() => handlePreview(track.id, null, currentBgm.volume)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          isPlaying
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                            : 'bg-slate-900 border-slate-700 hover:border-slate-600 text-slate-300'
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>

                      {/* Select as Active Button */}
                      <button
                        type="button"
                        onClick={() => {
                          stopCurrentPreview();
                          setAudioSettings((prev) => ({
                            ...prev,
                            bgm: {
                              ...prev.bgm,
                              activeTrackId: track.id,
                              activeTrackUrl: null,
                              isMuted: false
                            }
                          }));
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isActive
                            ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                            : 'bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300'
                        }`}
                      >
                        {isActive ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Active in Game</span>
                          </>
                        ) : (
                          <span>Select Track</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload Custom Audio Track Section */}
          <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Custom Uploaded Audio Tracks</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload your own MP3, WAV, or OGG music files to use as gameplay background music.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleTriggerUpload('bgm')}
                disabled={isUploading}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition-all self-start sm:self-auto disabled:opacity-50"
              >
                {isUploading ? (
                  <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Upload Audio File</span>
              </button>
            </div>

            {audioAssets.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                No custom audio files uploaded yet. Click "Upload Audio File" to add your local music tracks.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {audioAssets.map((asset) => {
                  const isActive = currentBgm.activeTrackUrl === asset.url;
                  const isPlaying = currentlyPlayingId === asset.id;

                  return (
                    <div
                      key={asset.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-cyan-500/10 border-cyan-400'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FileAudio className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div className="truncate">
                          <div className="font-semibold text-xs text-slate-200 truncate">
                            {asset.displayName || asset.originalFilename}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {asset.fileSize ? `${Math.round(asset.fileSize / 1024)} KB` : 'Custom Audio'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Preview */}
                        <button
                          type="button"
                          onClick={() => handlePreview(asset.id, asset.url, currentBgm.volume)}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 text-xs"
                          title="Preview"
                        >
                          {isPlaying ? (
                            <Square className="w-3.5 h-3.5 text-amber-400 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </button>

                        {/* Set Active */}
                        <button
                          type="button"
                          onClick={() => {
                            stopCurrentPreview();
                            setAudioSettings((prev) => ({
                              ...prev,
                              bgm: {
                                ...prev.bgm,
                                activeTrackId: asset.id,
                                activeTrackUrl: asset.url,
                                isMuted: false
                              }
                            }));
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                            isActive
                              ? 'bg-cyan-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Active</span>
                            </>
                          ) : (
                            <span>Use as BGM</span>
                          )}
                        </button>

                        {/* Delete Asset */}
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(asset)}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-xs"
                          title="Delete audio file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* FEATURE 2: COMBO SOUNDS */}
      {/* ==================================================================== */}
      {activeTab === 'combo' && (
        <div className="space-y-6">
          {/* Combo Global Controls Card */}
          <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-400" />
                  <span>Combo Sound Settings</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sound effect triggered whenever a player bursts 3 bombs rapidly within 1 second.
                </p>
              </div>

              <div className="flex items-center gap-2.5 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-800">
                <span className="text-[11px] font-mono text-slate-400">Combo Volume:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentCombo.volume ?? 90}
                  onChange={(e) => {
                    const vol = Number(e.target.value);
                    setAudioSettings((prev) => ({
                      ...prev,
                      combo: {
                        ...(prev.combo || { soundId: 'combo_ding', volume: 90 }),
                        volume: vol
                      }
                    }));
                  }}
                  className="w-24 sm:w-32 accent-rose-400 cursor-pointer"
                />
                <span className="font-mono text-xs font-bold text-rose-300 w-9 text-right">
                  {currentCombo.volume ?? 90}%
                </span>
              </div>
            </div>
          </div>

          {/* Built-in Combo Sound Choices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-rose-400" />
                  <span>Built-in Combo Sound Choices</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Select which sound effect plays during high-octane 3-bomb combo achievements.
                </p>
              </div>

              <span className="text-[11px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg">
                5 Choices Available
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {COMBO_SOUND_OPTIONS.map((opt) => {
                const isActive =
                  currentCombo.soundId === opt.id && !currentCombo.customUrl;
                const isPlaying = currentlyPlayingId === opt.id;

                return (
                  <div
                    key={opt.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      isActive
                        ? 'bg-rose-500/10 border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                        : 'bg-[#0F1B2E]/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-bold text-slate-100 text-sm">
                          {opt.name}
                        </div>
                        {opt.badge && (
                          <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        {opt.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      {/* Preview Button */}
                      <button
                        type="button"
                        onClick={() => handlePreview(opt.id, null, currentCombo.volume ?? 90)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          isPlaying
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                            : 'bg-slate-900 border-slate-700 hover:border-slate-600 text-slate-300'
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Playing</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>

                      {/* Select as Active */}
                      <button
                        type="button"
                        onClick={() => {
                          setAudioSettings((prev) => ({
                            ...prev,
                            combo: {
                              ...(prev.combo || { soundId: 'combo_ding', volume: 90 }),
                              soundId: opt.id,
                              customUrl: null,
                              customAssetId: null
                            }
                          }));
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isActive
                            ? 'bg-rose-500 text-slate-950 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                            : 'bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-300'
                        }`}
                      >
                        {isActive ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Active in Combos</span>
                          </>
                        ) : (
                          <span>Select Sound</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Combo Sound Upload Section */}
          <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-rose-400" />
                  <span>Custom Uploaded Combo Sound</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload a punchy custom sound effect (.wav or .mp3) to replace the combo sound.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleTriggerUpload('combo')}
                disabled={isUploading}
                className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all self-start sm:self-auto disabled:opacity-50"
              >
                {isUploading ? (
                  <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Upload Custom Sound</span>
              </button>
            </div>

            {audioAssets.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                No custom audio files uploaded yet. Upload an audio file to use as a custom combo sound.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {audioAssets.map((asset) => {
                  const isActive = currentCombo.customUrl === asset.url;
                  const isPlaying = currentlyPlayingId === asset.id;

                  return (
                    <div
                      key={asset.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-rose-500/10 border-rose-400'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FileAudio className="w-4 h-4 text-rose-400 shrink-0" />
                        <div className="truncate">
                          <div className="font-semibold text-xs text-slate-200 truncate">
                            {asset.displayName || asset.originalFilename}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {asset.fileSize ? `${Math.round(asset.fileSize / 1024)} KB` : 'Custom Audio'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Preview */}
                        <button
                          type="button"
                          onClick={() => handlePreview(asset.id, asset.url, currentCombo.volume ?? 90)}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 text-xs"
                          title="Preview"
                        >
                          {isPlaying ? (
                            <Square className="w-3.5 h-3.5 text-amber-400 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </button>

                        {/* Set Active */}
                        <button
                          type="button"
                          onClick={() => {
                            setAudioSettings((prev) => ({
                              ...prev,
                              combo: {
                                ...(prev.combo || { soundId: 'combo_ding', volume: 90 }),
                                soundId: 'custom',
                                customAssetId: asset.id,
                                customUrl: asset.url
                              }
                            }));
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                            isActive
                              ? 'bg-rose-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Active</span>
                            </>
                          ) : (
                            <span>Use as Combo</span>
                          )}
                        </button>

                        {/* Delete Asset */}
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(asset)}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-xs"
                          title="Delete audio file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
