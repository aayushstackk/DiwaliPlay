/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves an asset URL consistently across Web browser, Android WebView (Capacitor),
 * and local dev environments.
 *
 * Rules:
 * 1. If empty or null/undefined, returns empty string.
 * 2. If already absolute (http://, https://, data:, blob:), returns as-is.
 * 3. If a legacy record is just an ID or objectKey (e.g. "asset_123" or "brand_logos/logo.png"),
 *    routes it through the safe /api/assets/:id/content endpoint.
 * 4. If relative (e.g. /api/assets/...), and VITE_API_BASE_URL or window.__API_BASE_URL__
 *    is an absolute origin, prepends the origin so Android WebView reaches the backend.
 * 5. In standard Web / Vercel environments, preserves the relative path for proxying.
 */
export function resolveAssetUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();
  if (!trimmed) return '';

  // Already an absolute URL or inline data / blob URI
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  let normalized = trimmed;

  // Handle bare legacy IDs or objectKeys (e.g. "asset_6fcfd7af-bcb" or "brand_logos/logo_123.png")
  if (!normalized.startsWith('/') && !normalized.startsWith('./')) {
    normalized = `/api/assets/${normalized}/content`;
  }

  // If running in Capacitor or native webview where window.location.origin is localhost / capacitor://
  // but API base URL points to a remote origin:
  const apiBase =
    (typeof window !== 'undefined' && (window as any).__API_BASE_URL__) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
    '';

  if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
    try {
      const origin = new URL(apiBase).origin;
      return `${origin}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
    } catch {
      // Fallback
    }
  }

  return normalized;
}

