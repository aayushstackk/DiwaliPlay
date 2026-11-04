/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';

/** Messages between the main thread and the hand-tracking worker. */

export interface HandWorkerInitOptions {
  wasmBasePath: string;
  modelAssetPath: string;
}

export type HandWorkerRequest =
  | { type: 'init'; options: HandWorkerInitOptions }
  | { type: 'detect'; id: number; bitmap: ImageBitmap; timestamp: number }
  | { type: 'close' };

export type HandWorkerResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'init-error'; message: string }
  | {
      type: 'result';
      id: number;
      landmarks: NormalizedLandmark[][];
      handedness: Category[][];
      inferenceMs: number;
    }
  | { type: 'detect-error'; id: number; message: string };

/** The subset of HandLandmarkerResult the tracking loop consumes. */
export interface HandDetectionResult {
  landmarks: NormalizedLandmark[][];
  handedness: Category[][];
}
