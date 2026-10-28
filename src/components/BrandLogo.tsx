/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';

interface BrandLogoProps {
  brandLogoUrl?: string | null;
  brandName?: string;
  size?: 'kiosk' | 'mobile' | 'compact';
  width?: number;
  height?: number;
  position?: { x: number; y: number };
  className?: string;
  style?: React.CSSProperties;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  brandLogoUrl,
  brandName = 'ItsSpotlight',
  size = 'kiosk',
  width,
  height,
  position,
  className = '',
  style
}) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [brandLogoUrl]);

  // Height and sizing presets based on viewport context
  const sizeClasses = {
    kiosk: 'h-8 sm:h-9 md:h-11 max-w-[220px] sm:max-w-[280px]',
    mobile: 'h-6 sm:h-7 max-w-[180px]',
    compact: 'h-5 sm:h-6 max-w-[140px]'
  }[size];

  const transformStyle =
    position && (position.x !== 0 || position.y !== 0)
      ? `translate(${position.x}px, ${position.y}px)`
      : undefined;

  const customDimensionsStyle: React.CSSProperties = {
    ...(width ? { width: `${width}px`, maxWidth: 'none' } : {}),
    ...(height ? { height: `${height}px`, maxHeight: 'none' } : {}),
    ...(transformStyle ? { transform: transformStyle } : {}),
    ...style
  };

  // If a dynamic logo URL is provided and has not errored, display the uploaded image
  if (brandLogoUrl && !imageError) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <img
          src={brandLogoUrl}
          alt={brandName || 'Brand Logo'}
          onError={() => setImageError(true)}
          style={customDimensionsStyle}
          className={`${!width && !height ? sizeClasses : ''} w-auto object-contain mx-auto transition-transform duration-150 drop-shadow-[0_2px_10px_rgba(245,158,11,0.25)]`}
        />
      </div>
    );
  }

  // Fallback: Premium ItsSpotlight Brand Logo Badge (preserved aspect ratio, never distorted)
  const isKiosk = size === 'kiosk';
  const isMobile = size === 'mobile';

  return (
    <div
      style={customDimensionsStyle}
      className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1 sm:px-4 sm:py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-400/15 to-amber-500/10 border border-amber-400/35 shadow-[0_0_20px_rgba(245,158,11,0.18)] mx-auto transition-transform duration-150 ${className}`}
      title={brandName || 'ItsSpotlight'}
    >
      {/* Spotlight Icon / Symbol */}
      <svg
        className={`${isKiosk ? 'w-4 h-4 sm:w-5 sm:h-5' : isMobile ? 'w-3.5 h-3.5' : 'w-3 h-3'} text-amber-400 shrink-0 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" fill="#F59E0B" fillOpacity="0.4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
      </svg>

      {/* Brand Text */}
      <span
        className={`font-['Cinzel',serif] font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-100 to-yellow-300 uppercase select-none ${
          isKiosk
            ? 'text-xs sm:text-sm md:text-base'
            : isMobile
            ? 'text-[11px] sm:text-xs'
            : 'text-[10px] sm:text-[11px]'
        }`}
      >
        {brandName || 'ItsSpotlight'}
      </span>
    </div>
  );
};
