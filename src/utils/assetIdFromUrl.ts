/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Extracts the asset id from an `/api/assets/:id/content` URL (relative or absolute), or null. */
export function assetIdFromUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/api\/assets\/([^/?#]+)\/content(?:[?#]|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}
