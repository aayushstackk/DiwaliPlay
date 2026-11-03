/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let cachedIsAndroid: boolean | null = null;

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

