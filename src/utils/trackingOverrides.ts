/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test-only URL switches for comparing hand-tracking setups on a real kiosk:
 * ?delegate=gpu|cpu  ?hands=1|2 (see also ?tracking=main|worker)
 */
export interface TrackingOverrides {
  delegate?: 'GPU' | 'CPU';
  numHands: number;
}

export function getTrackingOverrides(search: string): TrackingOverrides {
  const params = new URLSearchParams(search);
  const delegate = params.get('delegate');
  return {
    delegate: delegate === 'cpu' ? 'CPU' : delegate === 'gpu' ? 'GPU' : undefined,
    numHands: params.get('hands') === '1' ? 1 : 2,
  };
}

/** Name of the graphics driver WebGL is really using, e.g. to spot a software renderer. */
export function getWebGlRendererName(): string {
  cachedRendererName ??= readWebGlRendererName();
  return cachedRendererName;
}

let cachedRendererName: string | undefined;

function readWebGlRendererName(): string {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return 'no WebGL2';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch {
    return 'unknown';
  }
}
