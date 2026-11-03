/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Point2D,
  LandmarkPoint,
  TargetAreaRect,
  MovementDirection,
  HandGesture,
  GameMappingPreview,
} from '../types/motion';

/**
 * Standard MediaPipe anatomical hand skeleton connections
 */
export const HAND_BONES = {
  palm: [
    [0, 1],   // Wrist -> Thumb CMC
    [0, 5],   // Wrist -> Index MCP
    [0, 9],   // Wrist -> Middle MCP
    [0, 13],  // Wrist -> Ring MCP
    [0, 17],  // Wrist -> Pinky MCP
    [5, 9],   // Index MCP -> Middle MCP
    [9, 13],  // Middle MCP -> Ring MCP
    [13, 17], // Ring MCP -> Pinky MCP
  ] as [number, number][],

  thumb: [[1, 2], [2, 3], [3, 4]] as [number, number][],
  index: [[5, 6], [6, 7], [7, 8]] as [number, number][],
  middle: [[9, 10], [10, 11], [11, 12]] as [number, number][],
  ring: [[13, 14], [14, 15], [15, 16]] as [number, number][],
  pinky: [[17, 18], [18, 19], [19, 20]] as [number, number][],
};

// Target area boundaries on mirrored screen space (0 to 1) for Alignment Phase
export const LEFT_TARGET_AREA: TargetAreaRect = {
  xMin: 0.08,
  xMax: 0.44,
  yMin: 0.22,
  yMax: 0.82,
};

export const RIGHT_TARGET_AREA: TargetAreaRect = {
  xMin: 0.56,
  xMax: 0.92,
  yMin: 0.22,
  yMax: 0.82,
};

/**
 * Calculates stable palm center from landmarks (indices 0, 5, 9, 17)
 */
