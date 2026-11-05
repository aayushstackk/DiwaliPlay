/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HandDetectionResult,
  HandWorkerInitOptions,
  HandWorkerRequest,
  HandWorkerResponse,
} from './handTrackingWorkerProtocol';

const INIT_TIMEOUT_MS = 30000;
// Generous: a stalled worker is detected, but a slow low-end GPU frame isn't treated as failure
const DETECT_TIMEOUT_MS = 8000;

interface PendingDetect {
  resolve: (result: HandDetectionResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Main-thread handle for the hand-tracking worker.
 * Use `HandTrackingWorkerClient.create()`; it rejects if the worker can't load
 * MediaPipe, so callers can fall back to main-thread detection.
 */
export class HandTrackingWorkerClient {
  public delegate: 'GPU' | 'CPU' = 'GPU';
  public rendererName = '';
  /** Last worker-side inference time in ms (for diagnostics). */
  public lastInferenceMs = 0;
  /** Set when the worker crashes or a detection fails; callers should fall back. */
  public failed = false;

  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingDetect>();

  private constructor(worker: Worker) {
    this.worker = worker;
  }

  /** Whether this browser can run detection in a worker at all. */
  static isSupported(): boolean {
    return (
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap === 'function'
    );
  }

  static create(options: HandWorkerInitOptions): Promise<HandTrackingWorkerClient> {
    const worker = new Worker(new URL('../workers/handTracking.worker.ts', import.meta.url), {
      type: 'module',
      name: 'hand-tracking',
    });
    const client = new HandTrackingWorkerClient(worker);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error('Hand-tracking worker init timed out'));
      }, INIT_TIMEOUT_MS);

      worker.onerror = (event) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message || 'Hand-tracking worker failed to load'));
      };

      worker.onmessage = (event: MessageEvent<HandWorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          clearTimeout(timer);
          client.delegate = msg.delegate;
          client.rendererName = msg.rendererName;
          client.attachRuntimeHandlers();
          resolve(client);
        } else if (msg.type === 'init-error') {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(msg.message));
        }
      };

      client.send({ type: 'init', options });
    });
  }

  /** Sends a camera frame for detection. The bitmap is transferred (not copied). */
  detect(bitmap: ImageBitmap, timestamp: number): Promise<HandDetectionResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Hand detection timed out'));
      }, DETECT_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ type: 'detect', id, bitmap, timestamp }, [bitmap]);
    });
  }

  close(): void {
    this.rejectAll(new Error('Hand-tracking worker closed'));
    try {
      this.send({ type: 'close' });
    } catch {
      // ignore
    }
    // Give the worker a moment to release GPU resources, then make sure it's gone
    setTimeout(() => this.worker.terminate(), 500);
  }

  private attachRuntimeHandlers() {
    this.worker.onmessage = (event: MessageEvent<HandWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'result') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        this.lastInferenceMs = msg.inferenceMs;
        p.resolve({ landmarks: msg.landmarks, handedness: msg.handedness });
      } else if (msg.type === 'detect-error') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    };
    this.worker.onerror = (event) => {
      this.failed = true;
      this.rejectAll(new Error(event.message || 'Hand-tracking worker crashed'));
    };
  }

  private rejectAll(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private send(msg: HandWorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }
}

export type TrackingPreference = 'auto' | 'worker' | 'main';

/**
 * By default the tracker is picked by benchmark on each load. Force one for A/B testing with
 * `?tracking=main|worker` in the URL, or localStorage `diwali_tracking_mode` = `main`.
 */
export function getTrackingPreference(): TrackingPreference {
  if (!HandTrackingWorkerClient.isSupported()) return 'main';
  try {
    const param = new URLSearchParams(window.location.search).get('tracking');
    if (param === 'main' || param === 'worker') return param;
    if (window.localStorage.getItem('diwali_tracking_mode') === 'main') return 'main';
  } catch {
    // ignore storage/URL access errors
  }
  return 'auto';
}
