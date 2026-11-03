/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BombConfig, BombGameSettings } from '../types/backend';
import { TrackedHand } from '../types/motion';
import { CartoonBombSvg } from './CartoonBombSvg';
import { DEFAULT_BOMB_CONFIGS, DEFAULT_BOMB_SETTINGS } from '../utils/bombDefaults';
import { getHandFlamePosition } from '../utils/motionMath';

export interface BombGameOverlayProps {
  isActive: boolean;
  leftHand: TrackedHand;
  rightHand: TrackedHand;
  getLiveTrackedHands?: () => { left: TrackedHand; right: TrackedHand };
  bombConfigs: BombConfig[];
  settings: BombGameSettings;
  isTouchMode?: boolean;
  onBombTouch: (bomb: BombConfig, x: number, y: number) => void;
  onPlayBurstSound: (bomb: BombConfig) => void;
  onTriggerParticles: (x: number, y: number, color: string) => void;
}

interface BombAscentSpark {
  id: string;
  x: number;
  y: number;
  time: number;
  size: number;
}

interface LaunchedBombEntity {
  uid: string;
  config: BombConfig;
  x: number;
  y: number;
  prevX: number; // for swept continuous collision detection at extreme speeds
  prevY: number; // for swept continuous collision detection at extreme speeds
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  radius: number;
  scale: number;
  launchTime: number;
  isBursting: boolean;
  burstTime: number;
  burstScale: number;
  trail: BombAscentSpark[]; // short trail of sparks/glow during high-speed ascent
  lastTrailTime?: number; // throttles spark creation to reduce DOM churn
}

interface FloatingScorePopup {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  isPenalty: boolean;
  createdAt: number;
}

interface LaunchMortarDef {
  id: number;
  pctX: number; // percentage across bottom (0 to 1)
  angleDeg: number; // tilt angle of the tube
  lastFiredTime: number; // timestamp when last shot fired (for kickback physics)
  shotCounter: number; // number of shots fired from this tube (for alternating spark patterns)
}

interface PendingBombLaunch {
  id: string;
  mortarIdx: number;
  scheduledTime: number; // performance.now() timestamp
  burstIndex: number; // 0, 1, or 2
  totalInBurst: number; // 1, 2, or 3
  apexOffsetY: number; // height variation
  vxAngleOffset: number; // horizontal spread
}

const INITIAL_MORTARS: LaunchMortarDef[] = [
  { id: 0, pctX: 0.16, angleDeg: 14, lastFiredTime: 0, shotCounter: 0 },
  { id: 1, pctX: 0.33, angleDeg: 7, lastFiredTime: 0, shotCounter: 0 },
  { id: 2, pctX: 0.50, angleDeg: 0, lastFiredTime: 0, shotCounter: 0 },
  { id: 3, pctX: 0.67, angleDeg: -7, lastFiredTime: 0, shotCounter: 0 },
  { id: 4, pctX: 0.84, angleDeg: -14, lastFiredTime: 0, shotCounter: 0 },
];

// High-octane arcade gravity: 2600 px/s²
// Upward launch velocity vy0 reaches ~1600–2000 px/s, shooting the bomb upward like a high-pressure cannonball.
// The bomb reaches near the top in ~0.55–0.60s and plunges down fast with no floatiness.
const BASE_GRAVITY = 2600;

/**
 * Calculates snappy gun-like kickback recoil, barrel compression, and muzzle flash.
 * Instantaneous ~18px punch down in 0..25ms, followed by spring-damped oscillation back to rest.
 */
function getMortarRecoilTransform(now: number, lastFired: number, baseAngleDeg: number) {
  const elapsed = now - lastFired;
  if (lastFired === 0 || elapsed < 0 || elapsed > 240) {
    return {
      kickY: 0,
      scaleY: 1.0,
      scaleX: 1.0,
      extraRot: 0,
      isFlashing: false,
      flashScale: 0,
      smokeProgress: -1,
    };
  }

  let kickY = 0;
  let scaleY = 1.0;
  let scaleX = 1.0;
  let extraRot = 0;

  if (elapsed < 24) {
    // Sharp, instantaneous backward/downward punch
    const t = elapsed / 24;
    const easePunch = Math.sin(t * (Math.PI / 2));
    kickY = 18 * easePunch;
    scaleY = 1.0 - 0.16 * easePunch; // mechanical barrel compression
    scaleX = 1.0 + 0.10 * easePunch; // mechanical barrel bulge
    extraRot = (baseAngleDeg >= 0 ? 1 : -1) * 3.5 * easePunch;
  } else {
    // Snappy spring-like recovery and subtle vibration
    const t = (elapsed - 24) / 196; // 0 to 1
    const damp = Math.exp(-4.2 * t);
    const wave = Math.cos(t * Math.PI * 3.5);
    kickY = 18 * damp * wave;
    scaleY = 1.0 - 0.16 * damp * wave;
    scaleX = 1.0 + 0.10 * damp * wave;
    extraRot = (baseAngleDeg >= 0 ? 1 : -1) * 3.5 * damp * wave;
  }

  // Intense muzzle flash in first 65ms
  const isFlashing = elapsed < 65;
  const flashScale = isFlashing ? Math.max(0, 1 - (elapsed / 65) * 0.35) : 0;

  // Expanding smoke puff drifting upward from 10ms to 280ms
  const smokeProgress = elapsed >= 10 && elapsed <= 280 ? (elapsed - 10) / 270 : -1;

  return { kickY, scaleY, scaleX, extraRot, isFlashing, flashScale, smokeProgress };
}

