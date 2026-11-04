/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let cachedIsAndroid: boolean | null = null;
let cachedIsLowEnd: boolean | null = null;
let dynamicLowEndOverride: boolean | null = null;

// Adaptive FPS monitoring buffer (last 30 frames)
const FRAME_SAMPLES = 30;
const frameTimesBuffer = new Float32Array(FRAME_SAMPLES);
let frameIndex = 0;
let frameCount = 0;
let frameSum = 0;

/**
 * Detects whether the current runtime is an Android device or Android WebView (e.g. Samsung Interactive Display Kiosk).
 */
export function isAndroidDevice(): boolean {
  if (cachedIsAndroid !== null) {
    return cachedIsAndroid;
  }
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  cachedIsAndroid =
    /Android/i.test(ua) ||
    (typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.()));
  return cachedIsAndroid;
}

/**
 * Detects whether the device has low-spec hardware (e.g., low-end Windows TV PC, Intel Celeron/Pentium mini PC,
 * integrated Intel HD/UHD graphics, <= 4 CPU cores, or <= 4GB RAM).
 */
export function isLowEndHardware(): boolean {
  if (dynamicLowEndOverride !== null) {
    return dynamicLowEndOverride;
  }
  if (cachedIsLowEnd !== null) {
    return cachedIsLowEnd;
  }
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false;
  }

  // Android TV / kiosk hardware is always low-to-mid spec
  if (isAndroidDevice()) {
    cachedIsLowEnd = true;
    return true;
  }

  // Low CPU core count (TV sticks, low-end Windows TV boxes, mini PCs have 2-4 cores)
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as any).deviceMemory || 8;
  if (cores <= 4 || memory <= 4) {
    cachedIsLowEnd = true;
    return true;
  }

  // Inspect WebGL renderer for low-end integrated Intel GPUs
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer =
          ((gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
        if (
          renderer.includes('intel') ||
          renderer.includes('celeron') ||
          renderer.includes('pentium') ||
          renderer.includes('hd graphics') ||
          renderer.includes('uhd graphics') ||
          renderer.includes('basic render') ||
          renderer.includes('swiftshader') ||
          renderer.includes('llvmpipe')
        ) {
          cachedIsLowEnd = true;
          return true;
        }
      }
    }
  } catch (e) {
    // ignore
  }

  cachedIsLowEnd = false;
  return false;
}

/**
 * Manually override low-end mode (e.g. for testing or user settings).
 */
export function setDynamicLowEndOverride(val: boolean | null): void {
  dynamicLowEndOverride = val;
}

/**
 * Records a frame delta time (in ms) to monitor real-time rendering performance.
 * If average frame time over 30 frames exceeds 24ms (<42 FPS), automatically switches to low-end optimized mode.
 * Returns true if the device is currently running in low-end mode.
 */
export function recordFrameTimeForAdaptiveQuality(dtMs: number): boolean {
  if (dtMs > 0 && dtMs < 200) {
    const oldVal = frameTimesBuffer[frameIndex];
    frameSum = frameSum - oldVal + dtMs;
    frameTimesBuffer[frameIndex] = dtMs;
    frameIndex = (frameIndex + 1) % FRAME_SAMPLES;
    if (frameCount < FRAME_SAMPLES) {
      frameCount++;
    }

    if (frameCount >= 20) {
      const avgMs = frameSum / frameCount;
      if (avgMs > 24) {
        // Average frame rate dropped below ~42 FPS: automatically enable low-end optimizations
        dynamicLowEndOverride = true;
      } else if (avgMs < 18 && dynamicLowEndOverride === true && !isLowEndHardware()) {
        // Recovered back to smooth 55-60 FPS on high-end hardware
        dynamicLowEndOverride = null;
      }
    }
  }

  return isLowEndHardware();
}

