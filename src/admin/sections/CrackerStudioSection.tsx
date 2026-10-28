/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AssetRecord } from '../../types/backend';
import { adminApi } from '../../services/api';
import {
  Flame,
  Sparkles,
  Info,
  Hand,
  Zap,
  Activity,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const CrackerStudioSection: React.FC = () => {
  const [spriteAssets, setSpriteAssets] = useState<AssetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSprites = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.listAssets('cracker_effects');
      if (res.success) {
        setSpriteAssets(res.assets);
      }
    } catch (err) {
      console.warn('[Cracker Studio] Failed to load cracker sprites:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSprites();
  }, []);

  const handleSpriteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFeedback(null);
    setIsUploading(true);

    try {
      const res = await adminApi.uploadAsset(file, 'cracker_effects', file.name.replace(/\.[^/.]+$/, ''));
      if (res.success && res.asset) {
        setFeedback({
          type: 'success',
          message: `Cracker sprite "${res.asset.displayName || file.name}" uploaded successfully.`
        });
        await loadSprites();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to upload sprite.' });
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

  const handleDeleteSprite = async (asset: AssetRecord) => {
    if (!confirm(`Delete cracker sprite "${asset.displayName || asset.originalFilename}"?`)) return;

    try {
      const res = await adminApi.deleteAsset(asset.id);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Sprite deleted safely.' });
        await loadSprites();
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
            Phase 4A Cracker Sprite & Particle Asset Storage
          </h3>
          <p className="text-amber-300/80 leading-relaxed">
            The game renders procedural Canvas 2D fireworks at 60 FPS. Operators can now upload custom PNG and WebP cracker sprites (up to 10 MB) into persistent object storage for branding overlays and custom bursts.
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
        {/* Active Cracker Types & Motion Mappings */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
              <Flame className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                Active Cracker Gesture Mappings
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-200">1. Festive Rocket</span>
                  <span className="text-[10px] text-amber-400 font-mono">Velocity &gt; 450 px/s</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Swift upward vertical hand thrusts. Launches a trail of smoke and sparks culminating in high-altitude starbursts.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-200">2. Ground Chakri (Spinning Wheel)</span>
                  <span className="text-[10px] text-amber-400 font-mono">Radial hand movement</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Circular hand swipes. Emits high-speed tangential spark arcs with rotational inertia.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-200">3. Phuljhadi (Golden Sparkler)</span>
                  <span className="text-[10px] text-amber-400 font-mono">Continuous tracking</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Follows fingertip positions with real-time shimmering golden embers and soft residual trails.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-200">4. Anar (Fountain Flowerpot)</span>
                  <span className="text-[10px] text-amber-400 font-mono">Low-position gesture</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Triggered when hands drop to the lower viewport area. Shoots a high-density vertical fountain of sparks.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-200">5. Festive Bomb (Fist Impact)</span>
                  <span className="text-[10px] text-amber-400 font-mono">Punch acceleration</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Forward punches and dual-hand claps trigger screen-wide shockwaves and massive particle bursts.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500">
            Current gesture sensitivity is calibrated for standard 720p/1080p kiosk webcams.
          </div>
        </div>

        {/* Upload Cracker Sprite Card */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
              <Upload className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                Upload Cracker Sprite / Effect Graphic
              </h2>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              Upload custom PNG, WebP, or JPEG graphics (up to 10 MB) to be rendered during firework bursts or particle explosions.
            </p>

            <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-2 mb-5 text-[11px] text-neutral-400">
              <div className="flex items-center justify-between">
                <span>Allowed Formats:</span>
                <span className="font-mono text-neutral-200 font-semibold">PNG, WebP, JPEG</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Maximum File Size:</span>
                <span className="font-mono text-neutral-200 font-semibold">10 MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Transparency:</span>
                <span className="font-mono text-neutral-200 font-semibold">Alpha transparency recommended</span>
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleSpriteUpload}
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
            />

            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 px-4 rounded-xl border-2 border-dashed border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/5 text-amber-200 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-6 h-6 text-amber-400" />
              <span>{isUploading ? 'Validating Sprite Image...' : 'Click to Upload Sprite File'}</span>
            </button>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500 text-center">
            Uploaded sprites are stored durably on object storage.
          </div>
        </div>
      </div>

      {/* Uploaded Cracker Sprites Gallery */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 shadow-xl">
        <h3 className="text-sm font-bold text-neutral-100 font-['Cinzel',serif] tracking-wide mb-4 pb-3 border-b border-neutral-800">
          Stored Cracker Sprites ({spriteAssets.length})
        </h3>

        {spriteAssets.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            No custom cracker sprites uploaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {spriteAssets.map((asset) => (
              <div
                key={asset.id}
                className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 flex flex-col justify-between items-center text-center"
              >
                <div className="h-20 w-full flex items-center justify-center overflow-hidden mb-2">
                  <img
                    src={asset.url}
                    alt={asset.displayName || asset.originalFilename}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="w-full">
                  <div className="text-[11px] font-semibold text-neutral-200 truncate">
                    {asset.displayName || asset.originalFilename}
                  </div>
                  <div className="text-[9px] text-neutral-400 font-mono mt-0.5">
                    {(asset.fileSize / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSprite(asset)}
                  className="mt-2 text-neutral-500 hover:text-red-400 p-1"
                  title="Delete sprite"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
