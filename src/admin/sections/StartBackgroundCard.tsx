/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { SystemSettings } from '../../types/backend';
import { adminApi } from '../../services/api';
import { useAdminTheme } from '../AdminThemeContext';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { assetIdFromUrl } from '../../utils/assetIdFromUrl';
import { DiwaliWallpaper } from '../../components/DiwaliWallpaper';
import { Image as ImageIcon, Upload, Trash2, Sliders, AlertCircle, Loader2 } from 'lucide-react';

const MB = 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * MB;
const MAX_VIDEO_BYTES = 40 * MB;
const VIDEO_ERROR = "This video can't be played here. Please use a 1080p H.264 MP4.";
const MAX_DIM = 80;

interface StartBackgroundCardProps {
  settings: SystemSettings;
  onSettingsUpdated: (s: SystemSettings) => void;
  readOnly: boolean;
  onNotify?: (type: 'success' | 'error', title: string, message: string) => void;
}

function canPlayVideo(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.preload = 'auto';
    probe.muted = true;
    const done = (ok: boolean) => {
      probe.onloadeddata = null;
      probe.onerror = null;
      probe.removeAttribute('src');
      probe.load();
      resolve(ok);
    };
    probe.onloadeddata = () => done(true);
    probe.onerror = () => done(false);
    probe.src = url;
  });
}

