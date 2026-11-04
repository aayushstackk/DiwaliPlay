/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure TypeScript Zero-Dependency QR Code Generator (ISO/IEC 18004 Model 2)
 * Supports Byte Mode, Error Correction Level M (15% redundancy), Versions 1 to 10.
 * 100% offline, synchronous, sub-millisecond execution.
 */

// Galois Field GF(2^8) with polynomial 0x11D (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_EXP[i + 255] = val;
    GF_LOG[val] = i;
    val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
  }
  GF_LOG[0] = 0;
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function computeReedSolomon(data: Uint8Array, numEcWords: number): Uint8Array {
  const gen = new Uint8Array(numEcWords + 1);
  gen[0] = 1;
  for (let i = 0; i < numEcWords; i++) {
    const factor = GF_EXP[i];
    for (let j = i + 1; j >= 1; j--) {
      gen[j] = gen[j] ^ gfMul(gen[j - 1], factor);
    }
  }

  const remainder = new Uint8Array(numEcWords);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < numEcWords - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    remainder[numEcWords - 1] = gfMul(gen[numEcWords], factor);
  }
  return remainder;
}

interface VersionConfig {
  version: number;
  totalDataWords: number;
  ecWordsPerBlock: number;
  numBlocks1: number;
  dataWords1: number;
  numBlocks2: number;
  dataWords2: number;
  alignmentPatterns: number[];
}

const VERSION_CONFIGS_M: VersionConfig[] = [
  { version: 1, totalDataWords: 16, ecWordsPerBlock: 10, numBlocks1: 1, dataWords1: 16, numBlocks2: 0, dataWords2: 0, alignmentPatterns: [] },
  { version: 2, totalDataWords: 28, ecWordsPerBlock: 16, numBlocks1: 1, dataWords1: 28, numBlocks2: 0, dataWords2: 0, alignmentPatterns: [6, 18] },
  { version: 3, totalDataWords: 44, ecWordsPerBlock: 26, numBlocks1: 1, dataWords1: 44, numBlocks2: 0, dataWords2: 0, alignmentPatterns: [6, 22] },
  { version: 4, totalDataWords: 64, ecWordsPerBlock: 18, numBlocks1: 2, dataWords1: 32, numBlocks2: 0, dataWords2: 0, alignmentPatterns: [6, 26] },
  { version: 5, totalDataWords: 86, ecWordsPerBlock: 24, numBlocks1: 2, dataWords1: 43, numBlocks2: 0, dataWords2: 0, alignmentPatterns: [6, 30] },
  { version: 6, totalDataWords: 108, ecWordsPerBlock: 16, numBlocks1: 4, dataWords1: 27, numBlocks2: 0, dataWords2: 0, alignmentPatterns: [6, 34] },
  { version: 7, totalDataWords: 124, ecWordsPerBlock: 18, numBlocks1: 4, dataWords1: 31, numBlocks2: 0, dataWords2: 0, alignmentPatterns: [6, 22, 38] },
  { version: 8, totalDataWords: 154, ecWordsPerBlock: 22, numBlocks1: 2, dataWords1: 38, numBlocks2: 2, dataWords2: 39, alignmentPatterns: [6, 24, 42] },
  { version: 9, totalDataWords: 182, ecWordsPerBlock: 22, numBlocks1: 3, dataWords1: 36, numBlocks2: 2, dataWords2: 37, alignmentPatterns: [6, 26, 46] },
  { version: 10, totalDataWords: 216, ecWordsPerBlock: 26, numBlocks1: 4, dataWords1: 43, numBlocks2: 1, dataWords2: 44, alignmentPatterns: [6, 28, 50] },
];