/**
 * Distance from point (px, py) to line segment (x1, y1) -> (x2, y2).
 * Prevents high-speed projectile tunneling through the tracked hand between frames.
 */
function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 0.0001) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export const BombGameOverlay: React.FC<BombGameOverlayProps> = ({
  isActive,
  leftHand,
  rightHand,
  getLiveTrackedHands,
  bombConfigs,
  settings,
  isTouchMode = false,
  onBombTouch,
  onPlayBurstSound,
  onTriggerParticles,
}) => {
  const [activeBombs, setActiveBombs] = useState<LaunchedBombEntity[]>([]);
  const [scorePopups, setScorePopups] = useState<FloatingScorePopup[]>([]);
  const mortarsRef = useRef<LaunchMortarDef[]>(INITIAL_MORTARS.map((m) => ({ ...m })));

  // Synchronous refs for smooth 60fps physics, decoupled from React prop re-renders
  const activeBombsRef = useRef<LaunchedBombEntity[]>([]);
  const pendingBurstsRef = useRef<PendingBombLaunch[]>([]);
  const leftHandRef = useRef<TrackedHand>(leftHand);
  const rightHandRef = useRef<TrackedHand>(rightHand);
  const getLiveTrackedHandsRef = useRef(getLiveTrackedHands);
  const bombConfigsRef = useRef<BombConfig[]>(bombConfigs);
  const settingsRef = useRef<BombGameSettings>(settings);
  const onBombTouchRef = useRef(onBombTouch);
  const onPlayBurstSoundRef = useRef(onPlayBurstSound);
  const onTriggerParticlesRef = useRef(onTriggerParticles);
  const isTouchModeRef = useRef(isTouchMode);

  // Sync refs on every render
  useEffect(() => {
    leftHandRef.current = leftHand;
    rightHandRef.current = rightHand;
    getLiveTrackedHandsRef.current = getLiveTrackedHands;
    bombConfigsRef.current = bombConfigs;
    settingsRef.current = settings;
    onBombTouchRef.current = onBombTouch;
    onPlayBurstSoundRef.current = onPlayBurstSound;
    onTriggerParticlesRef.current = onTriggerParticles;
    isTouchModeRef.current = isTouchMode;
  });

  const lastSpawnTimeRef = useRef<number>(0);
  const nextSpawnDelayRef = useRef<number>(800);
  const lastMortarIdxRef = useRef<number>(-1);
  const rafIdRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);

  // Weighted random bomb config selection with guaranteed fallback
  const pickRandomBombConfig = useCallback((): BombConfig => {
    const list =
      bombConfigsRef.current && bombConfigsRef.current.length > 0
        ? bombConfigsRef.current
        : DEFAULT_BOMB_CONFIGS;

    const activeList = list.filter((b) => b.isActive);
    const pool = activeList.length > 0 ? activeList : DEFAULT_BOMB_CONFIGS;

    const totalWeight = pool.reduce((sum, b) => sum + Math.max(1, b.spawnWeight || 5), 0);
    let rand = Math.random() * totalWeight;

    for (const b of pool) {
      const weight = Math.max(1, b.spawnWeight || 5);
      if (rand < weight) {
        return b;
      }
      rand -= weight;
    }

    return pool[0] || DEFAULT_BOMB_CONFIGS[0];
  }, []);

  // Launch a single bomb shot from a mortar (part of a rapid-fire burst or single shot)
  const launchSingleBomb = useCallback(
    (now: number, shot: PendingBombLaunch) => {
      const config = pickRandomBombConfig();
      const currentMortars = mortarsRef.current;
      if (!currentMortars || currentMortars.length === 0) return;

      const mortar = currentMortars[shot.mortarIdx] || currentMortars[0];
      const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const screenH = typeof window !== 'undefined' ? window.innerHeight : 720;

      // Trigger sharp mechanical kickback & muzzle flash on this exact shot
      mortar.lastFiredTime = now;
      mortar.shotCounter++;

      const originX = mortar.pctX * screenW;
      const originY = screenH - 72; // mouth opening of the container tube

      const curSettings = settingsRef.current || DEFAULT_BOMB_SETTINGS;
      const speedMult = curSettings.launchSpeedMultiplier || 1.45;
      const gravMult = curSettings.gravityMultiplier || 1.45;
      const effectiveGravity = BASE_GRAVITY * (gravMult / 1.45);

      // Target apex in the upper playable area (between ~130px and 220px, safely below top score header)
      const targetApexY = Math.max(
        130,
        screenH * 0.19 + Math.random() * (screenH * 0.12) + shot.apexOffsetY
      );
      const deltaH = originY - targetApexY;

      // Strong upward impulse: vy0 = -sqrt(2 * g * deltaH) * (speedMult / 1.45)
      // Produces an explosive ~1600-2000 px/s launch velocity
      const baseVy0 = -Math.sqrt(2 * effectiveGravity * Math.max(80, deltaH));
      const vy0 = baseVy0 * (speedMult / 1.45);

      // Horizontal velocity based on mortar tube tilt angle + burst fanning spread
      let baseVx = 0;
      if (mortar.pctX < 0.35) {
        baseVx = screenW * 0.08 + Math.random() * (screenW * 0.08); // drift right
      } else if (mortar.pctX > 0.65) {
        baseVx = -(screenW * 0.08 + Math.random() * (screenW * 0.08)); // drift left
      } else {
        baseVx = (Math.random() - 0.5) * (screenW * 0.12); // center drift
      }

      // Add the burst fanning angle offset so multiple bombs fan out visibly
      const totalVx = baseVx + shot.vxAngleOffset;

      const vRot = (Math.random() - 0.5) * 85;
      const rot0 = (Math.random() - 0.5) * 25;

      const baseRadius = curSettings.bombRadius || 52;
      const sizeMultiplier = Math.max(0.4, Math.min(1.8, (config.sizePercent ?? 100) / 100));
      const effectiveRadius = Math.round(baseRadius * sizeMultiplier);

      const newBomb: LaunchedBombEntity = {
        uid: `bomb_${now}_${Math.random().toString(36).substring(2, 7)}`,
        config,
        x: originX,
        y: originY,
        prevX: originX,
        prevY: originY,
        vx: totalVx,
        vy: vy0,
        rot: rot0,
        vRot,
        radius: effectiveRadius,
        scale: 0.65, // starts slightly smaller as it emerges from tube nozzle
        launchTime: now,
        isBursting: false,
        burstTime: 0,
        burstScale: 1.0,
        trail: [],
        lastTrailTime: 0,
      };

      activeBombsRef.current.push(newBomb);

      console.log('[BombLauncher] Rapid-fire shot launched:', {
        id: newBomb.uid,
        shot: `${shot.burstIndex + 1}/${shot.totalInBurst}`,
        mortarIdx: shot.mortarIdx,
        bombType: config.id,
        points: config.points,
        vy0: Math.round(vy0),
        vx: Math.round(totalVx),
        activeCount: activeBombsRef.current.length,
      });
    },
    [pickRandomBombConfig]
  );

  // Schedule a rapid-fire burst of 1, 2, or 3 bombs from a single launcher
  const scheduleBurst = useCallback((now: number) => {
    const curSettings = settingsRef.current || DEFAULT_BOMB_SETTINGS;
    const maxConcurrent = curSettings.maxConcurrentBombs || 5;

    // Available slots check: include already flying bombs and already queued burst shots
    const currentUnburst = activeBombsRef.current.filter((b) => !b.isBursting).length;
    const pendingCount = pendingBurstsRef.current.length;
    const committedSlots = currentUnburst + pendingCount;
    const availableSlots = maxConcurrent - committedSlots;

    if (availableSlots <= 0) return;

    // Determine desired burst size: 1, 2, or 3 bombs (2-3 bomb bursts occur ~80% of the time)
    const maxBurstConfig = Math.min(3, Math.max(1, curSettings.maxBurstSize ?? 3));
    const rand = Math.random();
    let desiredBurst = 1;
    if (rand < 0.20) {
      desiredBurst = 1;
    } else if (rand < 0.65) {
      desiredBurst = 2;
    } else {
      desiredBurst = 3;
    }
    desiredBurst = Math.min(desiredBurst, maxBurstConfig);

    // Strictly clamp by available slots:
    // If 2 slots available -> launch at most 2. If 1 slot available -> launch 1.
    const burstSize = Math.min(desiredBurst, availableSlots);
    if (burstSize <= 0) return;

    // Select ONE launcher container for this entire burst event
    const currentMortars = mortarsRef.current;
    if (!currentMortars || currentMortars.length === 0) return;

    let candidateIndices = currentMortars.map((_, i) => i).filter((i) => i !== lastMortarIdxRef.current);
    if (candidateIndices.length === 0) candidateIndices = [0];
    const mortarIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
    lastMortarIdxRef.current = mortarIdx;

    // Rapid-fire interval between burst shots (50–100ms apart, default ~75ms)
    const baseInterval = Math.max(50, Math.min(100, curSettings.burstIntervalMs || 75));

    // Queue each shot with tight timing stagger, height variation, and sideways fan spread
    for (let i = 0; i < burstSize; i++) {
      const staggerDelay = i === 0 ? 0 : i * baseInterval + (Math.random() - 0.5) * 15;

      // Varied angles and apex heights so bombs spread out visibly
      let apexOffsetY = 0;
      let vxAngleOffset = 0;

      if (burstSize === 1) {
        apexOffsetY = 0;
        vxAngleOffset = (Math.random() - 0.5) * 40;
      } else if (burstSize === 2) {
        apexOffsetY = i === 0 ? -32 : 32;
        vxAngleOffset = i === 0 ? -90 + (Math.random() - 0.5) * 20 : 90 + (Math.random() - 0.5) * 20;
      } else {
        // 3-bomb burst
        apexOffsetY = i === 0 ? -40 : i === 1 ? 0 : 40;
        vxAngleOffset =
          i === 0
            ? -110 + (Math.random() - 0.5) * 20
            : i === 1
            ? (Math.random() - 0.5) * 25
            : 110 + (Math.random() - 0.5) * 20;
      }

      const scheduledTime = now + Math.max(0, staggerDelay);

      pendingBurstsRef.current.push({
        id: `shot_${now}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        mortarIdx,
        scheduledTime,
        burstIndex: i,
        totalInBurst: burstSize,
        apexOffsetY,
        vxAngleOffset,
      });
    }

    // Update spawn timing for next burst event
    lastSpawnTimeRef.current = now;
    const minD = curSettings.minSpawnDelayMs || 650;
    const maxD = curSettings.maxSpawnDelayMs || 1400;
    nextSpawnDelayRef.current = minD + Math.random() * (maxD - minD);
  }, []);

  // Handle bomb touch and burst (guaranteed single-hit scoring)
  const handleBurst = useCallback((bomb: LaunchedBombEntity, now: number) => {
    if (bomb.isBursting) return;
    bomb.isBursting = true;
    bomb.burstTime = now;

    console.log('[BombLauncher] Burst bomb touched:', {
      id: bomb.uid,
      type: bomb.config.id,
      points: bomb.config.points,
      x: Math.round(bomb.x),
      y: Math.round(bomb.y),
    });

    // 1. Play assigned burst sound immediately
    onPlayBurstSoundRef.current(bomb.config);

    // 2. Apply configured score
    onBombTouchRef.current(bomb.config, bomb.x, bomb.y);

    // 3. Trigger particle explosion effect
    onTriggerParticlesRef.current(bomb.x, bomb.y, bomb.config.color);

    // 4. Create floating score popup
    const isPenalty = bomb.config.points < 0;
    const text =
      bomb.config.points > 0
        ? `+${bomb.config.points}`
        : `${bomb.config.points} ${isPenalty ? 'OUCH!' : ''}`;

    const popupId = `popup_${Date.now()}_${Math.random()}`;
    setScorePopups((prev) => [
      ...prev,
      {
        id: popupId,
        x: bomb.x,
        y: bomb.y,
        text,
        color: bomb.config.color,
        isPenalty,
        createdAt: performance.now(),
      },
    ]);

    setTimeout(() => {
      setScorePopups((prev) => prev.filter((p) => p.id !== popupId));
    }, 850);
  }, []);

  // Direct touchscreen tap / mouse click hit test for Touch Gameplay mode
  const tryBurstBombAt = useCallback(
    (clientX: number, clientY: number) => {
      const now = performance.now();
      for (const bomb of activeBombsRef.current) {
        if (bomb.isBursting || bomb.scale < 0.5) continue;
        const hitRadius = Math.max(20, bomb.radius * 1.25);
        const dist = Math.hypot(clientX - bomb.x, clientY - bomb.y);
        if (dist <= hitRadius) {
          handleBurst(bomb, now);
          break;
        }
      }
    },
    [handleBurst]
  );

  // 60FPS Kinematics, Arc Physics, Spawning & Swept Collision Loop
  useEffect(() => {
    if (!isActive) {
      pendingBurstsRef.current = [];
      activeBombsRef.current = [];
      setActiveBombs([]);
      setScorePopups([]);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const startNow = performance.now();
    lastTickTimeRef.current = startNow;

    const curSettings = settingsRef.current || DEFAULT_BOMB_SETTINGS;
    const minDelay = curSettings.minSpawnDelayMs || 650;
    const maxDelay = curSettings.maxSpawnDelayMs || 1400;
    nextSpawnDelayRef.current = minDelay + Math.random() * (maxDelay - minDelay);

    // Pre-seed spawn timer so the very first burst launches promptly (within ~150ms)
    lastSpawnTimeRef.current = startNow - nextSpawnDelayRef.current + 150;

    console.log('[BombLauncher] High-speed arcade physics loop started. First launch in ~150ms.');

    const tick = (frameNow: number) => {
      const dt = Math.min((frameNow - (lastTickTimeRef.current || frameNow)) / 1000, 0.05);
      lastTickTimeRef.current = frameNow;

      const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const screenH = typeof window !== 'undefined' ? window.innerHeight : 720;

      const settingsSnap = settingsRef.current || DEFAULT_BOMB_SETTINGS;
      const maxConcurrent = settingsSnap.maxConcurrentBombs || 5;
      const gravMult = settingsSnap.gravityMultiplier || 1.45;
      const effectiveGravity = BASE_GRAVITY * (gravMult / 1.45);

      // 1. Process any pending rapid-fire burst shots whose scheduledTime has arrived
      if (pendingBurstsRef.current.length > 0) {
        const readyShots: PendingBombLaunch[] = [];
        const stillPending: PendingBombLaunch[] = [];

        for (const shot of pendingBurstsRef.current) {
          if (frameNow >= shot.scheduledTime) {
            readyShots.push(shot);
          } else {
            stillPending.push(shot);
          }
        }
        pendingBurstsRef.current = stillPending;

        for (const shot of readyShots) {
          const inFlightCount = activeBombsRef.current.filter((b) => !b.isBursting).length;
          if (inFlightCount < maxConcurrent) {
            launchSingleBomb(frameNow, shot);
          }
        }
      }

      // 2. Spawner Check: Trigger next launcher burst when conditions are satisfied
      const committedSlots =
        activeBombsRef.current.filter((b) => !b.isBursting).length + pendingBurstsRef.current.length;

      if (committedSlots < maxConcurrent) {
        // Continuous pacing: If screen is empty, trigger next burst with minimal delay
        const effectiveDelay =
          committedSlots === 0
            ? Math.min(nextSpawnDelayRef.current, 320)
            : nextSpawnDelayRef.current;

        if (frameNow - lastSpawnTimeRef.current >= effectiveDelay) {
          scheduleBurst(frameNow);
        }
      }

      // 3. Collect hand touch points from refs (independent of React renders)
      // Only active in Camera Mode. In Touch Mode, hand tracking collisions must remain strictly disabled.
      const touchPoints: Array<{ x: number; y: number; radius: number }> = [];
      if (!isTouchModeRef.current) {
        const live = getLiveTrackedHandsRef.current ? getLiveTrackedHandsRef.current() : null;
        const lHand = live ? live.left : leftHandRef.current;
        const rHand = live ? live.right : rightHandRef.current;

        const leftFlame = getHandFlamePosition('left');
        const rightFlame = getHandFlamePosition('right');

        // Left hand collision points: prioritize live interpolated flame position
        if (leftFlame.active) {
          touchPoints.push({ x: leftFlame.x, y: leftFlame.y, radius: 46 });
        } else if (lHand && lHand.detected && lHand.pixelX > 0 && lHand.pixelY > 0) {
          touchPoints.push({ x: lHand.pixelX, y: lHand.pixelY, radius: 40 });
        }
        if (lHand && lHand.detected && lHand.landmarks && lHand.landmarks[8]) {
          const lm = lHand.landmarks[8];
          touchPoints.push({ x: (1 - lm.x) * screenW, y: lm.y * screenH, radius: 32 });
        }

        // Right hand collision points: prioritize live interpolated flame position
        if (rightFlame.active) {
          touchPoints.push({ x: rightFlame.x, y: rightFlame.y, radius: 46 });
        } else if (rHand && rHand.detected && rHand.pixelX > 0 && rHand.pixelY > 0) {
          touchPoints.push({ x: rHand.pixelX, y: rHand.pixelY, radius: 40 });
        }
        if (rHand && rHand.detected && rHand.landmarks && rHand.landmarks[8]) {
          const lm = rHand.landmarks[8];
          touchPoints.push({ x: (1 - lm.x) * screenW, y: lm.y * screenH, radius: 32 });
        }
      }

      // 4. Update bomb kinematics & test swept collisions
      const nextBombs: LaunchedBombEntity[] = [];

      for (const bomb of activeBombsRef.current) {
        if (bomb.isBursting) {
          const burstElapsed = frameNow - bomb.burstTime;
          // Keep bursting bomb for 700ms with smooth explosion lifecycle and dissipation
          if (burstElapsed < 700) {
            // Decelerate residual velocity naturally during explosion
            bomb.vx *= 0.94;
            bomb.vy *= 0.94;
            bomb.x += bomb.vx * dt;
            bomb.y += bomb.vy * dt;
            nextBombs.push(bomb);
          }
          continue;
        }

        // Save previous coordinates for swept collision detection
        bomb.prevX = bomb.x;
        bomb.prevY = bomb.y;

        // Apply fast simulated gravity
        bomb.vy += effectiveGravity * dt;
        bomb.x += bomb.vx * dt;
        bomb.y += bomb.vy * dt;
        bomb.rot += bomb.vRot * dt;

        // Snappy perspective scale from tube mouth (reaches full 1.0 size within 140ms)
        const elapsedSinceLaunch = frameNow - bomb.launchTime;
        bomb.scale = Math.min(1.0, 0.65 + (elapsedSinceLaunch / 140) * 0.35);

        // Sparks & glow trail during high-speed ascent (vy < 0) throttled to max 1 spark per ~35ms
        if (bomb.vy < 0 && (!bomb.lastTrailTime || frameNow - bomb.lastTrailTime >= 35)) {
          bomb.lastTrailTime = frameNow;
          bomb.trail.push({
            id: `spk_${frameNow}_${Math.random().toString(36).substring(2, 6)}`,
            x: bomb.x + (Math.random() - 0.5) * 8,
            y: bomb.y + bomb.radius * 0.7,
            time: frameNow,
            size: 8 + Math.random() * 6,
          });
        }
        // Filter out sparks older than 160ms
        bomb.trail = bomb.trail.filter((pt) => frameNow - pt.time < 160);

        // Soft dampening bounce on left and right screen borders
        if (bomb.x < bomb.radius + 15) {
          bomb.x = bomb.radius + 15;
          bomb.vx = Math.abs(bomb.vx) * 0.7;
        } else if (bomb.x > screenW - bomb.radius - 15) {
          bomb.x = screenW - bomb.radius - 15;
          bomb.vx = -Math.abs(bomb.vx) * 0.7;
        }

        // Missed bomb: Falls past bottom of play area without awarding points
        if (bomb.y > screenH + 80 && bomb.vy > 0) {
          console.log('[BombLauncher] Bomb fell below screen (missed):', bomb.uid);
          continue;
        }

        // Swept Collision Detection (Camera Interactive Mode):
        // Tests the line segment from (prevX, prevY) to (x, y) against each hand point.
        // Guarantees high-velocity bombs cannot pass through the tracked hand between frames!
        if (!isTouchModeRef.current && bomb.scale >= 0.8 && touchPoints.length > 0) {
          for (const pt of touchPoints) {
            const dist = distToSegment(pt.x, pt.y, bomb.prevX, bomb.prevY, bomb.x, bomb.y);
            if (dist <= bomb.radius + pt.radius) {
              handleBurst(bomb, frameNow);
              break;
            }
          }
        }

        nextBombs.push(bomb);
      }

      activeBombsRef.current = nextBombs;
      setActiveBombs([...nextBombs]);

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      pendingBurstsRef.current = [];
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isActive, scheduleBurst, launchSingleBomb, handleBurst]);

  if (!isActive) return null;

  const now = performance.now();

  return (
    <div
      className={`fixed inset-0 z-20 overflow-hidden select-none touch-none ${
        isTouchMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
      }`}
      onPointerDown={(e) => {
        if (!isTouchMode) return;
        tryBurstBombAt(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!isTouchMode) return;
        if (e.buttons > 0 || e.pointerType === 'touch') {
          tryBurstBombAt(e.clientX, e.clientY);
        }
      }}
    >
      {/* ============================================================== */}
      {/* 1. ROW OF LAUNCH CONTAINERS (MORTARS) ALONG THE BOTTOM          */}
      {/* ============================================================== */}
      <div className="fixed bottom-0 inset-x-0 h-24 pointer-events-none z-20 flex items-end justify-center">
        {/* Bottom Mount Baseline Runner */}
        <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-neutral-950 via-neutral-900 to-amber-950/40 border-t border-amber-500/25 shadow-[0_-4px_20px_rgba(0,0,0,0.8)]" />

        {/* Individual Decorative Brass Launch Mortar Tubes */}
        {mortarsRef.current.map((mortar) => {
          const { kickY, scaleY, scaleX, extraRot, isFlashing, flashScale, smokeProgress } =
            getMortarRecoilTransform(now, mortar.lastFiredTime, mortar.angleDeg);

          return (
            <div
              key={mortar.id}
              className="absolute bottom-2 flex flex-col items-center select-none will-change-transform"
              style={{
                left: `${mortar.pctX * 100}%`,
                transform: `translateX(-50%) translateY(${kickY}px) scaleX(${scaleX}) scaleY(${scaleY}) rotate(${mortar.angleDeg + extraRot}deg)`,
                transformOrigin: '50% 90%',
              }}
            >
              {/* Rising Smoke/Puff Effect on Launch */}
              {smokeProgress >= 0 && (
                <div
                  className="absolute -top-7 pointer-events-none flex items-center justify-center select-none"
                  style={{
                    transform: `translateY(-${smokeProgress * 38}px) scale(${1.0 + smokeProgress * 1.6})`,
                    opacity: Math.max(0, (1 - smokeProgress) * 0.65),
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-neutral-300/40 blur-xs" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500/20 blur-xs" />
                </div>
              )}

              {/* Blazing Muzzle Flash & Spark Burst at Tube Mouth */}
              {isFlashing && (
                <div className="absolute -top-8 w-20 h-20 pointer-events-none flex items-center justify-center">
                  {/* Blazing outer fire bloom */}
                  <div
                    className="absolute w-16 h-16 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-yellow-200 blur-sm pointer-events-none"
                    style={{ transform: `scale(${flashScale * 1.3})`, opacity: flashScale }}
                  />
                  {/* Brilliant white-hot center core */}
                  <div
                    className="absolute w-8 h-8 rounded-full bg-white blur-[1px] pointer-events-none shadow-[0_0_16px_#FDE047]"
                    style={{ transform: `scale(${flashScale})`, opacity: flashScale }}
                  />
                  {/* Directional spark spikes radiating from nozzle */}
                  <div
                    className="absolute w-1 h-14 bg-yellow-200 blur-[0.5px] pointer-events-none"
                    style={{
                      transform: `rotate(${mortar.angleDeg + (mortar.shotCounter % 2 === 0 ? 18 : -18)}deg) scaleY(${flashScale})`,
                      opacity: flashScale,
                    }}
                  />
                  <div
                    className="absolute w-14 h-1 bg-amber-300 blur-[0.5px] pointer-events-none"
                    style={{
                      transform: `rotate(${mortar.angleDeg + 45}deg) scaleX(${flashScale})`,
                      opacity: flashScale,
                    }}
                  />
                </div>
              )}

              {/* Ornate Cannon / Mortar Tube */}
              <div className="relative w-12 sm:w-14 h-16 sm:h-20 flex flex-col items-center">
                {/* Dark Inner Bore (Nozzle Mouth) */}
                <div className="relative w-10 sm:w-12 h-3.5 rounded-full bg-neutral-950 border-2 border-amber-400/90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.95)] flex items-center justify-center">
                  <div className="w-6 h-1.5 rounded-full bg-amber-500/40 blur-xs animate-pulse" />
                </div>

                {/* Brass / Burnished Metal Mortar Barrel */}
                <div className="w-8 sm:w-10 flex-1 bg-gradient-to-r from-neutral-900 via-amber-700 to-neutral-950 border-x border-amber-500/40 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-2 inset-x-0 h-1 bg-amber-400/80 shadow-sm" />
                  <div className="absolute top-5 inset-x-0 h-0.5 bg-amber-300/60" />
                  <div className="absolute bottom-3 inset-x-0 h-1 bg-amber-400/80 shadow-sm" />
                  <div className="absolute inset-y-0 left-2 w-1.5 bg-white/20 blur-[1px]" />
                </div>

                {/* Flared Heavy Cast Base */}
                <div className="w-12 sm:w-14 h-4 bg-gradient-to-r from-neutral-950 via-amber-800 to-neutral-950 rounded-b-lg border border-amber-500/30 shadow-lg" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 2. ASCENT SPARK TRAILS BEHIND RISING BOMBS                      */}
      {/* ============================================================== */}
      {activeBombs.map((bomb) =>
        bomb.trail.map((pt) => {
          const age = (now - pt.time) / 160;
          const opacity = Math.max(0, (1 - age) * 0.75);
          const size = pt.size * (1 - age * 0.5);

          return (
            <div
              key={pt.id}
              className="absolute rounded-full pointer-events-none blur-[1px] will-change-transform"
              style={{
                top: 0,
                left: 0,
                transform: `translate3d(${Math.round(pt.x - size / 2)}px, ${Math.round(pt.y - size / 2)}px, 0)`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: '#FDE047',
                boxShadow: `0 0 10px ${bomb.config.color || '#F59E0B'}`,
                opacity,
              }}
            />
          );
        })
      )}

      {/* ============================================================== */}
      {/* 3. ACTIVE LAUNCHED BOMBS IN FLIGHT (ARC TRAJECTORIES)           */}
      {/* ============================================================== */}
      {activeBombs.map((bomb) => {
        const size = (bomb.radius || 52) * 2;
        const isAscending = bomb.vy < -150 && !bomb.isBursting;
        const burstElapsed = bomb.isBursting ? now - bomb.burstTime : 0;
        const burstProgress = bomb.isBursting ? Math.min(1.0, Math.max(0, burstElapsed / 700)) : 0;

        // Container scale: during explosion, smooth explosive punch expansion
        const burstExpansion = bomb.isBursting
          ? 1.0 + Math.sin(Math.min(1.0, burstProgress * 1.8) * (Math.PI / 2)) * 0.4
          : 1.0;
        const renderScale = bomb.scale * burstExpansion;

        // Detonation Flash Core (0 to ~220ms)
        const flashOpacity = bomb.isBursting ? Math.max(0, 1 - burstProgress * 3.5) : 0;

        // Expanding Outer Shockwave Ring (0 to ~600ms)
        const shockwaveProgress = bomb.isBursting ? Math.min(1.0, burstProgress * 1.45) : 0;
        const shockwaveScale = 0.8 + shockwaveProgress * 1.85;
        const shockwaveOpacity = bomb.isBursting ? Math.max(0, (1 - shockwaveProgress) * 0.95) : 0;

        // Radiant Fireball Bloom (0 to ~500ms)
        const fireProgress = bomb.isBursting ? Math.min(1.0, burstProgress * 1.6) : 0;
        const fireScale = 1.0 + Math.sin(fireProgress * Math.PI) * 0.85;
        const fireOpacity = bomb.isBursting ? Math.max(0, (1 - fireProgress) * 0.85) : 0;

        // Dissipating Smoke Puff Cloud (90ms to ~700ms)
        const smokeProgress = bomb.isBursting ? Math.max(0, (burstElapsed - 90) / 610) : 0;
        const smokeScale = 0.9 + smokeProgress * 1.35;
        const smokeOpacity = bomb.isBursting && smokeProgress > 0 ? Math.max(0, (1 - smokeProgress) * 0.45) : 0;
        const smokeLiftY = smokeProgress * 18;

        return (
          <div
            key={bomb.uid}
            onPointerDown={(e) => {
              if (!isTouchMode) return;
              e.preventDefault();
              e.stopPropagation();
              handleBurst(bomb, performance.now());
            }}
            className={`absolute will-change-transform select-none touch-none ${
              isTouchMode && !bomb.isBursting
                ? 'pointer-events-auto cursor-pointer active:scale-95'
                : 'pointer-events-none'
            }`}
            style={{
              top: 0,
              left: 0,
              width: `${size}px`,
              height: `${size}px`,
              transform: `translate3d(${Math.round(bomb.x - bomb.radius)}px, ${Math.round(bomb.y - bomb.radius)}px, 0) scale(${renderScale})`,
              transformOrigin: '50% 50%',
            }}
          >
            {/* Ambient colorful glow ring when in flight */}
            {!bomb.isBursting && (
              <div
                className="absolute inset-0 rounded-full blur-md opacity-45 pointer-events-none"
                style={{ backgroundColor: bomb.config.color }}
              />
            )}

            {/* High-speed rocket propulsion exhaust during upward ascent */}
            {isAscending && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center">
                <div
                  className="w-4 h-6 rounded-full bg-gradient-to-t from-transparent via-amber-400 to-yellow-200 blur-[1px] animate-pulse"
                  style={{
                    boxShadow: `0 4px 12px ${bomb.config.color || '#F59E0B'}`,
                  }}
                />
              </div>
            )}

            {/* Premium 3D-Style Cartoon Bomb */}
            <CartoonBombSvg
              bomb={bomb.config}
              size={size}
              showBadge={true}
              isBursting={bomb.isBursting}
              rotation={bomb.rot}
            />

            {/* ========================================================== */}
            {/* EXPLOSION LIFECYCLE: FLASH, SHOCKWAVE, FIREBALL & SMOKE    */}
            {/* ========================================================== */}

            {/* 1. Instant Detonation Brilliant White Core Flash */}
            {bomb.isBursting && flashOpacity > 0 && (
              <div
                className="absolute inset-0 rounded-full bg-white blur-[2px] pointer-events-none"
                style={{
                  transform: `scale(${1.0 + (1 - flashOpacity) * 0.6})`,
                  opacity: flashOpacity * 0.95,
                  boxShadow: `0 0 24px ${bomb.config.color || '#FDE047'}, 0 0 40px #FFFFFF`,
                }}
              />
            )}

            {/* 2. Expanding Radiant Shockwave Ring */}
            {bomb.isBursting && shockwaveOpacity > 0 && (
              <div
                className="absolute inset-0 rounded-full border-2 sm:border-3 pointer-events-none will-change-transform"
                style={{
                  borderColor: bomb.config.color || '#F59E0B',
                  boxShadow: `0 0 16px ${bomb.config.color || '#F59E0B'}`,
                  transform: `scale(${shockwaveScale})`,
                  opacity: shockwaveOpacity,
                }}
              />
            )}

            {/* 3. Core Fireball Radial Glow */}
            {bomb.isBursting && fireOpacity > 0 && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none blur-md will-change-transform"
                style={{
                  background: `radial-gradient(circle, #FFFFFF 0%, ${bomb.config.color || '#F59E0B'} 50%, rgba(234, 88, 12, 0.4) 75%, transparent 100%)`,
                  transform: `scale(${fireScale})`,
                  opacity: fireOpacity,
                }}
              />
            )}

            {/* 4. Dissipating Smoke Puff Cloud */}
            {bomb.isBursting && smokeOpacity > 0 && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none blur-sm will-change-transform"
                style={{
                  background: 'radial-gradient(circle, rgba(254, 243, 199, 0.4) 0%, rgba(214, 211, 209, 0.25) 55%, transparent 80%)',
                  transform: `scale(${smokeScale}) translateY(-${smokeLiftY}px)`,
                  opacity: smokeOpacity,
                }}
              />
            )}
          </div>
        );
      })}

      {/* ============================================================== */}
      {/* 4. FLOATING SCORE POPUPS (+100, +150, +300, -150 OUCH!)         */}
      {/* ============================================================== */}
      {scorePopups.map((popup) => (
        <div
          key={popup.id}
          className="absolute font-black tracking-wider text-xl sm:text-2xl drop-shadow-[0_4px_14px_rgba(0,0,0,0.85)] pointer-events-none animate-float-fade select-none will-change-transform"
          style={{
            top: 0,
            left: 0,
            transform: `translate3d(${Math.round(popup.x)}px, ${Math.round(popup.y - 20)}px, 0)`,
            color: popup.isPenalty ? '#EF4444' : '#FDE047',
            textShadow: popup.isPenalty
              ? '0 0 16px rgba(239, 68, 68, 0.95), 0 2px 4px rgba(0,0,0,0.9)'
              : '0 0 16px rgba(250, 204, 21, 0.95), 0 2px 4px rgba(0,0,0,0.9)',
          }}
        >
          {popup.text}
        </div>
      ))}
    </div>
  );
};
