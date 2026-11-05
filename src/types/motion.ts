/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point2D {
  x: number; // normalized 0..1 (mirrored screen space)
  y: number; // normalized 0..1 (screen space)
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export type HandGesture =
  | 'OPEN_PALM'
  | 'FIST'
  | 'THUMBS_UP'
  | 'POINTING'
  | 'PEACE'
  | 'UNKNOWN';

export type MovementDirection =
  | 'STATIONARY'
  | 'LEFT'
  | 'RIGHT'
  | 'UP'
  | 'DOWN'
  | 'UP_LEFT'
  | 'UP_RIGHT'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT';

export interface TrackedHand {
  side: 'left' | 'right';
  detected: boolean;
  screenCenter: Point2D; // normalized screen position (0..1)
  pixelX: number; // in video/canvas pixels
  pixelY: number; // in video/canvas pixels
  percentX: number; // 0..100%
  percentY: number; // 0..100%
  movementSpeed: number; // px per second
  movementCategory: 'Idle' | 'Slow' | 'Moderate' | 'Fast';
  landmarks: LandmarkPoint[];
  inTargetArea: boolean;
  consecutiveDetectedFrames: number;
  lastSeenTimestamp: number;
  
  // Fast movement & interaction fields
  gesture: HandGesture;
  direction: MovementDirection;
  velocityX: number; // px per sec
  velocityY: number; // px per sec
  acceleration: number; // px per sec^2
  distanceMoved: number; // cumulative pixels
  isPredicted: boolean; // true during 1-6 frame motion blur interpolation
}

export type GameState = 
  | 'IDLE'
  | 'READY'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'PHOTO_COUNTDOWN'
  | 'GAME_OVER';

export type ChallengePhase = GameState | 'WAITING_HANDS' | 'HANDS_READY' | 'TEST_MODE' | 'LOADING';

export interface ScoreTierInfo {
  tier: 'NOVICE' | 'SPARKLER' | 'CHAKRI' | 'ROCKET' | 'DHAMAKA_MASTER';
  badgeTitle: string;
  badgeSubtitle: string;
  emoji: string;
  color: string;
}

export interface GameScoreState {
  score: number;
  multiplier: number;
  crackersBurst: number;
  maxSpeed: number;
  comboCount: number;
  punchCount: number;
  comboDurationSec: number;
  lastDeltaPoints?: number;
  lastDeltaLabel?: string;
  bombsBurst?: number;
  combosAwarded?: number;
  penaltyDeductions?: number;
  comboBonusPoints?: number;
  targetScore?: number;
  targetAchieved?: boolean;
}

export interface TargetAreaRect {
  xMin: number; // normalized 0..1
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface CrackerStats {
  crackersBurst: number;
  isCombo: boolean;
  comboMultiplier: number;
  activeParticles: number;
  lastCrackerStyle: string;
}

export interface SoundStats {
  isUnlocked: boolean;
  isMuted: boolean;
  masterVolume: number;
  effectVolume: number;
  musicVolume: number;
  activeVoices: number;
  lastSoundName: string;
}

export interface PerformanceMetrics {
  cameraFps: number;
  processingFps: number;
  renderFps: number;
  detectionMs: number;
  frameToResultMs: number;
  cameraDelayMs: number | null; // null when the camera driver reports no capture time
  cameraMode: string;
  trackerMode: string;
  gpuName: string;
  lowEndMode: boolean;
  trackingConfidence: number; // e.g. 0.88 (88%)
  leftSpeed: number;
  rightSpeed: number;
  leftDetected: boolean;
  rightDetected: boolean;
  leftGesture: HandGesture;
  rightGesture: HandGesture;
  trackingLossCount: number;
  leftTrackingLosses: number;
  rightTrackingLosses: number;
  maxSpeedRecorded: number;
  crackersBurst: number;
  isCombo: boolean;
  audioReady: boolean;
  lastSound: string;
  activeSounds: number;
  masterVolume: number;
  effectVolume: number;
  musicVolume: number;
  isMuted: boolean;
}

// Prepared structure for Diwali cracker mapping
export interface GameMappingPreview {
  crackerSpawnRate: 'IDLE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'OVERDRIVE';
  crackerAction: 'SPARK_SHOWER' | 'BURST_BOMB' | 'DOUBLE_ROCKET' | 'LASER_FIREWORK' | 'READY';
  isComboActive: boolean; // Both hands moving fast
  intensityPercent: number; // 0..100%
}
