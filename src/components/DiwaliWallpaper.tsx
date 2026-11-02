/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { resolveAssetUrl } from '../utils/assetUrl';

interface DiwaliWallpaperProps {
  wallpaperUrl?: string | null;
  opacity?: number; // 0 to 100
  className?: string;
}

export const DiwaliWallpaper: React.FC<DiwaliWallpaperProps> = ({
  wallpaperUrl,
  opacity = 100,
  className = ''
}) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [wallpaperUrl]);

  const normalizedOpacity =
    typeof opacity === 'number' ? Math.max(0, Math.min(100, opacity)) / 100 : 1;

  const resolvedWallpaperUrl = resolveAssetUrl(wallpaperUrl);

  // If a valid custom wallpaper URL is provided, render it with object-cover
  if (resolvedWallpaperUrl && !imageError) {
    return (
      <div
        className={`fixed inset-0 w-full h-full overflow-hidden pointer-events-none select-none -z-10 transition-opacity duration-300 ${className}`}
        style={{ opacity: normalizedOpacity }}
      >
        <img
          src={resolvedWallpaperUrl}
          alt="Diwali Wallpaper"
          onError={() => setImageError(true)}
          className="absolute inset-0 w-full h-full object-cover object-center select-none"
        />
        {/* Subtle dark vignette overlay for high contrast cracker visibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/60 via-transparent to-neutral-950/40" />
      </div>
    );
  }

  // Built-in Festive Diwali Full-Screen Wallpaper
  // Responsive, aspect-ratio preserving, zero border, zero stretching
  return (
    <div
      className={`fixed inset-0 w-full h-full overflow-hidden pointer-events-none select-none -z-10 bg-[#0A0518] transition-opacity duration-300 ${className}`}
      style={{ opacity: normalizedOpacity }}
      aria-hidden="true"
    >
      {/* Deep Royal Midnight Purple & Dark Indigo Gradient Base */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070312] via-[#0E0620] to-[#15082C]" />

      {/* Atmospheric Ambient Glows */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[70vw] h-[40vh] bg-amber-500/10 rounded-full blur-[140px]" />
      <div className="absolute bottom-0 left-0 right-0 h-[45vh] bg-gradient-to-t from-orange-600/15 via-amber-600/5 to-transparent blur-[80px]" />

      {/* Subtle Starry Night Texture Overlay */}
      <div className="absolute inset-0 opacity-30 mix-blend-screen bg-[radial-gradient(#FDE68A_1px,transparent_1px)] [background-size:32px_32px]" />

      {/* Top Festive Toran / Decorative Garland Accents */}
      <div className="absolute top-0 inset-x-0 h-16 opacity-35 flex justify-around items-start">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="w-[1px] h-6 sm:h-9 bg-gradient-to-b from-amber-400/80 to-amber-500/10" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          </div>
        ))}
      </div>

      {/* Subtle Elegant Mandala Patterns in Background */}
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-[850px] aspect-square text-amber-500/[0.04] animate-spin-slow pointer-events-none"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
      >
        <circle cx="100" cy="100" r="90" strokeDasharray="3 3" />
        <circle cx="100" cy="100" r="70" strokeDasharray="4 4" />
        <circle cx="100" cy="100" r="50" />
        <circle cx="100" cy="100" r="30" strokeDasharray="2 2" />
        <path d="M100 10 L100 190 M10 100 L190 100 M36 36 L164 164 M36 164 L164 36" />
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const x1 = 100 + 40 * Math.cos(angle);
          const y1 = 100 + 40 * Math.sin(angle);
          const x2 = 100 + 80 * Math.cos(angle);
          const y2 = 100 + 80 * Math.sin(angle);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </svg>

      {/* Bottom Glowing Traditional Diyas with Luminous Flames */}
      <div className="absolute bottom-2 sm:bottom-4 inset-x-0 flex items-end justify-between px-6 sm:px-16 pointer-events-none opacity-80">
        {/* Left Diya */}
        <div className="flex flex-col items-center">
          <div className="w-3 h-5 bg-gradient-to-t from-amber-500 via-yellow-400 to-white rounded-full shadow-[0_0_16px_rgba(251,191,36,0.9)] animate-pulse" />
          <svg className="w-10 sm:w-14 h-5 sm:h-7 text-amber-600 drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]" viewBox="0 0 40 20" fill="currentColor">
            <path d="M4 8c0 6 7 10 16 10s16-4 16-10H4z" />
          </svg>
        </div>

        {/* Center-Left Diya */}
        <div className="hidden md:flex flex-col items-center">
          <div className="w-2.5 h-4 bg-gradient-to-t from-amber-500 via-yellow-400 to-white rounded-full shadow-[0_0_14px_rgba(251,191,36,0.85)] animate-pulse" />
          <svg className="w-8 h-4 text-amber-600 drop-shadow-[0_2px_6px_rgba(245,158,11,0.4)]" viewBox="0 0 40 20" fill="currentColor">
            <path d="M4 8c0 6 7 10 16 10s16-4 16-10H4z" />
          </svg>
        </div>

        {/* Center-Right Diya */}
        <div className="hidden md:flex flex-col items-center">
          <div className="w-2.5 h-4 bg-gradient-to-t from-amber-500 via-yellow-400 to-white rounded-full shadow-[0_0_14px_rgba(251,191,36,0.85)] animate-pulse" />
          <svg className="w-8 h-4 text-amber-600 drop-shadow-[0_2px_6px_rgba(245,158,11,0.4)]" viewBox="0 0 40 20" fill="currentColor">
            <path d="M4 8c0 6 7 10 16 10s16-4 16-10H4z" />
          </svg>
        </div>

        {/* Right Diya */}
        <div className="flex flex-col items-center">
          <div className="w-3 h-5 bg-gradient-to-t from-amber-500 via-yellow-400 to-white rounded-full shadow-[0_0_16px_rgba(251,191,36,0.9)] animate-pulse" />
          <svg className="w-10 sm:w-14 h-5 sm:h-7 text-amber-600 drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]" viewBox="0 0 40 20" fill="currentColor">
            <path d="M4 8c0 6 7 10 16 10s16-4 16-10H4z" />
          </svg>
        </div>
      </div>

      {/* Radial Dark Vignette to ensure firework particles pop with maximum brilliance */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-neutral-950/20 to-neutral-950/50 pointer-events-none" />
    </div>
  );
};
