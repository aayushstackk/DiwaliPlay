/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrandLogo } from './BrandLogo';
import { useBranding } from '../hooks/useBranding';

interface BrandingBlockProps {
  brandLogoUrl?: string | null;
  brandName?: string;
  experienceTitle?: string;
  connectorText?: string;
  logoWidth?: number;
  logoHeight?: number;
  logoPosition?: { x: number; y: number };
  size?: 'kiosk' | 'mobile' | 'compact';
  className?: string;
}

export const BrandingBlock: React.FC<BrandingBlockProps> = ({
  brandLogoUrl,
  brandName,
  experienceTitle,
  connectorText,
  logoWidth,
  logoHeight,
  logoPosition,
  size = 'kiosk',
  className = ''
}) => {
  const dynamicBranding = useBranding();
  const effectiveTitle = experienceTitle || dynamicBranding.experienceTitle || 'DIWALI FUN PLAY';
  const effectiveConnector =
    connectorText !== undefined ? connectorText : dynamicBranding.connectorText || 'by';
  const effectiveLogoUrl =
    brandLogoUrl !== undefined ? brandLogoUrl : dynamicBranding.brandLogoUrl;
  const effectiveBrandName = brandName || dynamicBranding.brandName || 'ItsSpotlight';
  const effectiveWidth = logoWidth !== undefined ? logoWidth : dynamicBranding.logoWidth;
  const effectiveHeight = logoHeight !== undefined ? logoHeight : dynamicBranding.logoHeight;
  const effectivePosition = logoPosition !== undefined ? logoPosition : dynamicBranding.logoPosition;

  // Responsive typography based on presentation context
  const line1Classes = {
    kiosk:
      'text-2xl sm:text-3xl md:text-4xl font-black tracking-wider text-amber-100 font-[\'Cinzel\',serif] drop-shadow-[0_2px_14px_rgba(245,158,11,0.35)]',
    mobile:
      'text-xl sm:text-2xl font-black tracking-wider text-amber-100 font-[\'Cinzel\',serif] drop-shadow-[0_2px_10px_rgba(245,158,11,0.25)]',
    compact:
      'text-sm sm:text-base font-extrabold tracking-wider text-amber-100 font-[\'Cinzel\',serif]'
  }[size];

  const line2Classes = {
    kiosk: 'text-amber-300/80 font-serif italic text-xs sm:text-sm tracking-widest my-1 lowercase',
    mobile:
      'text-amber-300/80 font-serif italic text-[11px] sm:text-xs tracking-widest my-0.5 lowercase',
    compact: 'text-amber-300/70 font-serif italic text-[10px] tracking-widest my-0 lowercase'
  }[size];

  const line3Classes = {
    kiosk: 'mt-0.5 sm:mt-1',
    mobile: 'mt-0.5',
    compact: 'mt-0.5'
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
      {/* LINE 1: Experience Title */}
      <h1 className={line1Classes}>{effectiveTitle}</h1>

      {/* LINE 2: Connector Text */}
      {effectiveConnector ? (
        <span className={line2Classes}>{effectiveConnector}</span>
      ) : (
        <div className="h-1" />
      )}

      {/* LINE 3: [COMPANY LOGO] */}
      <div className={line3Classes}>
        <BrandLogo
          brandLogoUrl={effectiveLogoUrl}
          brandName={effectiveBrandName}
          width={effectiveWidth}
          height={effectiveHeight}
          position={effectivePosition}
          size={size}
        />
      </div>
    </div>
  );
};
