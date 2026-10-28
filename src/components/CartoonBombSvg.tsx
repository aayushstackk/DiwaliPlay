/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BombConfig } from '../types/backend';

interface CartoonBombSvgProps {
  bomb: Partial<BombConfig>;
  size?: number; // size in px, default 96
  showBadge?: boolean;
  isBursting?: boolean;
  rotation?: number; // tilt/spin in degrees
  className?: string;
}

// Utility to lighten/darken hex colors for 3D gradient stops
function adjustHex(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const CartoonBombSvg: React.FC<CartoonBombSvgProps> = ({
  bomb,
  size = 96,
  showBadge = true,
  isBursting = false,
  rotation = 0,
  className = ''
}) => {
  const points = bomb.points ?? 100;
  const isPenalty = points < 0;
  const baseColor = bomb.color || (isPenalty ? '#1E293B' : '#EF4444');
  const preset = bomb.imagePreset || (isPenalty ? 'black_penalty' : 'red_classic');
  const customImageUrl = bomb.imageUrl;

  // Generated gradient colors for 3D sphere volume
  const lightColor = adjustHex(baseColor, 35);
  const midColor = baseColor;
  const darkColor = adjustHex(baseColor, -45);
  const deepShadowColor = adjustHex(baseColor, -75);
  const rimColor = isPenalty ? '#EF4444' : adjustHex(baseColor, 40);

  const idPrefix = `bomb-${bomb.id || 'preview'}-${size}`;
  const sphereGradId = `${idPrefix}-sphere`;
  const specularGradId = `${idPrefix}-specular`;
  const rimGradId = `${idPrefix}-rim`;
  const collarGradId = `${idPrefix}-collar`;
  const badgeShadowId = `${idPrefix}-badgeShadow`;

  const pointsText = points > 0 ? `+${points}` : `${points}`;

  // 3D Badge styling based on point tier
  let badgeBg = '#EF4444';
  let badgeBorder = '#FCA5A5';
  let badgeShadow = 'rgba(239, 68, 68, 0.5)';

  if (isPenalty) {
    badgeBg = '#7F1D1D';
    badgeBorder = '#EF4444';
    badgeShadow = 'rgba(239, 68, 68, 0.6)';
  } else if (points >= 300) {
    badgeBg = '#047857';
    badgeBorder = '#6EE7B7';
    badgeShadow = 'rgba(16, 185, 129, 0.5)';
  } else if (points >= 150) {
    badgeBg = '#1D4ED8';
    badgeBorder = '#93C5FD';
    badgeShadow = 'rgba(59, 130, 246, 0.5)';
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${
        isBursting ? 'scale-135 opacity-0 transition-all duration-300' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: '50% 55%',
        filter: isPenalty
          ? 'drop-shadow(0 10px 18px rgba(239, 68, 68, 0.25))'
          : 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.55))',
      }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full overflow-visible"
      >
        <defs>
          {/* 1. Main 3D Spherical Volume Gradient (light from top-left) */}
          <radialGradient id={sphereGradId} cx="34%" cy="32%" r="68%">
            <stop offset="0%" stopColor={lightColor} stopOpacity="1" />
            <stop offset="42%" stopColor={midColor} stopOpacity="1" />
            <stop offset="78%" stopColor={darkColor} stopOpacity="1" />
            <stop offset="100%" stopColor={deepShadowColor} stopOpacity="1" />
          </radialGradient>

          {/* 2. Top-Left Primary Specular Hotspot (Glossy Softbox Sheen) */}
          <linearGradient id={specularGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.88" />
            <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.32" />
            <stop offset="75%" stopColor="#FFFFFF" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* 3. Bottom-Right Ambient Rim / Bounce Light (Fresnel Glow) */}
          <radialGradient id={rimGradId} cx="78%" cy="78%" r="48%">
            <stop offset="0%" stopColor={rimColor} stopOpacity="0.75" />
            <stop offset="55%" stopColor={rimColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={rimColor} stopOpacity="0" />
          </radialGradient>

          {/* 4. Turned Brass Metallic Collar Gradient */}
          <linearGradient id={collarGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="25%" stopColor="#D97706" />
            <stop offset="45%" stopColor="#FEF08A" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>

          {/* 5. Drop shadow for badge & collar */}
          <filter id={badgeShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* ============================================================== */}
        {/* FUSE & SPARKS (Behind bomb collar)                             */}
        {/* ============================================================== */}
        {/* Twisted Rope Fuse with 3D Ribbing */}
        <path
          d="M 50 18 Q 55 8, 68 6 Q 79 5, 83 12"
          fill="none"
          stroke="#78350F"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <path
          d="M 50 18 Q 55 8, 68 6 Q 79 5, 83 12"
          fill="none"
          stroke="#D97706"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeDasharray="2.8 1.4"
        />

        {/* Fiery Fuse Spark Flame & Embers */}
        <g transform="translate(83, 12)">
          {/* Radial Fire Glow */}
          <circle cx="0" cy="0" r="8" fill="#F59E0B" opacity="0.35" className="animate-pulse" />
          <circle cx="0" cy="0" r="5" fill="#F97316" opacity="0.7" />
          <circle cx="0" cy="0" r="3" fill="#FEF08A" />
          <circle cx="0" cy="0" r="1.4" fill="#FFFFFF" />

          {/* Animated Star Flares */}
          <line x1="-6.5" y1="0" x2="6.5" y2="0" stroke="#FEF08A" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="0" y1="-6.5" x2="0" y2="6.5" stroke="#FEF08A" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="-4" y1="-4" x2="4" y2="4" stroke="#F97316" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="4" y1="-4" x2="-4" y2="4" stroke="#F97316" strokeWidth="1.2" strokeLinecap="round" />

          {/* Tiny flying ember sparks */}
          <circle cx="6" cy="-4" r="1.0" fill="#FEF08A" opacity="0.8" />
          <circle cx="-5" cy="-5" r="0.8" fill="#F97316" opacity="0.9" />
          <circle cx="4" cy="6" r="0.7" fill="#FDE047" opacity="0.8" />
        </g>

        {/* ============================================================== */}
        {/* TURNED METALLIC BRASS COLLAR                                   */}
        {/* ============================================================== */}
        <rect
          x="43"
          y="15"
          width="14"
          height="6.5"
          rx="2.2"
          fill={`url(#${collarGradId})`}
          stroke="#451A03"
          strokeWidth="0.8"
          filter={`url(#${badgeShadowId})`}
        />
        {/* Top Rim Lip */}
        <ellipse cx="50" cy="15" rx="6.5" ry="1.8" fill="#FEF08A" />
        {/* Bevel highlight band */}
        <line x1="44" y1="18.5" x2="56" y2="18.5" stroke="#FFFFFF" strokeWidth="0.6" strokeOpacity="0.7" />

        {/* ============================================================== */}
        {/* 3D SPHERICAL BOMB BODY                                         */}
        {/* ============================================================== */}
        {/* Cast shadow under collar onto sphere */}
        <ellipse cx="50" cy="23" rx="9" ry="2.5" fill="#000000" opacity="0.5" />

        {/* Main Shaded Sphere */}
        <circle
          cx="50"
          cy="56"
          r="36"
          fill={`url(#${sphereGradId})`}
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="1.0"
        />

        {/* Bottom-Right Fresnel Rim Light (adds incredible 3D curvature) */}
        <circle
          cx="50"
          cy="56"
          r="35"
          fill={`url(#${rimGradId})`}
        />

        {/* Top-Left 3D Curved Specular Glare Arc */}
        <ellipse
          cx="37"
          cy="37"
          rx="15"
          ry="9.5"
          transform="rotate(-28, 37, 37)"
          fill={`url(#${specularGradId})`}
        />

        {/* Secondary Glint Specular Sparkle */}
        <ellipse
          cx="31"
          cy="34"
          rx="3.5"
          ry="2.0"
          transform="rotate(-28, 31, 34)"
          fill="#FFFFFF"
          opacity="0.9"
        />

        {/* ============================================================== */}
        {/* CUSTOM IMAGE OR 3D SCULPTED FACIAL FEATURES                   */}
        {/* ============================================================== */}
        {customImageUrl ? (
          // Custom Uploaded Image: Encased in a 3D Glass Medallion
          <g>
            <clipPath id={`${idPrefix}-imgClip`}>
              <circle cx="50" cy="56" r="30" />
            </clipPath>
            {/* Medallion Metallic Inner Bezel */}
            <circle cx="50" cy="56" r="31" fill="#0F172A" stroke="#FDE047" strokeWidth="1.4" />
            <image
              href={customImageUrl}
              x="20"
              y="26"
              width="60"
              height="60"
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${idPrefix}-imgClip)`}
            />
            {/* Convex Glass Specular Highlight Overlay */}
            <ellipse
              cx="44"
              cy="45"
              rx="18"
              ry="9"
              transform="rotate(-25, 44, 45)"
              fill="#FFFFFF"
              opacity="0.32"
            />
          </g>
        ) : (
          // 3D Sculpted Character Faces
          <>
            {/* BLACK PENALTY BOMB: Sculpted angry 3D brow, glowing predator slit eyes, chrome teeth */}
            {preset === 'black_penalty' && (
              <g>
                {/* Ominous red eye socket cast shadows */}
                <ellipse cx="37" cy="52" rx="7" ry="5.5" fill="#450A0A" opacity="0.8" />
                <ellipse cx="63" cy="52" rx="7" ry="5.5" fill="#450A0A" opacity="0.8" />

                {/* Glowing predator irises */}
                <ellipse cx="37" cy="52" rx="5.5" ry="4" fill="#FACC15" />
                <ellipse cx="63" cy="52" rx="5.5" ry="4" fill="#FACC15" />

                {/* Dark slit pupils */}
                <ellipse cx="37" cy="52" rx="1.8" ry="3.8" fill="#7F1D1D" />
                <ellipse cx="63" cy="52" rx="1.8" ry="3.8" fill="#7F1D1D" />

                {/* Heavy sculpted 3D crimson eyebrows */}
                <path
                  d="M 26 42 Q 36 47, 46 49"
                  stroke="#EF4444"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                />
                <path
                  d="M 74 42 Q 64 47, 54 49"
                  stroke="#EF4444"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                />
                {/* Brow top highlight */}
                <path
                  d="M 27 41 Q 36 45, 45 47"
                  stroke="#FCA5A5"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 73 41 Q 64 45, 55 47"
                  stroke="#FCA5A5"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />

                {/* Chrome sharp jagged teeth grimace */}
                <path
                  d="M 31 66 L 36 61 L 41 66 L 46 61 L 51 66 L 56 61 L 61 66 L 66 61 L 70 66"
                  stroke="#EF4444"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M 31 65 L 36 60 L 41 65 L 46 60 L 51 65 L 56 60 L 61 65 L 66 60 L 70 65"
                  stroke="#FEF08A"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </g>
            )}

            {/* GREEN SUPER BOMB (+300): Ecstatic open laughing mouth with tongue, anime eyes */}
            {preset === 'green_super' && (
              <g>
                {/* Dimensional eye sockets */}
                <ellipse cx="37" cy="48" rx="6.5" ry="7.5" fill="#FFFFFF" />
                <ellipse cx="63" cy="48" rx="6.5" ry="7.5" fill="#FFFFFF" />
                <circle cx="38" cy="48" r="4.2" fill="#064E3B" />
                <circle cx="64" cy="48" r="4.2" fill="#064E3B" />
                {/* Double sparkle catchlights */}
                <circle cx="36" cy="45" r="1.8" fill="#FFFFFF" />
                <circle cx="62" cy="45" r="1.8" fill="#FFFFFF" />
                <circle cx="40" cy="50" r="0.9" fill="#A7F3D0" />
                <circle cx="66" cy="50" r="0.9" fill="#A7F3D0" />

                {/* Shaded deep open laughing mouth */}
                <path
                  d="M 35 59 Q 50 78, 65 59 Z"
                  fill="#450A0A"
                  stroke="#064E3B"
                  strokeWidth="1.8"
                />
                {/* 3D Shaded pink tongue */}
                <path
                  d="M 43 67 Q 50 62, 57 67 Q 50 75, 43 67 Z"
                  fill="#F472B6"
                  stroke="#BE185D"
                  strokeWidth="0.8"
                />

                {/* Cute blushing cheeks */}
                <ellipse cx="27" cy="56" rx="4.5" ry="3.0" fill="#6EE7B7" opacity="0.75" />
                <ellipse cx="73" cy="56" rx="4.5" ry="3.0" fill="#6EE7B7" opacity="0.75" />
              </g>
            )}

            {/* BLUE HAPPY BOMB (+150): Cool winking eye with star, joyful anime grin */}
            {preset === 'blue_happy' && (
              <g>
                {/* Left eye: Cool winking arc with double stroke */}
                <path
                  d="M 31 50 Q 37 42, 43 50"
                  fill="none"
                  stroke="#1E3A8A"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 31 49 Q 37 42, 43 49"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />

                {/* Right eye: Big open anime eye with star shine */}
                <ellipse cx="63" cy="48" rx="6.5" ry="7.5" fill="#FFFFFF" />
                <circle cx="63" cy="48" r="4.2" fill="#1E3A8A" />
                <circle cx="61" cy="45" r="1.8" fill="#FFFFFF" />
                <circle cx="65" cy="50" r="0.9" fill="#93C5FD" />

                {/* Charming wide grin */}
                <path
                  d="M 40 61 Q 50 71, 60 61"
                  fill="none"
                  stroke="#1E3A8A"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 40 60 Q 50 69, 60 60"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />

                {/* Rosy glowing cheeks */}
                <ellipse cx="29" cy="56" rx="4.5" ry="2.8" fill="#93C5FD" opacity="0.65" />
                <ellipse cx="71" cy="56" rx="4.5" ry="2.8" fill="#93C5FD" opacity="0.65" />
              </g>
            )}

            {/* RED CLASSIC BOMB (+100): Sweet curved smiling anime eyes, cute cheerful smile */}
            {preset === 'red_classic' && (
              <g>
                {/* Left eye */}
                <path
                  d="M 31 49 Q 37 41, 43 49"
                  fill="none"
                  stroke="#7F1D1D"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 31 48 Q 37 41, 43 48"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />

                {/* Right eye */}
                <path
                  d="M 57 49 Q 63 41, 69 49"
                  fill="none"
                  stroke="#7F1D1D"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 57 48 Q 63 41, 69 48"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />

                {/* Sweet open smile */}
                <path
                  d="M 39 59 Q 50 69, 61 59"
                  fill="none"
                  stroke="#7F1D1D"
                  strokeWidth="4.0"
                  strokeLinecap="round"
                />
                <path
                  d="M 39 58 Q 50 67, 61 58"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />

                {/* Cute rosy blush */}
                <ellipse cx="28" cy="55" rx="5.0" ry="3.2" fill="#FCA5A5" opacity="0.75" />
                <ellipse cx="72" cy="55" rx="5.0" ry="3.2" fill="#FCA5A5" opacity="0.75" />
              </g>
            )}
          </>
        )}
      </svg>

      {/* ================================================================ */}
      {/* 3D EMBOSSED PILL POINT BADGE                                     */}
      {/* ================================================================ */}
      {showBadge && (
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full font-black tracking-wider shadow-xl flex items-center justify-center border whitespace-nowrap pointer-events-none select-none"
          style={{
            backgroundColor: badgeBg,
            borderColor: badgeBorder,
            color: '#FFFFFF',
            fontSize: Math.max(10, Math.round(size * 0.14)),
            boxShadow: `0 4px 14px ${badgeShadow}, inset 0 1px 0 rgba(255, 255, 255, 0.45)`,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
          }}
        >
          {pointsText}
        </div>
      )}
    </div>
  );
};
