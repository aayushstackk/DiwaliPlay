/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SystemSettings, AdminRole, AssetRecord, BrandingDisplayMode, StorageProviderType } from '../../types/backend';
import { adminApi } from '../../services/api';
import { BrandLogo } from '../../components/BrandLogo';
import { useAdminTheme } from '../AdminThemeContext';
import { resolveAssetUrl } from '../../utils/assetUrl';
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
  RefreshCw,
  X,
  AlertTriangle
} from 'lucide-react';

interface ToastNotification {
  id: string;
  type: 'success' | 'error';
  title: string;
  message: string;
}

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
  const { isLight } = useAdminTheme();

  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_2px_8px_rgba(73,52,38,0.05)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 text-slate-100 shadow-sm';
  const cardSubBg = isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/90 border-slate-800';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';
  const secondaryText = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const inputBg = isLight
    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] placeholder-[#806B58]/60 focus:border-[#B36D4E]'
    : 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-400';

  const [activeTab, setActiveTab] = useState<'branding' | 'wallpapers'>(initialTab);

  // Sync activeTab when initialTab prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // --------------------------------------------------------------------------
  // Prominent Modern Toast Notification State
  // --------------------------------------------------------------------------
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: 'success' | 'error', title: string, message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const id = Date.now().toString();
    setToast({ id, type, title, message });

    // Auto dismiss after 3.5 seconds
    toastTimeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3500);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // Custom In-App Modal for Deletion Confirmation (No browser alert/confirm)
  // --------------------------------------------------------------------------
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'logo' | 'wallpaper';
    asset: AssetRecord;
  } | null>(null);
  const [isDeletingAsset, setIsDeletingAsset] = useState(false);

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
  const [brandingDisplayMode, setBrandingDisplayMode] = useState<BrandingDisplayMode>(
    settings?.brandingDisplayMode || 'both'
  );

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
  const [storageProvider, setStorageProvider] = useState<StorageProviderType>('local');
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
      setBrandingDisplayMode(settings.brandingDisplayMode || 'both');
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
  // Delete Confirmation Handler (Executed after user confirms via custom modal)
  // --------------------------------------------------------------------------
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    const { type, asset } = itemToDelete;
    setIsDeletingAsset(true);
    try {
      const res = await adminApi.deleteAsset(asset.id);
      if (res.success) {
        if (type === 'logo') {
          if (brandLogoUrl === asset.url) {
            setBrandLogoUrl('');
          }
          await loadUploadedLogos();
          const msg = `Brand logo "${asset.displayName || asset.originalFilename}" was deleted from storage.`;
          setBrandingSuccess(msg);
          showToast('success', 'Brand Logo Deleted Successfully', msg);
        } else {
          await loadWallpapers();
          const msg = `Wallpaper "${asset.displayName || asset.originalFilename}" was deleted safely.`;
          setWallpaperSuccess(msg);
          showToast('success', 'Wallpaper Deleted Successfully', msg);
        }
        setItemToDelete(null);
      } else {
        const errorMsg = res.message || 'Asset could not be deleted.';
        if (type === 'logo') {
          setBrandingError(errorMsg);
          showToast('error', 'Failed to Delete Brand Logo', errorMsg);
        } else {
          setWallpaperError(errorMsg);
          showToast('error', 'Failed to Delete Wallpaper', errorMsg);
        }
      }
    } catch (err: any) {
      const errorMsg = err.data?.message || err.message || 'Failed to delete asset.';
      if (type === 'logo') {
        setBrandingError(errorMsg);
        showToast('error', 'Failed to Delete Brand Logo', errorMsg);
      } else {
        setWallpaperError(errorMsg);
        showToast('error', 'Failed to Delete Wallpaper', errorMsg);
      }
    } finally {
      setIsDeletingAsset(false);
    }
  };

  // --------------------------------------------------------------------------
  // Branding Handlers
  // --------------------------------------------------------------------------
  const handleSaveBranding = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBrandingSuccess(null);
    setBrandingError(null);

    if (currentUserRole !== 'superadmin') {
      const msg = 'Superadmin permissions are required to update branding configuration.';
      setBrandingError(msg);
      showToast('error', 'Permission Denied', msg);
      return;
    }

    setIsSavingBranding(true);
    try {
      const res = await adminApi.updateSettings({
        experienceTitle: experienceTitle.trim() || 'DIWALI FUN PLAY',
        connectorText: connectorText.trim(),
        brandName: brandName.trim() || 'ItsSpotlight',
        brandLogoUrl: brandLogoUrl.trim(),
        brandingDisplayMode,
        logoWidth: Number(logoWidth) || 160,
        logoHeight: Number(logoHeight) || 48,
        logoPosition: {
          x: Math.round(logoPosition.x) || 0,
          y: Math.round(logoPosition.y) || 0
        }
      });
      setIsSavingBranding(false);
      const msg = 'Branding changes saved! Kiosk & mobile update immediately.';
      setBrandingSuccess(msg);
      showToast('success', 'Brand Logo & Layout Updated Successfully', msg);
      onSettingsUpdated(res.settings);
    } catch (err: any) {
      setIsSavingBranding(false);
      const msg = err.data?.message || err.message || 'Failed to update branding settings.';
      setBrandingError(msg);
      showToast('error', 'Failed to Update Branding', msg);
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
        const msg = `Brand logo "${file.name}" uploaded and set as active.`;
        setBrandingSuccess(msg);
        showToast('success', 'Brand Logo Added Successfully', msg);
        await loadUploadedLogos();
      } else {
        const msg = res.message || 'Failed to upload brand logo.';
        setBrandingError(msg);
        showToast('error', 'Brand Logo Upload Failed', msg);
      }
    } catch (err: any) {
      const msg = err.data?.message || err.message || 'Logo upload failed.';
      setBrandingError(msg);
      showToast('error', 'Brand Logo Upload Failed', msg);
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
        brandLogoUrl: asset.url,
        brandingDisplayMode
      });
      if (res.success) {
        onSettingsUpdated(res.settings);
        const msg = `Active brand logo changed to "${asset.displayName || asset.originalFilename}".`;
        setBrandingSuccess(msg);
        showToast('success', 'Brand Logo Replaced Successfully', msg);
      }
    } catch (err: any) {
      const msg = err.data?.message || err.message || 'Failed to set active logo.';
      setBrandingError(msg);
      showToast('error', 'Failed to Replace Brand Logo', msg);
    }
  };

  const handleClearActiveLogo = async () => {
    setBrandLogoUrl('');
    try {
      const res = await adminApi.updateSettings({
        brandLogoUrl: ''
      });
      if (res.success && res.settings) {
        onSettingsUpdated(res.settings);
        const msg = 'Active brand logo cleared. Displaying text branding.';
        setBrandingSuccess(msg);
        showToast('success', 'Brand Logo Cleared Successfully', msg);
      }
    } catch (err: any) {
      const msg = err.data?.message || err.message || 'Failed to clear active logo.';
      setBrandingError(msg);
      showToast('error', 'Failed to Clear Brand Logo', msg);
    }
  };

  const handleDeleteLogo = (asset: AssetRecord) => {
    // Open modern custom in-app confirmation modal (no native browser confirm)
    setItemToDelete({ type: 'logo', asset });
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
        const msg = `Wallpaper background opacity set to ${opacityVal}%.`;
        setWallpaperSuccess(msg);
        showToast('success', 'Wallpaper Opacity Updated Successfully', msg);
      }
    } catch (err: any) {
      const msg = err.data?.message || err.message || 'Failed to update wallpaper opacity.';
      setWallpaperError(msg);
      showToast('error', 'Failed to Update Wallpaper Opacity', msg);
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
        const msg = `Wallpaper "${res.asset.displayName || file.name}" uploaded successfully!`;
        setWallpaperSuccess(msg);
        showToast('success', 'Wallpaper Uploaded Successfully', msg);
        await loadWallpapers();
      } else {
        const msg = res.message || 'Failed to upload wallpaper.';
        setWallpaperError(msg);
        showToast('error', 'Wallpaper Upload Failed', msg);
      }
    } catch (err: any) {
      const msg = err.data?.message || err.message || 'Upload failed.';
      setWallpaperError(msg);
      showToast('error', 'Wallpaper Upload Failed', msg);
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
        const msg = `Active wallpaper updated to "${asset.displayName || asset.originalFilename}". It will appear first in rotation.`;
        setWallpaperSuccess(msg);
        showToast('success', 'Wallpaper Replaced Successfully', msg);
        onSettingsUpdated(res.settings);
      }
    } catch (err: any) {
      const msg = err.data?.message || err.message || 'Failed to set active wallpaper.';
      setWallpaperError(msg);
      showToast('error', 'Failed to Replace Wallpaper', msg);
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
        const msg = 'Reset to procedural festive default background.';
        setWallpaperSuccess(msg);
        showToast('success', 'Wallpaper Reset Successfully', msg);
        onSettingsUpdated(res.settings);
      }
    } catch (err: any) {
      const msg = err.data?.message || err.message || 'Failed to clear active wallpaper.';
      setWallpaperError(msg);
      showToast('error', 'Failed to Reset Wallpaper', msg);
    }
  };

  const handleToggleWallpaperEnabled = async (enabled: boolean) => {
    if (currentUserRole !== 'superadmin') {
      const msg = 'Superadmin permissions are required to change gameplay wallpaper configuration.';
      setWallpaperError(msg);
      showToast('error', 'Permission Denied', msg);
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
      const msg = enabled
        ? 'Gameplay Wallpaper set to ON — Using Uploaded Wallpaper during active gameplay.'
        : 'Gameplay Wallpaper set to OFF — Using Live Camera Background during active gameplay.';
      setWallpaperSuccess(msg);
      showToast('success', 'Wallpaper Mode Updated Successfully', msg);
      if (res.success && res.settings) {
        onSettingsUpdated(res.settings);
      }
    } catch (err: any) {
      setIsSavingToggle(false);
      const msg = err.data?.message || err.message || 'Failed to update wallpaper setting.';
      setWallpaperError(msg);
      showToast('error', 'Failed to Update Wallpaper Mode', msg);
    }
  };

  const handleDeleteWallpaper = (asset: AssetRecord) => {
    // Open modern custom in-app confirmation modal (no native browser confirm)
    setItemToDelete({ type: 'wallpaper', asset });
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
        showToast(
          'success',
          'Wallpaper Rotation Updated Successfully',
          `Wallpaper sequence order updated to #${newOrderValue}.`
        );
      } else {
        showToast('error', 'Failed to Update Wallpaper Order', (res as any).message || 'Failed to update order.');
      }
    } catch (err: any) {
      console.warn('Failed to update wallpaper order:', err);
      showToast('error', 'Failed to Update Wallpaper Order', err.data?.message || err.message || 'Failed to update wallpaper order.');
    } finally {
      setSavingOrderId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Navigation Tabs Header */}
      <div className={`flex items-center justify-between border-b pb-3 ${isLight ? 'border-[#D8C7AE]' : 'border-cyan-500/15'}`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'branding'
                ? isLight
                  ? 'bg-[#76513D] text-[#FDF9F3] border border-[#76513D] shadow-[0_2px_8px_rgba(118,81,61,0.25)]'
                  : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                : isLight
                  ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#FAF4E8] border border-transparent'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
            }`}
          >
            <Palette className={`w-4 h-4 ${activeTab === 'branding' ? (isLight ? 'text-[#FDF9F3]' : 'text-cyan-400') : (isLight ? 'text-[#806B58]' : 'text-cyan-400')}`} />
            <span>Branding & Layout</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wallpapers')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'wallpapers'
                ? isLight
                  ? 'bg-[#76513D] text-[#FDF9F3] border border-[#76513D] shadow-[0_2px_8px_rgba(118,81,61,0.25)]'
                  : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                : isLight
                  ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#FAF4E8] border border-transparent'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
            }`}
          >
            <ImageIcon className={`w-4 h-4 ${activeTab === 'wallpapers' ? (isLight ? 'text-[#FDF9F3]' : 'text-cyan-400') : (isLight ? 'text-[#806B58]' : 'text-cyan-400')}`} />
            <span>Wallpapers & Background</span>
            {wallpapers.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                isLight ? 'bg-[#F1E8D9] text-[#76513D]' : 'bg-cyan-500/30 text-cyan-300'
              }`}>
                {wallpapers.length}
              </span>
            )}
          </button>
        </div>

        <div className={`hidden sm:flex items-center gap-2 text-xs font-mono ${secondaryText}`}>
          <Sparkles className={`w-3.5 h-3.5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
          <span>Interactive Customizer</span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: BRANDING & VISUAL LAYOUT                                      */}
      {/* ==================================================================== */}
      {activeTab === 'branding' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Configuration Form & Logo Upload */}
          <div className={`border rounded-2xl p-5 sm:p-6 flex flex-col justify-between ${cardBg}`}>
            <div>
              <div className={`flex items-center gap-2 mb-4 pb-3 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
                <Palette className={`w-5 h-5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                <h2 className={`text-base font-bold ${primaryText}`}>
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
                <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{brandingError}</span>
                </div>
              )}

              <form onSubmit={handleSaveBranding} className="space-y-4">
                {/* Line 1: Experience Title */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${isLight ? 'text-[#493426]' : 'text-slate-300'}`}>
                    Line 1: Experience Title
                  </label>
                  <input
                    type="text"
                    value={experienceTitle}
                    onChange={(e) => setExperienceTitle(e.target.value)}
                    placeholder="DIWALI FUN PLAY"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs transition-colors outline-none font-bold border ${inputBg}`}
                  />
                  <span className={`text-[10px] mt-1 block ${secondaryText}`}>
                    Displays at the top of the 3-line branding block across kiosk and mobile
                  </span>
                </div>

                {/* Line 2: Connector Text */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${isLight ? 'text-[#493426]' : 'text-slate-300'}`}>
                    Line 2: Connector Text
                  </label>
                  <input
                    type="text"
                    value={connectorText}
                    onChange={(e) => setConnectorText(e.target.value)}
                    placeholder="by"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs italic font-serif transition-colors outline-none border ${inputBg}`}
                  />
                  <span className={`text-[10px] mt-1 block ${secondaryText}`}>
                    Connecting line between experience title and company name/logo (e.g. "by", "presented by")
                  </span>
                </div>

                {/* Line 3: Brand Name / Company */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${isLight ? 'text-[#493426]' : 'text-slate-300'}`}>
                    Line 3: Sponsor / Company Name
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="ItsSpotlight"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs transition-colors outline-none border ${inputBg}`}
                    required
                  />

                  {/* 3-Option Segmented Toggle */}
                  <div className="mt-2.5">
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isLight ? 'text-[#493426]' : 'text-slate-300'}`}>
                      Display Mode
                    </label>
                    <div
                      className={`grid grid-cols-3 p-1 rounded-xl border ${
                        isLight ? 'bg-[#E6D7C1]/50 border-[#D8C7AE]' : 'bg-slate-900/80 border-slate-700'
                      }`}
                      role="radiogroup"
                      aria-label="Branding Display Mode"
                    >
                      {(
                        [
                          { id: 'both', label: 'Name + Logo' },
                          { id: 'name', label: 'Name Only' },
                          { id: 'logo', label: 'Logo Only' }
                        ] as const
                      ).map((option) => {
                        const isSelected = brandingDisplayMode === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => setBrandingDisplayMode(option.id)}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                              isSelected
                                ? isLight
                                  ? 'bg-[#76513D] text-[#FDF9F3] shadow-sm'
                                  : 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 shadow-sm'
                                : isLight
                                ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#FAF4E8]/60'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Direct File Upload for Brand Logo */}
                <div className="pt-2 pb-1">
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isLight ? 'text-[#493426]' : 'text-slate-300'}`}>
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
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50 ${
                        isLight
                          ? 'border-[#D8C7AE] hover:border-[#B36D4E] bg-[#FAF4E8] hover:bg-[#F1E8D9] text-[#76513D]'
                          : 'border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 text-cyan-200'
                      }`}
                    >
                      <Upload className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                      <span>{isUploadingLogo ? 'Uploading to Storage...' : 'Upload Brand Logo File'}</span>
                    </button>
                    {brandLogoUrl && (
                      <button
                        type="button"
                        onClick={handleClearActiveLogo}
                        className={`py-2.5 px-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                          isLight
                            ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58] hover:text-[#493426]'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                        title="Clear custom logo"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Dynamic Logo URL */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${secondaryText}`}>
                    Active Logo URI / URL
                  </label>
                  <input
                    type="text"
                    value={brandLogoUrl}
                    onChange={(e) => setBrandLogoUrl(e.target.value)}
                    placeholder="https://... or /api/assets/..."
                    className={`w-full px-3.5 py-2 rounded-xl text-xs transition-colors outline-none font-mono border ${inputBg}`}
                  />
                </div>

                {/* Logo Dimension Controls */}
                <div className={`pt-2 p-3.5 rounded-xl border space-y-3 ${cardSubBg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold flex items-center gap-1.5 ${primaryText}`}>
                      <Sliders className={`w-3.5 h-3.5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                      Logo Dimensions
                    </span>
                    <button
                      type="button"
                      onClick={handleResetSize}
                      className={`text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                        isLight ? 'text-[#B36D4E] hover:text-[#8F4C30]' : 'text-cyan-400/80 hover:text-cyan-300'
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Size
                    </button>
                  </div>

                  {/* Width control */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span className={secondaryText}>Width</span>
                      <span className={isLight ? 'text-[#76513D] font-bold' : 'text-cyan-300'}>{logoWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={360}
                      value={logoWidth}
                      onChange={(e) => setLogoWidth(Number(e.target.value))}
                      className={`w-full h-1.5 rounded-lg cursor-pointer ${
                        isLight ? 'accent-[#B36D4E] bg-[#F1E8D9]' : 'accent-cyan-400 bg-slate-800'
                      }`}
                    />
                  </div>

                  {/* Height control */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span className={secondaryText}>Height</span>
                      <span className={isLight ? 'text-[#76513D] font-bold' : 'text-cyan-300'}>{logoHeight}px</span>
                    </div>
                    <input
                      type="range"
                      min={24}
                      max={120}
                      value={logoHeight}
                      onChange={(e) => setLogoHeight(Number(e.target.value))}
                      className={`w-full h-1.5 rounded-lg cursor-pointer ${
                        isLight ? 'accent-[#B36D4E] bg-[#F1E8D9]' : 'accent-cyan-400 bg-slate-800'
                      }`}
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingBranding || currentUserRole !== 'superadmin'}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wide transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 ${
                      isLight
                        ? 'bg-[#76513D] hover:bg-[#5D3F2E] text-[#FDF9F3] shadow-[0_2px_10px_rgba(118,81,61,0.25)]'
                        : 'bg-gradient-to-r from-cyan-500 via-cyan-400 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 shadow-[0_4px_20px_rgba(6,182,212,0.25)]'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingBranding ? 'Saving to Database...' : 'Save Branding Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right: Interactive Live Preview Panel */}
          <div className={`border rounded-2xl p-5 sm:p-6 flex flex-col justify-between ${cardBg}`}>
            <div>
              <div className={`flex items-center justify-between mb-4 pb-3 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
                <div className="flex items-center gap-2">
                  <Sparkles className={`w-5 h-5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                  <h2 className={`text-base font-bold ${primaryText}`}>
                    Live Player-Facing Preview
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetPosition}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-colors ${
                      isLight
                        ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:border-[#B36D4E]'
                        : 'bg-slate-900 border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-cyan-200'
                    }`}
                    title="Reset logo to center"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Position
                  </button>
                </div>
              </div>

              {/* Instructions banner */}
              <div className={`mb-3 px-3 py-2 rounded-xl border text-[11px] flex items-center justify-between ${
                isLight ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58]' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-200/90'
              }`}>
                <span className="flex items-center gap-1.5">
                  <Move className={`w-3.5 h-3.5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                  <span>Click and drag the logo inside the box to reposition.</span>
                </span>
                <span className={`font-mono text-[10px] ${secondaryText}`}>
                  Offset: X:{logoPosition.x > 0 ? `+${logoPosition.x}` : logoPosition.x}px Y:{logoPosition.y > 0 ? `+${logoPosition.y}` : logoPosition.y}px
                </span>
              </div>

              {/* Kiosk Display Mockup Frame with Interactive Repositioning */}
              <div className={`rounded-2xl bg-[#090D1A] ${isLight ? 'border border-[#D8C7AE]' : 'border border-cyan-500/30'} p-8 shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[300px]`}>
                <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-rose-600/5 pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center select-none w-full">
                  {/* LINE 1 */}
                  <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-slate-100 drop-shadow-[0_2px_14px_rgba(6,182,212,0.35)]">
                    {experienceTitle || 'DIWALI FUN PLAY'}
                  </h1>

                  {/* LINE 2 */}
                  {connectorText ? (
                    <span className="text-cyan-300/80 font-serif italic text-sm tracking-widest my-1.5 lowercase">
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
                        ? isLight
                          ? 'border-[#B36D4E] ring-2 ring-[#B36D4E]/50 bg-white/10'
                          : 'border-cyan-400 ring-2 ring-cyan-400/50 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                        : isLight
                          ? 'border-dashed border-[#D8C7AE]/60 hover:border-[#B36D4E] hover:bg-white/5'
                          : 'border-dashed border-cyan-500/40 hover:border-cyan-400 hover:bg-white/5'
                    }`}
                    title="Click and drag to reposition logo"
                  >
                    <BrandLogo
                      brandLogoUrl={brandLogoUrl || null}
                      brandName={brandName}
                      width={logoWidth}
                      height={logoHeight}
                      position={logoPosition}
                      displayMode={brandingDisplayMode}
                      size="kiosk"
                    />
                  </div>
                </div>
              </div>

              {/* Uploaded Brand Logos Library */}
              {uploadedLogos.length > 0 && (
                <div className={`mt-6 pt-4 border-t ${isLight ? 'border-[#D8C7AE]' : 'border-neutral-800'}`}>
                  <h4 className={`text-xs font-bold mb-2 uppercase tracking-wider ${primaryText}`}>
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
                              ? isLight
                                ? 'bg-[#FAF4E8] border-[#B36D4E] ring-2 ring-[#B36D4E]/30'
                                : 'bg-cyan-500/15 border-cyan-400'
                              : isLight
                                ? 'bg-[#FAF4E8] border-[#D8C7AE] hover:border-[#B36D4E]'
                                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="h-10 w-full flex items-center justify-center overflow-hidden">
                            <img
                              src={resolveAssetUrl(logo.url)}
                              alt={logo.displayName || 'Logo'}
                              className="max-h-8 max-w-full object-contain"
                            />
                          </div>
                          <div className={`w-full flex items-center justify-between mt-1 text-[10px] ${secondaryText}`}>
                            <span className="truncate max-w-[60px]">{logo.displayName || 'Logo'}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLogo(logo);
                              }}
                              className={`transition-colors ${isLight ? 'text-[#806B58] hover:text-[#A74747]' : 'text-slate-500 hover:text-rose-400'}`}
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

            <div className={`text-[11px] text-center mt-4 ${secondaryText}`}>
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
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{wallpaperError}</span>
            </div>
          )}

          {/* Gameplay Wallpaper Mode Toggle Card */}
          <div className={`p-5 sm:p-6 rounded-2xl border ${cardBg}`}>
            <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
              <div className="flex items-start sm:items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 transition-colors ${
                    isLight
                      ? wallpaperEnabled
                        ? 'bg-[#FAF4E8] border-[#76513D]/30 text-[#76513D]'
                        : 'bg-[#FAF4E8] border-[#58734B]/30 text-[#58734B]'
                      : wallpaperEnabled
                        ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  }`}
                >
                  {wallpaperEnabled ? <ImageIcon className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`text-base font-bold tracking-wide ${primaryText}`}>
                      Gameplay Wallpaper
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider border ${
                        isLight
                          ? wallpaperEnabled
                            ? 'bg-[#B36D4E]/10 text-[#B36D4E] border-[#B36D4E]/30'
                            : 'bg-[#58734B]/10 text-[#58734B] border-[#58734B]/30'
                          : wallpaperEnabled
                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {wallpaperEnabled ? 'ACTIVE: UPLOADED WALLPAPER' : 'ACTIVE: LIVE CAMERA FEED'}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${secondaryText}`}>
                    Choose what players see behind the arcade gameplay screen. When enabled, your uploaded festive
                    wallpaper is shown. When disabled, the player's live webcam video feed becomes the backdrop (AR mode).
                  </p>
                </div>
              </div>

              {/* Two State Toggle Buttons */}
              <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-1.5 rounded-xl border shrink-0 ${cardSubBg}`}>
                <button
                  type="button"
                  disabled={isSavingToggle || currentUserRole !== 'superadmin'}
                  onClick={() => handleToggleWallpaperEnabled(true)}
                  className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    wallpaperEnabled
                      ? isLight
                        ? 'bg-[#76513D] text-[#FDF9F3] font-bold shadow-[0_2px_8px_rgba(118,81,61,0.25)]'
                        : 'bg-gradient-to-r from-cyan-500 via-cyan-400 to-blue-500 text-slate-950 font-bold shadow-[0_2px_12px_rgba(6,182,212,0.3)]'
                      : isLight
                        ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#F1E8D9]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
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
                      ? isLight
                        ? 'bg-[#58734B] text-[#FDF9F3] font-bold shadow-[0_2px_8px_rgba(88,115,75,0.25)]'
                        : 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 text-slate-950 font-bold shadow-[0_2px_12px_rgba(16,185,129,0.3)]'
                      : isLight
                        ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#F1E8D9]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
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
                  isLight
                    ? wallpaperEnabled
                      ? 'bg-[#FAF4E8] border-[#B36D4E]/40 text-[#493426]'
                      : 'bg-[#FAF4E8] border-[#D8C7AE]/60 text-[#806B58]'
                    : wallpaperEnabled
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    isLight
                      ? wallpaperEnabled ? 'bg-[#B36D4E]' : 'bg-[#806B58]'
                      : wallpaperEnabled ? 'bg-cyan-400' : 'bg-slate-600'
                  }`} />
                  ON — Uploaded Wallpaper Mode
                </div>
                <p className={`text-[10.5px] leading-relaxed ${secondaryText}`}>
                  Renders the active festive wallpaper or playlist image behind the game. Bombs, launch mortars, hand fire flames, and HUD float on top.
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border transition-all ${
                  isLight
                    ? !wallpaperEnabled
                      ? 'bg-[#FAF4E8] border-[#58734B]/40 text-[#493426]'
                      : 'bg-[#FAF4E8] border-[#D8C7AE]/60 text-[#806B58]'
                    : !wallpaperEnabled
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    isLight
                      ? !wallpaperEnabled ? 'bg-[#58734B]' : 'bg-[#806B58]'
                      : !wallpaperEnabled ? 'bg-emerald-400' : 'bg-slate-600'
                  }`} />
                  OFF — Live Camera Background Mode
                </div>
                <p className={`text-[10.5px] leading-relaxed ${secondaryText}`}>
                  Renders the mirrored live webcam feed continuously behind the game. Players interact with bombs in augmented reality with zero extra stream overhead.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Wallpaper & Opacity Slider */}
            <div className={`border rounded-2xl p-5 sm:p-6 flex flex-col justify-between ${cardBg}`}>
              <div>
                <div className={`flex items-center justify-between mb-4 pb-3 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
                  <div className="flex items-center gap-2">
                    <ImageIcon className={`w-5 h-5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                    <h2 className={`text-base font-bold ${primaryText}`}>
                      Active Kiosk Wallpaper
                    </h2>
                  </div>
                  {currentWallpaperUrl && (
                    <button
                      type="button"
                      onClick={handleClearActiveWallpaper}
                      className={`text-[11px] transition-colors cursor-pointer ${
                        isLight ? 'text-[#B36D4E] hover:text-[#8F4C30]' : 'text-slate-400 hover:text-cyan-300'
                      }`}
                    >
                      Reset to Default
                    </button>
                  )}
                </div>

                {/* Visual Preview */}
                <div className={`rounded-xl border overflow-hidden relative aspect-video flex items-center justify-center shadow-inner ${
                  isLight ? 'border-[#D8C7AE] bg-[#090D1A]' : 'border-slate-800 bg-slate-950/80'
                }`}>
                  {currentWallpaperUrl ? (
                    <img
                      src={resolveAssetUrl(currentWallpaperUrl)}
                      alt="Current Kiosk Wallpaper"
                      style={{ opacity: wallpaperOpacity / 100 }}
                      className="w-full h-full object-cover transition-opacity duration-200"
                    />
                  ) : (
                    <div className="text-center p-6 flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 border ${
                        isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-cyan-500/10 border-cyan-500/20'
                      }`}>
                        <Sparkles className={`w-6 h-6 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                      </div>
                      <h4 className={`text-sm font-semibold mb-1 ${primaryText}`}>
                        Procedural Festive Background
                      </h4>
                      <p className={`text-[11px] max-w-sm ${secondaryText}`}>
                        Interactive dark background with sparkle particles, diya lamp glow, and motion bursts.
                      </p>
                    </div>
                  )}
                </div>

                {/* Wallpaper Opacity Control */}
                <div className={`mt-5 p-4 rounded-xl border space-y-2 ${cardSubBg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold flex items-center gap-1.5 ${primaryText}`}>
                      <Sliders className={`w-3.5 h-3.5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                      Wallpaper Background Opacity
                    </span>
                    <span className={`text-xs font-mono font-bold ${isLight ? 'text-[#76513D]' : 'text-cyan-300'}`}>
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
                    className={`w-full h-2 rounded-lg cursor-pointer ${
                      isLight ? 'accent-[#B36D4E] bg-[#F1E8D9]' : 'accent-cyan-400 bg-slate-800'
                    }`}
                  />

                  <div className={`flex items-center justify-between text-[10px] ${secondaryText}`}>
                    <span>0% (Transparent)</span>
                    <span>50%</span>
                    <span>100% (Solid)</span>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <span className={`text-[10px] ${secondaryText}`}>
                      Applied strictly to background only. Fireworks, UI, and camera trails remain 100% opaque.
                    </span>
                    <button
                      type="button"
                      disabled={isSavingOpacity}
                      onClick={() => handleSaveOpacity(wallpaperOpacity)}
                      className={`px-2.5 py-1 rounded text-[10px] font-semibold cursor-pointer transition-colors border ${
                        isLight
                          ? 'bg-[#76513D] hover:bg-[#5D3F2E] text-[#FDF9F3] border-[#76513D]'
                          : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-500/30'
                      }`}
                    >
                      {isSavingOpacity ? 'Saving...' : 'Save Opacity'}
                    </button>
                  </div>
                </div>
              </div>

              <div className={`mt-4 text-[11px] ${secondaryText}`}>
                The active wallpaper appears first on initial kiosk launch.
              </div>
            </div>

            {/* Upload New Wallpaper */}
            <div className={`border rounded-2xl p-5 sm:p-6 flex flex-col justify-between ${cardBg}`}>
              <div>
                <div className={`flex items-center gap-2 mb-4 pb-3 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
                  <Upload className={`w-5 h-5 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                  <h2 className={`text-base font-bold ${primaryText}`}>
                    Upload Kiosk Wallpaper
                  </h2>
                </div>

                <p className={`text-xs leading-relaxed mb-4 ${secondaryText}`}>
                  Upload 1080p or 4K wallpaper images optimized for 65" horizontal displays. Files are validated for magic byte signatures and stored in persistent object storage.
                </p>

                <div className={`p-4 rounded-xl border space-y-2 mb-5 text-[11px] ${cardSubBg}`}>
                  <div className="flex items-center justify-between">
                    <span className={secondaryText}>Allowed Formats:</span>
                    <span className={`font-mono font-semibold ${primaryText}`}>JPEG, PNG, WebP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={secondaryText}>Maximum File Size:</span>
                    <span className={`font-mono font-semibold ${primaryText}`}>15 MB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={secondaryText}>Recommended Aspect:</span>
                    <span className={`font-mono font-semibold ${primaryText}`}>16:9 (1920×1080 or 3840×2160)</span>
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
                  className={`w-full py-4 px-4 rounded-xl border-2 border-dashed text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                    isLight
                      ? 'border-[#D8C7AE] hover:border-[#B36D4E] bg-[#FAF4E8] hover:bg-[#F1E8D9] text-[#76513D]'
                      : 'border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/5 text-cyan-200'
                  }`}
                >
                  <Upload className={`w-6 h-6 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                  <span>{isUploadingWallpaper ? 'Validating and Uploading...' : 'Click to Select & Upload Wallpaper File'}</span>
                  <span className={`text-[10px] ${secondaryText}`}>Files are checked for valid image headers</span>
                </button>
              </div>

              <div className={`mt-4 text-[11px] text-center ${secondaryText}`}>
                Uploaded wallpapers automatically join the rotation sequence below.
              </div>
            </div>
          </div>

          {/* Uploaded Wallpaper Library with Rotation Sequence Management */}
          <div className={`border rounded-2xl p-5 sm:p-6 shadow-xl ${cardBg}`}>
            <div className={`flex items-center justify-between mb-4 pb-3 border-b ${isLight ? 'border-[#D8C7AE]' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-sm font-bold tracking-wide ${primaryText}`}>
                  Persistent Wallpaper Library & Rotation Sequence ({wallpapers.length})
                </h3>
                <p className={`text-[11px] ${secondaryText}`}>
                  Active wallpaper plays first. Games advance to the next wallpaper in ascending order (1, 2, 3...) between completed sessions.
                </p>
              </div>

              <button
                type="button"
                onClick={loadWallpapers}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:border-[#B36D4E]'
                    : 'bg-slate-900 border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-cyan-200'
                }`}
                title="Refresh wallpapers"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingWallpapers ? 'animate-spin text-[#B36D4E]' : ''}`} />
              </button>
            </div>

            {wallpapers.length === 0 ? (
              <div className={`p-8 text-center text-xs ${secondaryText}`}>
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
                      className={`rounded-xl border overflow-hidden flex flex-col justify-between transition-all ${
                        isLight
                          ? isActive
                            ? 'bg-[#FAF4E8] border-[#B36D4E] shadow-[0_0_12px_rgba(179,109,78,0.25)]'
                            : 'bg-[#FAF4E8] border-[#D8C7AE] hover:border-[#B36D4E]'
                          : isActive
                            ? 'bg-slate-900/80 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                            : 'bg-slate-900/80 border-slate-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="aspect-video relative bg-slate-950 overflow-hidden">
                        <img
                          src={resolveAssetUrl(asset.url)}
                          alt={asset.displayName || asset.originalFilename}
                          className="w-full h-full object-cover"
                        />
                        {isActive && (
                          <div className={`absolute top-2 right-2 px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1 shadow ${
                            isLight ? 'bg-[#76513D] text-[#FDF9F3]' : 'bg-cyan-500 text-slate-950'
                          }`}>
                            <Check className="w-3 h-3" />
                            <span>ACTIVE</span>
                          </div>
                        )}
                      </div>

                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className={`text-xs font-semibold truncate ${primaryText}`}>
                            {asset.displayName || asset.originalFilename}
                          </h4>
                          <div className={`text-[10px] mt-1 flex items-center gap-1.5 font-mono ${secondaryText}`}>
                            <span>{(asset.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                            <span>·</span>
                            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {/* Numeric Sequence / Order Input */}
                        <div className={`mt-3 pt-2 border-t flex items-center justify-between gap-2 ${isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800/80'}`}>
                          <label className={`text-[10px] font-mono ${secondaryText}`}>
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
                              className={`w-14 px-1.5 py-0.5 rounded text-xs font-mono text-center outline-none border ${
                                isLight
                                  ? 'bg-[#F1E8D9] border-[#D8C7AE] text-[#493426] focus:border-[#B36D4E]'
                                  : 'bg-slate-950 border-slate-700 focus:border-cyan-400 text-cyan-200'
                              }`}
                            />
                            {savingOrderId === asset.id && (
                              <RefreshCw className={`w-3 h-3 animate-spin ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                            )}
                          </div>
                        </div>

                        <div className={`mt-2 pt-2 border-t flex items-center justify-between gap-2 ${isLight ? 'border-[#D8C7AE]/60' : 'border-slate-800'}`}>
                          {isActive ? (
                            <span className={`text-[11px] font-semibold ${isLight ? 'text-[#58734B]' : 'text-cyan-300'}`}>
                              Currently Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetActiveWallpaper(asset)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors border ${
                                isLight
                                  ? 'bg-[#FAF4E8] hover:bg-[#F1E8D9] text-[#76513D] border-[#D8C7AE] hover:border-[#B36D4E]'
                                  : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-500/40'
                              }`}
                            >
                              Set as Active
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteWallpaper(asset)}
                            disabled={isActive}
                            className={`p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                              isLight ? 'text-[#806B58] hover:text-[#A74747] hover:bg-[#A74747]/10' : 'text-slate-500 hover:text-rose-400 hover:bg-rose-950/30'
                            }`}
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

      {/* ==================================================================== */}
      {/* PROMINENT TOP-CENTER TOAST POPUP NOTIFICATION                        */}
      {/* ==================================================================== */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[99999] pointer-events-auto w-[calc(100%-2rem)] max-w-lg sm:w-auto sm:min-w-[440px] animate-toast-in select-none"
        >
          <div
            className={`rounded-2xl backdrop-blur-2xl border-2 overflow-hidden shadow-2xl transition-all ${
              isLight
                ? toast.type === 'success'
                  ? 'bg-[#FBF5EA] border-[#58734B] text-[#493426] shadow-[0_16px_50px_rgba(88,115,75,0.3)]'
                  : 'bg-[#FBF5EA] border-[#A74747] text-[#493426] shadow-[0_16px_50px_rgba(167,71,71,0.3)]'
                : toast.type === 'success'
                  ? 'bg-[#061710]/95 border-emerald-500 text-emerald-50 shadow-[0_16px_50px_rgba(16,185,129,0.38)]'
                  : 'bg-[#1e070e]/95 border-rose-500 text-rose-50 shadow-[0_16px_50px_rgba(244,63,94,0.38)]'
            }`}
          >
            <div className="p-4 sm:p-5 flex items-start gap-3.5">
              {/* Prominent glowing icon */}
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                  isLight
                    ? toast.type === 'success'
                      ? 'bg-[#58734B]/15 border-[#58734B]/30 text-[#58734B]'
                      : 'bg-[#A74747]/15 border-[#A74747]/30 text-[#A74747]'
                    : toast.type === 'success'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                      : 'bg-rose-500/20 border-rose-500/40 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
                }`}
              >
                {toast.type === 'success' ? (
                  <CheckCircle2 className="w-6 h-6 stroke-[2.4]" />
                ) : (
                  <AlertCircle className="w-6 h-6 stroke-[2.4]" />
                )}
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase font-mono border ${
                      isLight
                        ? toast.type === 'success'
                          ? 'bg-[#58734B]/15 text-[#58734B] border-[#58734B]/30'
                          : 'bg-[#A74747]/15 text-[#A74747] border-[#A74747]/30'
                        : toast.type === 'success'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {toast.type === 'success' ? 'Success' : 'Error'}
                  </span>
                  <span className={`text-[11px] font-mono ${secondaryText}`}>DiwaliPlay Admin</span>
                </div>
                <h4 className={`text-sm sm:text-base font-bold tracking-wide leading-tight ${primaryText}`}>
                  {toast.title}
                </h4>
                <p className={`text-xs sm:text-[13px] leading-snug mt-1 break-words ${secondaryText}`}>
                  {toast.message}
                </p>
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={dismissToast}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                  isLight ? 'text-[#806B58] hover:text-[#493426] hover:bg-black/5' : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Countdown progress bar (3.5s) */}
            <div className="h-1.5 w-full bg-black/20 overflow-hidden">
              <div
                key={toast.id}
                className={`h-full animate-toast-progress ${
                  toast.type === 'success'
                    ? isLight ? 'bg-[#58734B]' : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : isLight ? 'bg-[#A74747]' : 'bg-gradient-to-r from-rose-500 to-red-400'
                }`}
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CUSTOM ASSET DELETE CONFIRMATION MODAL (NO BROWSER ALERT/CONFIRM)   */}
      {/* ==================================================================== */}
      {itemToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className={`border rounded-2xl p-6 max-w-md w-full relative ${
            isLight
              ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_20px_60px_rgba(73,52,38,0.3)]'
              : 'bg-[#0D1527] border-rose-500/40 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.85)]'
          }`}>
            <div className="flex flex-col items-center text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border ${
                isLight
                  ? 'bg-[#A74747]/10 border-[#A74747]/30 text-[#A74747]'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
              }`}>
                <Trash2 className="w-7 h-7" />
              </div>

              <h3 className={`text-lg font-bold ${primaryText}`}>
                Delete {itemToDelete.type === 'logo' ? 'Brand Logo' : 'Wallpaper'}?
              </h3>

              <p className={`text-xs mt-2 leading-relaxed ${secondaryText}`}>
                Are you sure you want to permanently remove{' '}
                <span className={`font-semibold ${isLight ? 'text-[#A74747]' : 'text-rose-300'}`}>
                  "{itemToDelete.asset.displayName || itemToDelete.asset.originalFilename}"
                </span>{' '}
                from storage? This action cannot be undone.
              </p>

              {/* Asset Preview Thumbnail */}
              <div className={`mt-4 p-2.5 rounded-xl border w-full flex items-center gap-3 ${cardSubBg}`}>
                <div className={`w-14 h-14 rounded-lg border overflow-hidden flex items-center justify-center shrink-0 ${
                  isLight ? 'bg-[#F1E8D9] border-[#D8C7AE]' : 'bg-slate-900 border-slate-800'
                }`}>
                  <img
                    src={resolveAssetUrl(itemToDelete.asset.url)}
                    alt={itemToDelete.asset.displayName || 'Thumbnail'}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className={`text-xs font-semibold truncate ${primaryText}`}>
                    {itemToDelete.asset.displayName || itemToDelete.asset.originalFilename}
                  </div>
                  <div className={`text-[11px] font-mono mt-0.5 ${secondaryText}`}>
                    {(itemToDelete.asset.fileSize / (1024 * 1024)).toFixed(2)} MB · {itemToDelete.type === 'logo' ? 'Brand Logo' : 'Wallpaper'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex items-center gap-3 w-full">
                <button
                  type="button"
                  disabled={isDeletingAsset}
                  onClick={() => setItemToDelete(null)}
                  className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                    isLight
                      ? 'bg-[#FAF4E8] hover:bg-[#F1E8D9] border-[#D8C7AE] text-[#493426]'
                      : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isDeletingAsset}
                  onClick={handleConfirmDelete}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 ${
                    isLight
                      ? 'bg-[#A74747] hover:bg-[#8F3C3C] shadow-[0_2px_10px_rgba(167,71,71,0.25)]'
                      : 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-[0_2px_15px_rgba(244,63,94,0.3)]'
                  }`}
                >
                  {isDeletingAsset ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirm Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
