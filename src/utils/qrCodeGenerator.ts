/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode from 'qrcode';

export interface GeneratedQrResult {
  matrixSize: number;
  svgPath: string;
}

// Module-level memoization cache (0ms execution for repeated or unchanged URLs)
const qrCache = new Map<string, GeneratedQrResult>();

/**
 * Encodes text into a standard ISO/IEC 18004 2D boolean QR matrix.
 * Uses Error Correction Level M (~15% recovery capacity).
 */
export function encodeQrToMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const matrix: boolean[][] = [];

  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(data[r * size + c] === 1);
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Converts a 2D boolean matrix to an SVG combined path data string
 */
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

/**
 * Returns memoized QR result with matrix dimension and pre-computed SVG path
 */
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
