/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import crypto from 'crypto';
import { AssetCategory } from '../../../src/types/backend';
import { CategoryValidationRules } from './types';

export const CATEGORY_RULES: Record<AssetCategory, CategoryValidationRules> = {
  wallpapers: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxSizeBytes: 15 * 1024 * 1024, // 15 MB
    readableLimit: '15 MB'
  },
  brand_logos: {
    allowedMimeTypes: ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'],
    allowedExtensions: ['.png', '.svg', '.webp', '.jpg', '.jpeg'],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    readableLimit: '5 MB'
  },
  audio_tracks: {
    allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4'],
    allowedExtensions: ['.mp3', '.wav', '.ogg', '.m4a'],
    maxSizeBytes: 12 * 1024 * 1024, // 12 MB
    readableLimit: '12 MB'
  },
  cracker_effects: {
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg'],
    allowedExtensions: ['.png', '.webp', '.jpg', '.jpeg'],
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    readableLimit: '10 MB'
  },
  bomb_assets: {
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4'
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.mp3', '.wav', '.ogg', '.m4a'],
    maxSizeBytes: 15 * 1024 * 1024, // 15 MB
    readableLimit: '15 MB'
  },
  reward_images: {
    allowedMimeTypes: ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'],
    allowedExtensions: ['.png', '.svg', '.webp', '.jpg', '.jpeg'],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    readableLimit: '5 MB'
  },
  start_backgrounds: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.mp4'],
    maxSizeBytes: 40 * 1024 * 1024, // 40 MB (video)
    maxSizeBytesByMime: {
      'image/jpeg': 15 * 1024 * 1024,
      'image/png': 15 * 1024 * 1024,
      'image/webp': 15 * 1024 * 1024
    },
    readableLimit: '15 MB for images, 40 MB for video'
  }
};

const EXTENSION_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4'
};

/**
 * Sniffs binary magic bytes to verify file format authenticity.
 */
export function verifyMagicBytes(buffer: Buffer, declaredMime: string, ext: string): { valid: boolean; reason?: string } {
  if (buffer.length < 4) {
    return { valid: false, reason: 'File buffer is too small to contain valid media headers.' };
  }

  // 1. JPEG: FF D8 FF
  if (declaredMime === 'image/jpeg' || ext === '.jpg' || ext === '.jpeg') {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true };
    }
    return { valid: false, reason: 'Binary header does not match JPEG signature (FF D8 FF).' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (declaredMime === 'image/png' || ext === '.png') {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    ) {
      return { valid: true };
    }
    return { valid: false, reason: 'Binary header does not match PNG signature (89 50 4E 47).' };
  }

  // 3. WebP: RIFF ... WEBP
  if (declaredMime === 'image/webp' || ext === '.webp') {
    const isRiff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
    const isWebp = buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (isRiff && isWebp) {
      return { valid: true };
    }
    return { valid: false, reason: 'Binary header does not match WebP signature (RIFF...WEBP).' };
  }

  // 4. SVG: Text check with XML / SVG tags (and script injection ban)
  if (declaredMime === 'image/svg+xml' || ext === '.svg') {
    const textSnippet = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf-8').toLowerCase();
    if (!textSnippet.includes('<svg') && !textSnippet.includes('<?xml')) {
      return { valid: false, reason: 'File does not contain valid SVG or XML opening tags.' };
    }
    // Strict SVG Sanitization: Reject SVG containing embedded scripts or dangerous handlers
    const fullText = buffer.toString('utf-8').toLowerCase();
    if (
      fullText.includes('<script') ||
      fullText.includes('javascript:') ||
      fullText.includes('onload=') ||
      fullText.includes('onerror=') ||
      fullText.includes('onclick=')
    ) {
      return { valid: false, reason: 'SVG contains forbidden executable script tags or event handlers.' };
    }
    return { valid: true };
  }

  // MP4: ISO base media file, 'ftyp' box type at byte offset 4
  if (declaredMime === 'video/mp4' || ext === '.mp4') {
    if (buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
      return { valid: true };
    }
    return { valid: false, reason: 'Binary header does not match MP4 signature (ftyp box).' };
  }

  // 5. MP3: ID3 or MPEG sync frames (FF FB, FF F3, FF F2)
  if (declaredMime.includes('mpeg') || declaredMime.includes('mp3') || ext === '.mp3') {
    const isId3 = buffer.subarray(0, 3).toString('ascii') === 'ID3';
    const isSync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
    if (isId3 || isSync) {
      return { valid: true };
    }
    return { valid: false, reason: 'Binary header does not match MP3 frame or ID3 signature.' };
  }

  // 6. WAV: RIFF ... WAVE
  if (declaredMime.includes('wav') || ext === '.wav') {
    const isRiff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
    const isWave = buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
    if (isRiff && isWave) {
      return { valid: true };
    }
    return { valid: false, reason: 'Binary header does not match WAV signature (RIFF...WAVE).' };
  }

  // 7. OGG: OggS
  if (declaredMime.includes('ogg') || ext === '.ogg') {
    if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
      return { valid: true };
    }
    return { valid: false, reason: 'Binary header does not match OGG container signature (OggS).' };
  }

  // Permissive fallback for other accepted audio if declared properly
  return { valid: true };
}

