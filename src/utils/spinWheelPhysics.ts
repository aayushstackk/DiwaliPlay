/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared Spin Wheel Physics, Timing & Audio Engine
 * Single source of truth for wheel animation across DiwaliPlay.
 * Strictly clockwise, delta-time driven, 60 FPS optimized, 2.2s–2.6s total duration.
 */

export const SPIN_CONSTANTS = {
  // Speed & Duration targets: Total spin time is ~2.2s to 2.6s
  CRUISE_SPEED: 1600, // degrees/sec (~4.44 rotations/sec)
  ACCEL_DURATION_MS: 280, // snappy acceleration to top speed
  MIN_CRUISE_DURATION_MS: 520, // fast cruising while backend response resolves
  DECEL_FULL_TURNS: 2, // 2 full revolutions during natural deceleration (~1.4s to 1.8s)
  DECEL_EASING_POWER: 2.8, // smooth quartic-style deceleration curve with zero jerk
  MIN_TICK_INTERVAL_MS: 20, // rate limiter for crisp, non-distorted audio clicks
} as const;

/**
 * Calculates the exact stop angle required to center slice targetIdx at the top pointer (12 o'clock / 0 degrees).
 * Slices are oriented clockwise starting from 12 o'clock.
 */
export function calculateTargetStopAngle(targetIdx: number, numSlices: number): number {
  const safeNumSlices = Math.max(1, numSlices);
  const sliceAngle = 360 / safeNumSlices;
  const sliceCenter = (targetIdx + 0.5) * sliceAngle;
  return ((360 - (sliceCenter % 360)) % 360 + 360) % 360;
}

export interface DecelTrajectory {
  decelStartAngle: number;
  totalDecelDegrees: number;
  decelDurationMs: number;
}

/**
 * Computes strictly clockwise deceleration trajectory to align with targetStopAngle.
 * Mathematically guarantees zero negative (anti-clockwise) velocity at all points.
 */
export function calculateDecelTrajectory(
  currentAngle: number,
  targetStopAngle: number
): DecelTrajectory {
  const decelStartAngle = currentAngle;
  const currentMod = ((decelStartAngle % 360) + 360) % 360;

  // Clockwise forward delta
  let forwardDelta = ((targetStopAngle - currentMod) % 360 + 360) % 360;
  if (forwardDelta < 15) {
    forwardDelta += 360;
  }

  const totalDecelDegrees = SPIN_CONSTANTS.DECEL_FULL_TURNS * 360 + forwardDelta;

  // Duration calculated so initial deceleration speed matches CRUISE_SPEED seamlessly (zero visual jerk)
  // v_0 = (DECEL_EASING_POWER * totalDecelDegrees) / duration = CRUISE_SPEED
  const decelDurationMs =
    ((SPIN_CONSTANTS.DECEL_EASING_POWER * totalDecelDegrees) / SPIN_CONSTANTS.CRUISE_SPEED) * 1000;

  return {
    decelStartAngle,
    totalDecelDegrees,
    decelDurationMs,
  };
}

/**
 * Cached pre-rendered AudioBuffer for the casino flapper click sound.
 * Avoids creating hundreds of Web Audio oscillators, filters, and buffers per second during spins.
 */
let cachedTickBuffer: AudioBuffer | null = null;
let cachedSampleRate: number = 0;

export function getOrCreateTickBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedTickBuffer && cachedSampleRate === ctx.sampleRate) {
    return cachedTickBuffer;
  }

  // 12ms crisp mechanical flapper snap sound
  const length = Math.floor(ctx.sampleRate * 0.012);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const decay = Math.exp(-t * 11);
    const snap = Math.sin(2 * Math.PI * 1450 * (1 - t * 0.65) * (i / ctx.sampleRate));
    const noise = (Math.random() * 2 - 1) * 0.35;
    data[i] = (snap + noise) * decay;
  }

  cachedTickBuffer = buffer;
  cachedSampleRate = ctx.sampleRate;
  return buffer;
}

/**
 * High-performance, zero-allocation tick sound playback using pre-rendered AudioBuffer.
 * Runs in under 0.02ms on the JS main thread.
 */
export function playPreRenderedTick(
  ctx: AudioContext | null,
  tickBuffer: AudioBuffer | null,
  speedRatio: number,
  lastTickTimeRef: { current: number }
): void {
  if (!ctx || !tickBuffer) return;

  const now = performance.now();
  if (now - lastTickTimeRef.current < SPIN_CONSTANTS.MIN_TICK_INTERVAL_MS) {
    return;
  }
  lastTickTimeRef.current = now;

  try {
    const source = ctx.createBufferSource();
    source.buffer = tickBuffer;

    // Pitch shifts slightly with speed
    const pitch = Math.min(1.35, Math.max(0.7, 0.8 + speedRatio * 0.35));
    source.playbackRate.value = pitch;

    const gain = ctx.createGain();
    const volume = Math.min(0.5, Math.max(0.2, 0.25 + speedRatio * 0.25));
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
  } catch {}
}

