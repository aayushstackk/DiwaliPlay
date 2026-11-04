/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { getCachedQrResult } from '../utils/qrCodeGenerator';

interface QrDisplayProps {
  url: string;
  size?: number;
  className?: string;
}

/**
 * High-performance, zero-latency, offline vector QR code renderer.
 * Generates exact ISO/IEC 18004 QR Matrix locally with memoized SVG paths.
 * Renders instantly on the very first frame without remote HTTP delays.
 */
export const QrCodeSvg: React.FC<QrDisplayProps> = React.memo(
  ({ url, size = 200, className = '' }) => {
    const qrData = useMemo(() => {
      if (!url) return null;
      return getCachedQrResult(url);
    }, [url]);

    if (!qrData) return null;

    // Standard 4-module quiet zone padding for guaranteed 100% phone camera readability
    const padding = 4;
    const viewBoxSize = qrData.matrixSize + padding * 2;

    return (
      <div
        className={`relative flex items-center justify-center p-2 rounded-xl bg-amber-100 border-2 border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.3)] select-none ${className}`}
        style={{ width: size + 16, height: size + 16 }}
      >
        <svg
          viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
          width={size}
          height={size}
          className="w-full h-full rounded-lg"
          shapeRendering="crispEdges"
        >
          {/* High-contrast white background for guaranteed mobile camera scanning */}
          <rect width={viewBoxSize} height={viewBoxSize} fill="#FFFFFF" rx="2" />
          {/* Crisp sharp dark modules */}
          <g transform={`translate(${padding}, ${padding})`}>
            <path d={qrData.svgPath} fill="#0A0713" />
          </g>
        </svg>
      </div>
    );
  }
);
