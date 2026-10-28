/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { SystemSettings, AssetRecord } from '../../types/backend';
import { adminApi } from '../../services/api';
import {
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Sparkles,
  Info,
  Check,
  RefreshCw,
  Server,
  Cloud
} from 'lucide-react';

interface WallpapersSectionProps {
  settings: SystemSettings | null;
  onSettingsUpdated?: (newSettings: SystemSettings) => void;
}

export const WallpapersSection: React.FC<WallpapersSectionProps> = ({
  settings,
  onSettingsUpdated
}) => {
  const [wallpapers, setWallpapers] = useState<AssetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [storageProvider, setStorageProvider] = useState<'local' | 'gcs'>('local');
  const [isProductionReady, setIsProductionReady] = useState(false);
  const [setupHelp, setSetupHelp] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentWallpaperUrl = settings?.wallpaperUrl || '';

  const loadWallpapers = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.listAssets('wallpapers');
      if (res.success) {
        setWallpapers(res.assets);
        setStorageProvider(res.storageProvider);
        setIsProductionReady(res.isProductionReady);
        setSetupHelp(res.setupHelp);
      }
    } catch (err: any) {
      console.error('[Wallpapers] Failed to list assets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWallpapers();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);

    try {
      const res = await adminApi.uploadAsset(file, 'wallpapers', file.name.replace(/\.[^/.]+$/, ''));
      if (res.success && res.asset) {
        setUploadSuccess(`Wallpaper "${res.asset.displayName || file.name}" uploaded successfully!`);
        await loadWallpapers();
      } else {
        setUploadError(res.message || 'Failed to upload wallpaper.');
      }
    } catch (err: any) {
      setUploadError(err.data?.message || err.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSetActive = async (asset: AssetRecord) => {
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await adminApi.updateSettings({
        wallpaperUrl: asset.url
      });
      if (res.success && res.settings) {
        setUploadSuccess(`Active wallpaper updated to "${asset.displayName || asset.originalFilename}".`);
        if (onSettingsUpdated) {
          onSettingsUpdated(res.settings);
        }
      }
    } catch (err: any) {
      setUploadError(err.data?.message || err.message || 'Failed to set active wallpaper.');
    }
  };

  const handleClearActive = async () => {
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await adminApi.updateSettings({
        wallpaperUrl: ''
      });
      if (res.success && res.settings) {
        setUploadSuccess('Reset to procedural festive default background.');
        if (onSettingsUpdated) {
          onSettingsUpdated(res.settings);
        }
      }
    } catch (err: any) {
      setUploadError(err.data?.message || err.message || 'Failed to clear wallpaper.');
    }
  };

  const handleDelete = async (asset: AssetRecord) => {
    if (!confirm(`Are you sure you want to delete wallpaper "${asset.displayName || asset.originalFilename}"?`)) {
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await adminApi.deleteAsset(asset.id);
      if (res.success) {
        setUploadSuccess(res.message || 'Wallpaper deleted safely.');
        await loadWallpapers();
      }
    } catch (err: any) {
      setUploadError(err.data?.message || err.message || 'Failed to delete asset.');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Storage Provider Status Notice */}
      <div className={`p-4 rounded-2xl border text-xs flex items-start justify-between gap-4 ${
        isProductionReady
          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
      }`}>
        <div className="flex items-start gap-3">
          {isProductionReady ? (
            <Cloud className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <Server className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm text-neutral-100">
                Storage Provider: {storageProvider === 'gcs' ? 'Google Cloud Storage' : 'Local Storage Adapter'}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isProductionReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {isProductionReady ? 'PRODUCTION DURABLE' : 'LOCAL DEV / STAGING'}
              </span>
            </div>
            <p className="leading-relaxed opacity-90">
              {isProductionReady
                ? 'Binary assets are durably stored in Google Cloud Storage and persisted independently of Cloud Run container recycles.'
                : setupHelp || 'Files are stored on the local container filesystem. For production durability on Cloud Run, set the GCS_BUCKET_NAME environment variable.'}
            </p>
          </div>
        </div>

        <button
          onClick={loadWallpapers}
          className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500/40 text-neutral-300 cursor-pointer"
          title="Refresh wallpapers"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Upload Feedback */}
      {uploadSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{uploadSuccess}</span>
        </div>
      )}

      {uploadError && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Wallpaper Preview */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                  Active Kiosk Wallpaper
                </h2>
              </div>
              {currentWallpaperUrl && (
                <button
                  type="button"
                  onClick={handleClearActive}
                  className="text-[11px] text-neutral-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  Reset to Default
                </button>
              )}
            </div>

            {/* Visual Preview */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 overflow-hidden relative aspect-video flex items-center justify-center shadow-inner">
              {currentWallpaperUrl ? (
                <img
                  src={currentWallpaperUrl}
                  alt="Current Kiosk Wallpaper"
                  className="w-full h-full object-cover transition-opacity duration-300"
                />
              ) : (
                <div className="text-center p-6 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6 text-amber-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-200 mb-1">
                    Standard Procedural Festive Background
                  </h4>
                  <p className="text-[11px] text-neutral-400 max-w-sm">
                    Interactive dark background with procedural gold sparkle particles, diya lamp glow, and motion reactive bursts.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold mb-1">
                Active Wallpaper Source:
              </span>
              <span className="font-mono text-neutral-300 break-all text-[11px]">
                {currentWallpaperUrl || '(Procedural Canvas Default)'}
              </span>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500">
            Kiosk displays this background behind motion-tracking gameplay and attract screens.
          </div>
        </div>

        {/* Upload New Wallpaper */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
              <Upload className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                Upload Kiosk Wallpaper
              </h2>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              Upload 1080p or 4K wallpaper images optimized for 65" horizontal displays. Files are validated for magic byte signatures and stored in persistent object storage.
            </p>

            <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-2 mb-5 text-[11px] text-neutral-400">
              <div className="flex items-center justify-between">
                <span>Allowed Formats:</span>
                <span className="font-mono text-neutral-200 font-semibold">JPEG, PNG, WebP</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Maximum File Size:</span>
                <span className="font-mono text-neutral-200 font-semibold">15 MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Recommended Aspect:</span>
                <span className="font-mono text-neutral-200 font-semibold">16:9 (1920×1080 or 3840×2160)</span>
              </div>
            </div>

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />

            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 px-4 rounded-xl border-2 border-dashed border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/5 text-amber-200 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-6 h-6 text-amber-400" />
              <span>{isUploading ? 'Validating and Uploading...' : 'Click to Select & Upload Wallpaper File'}</span>
              <span className="text-[10px] text-neutral-500">Files are checked for valid image headers</span>
            </button>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500 text-center">
            Uploaded wallpapers will appear in the wallpaper library below.
          </div>
        </div>
      </div>

      {/* Uploaded Wallpaper Library */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
          <div>
            <h3 className="text-sm font-bold text-neutral-100 font-['Cinzel',serif] tracking-wide">
              Persistent Wallpaper Library ({wallpapers.length})
            </h3>
            <p className="text-[11px] text-neutral-400">Manage uploaded backgrounds stored on object storage</p>
          </div>
        </div>

        {wallpapers.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            No custom wallpapers uploaded yet. Upload an image above to populate the gallery.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {wallpapers.map((asset) => {
              const isActive = currentWallpaperUrl === asset.url;

              return (
                <div
                  key={asset.id}
                  className={`rounded-xl border overflow-hidden flex flex-col justify-between bg-neutral-900/80 transition-all ${
                    isActive
                      ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                      : 'border-neutral-800 hover:border-amber-500/30'
                  }`}
                >
                  <div className="aspect-video relative bg-neutral-950 overflow-hidden">
                    <img
                      src={asset.url}
                      alt={asset.displayName || asset.originalFilename}
                      className="w-full h-full object-cover"
                    />
                    {isActive && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-amber-500 text-neutral-950 font-bold text-[10px] flex items-center gap-1 shadow">
                        <Check className="w-3 h-3" />
                        <span>ACTIVE</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-neutral-200 truncate">
                        {asset.displayName || asset.originalFilename}
                      </h4>
                      <div className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1.5 font-mono">
                        <span>{(asset.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                        <span>·</span>
                        <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-neutral-800 flex items-center justify-between gap-2">
                      {isActive ? (
                        <span className="text-[11px] text-amber-300 font-semibold">
                          Currently Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetActive(asset)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-medium cursor-pointer transition-colors"
                        >
                          Set as Active
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(asset)}
                        disabled={isActive}
                        className="p-1 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isActive ? 'Cannot delete active wallpaper' : 'Delete asset'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
