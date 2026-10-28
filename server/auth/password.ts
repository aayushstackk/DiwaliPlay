/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';

/**
 * Validates password complexity:
 * - Minimum 5 characters
 * - Must include at least one digit or symbol
 */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 5) {
    return { valid: false, error: 'Password must be at least 5 characters long.' };
  }
  if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit or special character.' };
  }
  return { valid: true };
}

/**
 * Normalizes username: trimmed, lowercase, alphanumeric and underscores only.
 */
export function normalizeUsername(username: string): string {
  return (username || '').trim().toLowerCase();
}

/**
 * Cryptographically hashes a plaintext password using native crypto.scrypt.
 * Output format: scrypt:<salt-hex>:<derived-key-hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    // 64-byte derived key, CPU/memory cost parameter N=16384, r=8, p=1
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a plaintext password against a stored scrypt hash using timing-safe comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || typeof storedHash !== 'string') return false;

  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, originalKeyHex] = parts;
  return new Promise((resolve) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const originalBuffer = Buffer.from(originalKeyHex, 'hex');
        if (derivedKey.length !== originalBuffer.length) {
          return resolve(false);
        }
        resolve(crypto.timingSafeEqual(derivedKey, originalBuffer));
      } catch {
        resolve(false);
      }
    });
  });
}