/**
 * Validates file upload against category rules, MIME whitelist, and size bounds.
 */
export function validateUploadedFile(
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  },
  category: AssetCategory
): { valid: boolean; error?: string; normalizedMime?: string; sanitizedExt?: string } {
  const rules = CATEGORY_RULES[category];
  if (!rules) {
    return { valid: false, error: `Invalid asset category: "${category}".` };
  }

  if (!file || !file.buffer || file.buffer.length === 0) {
    return { valid: false, error: 'No file data provided in upload payload.' };
  }

  // 1. File size check against the category-wide ceiling
  if (file.size > rules.maxSizeBytes || file.buffer.length > rules.maxSizeBytes) {
    return {
      valid: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds category limit of ${rules.readableLimit}.`
    };
  }

  // 2. Extension check
  const ext = path.extname(file.originalname).toLowerCase();
  if (!rules.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Extension "${ext}" is not permitted for category "${category}". Allowed: ${rules.allowedExtensions.join(', ')}.`
    };
  }

  // 3. MIME type check
  let rawMime = (file.mimetype || '').toLowerCase();
  const mimeMatch = rules.allowedMimeTypes.some(
    (allowed) => rawMime === allowed || rawMime.startsWith(allowed)
  );

  if (!mimeMatch) {
    return {
      valid: false,
      error: `MIME type "${file.mimetype}" is not permitted for category "${category}". Allowed: ${rules.allowedMimeTypes.join(', ')}.`
    };
  }

  // 3b. Categories with per-type caps: the extension decides the type, the declared MIME must
  // agree (parameters stripped), and the per-type cap is applied to that canonical type so a
  // client cannot pick a looser cap by lying about Content-Type.
  if (rules.maxSizeBytesByMime) {
    const baseMime = rawMime.split(';')[0].trim();
    const canonicalMime = EXTENSION_MIME[ext];
    if (!canonicalMime || baseMime !== canonicalMime) {
      return {
        valid: false,
        error: `File extension "${ext}" does not match declared MIME type "${file.mimetype}".`
      };
    }
    rawMime = baseMime;
    const typeCap = rules.maxSizeBytesByMime[canonicalMime] ?? rules.maxSizeBytes;
    if (file.size > typeCap || file.buffer.length > typeCap) {
      return {
        valid: false,
        error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds category limit of ${rules.readableLimit}.`
      };
    }
  }

  // 4. Deep magic byte sniffing
  const magicCheck = verifyMagicBytes(file.buffer, rawMime, ext);
  if (!magicCheck.valid) {
    return {
      valid: false,
      error: `File validation failed: ${magicCheck.reason}`
    };
  }

  return {
    valid: true,
    normalizedMime: rawMime,
    sanitizedExt: ext
  };
}

/**
 * Generates an unguessable, collision-free object key.
 * Strictly prevents path traversal by generating clean, deterministic folder keys.
 */
export function generateSafeObjectKey(category: AssetCategory, ext: string): string {
  const prefixMap: Record<AssetCategory, string> = {
    wallpapers: 'wlp',
    brand_logos: 'logo',
    audio_tracks: 'audio',
    cracker_effects: 'fx',
    bomb_assets: 'bomb',
    reward_images: 'reward',
    start_backgrounds: 'bg'
  };

  const prefix = prefixMap[category] || 'asset';
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(8).toString('hex');
  const cleanExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;

  // Key format: category/prefix_timestamp_random.ext (e.g. wallpapers/wlp_1728639200_a1b2c3d4e5f6.jpg)
  return `${category}/${prefix}_${timestamp}_${randomHex}${cleanExt}`;
}
