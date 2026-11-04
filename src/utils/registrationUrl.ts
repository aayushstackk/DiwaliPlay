/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const PRODUCTION_FRONTEND_URL = 'https://diwali-game-six.vercel.app';

/**
 * Resolves the publicly accessible registration URL for QR code scanning.
 * - In production web environments (e.g. Vercel or custom domain): uses the live public origin.
 * - In local development or kiosk environments (localhost, 127.0.0.1, Electron file://):
 *   dynamically defaults to the publicly accessible production URL so mobile devices
 *   (Android & iPhone) can scan and open the page immediately.
 * - Preserves any active session/event/kiosk query parameters if present.
 */
export function getRegistrationUrl(): string {
  let base = PRODUCTION_FRONTEND_URL;

  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    const hostname = window.location.hostname;

    // Check if origin is a valid public web domain (not localhost, private network, or local file)
    const isLocalOrPrivate =
      !origin ||
      origin.startsWith('file:') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

    if (!isLocalOrPrivate && origin.startsWith('https://')) {
      base = origin.replace(/\/+$/, '');
    } else if (typeof (window as any).__PUBLIC_FRONTEND_URL__ === 'string') {
      base = String((window as any).__PUBLIC_FRONTEND_URL__).replace(/\/+$/, '');
    } else if (import.meta.env.VITE_PUBLIC_URL) {
      base = String(import.meta.env.VITE_PUBLIC_URL).replace(/\/+$/, '');
    }
  }

  const url = new URL('/register', base);

  // Preserve relevant query parameters if present on the kiosk window
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    try {
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.forEach((val, key) => {
        if (!key.startsWith('internal_') && !url.searchParams.has(key)) {
          url.searchParams.set(key, val);
        }
      });
    } catch {}
  }

  return url.toString();
}

