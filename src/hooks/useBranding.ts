/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { gameApi } from '../services/api';
import { GameplayInteractionMode, GameAudioSettings, AchievementTier, BrandingDisplayMode } from '../types/backend';
import { DEFAULT_AUDIO_SETTINGS } from '../utils/audioDefaults';

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
  brandingDisplayMode: BrandingDisplayMode;
  wallpaperUrl: string;
  wallpaperOpacity: number;
  wallpaperEnabled: boolean;
  gameplayMode: GameplayInteractionMode;
  targetScoreEnabled: boolean;
  targetScore: number;
  gameDurationSeconds: number;
  audioSettings: GameAudioSettings;
  achievementTiers?: AchievementTier[];
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
  brandingDisplayMode: BrandingDisplayMode;
  wallpaperUrl: string;
  wallpaperOpacity: number;
  wallpaperEnabled: boolean;
  gameplayMode: GameplayInteractionMode;
  targetScoreEnabled: boolean;
  targetScore: number;
  gameDurationSeconds: number;
  audioSettings: GameAudioSettings;
  achievementTiers?: AchievementTier[];
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
  brandingDisplayMode: 'both',
  wallpaperUrl: '',
  wallpaperOpacity: 100,
  wallpaperEnabled: true,
  gameplayMode: 'camera',
  targetScoreEnabled: false,
  targetScore: 5000,
  gameDurationSeconds: 35,
  audioSettings: DEFAULT_AUDIO_SETTINGS,
  wallpaperPlaylist: [],
  currentWallpaperUrl: '',
  rotationIndex: 0,
  isLoading: true
};

const listeners = new Set<() => void>();

// Polling pause control: the kiosk pauses background branding refreshes during
// countdown/gameplay so no network work or re-renders happen mid-round.
let pollingPaused = false;
const resumeListeners = new Set<() => void>();

/**
 * Pauses or resumes the 8s background branding refresh (and focus/visibility refreshes).
 * Resuming triggers an immediate refresh to catch up on admin changes made mid-round.
 */
export function setBrandingPollingPaused(paused: boolean): void {
  if (pollingPaused === paused) return;
  pollingPaused = paused;
  if (!paused) {
    resumeListeners.forEach((cb) => cb());
  }
}

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
        const newBrandingDisplayMode = (s.brandingDisplayMode === 'name' || s.brandingDisplayMode === 'logo'
          ? s.brandingDisplayMode
          : 'both') as BrandingDisplayMode;
        const newWallpaperUrl = s.wallpaperUrl || '';
        const newOpacity = typeof s.wallpaperOpacity === 'number' ? s.wallpaperOpacity : 100;
        const newWallpaperEnabled = s.wallpaperEnabled !== false;
        const newGameplayMode = (s.gameplayMode === 'touch' ? 'touch' : 'camera') as GameplayInteractionMode;
        const newTargetScoreEnabled = Boolean(s.targetScoreEnabled);
        const newTargetScore = typeof s.targetScore === 'number' && s.targetScore > 0 ? s.targetScore : 5000;
        const newGameDuration = typeof s.gameDurationSeconds === 'number' && s.gameDurationSeconds > 0
          ? s.gameDurationSeconds
          : 35;
        const newPlaylist = res.wallpaperPlaylist || [];

        const activeChanged = newWallpaperUrl !== cachedBranding.wallpaperUrl;

        cachedBranding.brandName = newBrandName;
        cachedBranding.brandLogoUrl = newBrandLogoUrl;
        cachedBranding.experienceTitle = newTitle;
        cachedBranding.connectorText = newConnector;
        cachedBranding.logoWidth = newWidth;
        cachedBranding.logoHeight = newHeight;
        cachedBranding.logoPosition = newPos;
        cachedBranding.brandingDisplayMode = newBrandingDisplayMode;
        cachedBranding.wallpaperUrl = newWallpaperUrl;
        cachedBranding.wallpaperOpacity = newOpacity;
        cachedBranding.wallpaperEnabled = newWallpaperEnabled;
        cachedBranding.gameplayMode = newGameplayMode;
        cachedBranding.targetScoreEnabled = newTargetScoreEnabled;
        cachedBranding.targetScore = newTargetScore;
        cachedBranding.gameDurationSeconds = newGameDuration;
        if (s.audioSettings) {
          cachedBranding.audioSettings = s.audioSettings;
        }
        if (s.achievementTiers) {
          cachedBranding.achievementTiers = s.achievementTiers;
        }
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
    const pollIfActive = () => {
      if (!pollingPaused) fetchBranding();
    };
    const interval = setInterval(pollIfActive, 8000);
    const handleSync = pollIfActive;
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    resumeListeners.add(fetchBranding);

    return () => {
      resumeListeners.delete(fetchBranding);
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
      brandingDisplayMode: cachedBranding.brandingDisplayMode || 'both',
      wallpaperUrl: cachedBranding.wallpaperUrl,
      wallpaperOpacity: cachedBranding.wallpaperOpacity,
      wallpaperEnabled: cachedBranding.wallpaperEnabled !== false,
      gameplayMode: cachedBranding.gameplayMode || 'camera',
      targetScoreEnabled: cachedBranding.targetScoreEnabled,
      targetScore: cachedBranding.targetScore,
      gameDurationSeconds: cachedBranding.gameDurationSeconds || 35,
      audioSettings: cachedBranding.audioSettings,
      achievementTiers: cachedBranding.achievementTiers,
      wallpaperPlaylist: cachedBranding.wallpaperPlaylist,
      currentWallpaperUrl: cachedBranding.currentWallpaperUrl || cachedBranding.wallpaperUrl,
      advanceWallpaper: advanceRotation,
      isLoading: cachedBranding.isLoading
    }),
    [tick]
  );
}
