/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StartBackgroundChoice =
  | { kind: 'builtin' }
  | { kind: 'image' | 'video'; url: string; dim: number };

const DEFAULT_DIM = 50;
const MAX_DIM = 80;

export function chooseStartBackground(
  url: string | null | undefined,
  type: string | undefined,
  dim: number | undefined
): StartBackgroundChoice {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return { kind: 'builtin' };
  const rawDim = typeof dim === 'number' && Number.isFinite(dim) ? dim : DEFAULT_DIM;
  return {
    kind: type === 'video' ? 'video' : 'image',
    url: trimmed,
    dim: Math.min(MAX_DIM, Math.max(0, rawDim)),
  };
}
