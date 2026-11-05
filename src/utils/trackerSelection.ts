/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// These limits apply to the benchmark's empty test frame, which is cheaper than a real frame with
// hands in it: a real frame costs an extra model run per hand, so allow for about 2.5x.
// At or under this, the worker should give about 15+ detections a second on real frames.
export const WORKER_FAST_ENOUGH_MS = 25;
// Main-thread detection blocks drawing, so above this the whole game would visibly stutter.
export const MAIN_THREAD_MAX_MS = 40;
// Switching costs smoothness, so the main thread has to be clearly faster to be worth it.
export const MAIN_THREAD_MIN_GAIN = 0.7;

// The first runs compile GPU shaders, so they say nothing about real detection speed.
export const BENCHMARK_WARMUP_RUNS = 2;
export const BENCHMARK_RUNS = 6;

export type TrackerChoice = 'worker' | 'main';

export function medianMs(samples: number[]): number {
  if (samples.length === 0) return Infinity;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function chooseTracker(workerMs: number, mainMs: number): TrackerChoice {
  if (workerMs <= WORKER_FAST_ENOUGH_MS) return 'worker';
  const mainIsUsable = mainMs <= MAIN_THREAD_MAX_MS;
  const mainIsClearlyFaster = mainMs <= workerMs * MAIN_THREAD_MIN_GAIN;
  return mainIsUsable && mainIsClearlyFaster ? 'main' : 'worker';
}

/** Times a detector on a fixed test frame, ignoring the warm-up runs. */
export async function benchmarkDetector(
  detect: (frame: HTMLCanvasElement, timestamp: number) => Promise<number> | number
): Promise<number> {
  const frame = document.createElement('canvas');
  frame.width = 640;
  frame.height = 480;
  const ctx = frame.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 640, 480);
    gradient.addColorStop(0, '#2a2a33');
    gradient.addColorStop(1, '#c9c2b8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 480);
  }

  const samples: number[] = [];
  for (let run = 0; run < BENCHMARK_RUNS; run++) {
    const ms = await detect(frame, performance.now());
    if (run >= BENCHMARK_WARMUP_RUNS) samples.push(ms);
  }
  return medianMs(samples);
}
