/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation rules for Player Name and Mobile Number
 * Shared between client and backend.
 */

export interface ValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Validates a Player Name according to event kiosk requirements:
 * 1. Minimum 2 alphabetic characters.
 * 2. Only letters (a-z, A-Z) and spaces allowed.
 * 3. Numbers, symbols, emojis forbidden.
 * 4. Cannot contain only spaces.
 * 5. Trim leading/trailing spaces, normalize multiple spaces.
 * 6. Reject obvious fake/test names (aa, bb, cc, aaa, bbb, etc.).
 * 7. Reject obvious alphabetical sequences (ab, bc, cd, de, ef, ba, cb, dc, ed, abcd, bcde, cdef, defg, etc.).
 * 8. Must not reject legitimate names (Rahul, Aman, Neha, Priya, Riya, Karan, Simran, Arjun, Vikram, Ananya).
 */
export function validatePlayerName(rawName: string | undefined | null): ValidationResult {
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return { valid: false, normalized: '', error: 'Please enter your name.' };
  }

  // Normalize multiple spaces and trim
  const normalized = rawName.trim().replace(/\s+/g, ' ');

  // Minimum 2 characters
  if (normalized.length < 2) {
    return { valid: false, normalized, error: 'Name must be at least 2 characters.' };
  }

  // Maximum 50 characters
  if (normalized.length > 50) {
    return { valid: false, normalized, error: 'Name must not exceed 50 characters.' };
  }

  // Only letters and spaces allowed (no numbers, symbols, emojis)
  if (!/^[a-zA-Z\s]+$/.test(normalized)) {
    return { valid: false, normalized, error: 'Please use letters only (no numbers or symbols).' };
  }

  const lettersOnly = normalized.toLowerCase().replace(/[^a-z]/g, '');
  if (lettersOnly.length < 2) {
    return { valid: false, normalized, error: 'Please enter a valid player name.' };
  }

  // Reject all identical repeating characters (aa, bb, cc, dd, aaa, bbb, etc.)
  if (/^(.)\1+$/.test(lettersOnly)) {
    return { valid: false, normalized, error: 'Please enter a valid player name.' };
  }

  // Known fake/test names
  const knownFakeNames = new Set([
    'test', 'testing', 'tester', 'dummy', 'admin', 'administrator', 'guest', 'temp', 'temporary',
    'asdf', 'asdfg', 'asdfgh', 'qwer', 'qwert', 'qwerty', 'zxcv', 'zxcvb',
    'abcd', 'bcde', 'cdef', 'defg', 'efgh',
    'none', 'null', 'undefined', 'anonymous', 'unknown', 'user', 'player', 'demo',
    'abc', 'xyz', 'foo', 'bar', 'baz', 'xxx', 'yyy', 'zzz'
  ]);
  if (knownFakeNames.has(lettersOnly)) {
    return { valid: false, normalized, error: 'Please enter a valid player name.' };
  }

  // Reject obvious alphabetical sequential patterns of 3 or more letters (e.g. abc, def, cba, fed)
  if (lettersOnly.length >= 3) {
    let isAsc = true;
    let isDesc = true;
    for (let i = 0; i < lettersOnly.length - 1; i++) {
      const diff = lettersOnly.charCodeAt(i + 1) - lettersOnly.charCodeAt(i);
      if (diff !== 1) isAsc = false;
      if (diff !== -1) isDesc = false;
    }
    if (isAsc || isDesc) {
      return { valid: false, normalized, error: 'Please enter a valid player name.' };
    }
  }

  // Obvious 2-letter keyboard mashings
  if (lettersOnly.length === 2) {
    const fakeTwoLetters = new Set([
      'aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii', 'jj', 'kk', 'll', 'mm', 'nn', 'oo', 'pp', 'qq', 'rr', 'ss', 'tt', 'uu', 'vv', 'ww', 'xx', 'yy', 'zz',
      'ab', 'bc', 'cd', 'de', 'ef', 'fg', 'gh', 'hi', 'ij', 'jk', 'kl', 'lm', 'mn', 'no', 'op', 'pq', 'qr', 'rs', 'st', 'tu', 'uv', 'vw', 'wx', 'xy', 'yz',
      'ba', 'cb', 'dc', 'ed', 'fe', 'gf', 'hg', 'ih', 'ji', 'kj', 'lk', 'ml', 'nm', 'on', 'po', 'qp', 'rq', 'sr', 'ts', 'ut', 'vu', 'wv', 'xw', 'yx', 'zy'
    ]);
    const legitimateTwoLetterNames = new Set(['om', 'al', 'jo', 'ty', 'bo', 'an', 'ed', 'mo', 'vi', 'lu']);
    if (fakeTwoLetters.has(lettersOnly) && !legitimateTwoLetterNames.has(lettersOnly)) {
      return { valid: false, normalized, error: 'Please enter a valid player name.' };
    }
  }

  // Format in Title Case (e.g., "rahul sharma" -> "Rahul Sharma")
  const titleCased = normalized
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { valid: true, normalized: titleCased };
}

/**
 * Validates a 10-digit Indian mobile number:
 * 1. Exactly 10 digits.
 * 2. First digit must be 6, 7, 8, or 9.
 * 3. Reject all identical digits (0000000000, 1111111111, ..., 9999999999).
 * 4. Reject obvious fake/sequential patterns (0000000001, 1234567890, 0123456789, 9876543210, 1111111112, 2222222223).
 * 5. Reject malformed values (letters, symbols, <10, >10).
 */
export function validateMobileNumber(rawMobile: string | undefined | null): ValidationResult {
  if (!rawMobile || typeof rawMobile !== 'string') {
    return { valid: false, normalized: '', error: 'Please enter a valid 10-digit mobile number.' };
  }

  const clean = rawMobile.trim();

  // Exactly 10 digits
  if (!/^\d{10}$/.test(clean)) {
    return { valid: false, normalized: clean, error: 'Please enter a valid 10-digit mobile number.' };
  }

  // First digit must be 6, 7, 8, or 9
  if (!/^[6-9]/.test(clean)) {
    return { valid: false, normalized: clean, error: 'Please enter a valid 10-digit mobile number.' };
  }

  // Reject all identical repeating digits (e.g. 5555555555, 9999999999, etc.)
  if (/^(\d)\1{9}$/.test(clean)) {
    return { valid: false, normalized: clean, error: 'Please enter a valid 10-digit mobile number.' };
  }

  // Reject obvious fake/sequential patterns
  const knownFakePatterns = [
    '0000000001',
    '1234567890',
    '0123456789',
    '9876543210',
    '1111111112',
    '2222222223'
  ];
  if (knownFakePatterns.includes(clean)) {
    return { valid: false, normalized: clean, error: 'Please enter a valid 10-digit mobile number.' };
  }

  // Reject 9 identical digits (e.g. 9999999998, 8888888889)
  if (/^(\d)\1{8}\d$/.test(clean) || /^\d(\d)\1{8}$/.test(clean)) {
    return { valid: false, normalized: clean, error: 'Please enter a valid 10-digit mobile number.' };
  }

  return { valid: true, normalized: clean };
}