export const StartBackgroundCard: React.FC<StartBackgroundCardProps> = ({
  settings,
  onSettingsUpdated,
  readOnly,
  onNotify
}) => {
  const { isLight } = useAdminTheme();
  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_2px_8px_rgba(73,52,38,0.05)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 text-slate-100 shadow-sm';
  const cardSubBg = isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/90 border-slate-800';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';
  const secondaryText = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const accent = isLight ? 'accent-[#B36D4E]' : 'accent-cyan-400';
  const primaryBtn = isLight
    ? 'bg-[#B36D4E] hover:bg-[#9F5F42] text-[#FDF9F3]'
    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950';
  const secondaryBtn = isLight
    ? 'border-[#D8C7AE] text-[#493426] hover:bg-[#F1E8D9]'
    : 'border-slate-700 text-slate-200 hover:bg-slate-800';

  const savedUrl = settings.startBackgroundUrl || '';
  const savedType: 'image' | 'video' = settings.startBackgroundType === 'video' ? 'video' : 'image';
  const savedDim = Math.min(MAX_DIM, Math.max(0, settings.startBackgroundDim ?? 50));

  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState('');
  const [localType, setLocalType] = useState<'image' | 'video'>('image');
  const [dim, setDim] = useState(savedDim);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef('');

  useEffect(() => {
    setDim(Math.min(MAX_DIM, Math.max(0, settings.startBackgroundDim ?? 50)));
  }, [settings.startBackgroundDim]);

  const replaceLocalUrl = (next: string) => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = next;
    setLocalUrl(next);
  };

  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  const fail = (message: string) => {
    setError(message);
    onNotify?.('error', 'Start Background', message);
  };

  const clearChoice = () => {
    setFile(null);
    replaceLocalUrl('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const deleteOldAsset = async (url: string) => {
    const id = assetIdFromUrl(url);
    if (!id) return;
    try {
      await adminApi.deleteAsset(id);
    } catch (err) {
      console.warn('[StartBackground] Failed to delete previous asset:', err);
    }
  };

  const handleChoose = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    setError(null);

    const isVideo = chosen.type === 'video/mp4' || /\.mp4$/i.test(chosen.name);
    const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (chosen.size > limit) {
      clearChoice();
      fail(
        isVideo
          ? 'Videos must be 40 MB or smaller.'
          : 'Images must be 15 MB or smaller.'
      );
      return;
    }

    const objectUrl = URL.createObjectURL(chosen);
    if (isVideo && !(await canPlayVideo(objectUrl))) {
      URL.revokeObjectURL(objectUrl);
      clearChoice();
      fail(VIDEO_ERROR);
      return;
    }
    setFile(chosen);
    setLocalType(isVideo ? 'video' : 'image');
    replaceLocalUrl(objectUrl);
  };

  const handleSetBackground = async () => {
    if (!file || busy || readOnly) return;
    setBusy(true);
    setError(null);
    let uploadedId: string | null = null;
    try {
      const res = await adminApi.uploadAsset(file, 'start_backgrounds', file.name);
      uploadedId = res.asset.id;
      const updated = await adminApi.updateSettings({
        startBackgroundUrl: res.asset.url,
        startBackgroundType: localType,
        startBackgroundDim: dim
      });
      uploadedId = null;
      onSettingsUpdated(updated.settings);
      if (savedUrl) await deleteOldAsset(savedUrl);
      clearChoice();
      onNotify?.('success', 'Start Background', 'Start screen background updated.');
    } catch (err: any) {
      if (uploadedId) {
        try {
          await adminApi.deleteAsset(uploadedId);
        } catch (cleanupErr) {
          console.warn('[StartBackground] Failed to clean up upload:', cleanupErr);
        }
      }
      fail(err?.message || 'Could not set the start screen background.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!savedUrl || busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.updateSettings({
        startBackgroundUrl: '',
        startBackgroundType: 'image'
      });
      onSettingsUpdated(updated.settings);
      await deleteOldAsset(savedUrl);
      clearChoice();
      onNotify?.('success', 'Start Background', 'Using the built-in wallpaper.');
    } catch (err: any) {
      fail(err?.message || 'Could not remove the start screen background.');
    } finally {
      setBusy(false);
    }
  };

  const saveDim = async (value: number) => {
    if (readOnly || file || !savedUrl || value === savedDim) return;
    try {
      const updated = await adminApi.updateSettings({ startBackgroundDim: value });
      onSettingsUpdated(updated.settings);
    } catch (err: any) {
      fail(err?.message || 'Could not save the dim level.');
    }
  };

  const showUrl = file ? localUrl : savedUrl ? resolveAssetUrl(savedUrl) : '';
  const showType = file ? localType : savedType;
  const controlsDisabled = readOnly || busy;

  return (
    <div className={`p-5 sm:p-6 rounded-2xl border ${cardBg}`}>
      <div className="flex items-start gap-3.5 mb-4">
        <div className={`p-2.5 rounded-xl border ${cardSubBg}`}>
          <ImageIcon className={`w-5 h-5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
        </div>
        <div>
          <h3 className={`text-base font-bold ${primaryText}`}>Start Screen Background</h3>
          <p className={`text-xs mt-0.5 ${secondaryText}`}>
            An image (JPG, PNG, WebP, up to 15 MB) or a 1080p H.264 MP4 (up to 40 MB) shown behind the kiosk start screen.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div
        className={`relative w-full aspect-video rounded-xl overflow-hidden border ${cardSubBg}`}
        data-testid="start-bg-preview"
      >
        {showUrl ? (
          showType === 'video' ? (
            <video
              key={showUrl}
              src={showUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <img src={showUrl} alt="Start screen background" className="absolute inset-0 w-full h-full object-cover" />
          )
        ) : (
          <>
            <DiwaliWallpaper contained />
            <span className="absolute left-2 top-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-semibold text-white">
              Built-in wallpaper
            </span>
          </>
        )}
        {showUrl && (
          <div
            className="absolute inset-0 bg-black pointer-events-none"
            style={{ opacity: dim / 100 }}
            data-testid="start-bg-dim-overlay"
          />
        )}
      </div>

      <div className={`mt-4 p-4 rounded-xl border space-y-2 ${cardSubBg}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold flex items-center gap-1.5 ${primaryText}`}>
            <Sliders className={`w-3.5 h-3.5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
            Dim
          </span>
          <span className={`text-xs font-mono font-bold ${isLight ? 'text-[#76513D]' : 'text-cyan-300'}`}>{dim}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_DIM}
          value={dim}
          disabled={controlsDisabled}
          aria-label="Background dim"
          onChange={(e) => setDim(Number(e.target.value))}
          onMouseUp={() => saveDim(dim)}
          onTouchEnd={() => saveDim(dim)}
          onKeyUp={() => saveDim(dim)}
          className={`w-full h-2 rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${accent}`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4"
          disabled={controlsDisabled}
          onChange={handleChoose}
          aria-label="Choose background file"
          className={`text-xs max-w-full ${secondaryText} file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border file:text-xs file:font-semibold file:bg-transparent ${
            isLight ? 'file:border-[#D8C7AE] file:text-[#493426]' : 'file:border-slate-700 file:text-slate-200'
          }`}
        />
        <button
          type="button"
          onClick={handleSetBackground}
          disabled={controlsDisabled || !file}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${primaryBtn}`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Set as background
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={controlsDisabled || !savedUrl}
          className={`px-4 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${secondaryBtn}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove (use built-in)
        </button>
      </div>
      {readOnly && (
        <p className={`mt-3 text-[11px] ${secondaryText}`}>Only a superadmin can change the start screen background.</p>
      )}
    </div>
  );
};
