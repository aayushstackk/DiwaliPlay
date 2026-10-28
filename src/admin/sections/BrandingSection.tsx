/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { SystemSettings, AdminRole, AssetRecord } from '../../types/backend';
import { adminApi } from '../../services/api';
import { BrandLogo } from '../../components/BrandLogo';
import {
  Palette,
  Sparkles,
  Save,
  AlertCircle,
  CheckCircle2,
  Upload,
  Trash2,
  Check,
  RotateCcw,
  Move,
  Sliders,
  Image as ImageIcon,
  Video,
  RefreshCw
} from 'lucide-react';

interface BrandingSectionProps {
  settings: SystemSettings | null;
  onSettingsUpdated: (updated: SystemSettings) => void;
  currentUserRole: AdminRole;
  initialTab?: 'branding' | 'wallpapers';
}

export const BrandingSection: React.FC<BrandingSectionProps> = ({
  settings,
  onSettingsUpdated,
  currentUserRole,
  initialTab = 'branding'
}) => {
  const [activeTab, setActiveTab] = useState<'branding' | 'wallpapers'>(initialTab);

  // --------------------------------------------------------------------------
  // Tab 1: Branding & Visual Layout State
  // --------------------------------------------------------------------------
  const [experienceTitle, setExperienceTitle] = useState(
    settings?.experienceTitle || 'DIWALI FUN PLAY'
  );
  const [connectorText, setConnectorText] = useState(
    settings?.connectorText !== undefined ? settings.connectorText : 'by'
  );
  const [brandName, setBrandName] = useState(settings?.brandName || 'ItsSpotlight');
  const [brandLogoUrl, setBrandLogoUrl] = useState(settings?.brandLogoUrl || '');

  // Logo dimensions & position state
  const [logoWidth, setLogoWidth] = useState<number>(settings?.logoWidth || 160);
  const [logoHeight, setLogoHeight] = useState<number>(settings?.logoHeight || 48);
  const [logoPosition, setLogoPosition] = useState<{ x: number; y: number }>(
    settings?.logoPosition || { x: 0, y: 0 }
  );

  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [brandingSuccess, setBrandingSuccess] = useState<string | null>(null);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  const [uploadedLogos, setUploadedLogos] = useState<AssetRecord[]>([]);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop state for logo positioning inside preview
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number }>({
    x: 0,
    y: 0,
    origX: 0,
    origY: 0
  });

  // --------------------------------------------------------------------------
  // Tab 2: Wallpapers & Rotation State
  // --------------------------------------------------------------------------
  const [wallpapers, setWallpapers] = useState<AssetRecord[]>([]);
  const [isLoadingWallpapers, setIsLoadingWallpapers] = useState(false);
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);
  const [wallpaperOpacity, setWallpaperOpacity] = useState<number>(
    typeof settings?.wallpaperOpacity === 'number' ? settings.wallpaperOpacity : 100
  );
  const [wallpaperEnabled, setWallpaperEnabled] = useState<boolean>(
    settings?.wallpaperEnabled !== false
  );
  const [isSavingToggle, setIsSavingToggle] = useState(false);
  const [wallpaperSuccess, setWallpaperSuccess] = useState<string | null>(null);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [storageProvider, setStorageProvider] = useState<'local' | 'gcs'>('local');
  const [isProductionReady, setIsProductionReady] = useState(false);
  const [setupHelp, setSetupHelp] = useState<string | undefined>(undefined);
  const [isSavingOpacity, setIsSavingOpacity] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

  const wallpaperFileInputRef = useRef<HTMLInputElement>(null);
  const currentWallpaperUrl = settings?.wallpaperUrl || '';

  // Synchronize state when settings prop updates
  useEffect(() => {
    if (settings) {
      setExperienceTitle(settings.experienceTitle || 'DIWALI FUN PLAY');
      setConnectorText(settings.connectorText !== undefined ? settings.connectorText : 'by');
      setBrandName(settings.brandName || 'ItsSpotlight');
      setBrandLogoUrl(settings.brandLogoUrl || '');
      setLogoWidth(settings.logoWidth || 160);
      setLogoHeight(settings.logoHeight || 48);
      setLogoPosition(settings.logoPosition || { x: 0, y: 0 });
      if (typeof settings.wallpaperOpacity === 'number') {
        setWallpaperOpacity(settings.wallpaperOpacity);
      }
      setWallpaperEnabled(settings.wallpaperEnabled !== false);
    }
  }, [settings]);

  // Load uploaded logos
  const loadUploadedLogos = async () => {
    try {
      const res = await adminApi.listAssets('brand_logos');
      if (res.success) {
        setUploadedLogos(res.assets);
      }
    } catch (err) {
      console.warn('[Branding] Failed to load brand logos:', err);
    }
  };

  // Load wallpapers
  const loadWallpapers = async () => {
    setIsLoadingWallpapers(true);
    try {
      const res = await adminApi.listAssets('wallpapers');
      if (res.success) {
        // Sort ascending by order (default 999), then createdAt asc
        const sorted = [...res.assets].sort((a, b) => {
          const ordA = typeof a.order === 'number' && !isNaN(a.order) ? a.order : 999;
          const ordB = typeof b.order === 'number' && !isNaN(b.order) ? b.order : 999;
          if (ordA !== ordB) return ordA - ordB;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
        setWallpapers(sorted);
        setStorageProvider(res.storageProvider);
        setIsProductionReady(res.isProductionReady);
        setSetupHelp(res.setupHelp);
      }
    } catch (err) {
      console.warn('[Wallpapers] Failed to list wallpapers:', err);
    } finally {
      setIsLoadingWallpapers(false);
    }
  };

  useEffect(() => {
    loadUploadedLogos();
    loadWallpapers();
  }, []);

  // --------------------------------------------------------------------------
  // Branding Handlers
  // --------------------------------------------------------------------------
  const handleSaveBranding = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBrandingSuccess(null);
    setBrandingError(null);

    if (currentUserRole !== 'superadmin') {
      setBrandingError('Superadmin permissions are required to update branding configuration.');
      return;
    }

    setIsSavingBranding(true);
    try {
      const res = await adminApi.updateSettings({
        experienceTitle: experienceTitle.trim() || 'DIWALI FUN PLAY',
        connectorText: connectorText.trim(),
        brandName: brandName.trim() || 'ItsSpotlight',
        brandLogoUrl: brandLogoUrl.trim(),
        logoWidth: Number(logoWidth) || 160,
        logoHeight: Number(logoHeight) || 48,
        logoPosition: {
          x: Math.round(logoPosition.x) || 0,
          y: Math.round(logoPosition.y) || 0
        }
      });
      setIsSavingBranding(false);
      setBrandingSuccess('Branding & design saved successfully! Kiosk & mobile update immediately.');
      onSettingsUpdated(res.settings);
    } catch (err: any) {
      setIsSavingBranding(false);
      setBrandingError(err.data?.message || err.message || 'Failed to update branding settings.');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBrandingError(null);
    setBrandingSuccess(null);
    setIsUploadingLogo(true);

    try {
      const res = await adminApi.uploadAsset(file, 'brand_logos', brandName || file.name);
      if (res.success && res.asset) {
        setBrandLogoUrl(res.asset.url);
        const settingsRes = await adminApi.updateSettings({
          brandName: brandName.trim() || 'ItsSpotlight',
          brandLogoUrl: res.asset.url,
          experienceTitle: experienceTitle.trim() || 'DIWALI FUN PLAY',
          connectorText: connectorText.trim(),
          logoWidth,
          logoHeight,
          logoPosition
        });
        if (settingsRes.success) {
          onSettingsUpdated(settingsRes.settings);
        }
        setBrandingSuccess(`Brand logo "${file.name}" uploaded and set as active.`);
        await loadUploadedLogos();
      } else {
        setBrandingError(res.message || 'Failed to upload brand logo.');
      }
    } catch (err: any) {
      setBrandingError(err.data?.message || err.message || 'Logo upload failed.');
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleSelectExistingLogo = async (asset: AssetRecord) => {
    setBrandLogoUrl(asset.url);
    try {
      const res = await adminApi.updateSettings({
        brandName: brandName.trim() || 'ItsSpotlight',
        brandLogoUrl: asset.url
      });
      if (res.success) {
        onSettingsUpdated(res.settings);
        setBrandingSuccess(`Active brand logo changed to "${asset.displayName || asset.originalFilename}".`);
      }
    } catch (err: any) {
      setBrandingError(err.data?.message || err.message || 'Failed to set active logo.');
    }
  };

  const handleDeleteLogo = async (asset: AssetRecord) => {
    if (!confirm(`Delete logo "${asset.displayName || asset.originalFilename}"?`)) return;

    try {
      const res = await adminApi.deleteAsset(asset.id);
      if (res.success) {
        setBrandingSuccess(res.message || 'Logo deleted.');
        if (brandLogoUrl === asset.url) {
          setBrandLogoUrl('');
        }
        await loadUploadedLogos();
      }
    } catch (err: any) {
      setBrandingError(err.data?.message || err.message || 'Failed to delete asset.');
    }
  };

  const handleResetPosition = () => {
    setLogoPosition({ x: 0, y: 0 });
  };

  const handleResetSize = () => {
    setLogoWidth(160);
    setLogoHeight(48);
  };

  // Pointer drag events for interactive logo positioning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDraggingLogo(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      origX: logoPosition.x,
      origY: logoPosition.y
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingLogo) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    // Bound within reasonable preview container limits
    const clampedX = Math.round(Math.max(-160, Math.min(160, dragStartRef.current.origX + dx)));
    const clampedY = Math.round(Math.max(-80, Math.min(80, dragStartRef.current.origY + dy)));
    setLogoPosition({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingLogo) {
      setIsDraggingLogo(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // --------------------------------------------------------------------------
  // Wallpapers Handlers
  // --------------------------------------------------------------------------
  const handleSaveOpacity = async (opacityVal: number) => {
    setIsSavingOpacity(true);
    setWallpaperError(null);
    setWallpaperSuccess(null);
    try {
      const res = await adminApi.updateSettings({
        wallpaperOpacity: opacityVal
      });
      if (res.success) {
        onSettingsUpdated(res.settings);
        setWallpaperSuccess(`Wallpaper opacity set to ${opacityVal}%.`);
      }
    } catch (err: any) {
      setWallpaperError(err.data?.message || err.message || 'Failed to update wallpaper opacity.');
    } finally {
      setIsSavingOpacity(false);
    }
  };

  const handleWallpaperFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setWallpaperError(null);
    setWallpaperSuccess(null);
    setIsUploadingWallpaper(true);

    try {
      const defaultOrder = wallpapers.length + 1;
      const res = await adminApi.uploadAsset(
        file,
        'wallpapers',
        file.name.replace(/\.[^/.]+$/, ''),
        defaultOrder
      );
      if (res.success && res.asset) {
        setWallpaperSuccess(`Wallpaper "${res.asset.displayName || file.name}" uploaded successfully!`);
        await loadWallpapers();
      } else {
        setWallpaperError(res.message || 'Failed to upload wallpaper.');
      }
    } catch (err: any) {
      setWallpaperError(err.data?.message || err.message || 'Upload failed.');
    } finally {
      setIsUploadingWallpaper(false);
      if (wallpaperFileInputRef.current) {
        wallpaperFileInputRef.current.value = '';
      }
    }
  };

  const handleSetActiveWallpaper = async (asset: AssetRecord) => {
    setWallpaperError(null);
    setWallpaperSuccess(null);

    try {
      const res = await adminApi.updateSettings({
        wallpaperUrl: asset.url
      });
      if (res.success && res.settings) {
        setWallpaperSuccess(`Active wallpaper updated to "${asset.displayName || asset.originalFilename}". It will appear first in rotation.`);
        onSettingsUpdated(res.settings);
      }
    } catch (err: any) {
      setWallpaperError(err.data?.message || err.message || 'Failed to set active wallpaper.');
    }
  };

  const handleClearActiveWallpaper = async () => {
    setWallpaperError(null);
    setWallpaperSuccess(null);

    try {
      const res = await adminApi.updateSettings({
        wallpaperUrl: ''
      });
      if (res.success && res.settings) {
        setWallpaperSuccess('Reset to procedural festive default background.');
        onSettingsUpdated(res.settings);
      }
    } catch (err: any) {
      setWallpaperError(err.data?.message || err.message || 'Failed to clear active wallpaper.');
    }
  };

  const handleToggleWallpaperEnabled = async (enabled: boolean) => {
    if (currentUserRole !== 'superadmin') {
      setWallpaperError('Superadmin permissions are required to change gameplay wallpaper configuration.');
      return;
    }

    setWallpaperError(null);
    setWallpaperSuccess(null);
    setIsSavingToggle(true);

    try {
      const res = await adminApi.updateSettings({
        wallpaperEnabled: enabled
      });
      setWallpaperEnabled(enabled);
      setIsSavingToggle(false);
      setWallpaperSuccess(
        enabled
          ? 'Gameplay Wallpaper set to ON — Using Uploaded Wallpaper during active gameplay.'
          : 'Gameplay Wallpaper set to OFF — Using Live Camera Background during active gameplay.'
      );
      if (res.success && res.settings) {
        onSettingsUpdated(res.settings);
      }
    } catch (err: any) {
      setIsSavingToggle(false);
      setWallpaperError(err.data?.message || err.message || 'Failed to update wallpaper setting.');
    }
  };

  const handleDeleteWallpaper = async (asset: AssetRecord) => {
    if (!confirm(`Are you sure you want to delete wallpaper "${asset.displayName || asset.originalFilename}"?`)) {
      return;
    }

    setWallpaperError(null);
    setWallpaperSuccess(null);

    try {
      const res = await adminApi.deleteAsset(asset.id);
      if (res.success) {
        setWallpaperSuccess(res.message || 'Wallpaper deleted safely.');
        await loadWallpapers();
      }
    } catch (err: any) {
      setWallpaperError(err.data?.message || err.message || 'Failed to delete asset.');
    }
  };

  const handleUpdateWallpaperOrder = async (assetId: string, newOrderValue: number) => {
    if (isNaN(newOrderValue) || newOrderValue < 0) return;
    setSavingOrderId(assetId);
    try {
      const res = await adminApi.updateAsset(assetId, { order: newOrderValue });
      if (res.success) {
        // Update local state and re-sort
        setWallpapers((prev) =>
          prev
            .map((w) => (w.id === assetId ? { ...w, order: newOrderValue } : w))
            .sort((a, b) => {
              const ordA = typeof a.order === 'number' && !isNaN(a.order) ? a.order : 999;
              const ordB = typeof b.order === 'number' && !isNaN(b.order) ? b.order : 999;
              if (ordA !== ordB) return ordA - ordB;
              return (a.createdAt || '').localeCompare(b.createdAt || '');
            })
        );
      }
    } catch (err: any) {
      console.warn('Failed to update wallpaper order:', err);
    } finally {
      setSavingOrderId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Navigation Tabs Header */}
      <div className="flex items-center justify-between border-b border-amber-500/15 pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'branding'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60 border border-transparent'
            }`}
          >
            <Palette className="w-4 h-4 text-amber-400" />
            <span>Branding & Layout</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wallpapers')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'wallpapers'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60 border border-transparent'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-amber-400" />
            <span>Wallpapers & Background</span>
            {wallpapers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-300 font-mono">
                {wallpapers.length}
              </span>
            )}
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-neutral-400">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Interactive Customizer</span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: BRANDING & VISUAL LAYOUT                                      */}
      {/* ==================================================================== */}
      {activeTab === 'branding' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Configuration Form & Logo Upload */}
          <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
                <Palette className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                  Branding Specifications
                </h2>
              </div>

              {brandingSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{brandingSuccess}</span>
                </div>
              )}

              {brandingError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{brandingError}</span>
                </div>
              )}

              <form onSubmit={handleSaveBranding} className="space-y-4">
                {/* Line 1: Experience Title */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1">
                    Line 1: Experience Title
                  </label>
                  <input
                    type="text"
                    value={experienceTitle}
                    onChange={(e) => setExperienceTitle(e.target.value)}
                    placeholder="DIWALI FUN PLAY"
                    className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-100 text-xs transition-colors outline-none font-bold"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    Displays at the top of the 3-line branding block across kiosk and mobile
                  </span>
                </div>

                {/* Line 2: Connector Text */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1">
                    Line 2: Connector Text
                  </label>
                  <input
                    type="text"
                    value={connectorText}
                    onChange={(e) => setConnectorText(e.target.value)}
                    placeholder="by"
                    className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-200 text-xs italic font-serif transition-colors outline-none"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    Connecting line between experience title and company name/logo (e.g. "by", "presented by")
                  </span>
                </div>

                {/* Line 3: Brand Name / Company */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1">
                    Line 3: Sponsor / Company Name
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="ItsSpotlight"
                    className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-100 text-xs transition-colors outline-none"
                    required
                  />
                </div>

                {/* Direct File Upload for Brand Logo */}
                <div className="pt-2 pb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                    Upload Brand Logo (PNG, SVG, WebP, max 5MB)
                  </label>
                  <input
                    type="file"
                    ref={logoInputRef}
                    onChange={handleLogoUpload}
                    accept="image/png,image/svg+xml,image/webp,image/jpeg"
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="flex-1 py-2.5 px-4 rounded-xl border border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/10 text-amber-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4 text-amber-400" />
                      <span>{isUploadingLogo ? 'Uploading to Storage...' : 'Upload Brand Logo File'}</span>
                    </button>
                    {brandLogoUrl && (
                      <button
                        type="button"
                        onClick={() => setBrandLogoUrl('')}
                        className="py-2.5 px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-400 hover:text-neutral-200 text-xs cursor-pointer"
                        title="Clear custom logo"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Dynamic Logo URL */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Active Logo URI / URL
                  </label>
                  <input
                    type="text"
                    value={brandLogoUrl}
                    onChange={(e) => setBrandLogoUrl(e.target.value)}
                    placeholder="https://... or /api/assets/..."
                    className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-300 text-xs transition-colors outline-none font-mono"
                  />
                </div>

                {/* Logo Dimension Controls */}
                <div className="pt-2 p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      Logo Dimensions
                    </span>
                    <button
                      type="button"
                      onClick={handleResetSize}
                      className="text-[11px] text-amber-400/80 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Size
                    </button>
                  </div>

                  {/* Width control */}
                  <div>
                    <div className="flex justify-between text-[11px] text-neutral-400 mb-1 font-mono">
                      <span>Width</span>
                      <span className="text-amber-300">{logoWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={360}
                      value={logoWidth}
                      onChange={(e) => setLogoWidth(Number(e.target.value))}
                      className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Height control */}
                  <div>
                    <div className="flex justify-between text-[11px] text-neutral-400 mb-1 font-mono">
                      <span>Height</span>
                      <span className="text-amber-300">{logoHeight}px</span>
                    </div>
                    <input
                      type="range"
                      min={24}
                      max={120}
                      value={logoHeight}
                      onChange={(e) => setLogoHeight(Number(e.target.value))}
                      className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingBranding || currentUserRole !== 'superadmin'}
                    className="w-full py-3 px-4 rounded-xl font-semibold text-xs tracking-wide bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-neutral-950 shadow-[0_4px_20px_rgba(245,158,11,0.25)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingBranding ? 'Saving to Database...' : 'Save Branding Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right: Interactive Live Preview Panel */}
          <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                    Live Player-Facing Preview
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetPosition}
                    className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-400 text-neutral-300 hover:text-amber-200 text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                    title="Reset logo to center"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Position
                  </button>
                </div>
              </div>

              {/* Instructions banner */}
              <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-amber-400" />
                  <span>Click and drag the logo inside the box to reposition.</span>
                </span>
                <span className="font-mono text-[10px] text-neutral-400">
                  Offset: X:{logoPosition.x > 0 ? `+${logoPosition.x}` : logoPosition.x}px Y:{logoPosition.y > 0 ? `+${logoPosition.y}` : logoPosition.y}px
                </span>
              </div>

              {/* Kiosk Display Mockup Frame with Interactive Repositioning */}
              <div className="rounded-2xl bg-[#090612] border border-amber-500/30 p-8 shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[300px]">
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-red-600/5 pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center select-none w-full">
                  {/* LINE 1 */}
                  <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-amber-100 font-['Cinzel',serif] drop-shadow-[0_2px_14px_rgba(245,158,11,0.35)]">
                    {experienceTitle || 'DIWALI FUN PLAY'}
                  </h1>

                  {/* LINE 2 */}
                  {connectorText ? (
                    <span className="text-amber-300/80 font-serif italic text-sm tracking-widest my-1.5 lowercase">
                      {connectorText}
                    </span>
                  ) : (
                    <div className="h-2" />
                  )}

                  {/* LINE 3: DRAGGABLE LOGO */}
                  <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className={`mt-1.5 p-2 rounded-xl border transition-all select-none touch-none cursor-grab active:cursor-grabbing ${
                      isDraggingLogo
                        ? 'border-amber-400 ring-2 ring-amber-400/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                        : 'border-dashed border-amber-500/40 hover:border-amber-400 hover:bg-white/5'
                    }`}
                    title="Click and drag to reposition logo"
                  >
                    <BrandLogo
                      brandLogoUrl={brandLogoUrl || null}
                      brandName={brandName}
                      width={logoWidth}
                      height={logoHeight}
                      position={logoPosition}
                      size="kiosk"
                    />
                  </div>
                </div>
              </div>

              {/* Uploaded Brand Logos Library */}
              {uploadedLogos.length > 0 && (
                <div className="mt-6 pt-4 border-t border-neutral-800">
                  <h4 className="text-xs font-bold text-neutral-300 mb-2 uppercase tracking-wider">
                    Stored Brand Logos ({uploadedLogos.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {uploadedLogos.map((logo) => {
                      const isSelected = brandLogoUrl === logo.url;
                      return (
                        <div
                          key={logo.id}
                          onClick={() => handleSelectExistingLogo(logo)}
                          className={`p-2 rounded-xl border flex flex-col items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-400'
                              : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                          }`}
                        >
                          <div className="h-10 w-full flex items-center justify-center overflow-hidden">
                            <img
                              src={logo.url}
                              alt={logo.displayName || 'Logo'}
                              className="max-h-8 max-w-full object-contain"
                            />
                          </div>
                          <div className="w-full flex items-center justify-between mt-1 text-[10px] text-neutral-400">
                            <span className="truncate max-w-[60px]">{logo.displayName || 'Logo'}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLogo(logo);
                              }}
                              className="text-neutral-500 hover:text-red-400"
                              title="Delete logo"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="text-[11px] text-neutral-500 text-center mt-4">
              Saved dimensions and position automatically apply across Kiosk and Mobile displays.
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: WALLPAPERS & ROTATION                                         */}
      {/* ==================================================================== */}
      {activeTab === 'wallpapers' && (
        <div className="space-y-6">


          {/* Feedback messages */}
          {wallpaperSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{wallpaperSuccess}</span>
            </div>
          )}

          {wallpaperError && (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{wallpaperError}</span>
            </div>
          )}

          {/* Gameplay Wallpaper Mode Toggle Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#14101F]/80 border border-amber-500/20 shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-neutral-800">
              <div className="flex items-start sm:items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 transition-colors ${
                    wallpaperEnabled
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  }`}
                >
                  {wallpaperEnabled ? <ImageIcon className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-neutral-100 font-['Cinzel',serif] tracking-wide">
                      Gameplay Wallpaper
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider border ${
                        wallpaperEnabled
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {wallpaperEnabled ? 'ACTIVE: UPLOADED WALLPAPER' : 'ACTIVE: LIVE CAMERA FEED'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300/90 mt-1 max-w-2xl leading-relaxed">
                    Choose what players see behind the arcade gameplay screen. When enabled, your uploaded festive
                    wallpaper is shown. When disabled, the player's live webcam video feed becomes the backdrop (AR mode).
                  </p>
                </div>
              </div>

              {/* Two State Toggle Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-neutral-950/80 p-1.5 rounded-xl border border-neutral-800 shrink-0">
                <button
                  type="button"
                  disabled={isSavingToggle || currentUserRole !== 'superadmin'}
                  onClick={() => handleToggleWallpaperEnabled(true)}
                  className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    wallpaperEnabled
                      ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-neutral-950 font-bold shadow-[0_2px_12px_rgba(245,158,11,0.3)]'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>ON — Use Uploaded Wallpaper</span>
                </button>

                <button
                  type="button"
                  disabled={isSavingToggle || currentUserRole !== 'superadmin'}
                  onClick={() => handleToggleWallpaperEnabled(false)}
                  className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    !wallpaperEnabled
                      ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 text-neutral-950 font-bold shadow-[0_2px_12px_rgba(16,185,129,0.3)]'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Video className="w-4 h-4 shrink-0" />
                  <span>OFF — Use Live Camera Background</span>
                </button>
              </div>
            </div>

            {/* Mode Explanation & Status Preview */}
            <div className="pt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div
                className={`p-3 rounded-xl border transition-all ${
                  wallpaperEnabled
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-neutral-950/40 border-neutral-800 text-neutral-400'
                }`}
              >
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${wallpaperEnabled ? 'bg-amber-400' : 'bg-neutral-600'}`} />
                  ON — Uploaded Wallpaper Mode
                </div>
                <p className="text-[10.5px] leading-relaxed text-neutral-400">
                  Renders the active festive wallpaper or playlist image behind the game. Bombs, launch mortars, hand fire flames, and HUD float on top.
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border transition-all ${
                  !wallpaperEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-neutral-950/40 border-neutral-800 text-neutral-400'
                }`}
              >
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${!wallpaperEnabled ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                  OFF — Live Camera Background Mode
                </div>
                <p className="text-[10.5px] leading-relaxed text-neutral-400">
                  Renders the mirrored live webcam feed continuously behind the game. Players interact with bombs in augmented reality with zero extra stream overhead.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Wallpaper & Opacity Slider */}
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
                      onClick={handleClearActiveWallpaper}
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
                      style={{ opacity: wallpaperOpacity / 100 }}
                      className="w-full h-full object-cover transition-opacity duration-200"
                    />
                  ) : (
                    <div className="text-center p-6 flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
                        <Sparkles className="w-6 h-6 text-amber-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-neutral-200 mb-1">
                        Procedural Festive Background
                      </h4>
                      <p className="text-[11px] text-neutral-400 max-w-sm">
                        Interactive dark background with gold sparkle particles, diya lamp glow, and motion bursts.
                      </p>
                    </div>
                  )}
                </div>

                {/* Wallpaper Opacity Control */}
                <div className="mt-5 p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      Wallpaper Background Opacity
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-300">
                      {wallpaperOpacity}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={wallpaperOpacity}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setWallpaperOpacity(val);
                    }}
                    onMouseUp={() => handleSaveOpacity(wallpaperOpacity)}
                    onTouchEnd={() => handleSaveOpacity(wallpaperOpacity)}
                    className="w-full accent-amber-500 h-2 bg-neutral-800 rounded-lg cursor-pointer"
                  />

                  <div className="flex items-center justify-between text-[10px] text-neutral-500">
                    <span>0% (Transparent)</span>
                    <span>50%</span>
                    <span>100% (Solid)</span>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">
                      Applied strictly to background only. Fireworks, UI, and camera trails remain 100% opaque.
                    </span>
                    <button
                      type="button"
                      disabled={isSavingOpacity}
                      onClick={() => handleSaveOpacity(wallpaperOpacity)}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-[10px] font-semibold cursor-pointer transition-colors"
                    >
                      {isSavingOpacity ? 'Saving...' : 'Save Opacity'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-neutral-500">
                The active wallpaper appears first on initial kiosk launch.
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
                  ref={wallpaperFileInputRef}
                  onChange={handleWallpaperFileChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={isUploadingWallpaper}
                  onClick={() => wallpaperFileInputRef.current?.click()}
                  className="w-full py-4 px-4 rounded-xl border-2 border-dashed border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/5 text-amber-200 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-6 h-6 text-amber-400" />
                  <span>{isUploadingWallpaper ? 'Validating and Uploading...' : 'Click to Select & Upload Wallpaper File'}</span>
                  <span className="text-[10px] text-neutral-500">Files are checked for valid image headers</span>
                </button>
              </div>

              <div className="mt-4 text-[11px] text-neutral-500 text-center">
                Uploaded wallpapers automatically join the rotation sequence below.
              </div>
            </div>
          </div>

          {/* Uploaded Wallpaper Library with Rotation Sequence Management */}
          <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-bold text-neutral-100 font-['Cinzel',serif] tracking-wide">
                  Persistent Wallpaper Library & Rotation Sequence ({wallpapers.length})
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Active wallpaper plays first. Games advance to the next wallpaper in ascending order (1, 2, 3...) between completed sessions.
                </p>
              </div>

              <button
                type="button"
                onClick={loadWallpapers}
                className="p-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-amber-400 text-neutral-300 hover:text-amber-200 cursor-pointer transition-colors"
                title="Refresh wallpapers"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingWallpapers ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>

            {wallpapers.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-xs">
                No custom wallpapers uploaded yet. Upload an image above to populate the library.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {wallpapers.map((asset, index) => {
                  const isActive = currentWallpaperUrl === asset.url;
                  const currentOrder = typeof asset.order === 'number' && !isNaN(asset.order) ? asset.order : index + 1;

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

                        {/* Numeric Sequence / Order Input */}
                        <div className="mt-3 pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                          <label className="text-[10px] font-mono text-neutral-400">
                            Sequence #:
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              max={999}
                              defaultValue={currentOrder}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val !== asset.order) {
                                  handleUpdateWallpaperOrder(asset.id, val);
                                }
                              }}
                              className="w-14 px-1.5 py-0.5 bg-neutral-950 border border-neutral-700 focus:border-amber-400 rounded text-amber-200 text-xs font-mono text-center outline-none"
                            />
                            {savingOrderId === asset.id && (
                              <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                            )}
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center justify-between gap-2">
                          {isActive ? (
                            <span className="text-[11px] text-amber-300 font-semibold">
                              Currently Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetActiveWallpaper(asset)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-medium cursor-pointer transition-colors"
                            >
                              Set as Active
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteWallpaper(asset)}
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
      )}
    </div>
  );
};
