/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { gameApi } from '../services/api';
import { GameplayInteractionMode } from '../types/backend';

export interface WallpaperPlaylistItem {
  id: string;
  url: string;
  displayName?: string;
  order?: number;
}

export interface BrandingState {
  brandName: string;
  brandLogoUrl: string;
  experienceTitle: string;
  connectorText: string;
  logoWidth: number;
  logoHeight: number;
  logoPosition: { x: number; y: number };
  wallpaperUrl: string;
  wallpaperOpacity: number;
  wallpaperEnabled: boolean;
  gameplayMode: GameplayInteractionMode;
  targetScoreEnabled: boolean;
  targetScore: number;
  wallpaperPlaylist: WallpaperPlaylistItem[];
  currentWallpaperUrl: string;
  advanceWallpaper: () => void;
  isLoading: boolean;
}

interface CachedData {
  brandName: string;
  brandLogoUrl: string;
  experienceTitle: string;
  connectorText: string;
  logoWidth: number;
  logoHeight: number;
  logoPosition: { x: number; y: number };
  wallpaperUrl: string;
  wallpaperOpacity: number;
  wallpaperEnabled: boolean;
  gameplayMode: GameplayInteractionMode;
  targetScoreEnabled: boolean;
  targetScore: number;
  wallpaperPlaylist: WallpaperPlaylistItem[];
  currentWallpaperUrl: string;
  rotationIndex: number;
  isLoading: boolean;
}