export function getPalmCenterScreen(landmarks: LandmarkPoint[]): Point2D {
  if (!landmarks || landmarks.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  const indices = [0, 5, 9, 17];
  let sumRawX = 0;
  let sumRawY = 0;

  for (const idx of indices) {
    const pt = landmarks[idx] || landmarks[0];
    sumRawX += pt.x;
    sumRawY += pt.y;
  }

  const rawX = sumRawX / indices.length;
  const rawY = sumRawY / indices.length;

  return {
    x: 1 - rawX, // Flip horizontally for mirrored selfie camera
    y: rawY,
  };
}

/**
 * Checks whether a screen point falls inside a normalized target rectangle
 */
export function isPointInsideRect(pt: Point2D, rect: TargetAreaRect): boolean {
  return (
    pt.x >= rect.xMin &&
    pt.x <= rect.xMax &&
    pt.y >= rect.yMin &&
    pt.y <= rect.yMax
  );
}

/**
 * Categorizes speed (px/sec) into human-readable level
 */
export function categorizeSpeed(speedPxPerSec: number): 'Idle' | 'Slow' | 'Moderate' | 'Fast' {
  if (speedPxPerSec < 40) return 'Idle';
  if (speedPxPerSec < 180) return 'Slow';
  if (speedPxPerSec < 450) return 'Moderate';
  return 'Fast';
}

/**
 * Calculates 8-direction movement vector from pixel velocities
 */
export function calculateMovementDirection(vx: number, vy: number): MovementDirection {
  const speed = Math.hypot(vx, vy);
  if (speed < 45) return 'STATIONARY';

  // Screen coordinates: positive Y is down, positive X is right
  const angle = Math.atan2(vy, vx) * (180 / Math.PI); // -180 to 180

  if (angle >= -22.5 && angle < 22.5) return 'RIGHT';
  if (angle >= 22.5 && angle < 67.5) return 'DOWN_RIGHT';
  if (angle >= 67.5 && angle < 112.5) return 'DOWN';
  if (angle >= 112.5 && angle < 157.5) return 'DOWN_LEFT';
  if (angle >= 157.5 || angle < -157.5) return 'LEFT';
  if (angle >= -157.5 && angle < -112.5) return 'UP_LEFT';
  if (angle >= -112.5 && angle < -67.5) return 'UP';
  if (angle >= -67.5 && angle < -22.5) return 'UP_RIGHT';

  return 'STATIONARY';
}

/**
 * Dead reckoning extrapolation for brief motion blur / occlusion (1-6 frames).
 * Shifts landmarks forward using velocity vector in raw coordinate space.
 */
export function extrapolateLandmarks(
  landmarks: LandmarkPoint[],
  vx: number, // px/s screen space
  vy: number, // px/s screen space
  dt: number,
  canvasWidth: number,
  canvasHeight: number,
  decay = 0.55
): LandmarkPoint[] {
  if (!landmarks || landmarks.length === 0) return [];

  // In mirrored view: screenX = 1 - rawX => rawDx = -(vx * dt) / canvasWidth
  const rawDx = (-(vx * dt) / Math.max(canvasWidth, 1)) * decay;
  const rawDy = ((vy * dt) / Math.max(canvasHeight, 1)) * decay;

  return landmarks.map((pt) => ({
    x: Math.max(0, Math.min(1, pt.x + rawDx)),
    y: Math.max(0, Math.min(1, pt.y + rawDy)),
    z: pt.z,
  }));
}

/**
 * Maps current motion metrics to future Diwali cracker action states
 */
export function evaluateGameMapping(
  leftSpeed: number,
  rightSpeed: number,
  leftGesture: HandGesture,
  rightGesture: HandGesture
): GameMappingPreview {
  const maxSpeed = Math.max(leftSpeed, rightSpeed);
  const avgSpeed = (leftSpeed + rightSpeed) / 2;

  let spawnRate: 'IDLE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'OVERDRIVE' = 'IDLE';
  if (maxSpeed >= 500) spawnRate = 'OVERDRIVE';
  else if (maxSpeed >= 320) spawnRate = 'HIGH';
  else if (maxSpeed >= 140) spawnRate = 'MEDIUM';
  else if (maxSpeed >= 40) spawnRate = 'LOW';

  let action: 'SPARK_SHOWER' | 'BURST_BOMB' | 'DOUBLE_ROCKET' | 'LASER_FIREWORK' | 'READY' = 'READY';
  if (leftGesture === 'FIST' || rightGesture === 'FIST') {
    action = 'BURST_BOMB';
  } else if (leftGesture === 'PEACE' || rightGesture === 'PEACE') {
    action = 'DOUBLE_ROCKET';
  } else if (leftGesture === 'POINTING' || rightGesture === 'POINTING') {
    action = 'LASER_FIREWORK';
  } else if (leftGesture === 'OPEN_PALM' || rightGesture === 'OPEN_PALM') {
    action = 'SPARK_SHOWER';
  }

  const isCombo = leftSpeed > 280 && rightSpeed > 280;
  const intensity = Math.min(Math.round((avgSpeed / 600) * 100), 100);

  return {
    crackerSpawnRate: spawnRate,
    crackerAction: action,
    isComboActive: isCombo,
    intensityPercent: intensity,
  };
}

const FINGERTIP_INDICES = new Set([4, 8, 12, 16, 20]);

/**
 * Draws real-time digital hand skeleton with full joints and gesture status.
 * Optimized with two-pass neon glow rendering:
 * - Pass 1: Luminous soft neon halo outline
 * - Pass 2: Brilliant hot-white core filament
 * - Glowing fingertip jewels and radiant palm energy core
 * High responsiveness with zero trailing delay.
 */
export function renderHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  side: 'left' | 'right',
  width: number,
  height: number,
  movementSpeed: number,
  _gesture: HandGesture = 'UNKNOWN',
  isPredicted = false
) {
  if (!landmarks || landmarks.length < 21) return;

  const isLeft = side === 'left';
  // Festive neon colors: Vivid Amber Gold for Left, Luminous Coral-Rose for Right
  const boneColor = isLeft ? '#F59E0B' : '#F43F5E';
  const coreColor = isLeft ? '#FFFDE7' : '#FFF0F5';
  const jointFill = isLeft ? '#FEF08A' : '#FECDD3';
  const jointStroke = isLeft ? '#D97706' : '#BE123C';

  // Dynamic glow based on movement speed
  const speedGlowFactor = Math.min(movementSpeed / 400, 1);
  const glowBlur = isPredicted ? 10 : 15 + speedGlowFactor * 8;

  // 1. CONSTRUCT COMPLETE BONE SKELETON PATH (BATCHED)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  // Palm connections
  for (const [startIdx, endIdx] of HAND_BONES.palm) {
    const p1 = landmarks[startIdx];
    const p2 = landmarks[endIdx];
    if (!p1 || !p2) continue;
    ctx.moveTo((1 - p1.x) * width, p1.y * height);
    ctx.lineTo((1 - p2.x) * width, p2.y * height);
  }

  // Finger connections
  const fingerChains = [
    HAND_BONES.thumb,
    HAND_BONES.index,
    HAND_BONES.middle,
    HAND_BONES.ring,
    HAND_BONES.pinky,
  ];
  for (const chain of fingerChains) {
    for (const [startIdx, endIdx] of chain) {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];
      if (!p1 || !p2) continue;
      ctx.moveTo((1 - p1.x) * width, p1.y * height);
      ctx.lineTo((1 - p2.x) * width, p2.y * height);
    }
  }

  // PASS 1: VIBRANT NEON HALO
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = isPredicted ? (isLeft ? '#FBBF24' : '#FB7185') : boneColor;
  ctx.shadowColor = boneColor;
  ctx.shadowBlur = glowBlur;
  ctx.stroke();

  // PASS 2: CRISP LUMINESCENT CORE FILAMENT
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = coreColor;
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();

  // 2. DRAW CIRCULAR LANDMARK POINTS AT ALL 21 JOINTS
  ctx.save();
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const x = (1 - lm.x) * width;
    const y = lm.y * height;
    const isTip = FINGERTIP_INDICES.has(i);
    const isWrist = i === 0;

    if (isTip) {
      // Fingertip radiant jewel
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = boneColor;
      ctx.shadowColor = boneColor;
      ctx.shadowBlur = 10;
      ctx.fill();

      // Bright white spark center
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    } else if (isWrist) {
      // Wrist base anchor node
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = jointFill;
      ctx.shadowColor = boneColor;
      ctx.shadowBlur = 8;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = boneColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else {
      // Knuckle and finger joints
      ctx.beginPath();
      ctx.arc(x, y, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = jointFill;
      ctx.shadowColor = boneColor;
      ctx.shadowBlur = 6;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 3.8, 0, Math.PI * 2);
      ctx.strokeStyle = jointStroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  ctx.restore();

  // 3. Radiant Palm Energy Aura
  ctx.save();
  const palm = getPalmCenterScreen(landmarks);
  const px = palm.x * width;
  const py = palm.y * height;

  const palmRad = 18 + speedGlowFactor * 12;
  const palmGrad = ctx.createRadialGradient(px, py, 2, px, py, palmRad);
  if (isLeft) {
    palmGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    palmGrad.addColorStop(0.3, 'rgba(254, 240, 138, 0.75)');
    palmGrad.addColorStop(0.65, 'rgba(245, 158, 11, 0.35)');
    palmGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  } else {
    palmGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    palmGrad.addColorStop(0.3, 'rgba(254, 205, 211, 0.75)');
    palmGrad.addColorStop(0.65, 'rgba(244, 63, 94, 0.35)');
    palmGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
  }
  ctx.beginPath();
  ctx.arc(px, py, palmRad, 0, Math.PI * 2);
  ctx.fillStyle = palmGrad;
  ctx.fill();

  // Central bright spark core
  ctx.beginPath();
  ctx.arc(px, py, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = boneColor;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();
}

export interface HandTrailPoint {
  x: number;
  y: number;
  time: number;
  speed: number;
}

/**
 * Renders smooth, light glowing motion ribbons following hand movements in real time.
 * Tapered and refined to stay responsive without cluttering the screen.
 */
export function renderHandTrail(
  ctx: CanvasRenderingContext2D,
  trail: HandTrailPoint[],
  side: 'left' | 'right'
) {
  if (!trail || trail.length < 2) return;

  const isLeft = side === 'left';
  const len = trail.length;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const glowColor = isLeft ? '#F59E0B' : '#F43F5E';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;

  for (let i = 0; i < len - 1; i++) {
    const pt1 = trail[i];
    const pt2 = trail[i + 1];
    const t = (i + 1) / len; // 0 (oldest) to 1 (newest)
    const alpha = Math.min(t * 0.7, 0.75); // light and elegant
    const width = 2.5 + t * 5.5; // lighter tapered width (max ~8px)

    ctx.beginPath();
    ctx.moveTo(pt1.x, pt1.y);
    ctx.lineTo(pt2.x, pt2.y);
    ctx.strokeStyle = isLeft
      ? `rgba(251, 191, 36, ${alpha})`
      : `rgba(244, 63, 94, ${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Renders a small, smooth, clearly visible tracking marker for the hand centre during active gameplay.
 * Designed with a crisp luminous white center, saturated glowing core, subtle outer reticle ring, and soft ambient aura.
 * Replaces detailed hand skeletons and finger landmarks during gameplay for a clean, focused arcade experience.
 */
interface FlameParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  hue: number;
  wobbleSpeed: number;
}

interface FlameTrackerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tilt: number;
  alpha: number;
  initialized: boolean;
  lastSeenTime: number;
}

const flameParticles: { left: FlameParticle[]; right: FlameParticle[] } = {
  left: [],
  right: []
};

const flameTrackers: { left: FlameTrackerState; right: FlameTrackerState } = {
  left: { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, alpha: 0, initialized: false, lastSeenTime: 0 },
  right: { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, alpha: 0, initialized: false, lastSeenTime: 0 }
};

let particleIdCounter = 0;

/**
 * Resets hand flame interpolation and ember particle state (e.g. on game phase transition).
 */
export function resetHandFlameState(): void {
  flameTrackers.left.initialized = false;
  flameTrackers.left.alpha = 0;
  flameTrackers.right.initialized = false;
  flameTrackers.right.alpha = 0;
  flameParticles.left = [];
  flameParticles.right = [];
}

/**
 * Returns the instantaneous visual center and activity of the hand flame.
 * Allows collision detection in BombGameOverlay to align 1:1 with the visual fire position.
 */
export function getHandFlamePosition(side: 'left' | 'right'): { x: number; y: number; active: boolean } {
  const tracker = flameTrackers[side];
  return {
    x: tracker.x,
    y: tracker.y,
    active: tracker.initialized && tracker.alpha > 0.1 && (performance.now() - tracker.lastSeenTime < 250)
  };
}

/**
 * Draws an organic multi-tongued fire silhouette with curved bezier flanks,
 * distinct left and right licking tongues, a tall central tongue, and organic clefts.
 */
function drawFlameTongues(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  baseY: number,
  tipLeftX: number,
  tipLeftY: number,
  tipCenterX: number,
  tipCenterY: number,
  tipRightX: number,
  tipRightY: number,
  cleftLeftX: number,
  cleftLeftY: number,
  cleftRightX: number,
  cleftRightY: number
) {
  ctx.beginPath();
  // Start at base right
  ctx.moveTo(w * 0.45, baseY);

  // Soft rounded base under palm center
  ctx.bezierCurveTo(
    w * 0.25, baseY + 4,
    -w * 0.25, baseY + 4,
    -w * 0.45, baseY
  );

  // Outer flank of left tongue
  ctx.bezierCurveTo(
    -w * 0.78, baseY - 6,
    -w * 0.88, tipLeftY * 0.45,
    tipLeftX, tipLeftY
  );

  // Inner flank of left tongue down into left cleft
  ctx.bezierCurveTo(
    tipLeftX * 0.8 + cleftLeftX * 0.2, tipLeftY * 0.7 + cleftLeftY * 0.3,
    cleftLeftX - 3, cleftLeftY - 5,
    cleftLeftX, cleftLeftY
  );

  // Left flank of central main tongue rising up
  ctx.bezierCurveTo(
    cleftLeftX + 3, cleftLeftY - 8,
    tipCenterX - w * 0.28, tipCenterY * 0.55,
    tipCenterX, tipCenterY
  );

  // Right flank of central main tongue descending into right cleft
  ctx.bezierCurveTo(
    tipCenterX + w * 0.28, tipCenterY * 0.55,
    cleftRightX - 3, cleftRightY - 8,
    cleftRightX, cleftRightY
  );

  // Inner flank of right tongue rising to right tip
  ctx.bezierCurveTo(
    cleftRightX + 3, cleftRightY - 5,
    tipRightX * 0.8 + cleftRightX * 0.2, tipRightY * 0.7 + cleftRightY * 0.3,
    tipRightX, tipRightY
  );

  // Outer flank of right tongue sweeping down to base right
  ctx.bezierCurveTo(
    w * 0.88, tipRightY * 0.45,
    w * 0.78, baseY - 6,
    w * 0.45, baseY
  );

  ctx.closePath();
}

/**
 * Upgraded, highly aesthetic animated fire-flame effect for hand tracking during active gameplay.
 * Features:
 * - ~45-50% larger proportion for high visibility and arcade punch
 * - Organic multi-tongued fire silhouette (curved licking tongues & undulating central tip)
 * - 4-layer gradient depth: white-hot core, golden yellow inner, vivid orange middle, ruby red tips
 * - Multi-stage soft bloom and ambient diya radiance
 * - Upward convective dancing embers with color cooling
 * - Adaptive movement interpolation (silky 60fps tracking without webcam jitter or lag)
 * - Proportional centering on hand palm center with zero hitbox inflation
 */
export function renderHandFlame(
  ctx: CanvasRenderingContext2D,
  rawX: number,
  rawY: number,
  side: 'left' | 'right',
  speed = 0,
  vx = 0,
  vy = 0
) {
  const now = performance.now();
  const tracker = flameTrackers[side];

  // 1. Smooth Movement Interpolation: filters webcam step-jitter and guarantees buttery 60fps motion
  if (!tracker.initialized || now - tracker.lastSeenTime > 200) {
    tracker.x = rawX;
    tracker.y = rawY;
    tracker.vx = vx;
    tracker.vy = vy;
    tracker.tilt = 0;
    tracker.alpha = 0.2;
    tracker.initialized = true;
  } else {
    // 0.44 lerp factor delivers immediate responsive feel with silky noise rejection
    tracker.x += (rawX - tracker.x) * 0.44;
    tracker.y += (rawY - tracker.y) * 0.44;
    tracker.vx += (vx - tracker.vx) * 0.32;
    tracker.vy += (vy - tracker.vy) * 0.32;

    // Organic velocity tilt (leaning gracefully opposite to rapid hand sweep direction)
    const targetTilt = Math.max(-0.45, Math.min(0.45, -tracker.vx * 0.00065));
    tracker.tilt += (targetTilt - tracker.tilt) * 0.25;

    // Smooth fade in
    tracker.alpha = Math.min(1.0, tracker.alpha + 0.15);
  }
  tracker.lastSeenTime = now;

  // 2. Harmonic Multi-Frequency Oscillations for organic non-repeating flame dance
  const phase = side === 'left' ? 0 : 3.14159;
  const t1 = now * 0.007 + phase;
  const t2 = now * 0.017 + phase * 1.3;
  const t3 = now * 0.031 + phase * 0.7;
  const t4 = now * 0.048 + phase * 1.7;

  // Dynamic tip sways for multiple tongues
  const swayCenter = Math.sin(t1) * 5.2 + Math.sin(t3) * 2.6;
  const swayLeft = Math.cos(t2) * 5.8 + Math.sin(t4) * 2.2;
  const swayRight = Math.sin(t2 + 1.8) * 5.8 + Math.cos(t3) * 2.2;

  // Height breathing factors for tongues
  const heightFactorCenter = 0.94 + Math.sin(t2) * 0.08 + Math.cos(t4) * 0.04;
  const heightFactorLeft = 0.92 + Math.cos(t1 * 1.5) * 0.09 + Math.sin(t3) * 0.05;
  const heightFactorRight = 0.93 + Math.sin(t1 * 1.4 + 1.2) * 0.09 + Math.cos(t3) * 0.05;

  // Proportional dimensions: ~45-50% larger than earlier prototype
  const flameH = 56 + Math.min(speed * 0.035, 14);
  const flameW = 34 + Math.min(speed * 0.012, 5);

  ctx.save();
  ctx.globalAlpha = tracker.alpha;
  ctx.translate(tracker.x, tracker.y);
  ctx.rotate(tracker.tilt);

  // --------------------------------------------------------------------------
  // Layer 0: Ambient Diya Glow & Soft Bloom (Drawn behind flames)
  // --------------------------------------------------------------------------
  const auraRadius = flameH * 1.35;
  const auraGrad = ctx.createRadialGradient(0, -flameH * 0.35, 4, 0, -flameH * 0.35, auraRadius);
  auraGrad.addColorStop(0, 'rgba(255, 185, 45, 0.48)');
  auraGrad.addColorStop(0.35, 'rgba(249, 115, 22, 0.24)');
  auraGrad.addColorStop(0.70, 'rgba(220, 38, 38, 0.08)');
  auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(0, -flameH * 0.35, auraRadius, 0, Math.PI * 2);
  ctx.fillStyle = auraGrad;
  ctx.fill();

  // Core Solar Radiance (concentrated warm base glow)
  const coreGlow = ctx.createRadialGradient(0, -flameH * 0.18, 2, 0, -flameH * 0.18, flameH * 0.55);
  coreGlow.addColorStop(0, 'rgba(255, 255, 220, 0.55)');
  coreGlow.addColorStop(0.5, 'rgba(255, 160, 20, 0.25)');
  coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(0, -flameH * 0.18, flameH * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = coreGlow;
  ctx.fill();

  // --------------------------------------------------------------------------
  // Layer 1: Outer Multi-Tongue Silhouette (Deep Ruby Red to Fiery Orange)
  // --------------------------------------------------------------------------
  const w1 = flameW;
  const h1 = flameH;
  const tipL1X = -w1 * 0.58 + swayLeft;
  const tipL1Y = -h1 * 0.65 * heightFactorLeft;
  const tipC1X = swayCenter;
  const tipC1Y = -h1 * 1.02 * heightFactorCenter;
  const tipR1X = w1 * 0.58 + swayRight;
  const tipR1Y = -h1 * 0.68 * heightFactorRight;
  const cleftL1X = -w1 * 0.24 + swayCenter * 0.3;
  const cleftL1Y = -h1 * 0.40;
  const cleftR1X = w1 * 0.24 + swayCenter * 0.3;
  const cleftR1Y = -h1 * 0.42;

  drawFlameTongues(
    ctx,
    w1,
    h1,
    5,
    tipL1X,
    tipL1Y,
    tipC1X,
    tipC1Y,
    tipR1X,
    tipR1Y,
    cleftL1X,
    cleftL1Y,
    cleftR1X,
    cleftR1Y
  );

  const grad1 = ctx.createLinearGradient(0, 5, tipC1X, tipC1Y);
  grad1.addColorStop(0, '#991B1B');    // Deep wine crimson base
  grad1.addColorStop(0.25, '#DC2626'); // Vivid ruby red
  grad1.addColorStop(0.65, '#EA580C'); // Fiery orange
  grad1.addColorStop(1, '#F97316');    // Vibrant flame tip

  ctx.fillStyle = grad1;
  ctx.fill();

  // --------------------------------------------------------------------------
  // Layer 2: Middle Vivid Orange to Golden Amber Tongues (~76% scale)
  // --------------------------------------------------------------------------
  const w2 = flameW * 0.76;
  const h2 = flameH * 0.78;
  const tipL2X = -w2 * 0.58 + swayLeft * 0.75;
  const tipL2Y = -h2 * 0.64 * heightFactorLeft;
  const tipC2X = swayCenter * 0.75;
  const tipC2Y = -h2 * 1.0 * heightFactorCenter;
  const tipR2X = w2 * 0.58 + swayRight * 0.75;
  const tipR2Y = -h2 * 0.66 * heightFactorRight;
  const cleftL2X = -w2 * 0.24 + swayCenter * 0.25;
  const cleftL2Y = -h2 * 0.39;
  const cleftR2X = w2 * 0.24 + swayCenter * 0.25;
  const cleftR2Y = -h2 * 0.40;

  drawFlameTongues(
    ctx,
    w2,
    h2,
    3.5,
    tipL2X,
    tipL2Y,
    tipC2X,
    tipC2Y,
    tipR2X,
    tipR2Y,
    cleftL2X,
    cleftL2Y,
    cleftR2X,
    cleftR2Y
  );

  const grad2 = ctx.createLinearGradient(0, 3.5, tipC2X, tipC2Y);
  grad2.addColorStop(0, '#DC2626');
  grad2.addColorStop(0.35, '#F97316');
  grad2.addColorStop(0.75, '#FBBF24');
  grad2.addColorStop(1, '#FDE047');

  ctx.fillStyle = grad2;
  ctx.fill();

  // --------------------------------------------------------------------------
  // Layer 3: Inner Golden Yellow Tongues (~52% scale)
  // --------------------------------------------------------------------------
  const w3 = flameW * 0.52;
  const h3 = flameH * 0.55;
  const tipL3X = -w3 * 0.56 + swayLeft * 0.5;
  const tipL3Y = -h3 * 0.62 * heightFactorLeft;
  const tipC3X = swayCenter * 0.5;
  const tipC3Y = -h3 * 0.98 * heightFactorCenter;
  const tipR3X = w3 * 0.56 + swayRight * 0.5;
  const tipR3Y = -h3 * 0.64 * heightFactorRight;
  const cleftL3X = -w3 * 0.22;
  const cleftL3Y = -h3 * 0.38;
  const cleftR3X = w3 * 0.22;
  const cleftR3Y = -h3 * 0.39;

  drawFlameTongues(
    ctx,
    w3,
    h3,
    2,
    tipL3X,
    tipL3Y,
    tipC3X,
    tipC3Y,
    tipR3X,
    tipR3Y,
    cleftL3X,
    cleftL3Y,
    cleftR3X,
    cleftR3Y
  );

  const grad3 = ctx.createLinearGradient(0, 2, tipC3X, tipC3Y);
  grad3.addColorStop(0, '#F59E0B');
  grad3.addColorStop(0.45, '#FACC15');
  grad3.addColorStop(0.85, '#FEF08A');
  grad3.addColorStop(1, '#FFFFFF');

  ctx.fillStyle = grad3;
  ctx.fill();

  // --------------------------------------------------------------------------
  // Layer 4: Bright White-Yellow Incandescent Core (~28% scale)
  // --------------------------------------------------------------------------
  const wCore = flameW * 0.28;
  const hCore = flameH * 0.35;
  const tipCoreX = swayCenter * 0.3;
  const tipCoreY = -hCore;

  ctx.beginPath();
  ctx.moveTo(0, 1.5);
  ctx.bezierCurveTo(
    -wCore * 0.8, 0.5,
    -wCore * 0.6, -hCore * 0.45,
    tipCoreX, tipCoreY
  );
  ctx.bezierCurveTo(
    wCore * 0.6, -hCore * 0.45,
    wCore * 0.8, 0.5,
    0, 1.5
  );
  ctx.closePath();

  const coreGrad = ctx.createLinearGradient(0, 1.5, tipCoreX, tipCoreY);
  coreGrad.addColorStop(0, '#FDE047');
  coreGrad.addColorStop(0.45, '#FEF08A');
  coreGrad.addColorStop(1, '#FFFFFF');

  ctx.fillStyle = coreGrad;
  ctx.fill();

  // --------------------------------------------------------------------------
  // Layer 5: Diya Interaction Focal Bead Point at (0, 0)
  // --------------------------------------------------------------------------
  // Subtle golden rim
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 230, 100, 0.4)';
  ctx.fill();

  // Brilliant white diamond center point
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // --------------------------------------------------------------------------
  // Layer 6: Rising Dancing Ember Sparks (Upward convective turbulence)
  // --------------------------------------------------------------------------
  const pList = flameParticles[side];
  for (let i = pList.length - 1; i >= 0; i--) {
    const p = pList[i];
    p.x += p.vx + Math.sin(now * p.wobbleSpeed + p.id) * 0.75;
    p.y += p.vy;
    p.life -= p.decay;
    if (p.life <= 0) {
      pList.splice(i, 1);
      continue;
    }

    // Color cools from yellow-gold (hue 48) to ember orange (hue 22) to red (hue 5)
    const currentHue = Math.max(5, p.hue * (0.35 + p.life * 0.65));
    const currentAlpha = p.life * 0.95;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.35 + p.life * 0.65), 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${currentHue}, 100%, 65%, ${currentAlpha})`;
    ctx.fill();
  }

  // Spawn new sparks to maintain a lively convective cloud of 12-16 embers
  if (pList.length < 16 && Math.random() < 0.7) {
    pList.push({
      id: ++particleIdCounter,
      x: swayCenter * 0.5 + (Math.random() - 0.5) * (flameW * 0.7),
      y: -flameH * (0.55 + Math.random() * 0.45),
      vx: (Math.random() - 0.5) * 1.4,
      vy: -(1.8 + Math.random() * 2.2),
      life: 1.0,
      decay: 0.024 + Math.random() * 0.035,
      size: 1.4 + Math.random() * 1.8,
      hue: 45 + Math.floor(Math.random() * 18),
      wobbleSpeed: 0.012 + Math.random() * 0.015
    });
  }

  ctx.restore();
}

/**
 * Backward-compatible wrapper for renderHandFlame.
 */
export function renderHandCenterMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: 'left' | 'right',
  speed = 0,
  vx = 0,
  vy = 0
) {
  renderHandFlame(ctx, x, y, side, speed, vx, vy);
}