export function encodeQrToMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);
  const dataLen = textBytes.length;

  let cfg: VersionConfig = VERSION_CONFIGS_M[VERSION_CONFIGS_M.length - 1];
  for (const v of VERSION_CONFIGS_M) {
    const requiredDataBits = 4 + (v.version <= 9 ? 8 : 16) + dataLen * 8;
    const requiredDataBytes = Math.ceil(requiredDataBits / 8);
    if (requiredDataBytes <= v.totalDataWords) {
      cfg = v;
      break;
    }
  }

  const bitBuffer: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >>> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(dataLen, cfg.version <= 9 ? 8 : 16);
  for (let i = 0; i < dataLen; i++) {
    pushBits(textBytes[i], 8);
  }

  const totalBits = cfg.totalDataWords * 8;
  const termLen = Math.min(4, totalBits - bitBuffer.length);
  for (let i = 0; i < termLen; i++) bitBuffer.push(0);
  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < totalBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataWords = new Uint8Array(cfg.totalDataWords);
  for (let i = 0; i < cfg.totalDataWords; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitBuffer[i * 8 + j];
    }
    dataWords[i] = b;
  }

  const totalBlocks = cfg.numBlocks1 + cfg.numBlocks2;
  const blocksData: Uint8Array[] = [];
  const blocksEc: Uint8Array[] = [];

  let offset = 0;
  for (let i = 0; i < cfg.numBlocks1; i++) {
    const chunk = dataWords.slice(offset, offset + cfg.dataWords1);
    blocksData.push(chunk);
    blocksEc.push(computeReedSolomon(chunk, cfg.ecWordsPerBlock));
    offset += cfg.dataWords1;
  }
  for (let i = 0; i < cfg.numBlocks2; i++) {
    const chunk = dataWords.slice(offset, offset + cfg.dataWords2);
    blocksData.push(chunk);
    blocksEc.push(computeReedSolomon(chunk, cfg.ecWordsPerBlock));
    offset += cfg.dataWords2;
  }

  const finalSequence: number[] = [];
  const maxDataWords = Math.max(cfg.dataWords1, cfg.dataWords2);
  for (let i = 0; i < maxDataWords; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (i < blocksData[b].length) {
        finalSequence.push(blocksData[b][i]);
      }
    }
  }
  for (let i = 0; i < cfg.ecWordsPerBlock; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      finalSequence.push(blocksEc[b][i]);
    }
  }

  const size = cfg.version * 4 + 17;
  const matrix: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );

  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const qr = row + r;
        const qc = col + c;
        if (qr >= 0 && qr < size && qc >= 0 && qc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
            const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            matrix[qr][qc] = isBorder || isCore ? 1 : 0;
          } else {
            matrix[qr][qc] = 0;
          }
        }
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  if (cfg.alignmentPatterns.length > 0) {
    const pos = cfg.alignmentPatterns;
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const r = pos[i];
        const c = pos[j];
        if (matrix[r][c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            matrix[r + dr][c + dc] = isBorder || isCenter ? 1 : 0;
          }
        }
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0 ? 1 : 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  matrix[size - 8][8] = 1; // Dark module

  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = -1;
    if (matrix[i][8] === null) matrix[i][8] = -1;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = -1;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = -1;
  }

  let bitIdx = 0;
  const totalPlacedBits = finalSequence.length * 8;
  let dir = -1;
  let r = size - 1;
  let c = size - 1;

  while (c > 0) {
    if (c === 6) c--;
    for (let i = 0; i < 2; i++) {
      const col = c - i;
      if (matrix[r][col] === null) {
        let bit = 0;
        if (bitIdx < totalPlacedBits) {
          const byteVal = finalSequence[Math.floor(bitIdx / 8)];
          bit = (byteVal >>> (7 - (bitIdx % 8))) & 1;
          bitIdx++;
        }
        matrix[r][col] = bit;
      }
    }
    r += dir;
    if (r < 0 || r >= size) {
      dir = -dir;
      r += dir;
      c -= 2;
    }
  }

  const maskFn = (row: number, col: number) => (row + col) % 2 === 0;

  const finalMatrix: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const val = matrix[row][col];
      if (val === -1) {
        finalMatrix[row][col] = false;
      } else if (val === 1 || val === 0) {
        const isFinderArea =
          (row <= 8 && col <= 8) ||
          (row <= 8 && col >= size - 8) ||
          (row >= size - 8 && col <= 8);
        const isTiming = row === 6 || col === 6;
        const isDark = row === size - 8 && col === 8;

        let isAlign = false;
        if (cfg.alignmentPatterns.length > 0) {
          for (const ar of cfg.alignmentPatterns) {
            for (const ac of cfg.alignmentPatterns) {
              if (Math.abs(row - ar) <= 2 && Math.abs(col - ac) <= 2) {
                isAlign = true;
                break;
              }
            }
          }
        }

        if (isFinderArea || isTiming || isDark || isAlign) {
          finalMatrix[row][col] = val === 1;
        } else {
          const invert = maskFn(row, col);
          finalMatrix[row][col] = (val ^ (invert ? 1 : 0)) === 1;
        }
      }
    }
  }

  // Format info bits for Level M (00) + Mask 000 (000)
  const formatBits = [1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0];
  for (let i = 0; i <= 5; i++) finalMatrix[8][i] = formatBits[i] === 1;
  finalMatrix[8][7] = formatBits[6] === 1;
  finalMatrix[8][8] = formatBits[7] === 1;
  finalMatrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) finalMatrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) finalMatrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) finalMatrix[8][size - 15 + i] = formatBits[i] === 1;

  return finalMatrix;
}

export function qrMatrixToSvgPath(matrix: boolean[][]): string {
  let path = '';
  const size = matrix.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        path += `M${c},${r}h1v1h-1z `;
      }
    }
  }
  return path.trim();
}

export interface GeneratedQrResult {
  matrixSize: number;
  svgPath: string;
}

// Module-level memoization cache (0ms for repeated or unchanged URLs)
const qrCache = new Map<string, GeneratedQrResult>();

export function getCachedQrResult(text: string): GeneratedQrResult {
  if (qrCache.has(text)) {
    return qrCache.get(text)!;
  }
  const matrix = encodeQrToMatrix(text);
  const svgPath = qrMatrixToSvgPath(matrix);
  const res: GeneratedQrResult = { matrixSize: matrix.length, svgPath };
  qrCache.set(text, res);
  return res;
}