// Module-level cache so branding doesn't flash across page navigations
const cachedBranding: CachedData = {
  brandName: 'ItsSpotlight',
  brandLogoUrl: '',
  experienceTitle: 'DIWALI FUN PLAY',
  connectorText: 'by',
  logoWidth: 160,
  logoHeight: 48,
  logoPosition: { x: 0, y: 0 },
  wallpaperUrl: '',
  wallpaperOpacity: 100,
  wallpaperEnabled: true,
  gameplayMode: 'camera',
  targetScoreEnabled: false,
  targetScore: 5000,
  wallpaperPlaylist: [],
  currentWallpaperUrl: '',
  rotationIndex: 0,
  isLoading: true
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/**
 * Builds the rotation list with the active wallpaper strictly first,
 * followed by the remaining wallpapers sorted ascendingly.
 */
function buildRotationPlaylist(
  activeUrl: string,
  playlist: WallpaperPlaylistItem[]
): WallpaperPlaylistItem[] {
  if (playlist.length === 0) {
    if (activeUrl) {
      return [{ id: 'active_single', url: activeUrl, displayName: 'Active Wallpaper', order: 0 }];
    }
    return [];
  }

  // Find active wallpaper if present
  const activeItem = playlist.find((p) => p.url === activeUrl);
  const otherItems = playlist.filter((p) => p.url !== activeUrl);

  if (activeItem) {
    return [activeItem, ...otherItems];
  } else if (activeUrl) {
    return [
      { id: 'active_custom', url: activeUrl, displayName: 'Active Wallpaper', order: 0 },
      ...otherItems
    ];
  }

  return playlist;
}

function advanceRotation() {
  const rotationList = buildRotationPlaylist(
    cachedBranding.wallpaperUrl,
    cachedBranding.wallpaperPlaylist
  );

  if (rotationList.length <= 1) {
    cachedBranding.rotationIndex = 0;
    cachedBranding.currentWallpaperUrl = rotationList[0]?.url || cachedBranding.wallpaperUrl || '';
  } else {
    cachedBranding.rotationIndex = (cachedBranding.rotationIndex + 1) % rotationList.length;
    cachedBranding.currentWallpaperUrl = rotationList[cachedBranding.rotationIndex].url;
  }
  notifyListeners();
}

export function useBranding(): BrandingState {
  const [tick, setTick] = useState(0);

  const fetchBranding = useCallback(async () => {
    try {
      const res = await gameApi.getSettings();
      if (res.success && res.settings) {
        const s = res.settings;
        const newBrandName = s.brandName || 'ItsSpotlight';
        const newBrandLogoUrl = s.brandLogoUrl || '';
        const newTitle = s.experienceTitle || 'DIWALI FUN PLAY';
        const newConnector = s.connectorText !== undefined ? s.connectorText : 'by';
        const newWidth = s.logoWidth || 160;
        const newHeight = s.logoHeight || 48;
        const newPos = s.logoPosition || { x: 0, y: 0 };
        const newWallpaperUrl = s.wallpaperUrl || '';
        const newOpacity = typeof s.wallpaperOpacity === 'number' ? s.wallpaperOpacity : 100;
        const newWallpaperEnabled = s.wallpaperEnabled !== false;
        const newGameplayMode = (s.gameplayMode === 'touch' ? 'touch' : 'camera') as GameplayInteractionMode;
        const newTargetScoreEnabled = Boolean(s.targetScoreEnabled);
        const newTargetScore = typeof s.targetScore === 'number' && s.targetScore > 0 ? s.targetScore : 5000;
        const newPlaylist = res.wallpaperPlaylist || [];

        const activeChanged = newWallpaperUrl !== cachedBranding.wallpaperUrl;

        cachedBranding.brandName = newBrandName;
        cachedBranding.brandLogoUrl = newBrandLogoUrl;
        cachedBranding.experienceTitle = newTitle;
        cachedBranding.connectorText = newConnector;
        cachedBranding.logoWidth = newWidth;
        cachedBranding.logoHeight = newHeight;
        cachedBranding.logoPosition = newPos;
        cachedBranding.wallpaperUrl = newWallpaperUrl;
        cachedBranding.wallpaperOpacity = newOpacity;
        cachedBranding.wallpaperEnabled = newWallpaperEnabled;
        cachedBranding.gameplayMode = newGameplayMode;
        cachedBranding.targetScoreEnabled = newTargetScoreEnabled;
        cachedBranding.targetScore = newTargetScore;
        cachedBranding.wallpaperPlaylist = newPlaylist;
        cachedBranding.isLoading = false;

        // If active wallpaper changed or not set yet, reset to first in rotation
        if (activeChanged || !cachedBranding.currentWallpaperUrl) {
          const rotationList = buildRotationPlaylist(newWallpaperUrl, newPlaylist);
          cachedBranding.rotationIndex = 0;
          cachedBranding.currentWallpaperUrl = rotationList[0]?.url || newWallpaperUrl || '';
        }

        notifyListeners();
      }
    } catch {
      cachedBranding.isLoading = false;
      notifyListeners();
    }
  }, []);

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    listeners.add(handleUpdate);

    fetchBranding();
    const interval = setInterval(fetchBranding, 8000);
    const handleSync = () => fetchBranding();
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);

    return () => {
      listeners.delete(handleUpdate);
      clearInterval(interval);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [fetchBranding]);

  return useMemo(
    () => ({
      brandName: cachedBranding.brandName,
      brandLogoUrl: cachedBranding.brandLogoUrl,
      experienceTitle: cachedBranding.experienceTitle,
      connectorText: cachedBranding.connectorText,
      logoWidth: cachedBranding.logoWidth,
      logoHeight: cachedBranding.logoHeight,
      logoPosition: cachedBranding.logoPosition,
      wallpaperUrl: cachedBranding.wallpaperUrl,
      wallpaperOpacity: cachedBranding.wallpaperOpacity,
      wallpaperEnabled: cachedBranding.wallpaperEnabled !== false,
      gameplayMode: cachedBranding.gameplayMode || 'camera',
      targetScoreEnabled: cachedBranding.targetScoreEnabled,
      targetScore: cachedBranding.targetScore,
      wallpaperPlaylist: cachedBranding.wallpaperPlaylist,
      currentWallpaperUrl: cachedBranding.currentWallpaperUrl || cachedBranding.wallpaperUrl,
      advanceWallpaper: advanceRotation,
      isLoading: cachedBranding.isLoading
    }),
    [tick]
  );
}
