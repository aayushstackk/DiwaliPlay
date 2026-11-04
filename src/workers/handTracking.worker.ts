/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference lib="webworker" />

/**
 * Hand-tracking worker: runs MediaPipe HandLandmarker off the main thread so a slow
 * detection pass can never stall canvas animation. The main thread sends camera
 * frames as transferable ImageBitmaps and receives landmark results.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type {
  HandWorkerRequest,
  HandWorkerResponse,
  HandWorkerInitOptions,
} from '../utils/handTrackingWorkerProtocol';

declare const self: DedicatedWorkerGlobalScope;

let landmarker: HandLandmarker | null = null;

function post(msg: HandWorkerResponse) {
  self.postMessage(msg);
}

async function createLandmarker(
  options: HandWorkerInitOptions,
  delegate: 'GPU' | 'CPU'
): Promise<HandLandmarker> {
  // `true` = load the ES-module WASM loader (classic importScripts isn't available in module workers).
  // Absolute URLs: Vite's dev server rewrites root-relative dynamic imports (adds `?import`),
  // which breaks loading files served from /public.
  const wasmBase = new URL(options.wasmBasePath, self.location.origin).href;
  const modelUrl = new URL(options.modelAssetPath, self.location.origin).href;
  const fileset = await FilesetResolver.forVisionTasks(wasmBase, true);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  });
}

self.onmessage = async (event: MessageEvent<HandWorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    try {
      let delegate: 'GPU' | 'CPU' = 'GPU';
      try {
        // GPU in a worker needs OffscreenCanvas + WebGL2 in workers; not every browser/driver has it
        landmarker = await createLandmarker(msg.options, 'GPU');
      } catch (gpuErr) {
        console.warn('[HandWorker] GPU delegate unavailable in worker, using CPU:', gpuErr);
        delegate = 'CPU';
        landmarker = await createLandmarker(msg.options, 'CPU');
      }
      // Warm-up: the first GPU inference compiles shaders (~seconds on weak GPUs). Do it now,
      // during loading, instead of on the first gameplay frame.
      try {
        const warmCanvas = new OffscreenCanvas(256, 256);
        const warmCtx = warmCanvas.getContext('2d');
        if (warmCtx) {
          warmCtx.fillStyle = '#808080';
          warmCtx.fillRect(0, 0, 256, 256);
          landmarker.detectForVideo(warmCanvas, 1);
        }
      } catch (warmErr) {
        console.warn('[HandWorker] Warm-up inference failed (non-fatal):', warmErr);
      }

      post({ type: 'ready', delegate });
    } catch (err) {
      post({ type: 'init-error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (msg.type === 'detect') {
    const { id, bitmap, timestamp } = msg;
    try {
      if (!landmarker) throw new Error('HandLandmarker not initialised');
      const start = performance.now();
      const result = landmarker.detectForVideo(bitmap, timestamp);
      post({
        type: 'result',
        id,
        landmarks: result.landmarks,
        handedness: result.handedness,
        inferenceMs: performance.now() - start,
      });
    } catch (err) {
      post({ type: 'detect-error', id, message: err instanceof Error ? err.message : String(err) });
    } finally {
      bitmap.close();
    }
    return;
  }

  if (msg.type === 'close') {
    landmarker?.close();
    landmarker = null;
    self.close();
  }
};
