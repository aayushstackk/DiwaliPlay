/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PerformanceMetrics } from '../types/motion';

/** Small read-only tracking readout, shown only when the URL has ?timing=1. */
export const TrackingTimingOverlay: React.FC<{ metrics: PerformanceMetrics }> = ({ metrics }) => {
  const rows: [string, string][] = [
    ['Camera', `${metrics.cameraFps} fps (${metrics.cameraMode || 'no camera'})`],
    ['Camera delay', metrics.cameraDelayMs === null ? 'not reported' : `${metrics.cameraDelayMs} ms`],
    ['Detections', `${metrics.processingFps} /s`],
    ['Detection time', `${metrics.detectionMs} ms`],
    ['Frame to result', `${metrics.frameToResultMs} ms`],
    ['Drawing', `${metrics.renderFps} fps`],
    ['Tracker', `${metrics.trackerMode}${metrics.lowEndMode ? ', low-end' : ''}`],
    ['GPU', metrics.gpuName],
  ];

  return (
    <div className="fixed top-2 left-2 z-[9999] pointer-events-none rounded-lg bg-black/85 px-3 py-2 font-mono text-sm text-amber-200">
      {rows.map(([label, value]) => (
        <div key={label} className="flex max-w-[34rem] justify-between gap-6">
          <span className="text-neutral-400">{label}</span>
          <span className="min-w-0 break-words text-right font-bold">{value}</span>
        </div>
      ))}
    </div>
  );
};
