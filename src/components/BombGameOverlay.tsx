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
import { isLowEndHardware, getCanvasRenderScale } from '../utils/device';

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

// Fixed maximum bomb concurrency slots for object pooling
const MAX_BOMB_SLOTS = 8;
const MAX_PARTICLES = 120;
const MAX_SCORE_POPUPS = 8;
const MAX_PENDING_SHOTS = 8;

interface PooledBombEntity {
  active: boolean;
  slotIndex: number;
  uid: string;
  config: BombConfig;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  radius: number;
  scale: number;
  launchTime: number;
  isBursting: boolean;
  burstTime: number;
  lastTrailTime: number;
}

interface CanvasParticle {
  active: boolean;
  type: 'spark' | 'ember' | 'smoke' | 'shockwave' | 'flash' | 'muzzle';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  color: string;
  alpha: number;
  startTime: number;
  lifetime: number;
}

interface ScorePopup {
  active: boolean;
  x: number;
  y: number;
  startY: number;
  text: string;
  isPenalty: boolean;
  startTime: number;
  duration: number;
}

interface LaunchMortarDef {
  id: number;
  pctX: number;
  angleDeg: number;
  lastFiredTime: number;
  shotCounter: number;
}

interface PendingBombLaunch {
  active: boolean;
  mortarIdx: number;
  scheduledTime: number;
  burstIndex: number;
  totalInBurst: number;
  apexOffsetY: number;
  vxAngleOffset: number;
}

const INITIAL_MORTARS: LaunchMortarDef[] = [
  { id: 0, pctX: 0.16, angleDeg: 14, lastFiredTime: 0, shotCounter: 0 },
  { id: 1, pctX: 0.33, angleDeg: 7, lastFiredTime: 0, shotCounter: 0 },
  { id: 2, pctX: 0.5, angleDeg: 0, lastFiredTime: 0, shotCounter: 0 },
  { id: 3, pctX: 0.67, angleDeg: -7, lastFiredTime: 0, shotCounter: 0 },
  { id: 4, pctX: 0.84, angleDeg: -14, lastFiredTime: 0, shotCounter: 0 },
];

const BASE_GRAVITY = 2600;

/**
 * Calculates snappy gun-like kickback recoil for mortar tubes without re-rendering React.
 */
function getMortarRecoilTransform(now: number, lastFired: number, baseAngleDeg: number) {
  const elapsed = now - lastFired;
  if (lastFired === 0 || elapsed < 0 || elapsed > 240) {
    return {
      kickY: 0,
      scaleY: 1.0,
      scaleX: 1.0,
      extraRot: 0,
    };
  }

  let kickY = 0;
  let scaleY = 1.0;
  let scaleX = 1.0;
  let extraRot = 0;

  if (elapsed < 24) {
    const t = elapsed / 24;
    const easePunch = Math.sin(t * (Math.PI / 2));
    kickY = 18 * easePunch;
    scaleY = 1.0 - 0.16 * easePunch;
    scaleX = 1.0 + 0.1 * easePunch;
    extraRot = (baseAngleDeg >= 0 ? 1 : -1) * 3.5 * easePunch;
  } else {
    const t = (elapsed - 24) / 196;
    const damp = Math.exp(-4.2 * t);
    const wave = Math.cos(t * Math.PI * 3.5);
    kickY = 18 * damp * wave;
    scaleY = 1.0 - 0.16 * damp * wave;
    scaleX = 1.0 + 0.1 * damp * wave;
    extraRot = (baseAngleDeg >= 0 ? 1 : -1) * 3.5 * damp * wave;
  }

  return { kickY, scaleY, scaleX, extraRot };
}

/**
 * Squared distance from point (px, py) to segment (x1, y1) -> (x2, y2).
 * Fast, avoids expensive Math.sqrt / Math.hypot calls.
 */
function distToSegmentSq(
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
    const dpx = px - x1;
    const dpy = py - y1;
    return dpx * dpx + dpy * dpy;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dpx = px - projX;
  const dpy = py - projY;
  return dpx * dpx + dpy * dpy;
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
  // DOM element refs for pooled bomb slots (zero React renders during movement)
  const bombSlotElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const bombSlotRotElsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Mortar DOM element refs for direct recoil transform updates
  const mortarElsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Canvas ref for high-speed particle effects, shockwaves, muzzle flashes, and floating popups
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active configurations assigned to DOM slots (updated only on launch, not on animation frames)
  const [slotConfigs, setSlotConfigs] = useState<(BombConfig | null)[]>(() =>
    Array.from({ length: MAX_BOMB_SLOTS }, () => null)
  );

  // Synchronous refs for 60fps physics decoupled from React prop changes
  const leftHandRef = useRef<TrackedHand>(leftHand);
  const rightHandRef = useRef<TrackedHand>(rightHand);
  const getLiveTrackedHandsRef = useRef(getLiveTrackedHands);
  const bombConfigsRef = useRef<BombConfig[]>(bombConfigs);
  const settingsRef = useRef<BombGameSettings>(settings);
  const onBombTouchRef = useRef(onBombTouch);
  const onPlayBurstSoundRef = useRef(onPlayBurstSound);
  const onTriggerParticlesRef = useRef(onTriggerParticles);
  const isTouchModeRef = useRef(isTouchMode);

  // Pre-computed bomb weights for fast O(1) random selection without array allocations
  const preparedBombConfigsRef = useRef<{
    pool: BombConfig[];
    totalWeight: number;
    cumulativeWeights: number[];
  }>({
    pool: DEFAULT_BOMB_CONFIGS,
    totalWeight: 28,
    cumulativeWeights: [10, 18, 22, 28],
  });

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

    // Pre-calculate selection weights
    const list = bombConfigs && bombConfigs.length > 0 ? bombConfigs : DEFAULT_BOMB_CONFIGS;
    const activeList = list.filter((b) => b.isActive);
    const pool = activeList.length > 0 ? activeList : DEFAULT_BOMB_CONFIGS;
    let running = 0;
    const cumulativeWeights: number[] = [];
    for (const b of pool) {
      running += Math.max(1, b.spawnWeight || 5);
      cumulativeWeights.push(running);
    }
    preparedBombConfigsRef.current = {
      pool,
      totalWeight: running,
      cumulativeWeights,
    };
  });

  // Object Pools initialized once
  const bombPoolRef = useRef<PooledBombEntity[]>(
    Array.from({ length: MAX_BOMB_SLOTS }, (_, index) => ({
      active: false,
      slotIndex: index,
      uid: '',
      config: DEFAULT_BOMB_CONFIGS[0],
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      vRot: 0,
      radius: 52,
      scale: 0.65,
      launchTime: 0,
      isBursting: false,
      burstTime: 0,
      lastTrailTime: 0,
    }))
  );

  const particlesPoolRef = useRef<CanvasParticle[]>(
    Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      type: 'spark',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      maxSize: 0,
      color: '#FDE047',
      alpha: 1,
      startTime: 0,
      lifetime: 0,
    }))
  );

  const scorePopupsPoolRef = useRef<ScorePopup[]>(
    Array.from({ length: MAX_SCORE_POPUPS }, () => ({
      active: false,
      x: 0,
      y: 0,
      startY: 0,
      text: '',
      isPenalty: false,
      startTime: 0,
      duration: 850,
    }))
  );

  const pendingBurstsRef = useRef<PendingBombLaunch[]>(
    Array.from({ length: MAX_PENDING_SHOTS }, () => ({
      active: false,
      mortarIdx: 0,
      scheduledTime: 0,
      burstIndex: 0,
      totalInBurst: 0,
      apexOffsetY: 0,
      vxAngleOffset: 0,
    }))
  );

  // Pre-allocated touch points buffer for collision detection
  const touchPointsPool = useRef<Array<{ x: number; y: number; radius: number }>>([
    { x: 0, y: 0, radius: 46 },
    { x: 0, y: 0, radius: 46 },
  ]);

  const mortarsRef = useRef<LaunchMortarDef[]>(INITIAL_MORTARS.map((m) => ({ ...m })));
  const lastSpawnTimeRef = useRef<number>(0);
  const nextSpawnDelayRef = useRef<number>(800);
  const lastMortarIdxRef = useRef<number>(-1);
  const rafIdRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);

  // Fast bomb selection
  const pickRandomBombConfig = useCallback((): BombConfig => {
    const { pool, totalWeight, cumulativeWeights } = preparedBombConfigsRef.current;
    const rand = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
      if (rand < cumulativeWeights[i]) {
        return pool[i];
      }
    }
    return pool[0] || DEFAULT_BOMB_CONFIGS[0];
  }, []);

  // Spawn an ascent spark in the particle pool
  const spawnAscentSpark = useCallback((x: number, y: number, color: string, now: number) => {
    const pool = particlesPoolRef.current;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.type = 'spark';
        p.x = x + (Math.random() - 0.5) * 8;
        p.y = y;
        p.vx = (Math.random() - 0.5) * 20;
        p.vy = 20 + Math.random() * 40;
        p.size = 5 + Math.random() * 4;
        p.maxSize = p.size;
        p.color = color;
        p.alpha = 0.85;
        p.startTime = now;
        p.lifetime = 140;
        break;
      }
    }
  }, []);

  // Spawn explosion effects in the particle pool
  const spawnExplosionEffects = useCallback((x: number, y: number, color: string, now: number) => {
    const pool = particlesPoolRef.current;
    const isLowEnd = isLowEndHardware();

    // 1. Shockwave ring
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.type = 'shockwave';
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.size = 35;
        p.maxSize = 110;
        p.color = color;
        p.alpha = 0.95;
        p.startTime = now;
        p.lifetime = 500;
        break;
      }
    }

    // 2. Core white flash
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.type = 'flash';
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.size = 40;
        p.maxSize = 65;
        p.color = '#FFFFFF';
        p.alpha = 0.95;
        p.startTime = now;
        p.lifetime = 150;
        break;
      }
    }

    // 3. Fireball embers (8 on low-end, 14 on high-end)
    const emberCount = isLowEnd ? 8 : 14;
    let spawnedEmbers = 0;
    for (let i = 0; i < pool.length && spawnedEmbers < emberCount; i++) {
      const p = pool[i];
      if (!p.active) {
        const angle = (spawnedEmbers / emberCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = 120 + Math.random() * 180;
        p.active = true;
        p.type = 'ember';
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.size = 6 + Math.random() * 6;
        p.maxSize = p.size;
        p.color = spawnedEmbers % 2 === 0 ? color : '#FDE047';
        p.alpha = 0.9;
        p.startTime = now;
        p.lifetime = 350 + Math.random() * 150;
        spawnedEmbers++;
      }
    }

    // 4. Soft smoke puffs (3 on low-end, 5 on high-end)
    const smokeCount = isLowEnd ? 3 : 5;
    let spawnedSmoke = 0;
    for (let i = 0; i < pool.length && spawnedSmoke < smokeCount; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.type = 'smoke';
        p.x = x + (Math.random() - 0.5) * 24;
        p.y = y + (Math.random() - 0.5) * 20;
        p.vx = (Math.random() - 0.5) * 25;
        p.vy = -35 - Math.random() * 30; // gently drifts upward
        p.size = 18;
        p.maxSize = 48 + Math.random() * 15;
        p.color = '#E2E8F0';
        p.alpha = 0.35;
        p.startTime = now + 60; // slight delay
        p.lifetime = 600;
        spawnedSmoke++;
      }
    }
  }, []);

  // Spawn mortar muzzle flash at tube opening
  const spawnMuzzleFlash = useCallback((x: number, y: number, now: number) => {
    const pool = particlesPoolRef.current;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.type = 'muzzle';
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.size = 14;
        p.maxSize = 36;
        p.color = '#F59E0B';
        p.alpha = 0.95;
        p.startTime = now;
        p.lifetime = 65;
        break;
      }
    }
  }, []);

  // Launch a single bomb shot into a pooled slot
  const launchSingleBomb = useCallback(
    (now: number, shot: PendingBombLaunch) => {
      // Find an available slot in the bomb pool
      const pool = bombPoolRef.current;
      let slotIdx = -1;
      for (let i = 0; i < pool.length; i++) {
        if (!pool[i].active) {
          slotIdx = i;
          break;
        }
      }
      if (slotIdx === -1) return; // Pool full

      const config = pickRandomBombConfig();
      const currentMortars = mortarsRef.current;
      if (!currentMortars || currentMortars.length === 0) return;

      const mortar = currentMortars[shot.mortarIdx] || currentMortars[0];
      const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const screenH = typeof window !== 'undefined' ? window.innerHeight : 720;

      // Trigger mortar kickback recoil
      mortar.lastFiredTime = now;
      mortar.shotCounter++;

      const originX = mortar.pctX * screenW;
      const originY = screenH - 72;

      // Muzzle flash particle
      spawnMuzzleFlash(originX, originY, now);

      const curSettings = settingsRef.current || DEFAULT_BOMB_SETTINGS;
      const speedMult = curSettings.launchSpeedMultiplier || 1.45;
      const gravMult = curSettings.gravityMultiplier || 1.45;
      const effectiveGravity = BASE_GRAVITY * (gravMult / 1.45);

      const targetApexY = Math.max(
        130,
        screenH * 0.19 + Math.random() * (screenH * 0.12) + shot.apexOffsetY
      );
      const deltaH = originY - targetApexY;
      const baseVy0 = -Math.sqrt(2 * effectiveGravity * Math.max(80, deltaH));
      const vy0 = baseVy0 * (speedMult / 1.45);

      let baseVx = 0;
      if (mortar.pctX < 0.35) {
        baseVx = screenW * 0.08 + Math.random() * (screenW * 0.08);
      } else if (mortar.pctX > 0.65) {
        baseVx = -(screenW * 0.08 + Math.random() * (screenW * 0.08));
      } else {
        baseVx = (Math.random() - 0.5) * (screenW * 0.12);
      }
      const totalVx = baseVx + shot.vxAngleOffset;

      const vRot = (Math.random() - 0.5) * 85;
      const rot0 = (Math.random() - 0.5) * 25;

      const baseRadius = curSettings.bombRadius || 52;
      const sizeMultiplier = Math.max(0.4, Math.min(1.8, (config.sizePercent ?? 100) / 100));
      const effectiveRadius = Math.round(baseRadius * sizeMultiplier);

      const bomb = pool[slotIdx];
      bomb.active = true;
      bomb.slotIndex = slotIdx;
      bomb.uid = `bomb_${now}_${slotIdx}`;
      bomb.config = config;
      bomb.x = originX;
      bomb.y = originY;
      bomb.prevX = originX;
      bomb.prevY = originY;
      bomb.vx = totalVx;
      bomb.vy = vy0;
      bomb.rot = rot0;
      bomb.vRot = vRot;
      bomb.radius = effectiveRadius;
      bomb.scale = 0.65;
      bomb.launchTime = now;
      bomb.isBursting = false;
      bomb.burstTime = 0;
      bomb.lastTrailTime = 0;

      // Update slot configuration state if it changed (triggers single targeted slot render)
      setSlotConfigs((prev) => {
        if (prev[slotIdx]?.id === config.id && prev[slotIdx]?.color === config.color) {
          return prev;
        }
        const next = [...prev];
        next[slotIdx] = config;
        return next;
      });

      // Instantly reveal and position DOM element
      const el = bombSlotElsRef.current[slotIdx];
      if (el) {
        el.style.display = 'block';
        el.style.opacity = '1';
        el.style.transform = `translate3d(${Math.round(originX - effectiveRadius)}px, ${Math.round(
          originY - effectiveRadius
        )}px, 0) scale(0.65)`;
      }
    },
    [pickRandomBombConfig, spawnMuzzleFlash]
  );

  // Schedule a rapid-fire burst into the pending shots pool
  const scheduleBurst = useCallback((now: number) => {
    const curSettings = settingsRef.current || DEFAULT_BOMB_SETTINGS;
    const maxConcurrent = Math.min(MAX_BOMB_SLOTS, curSettings.maxConcurrentBombs || 5);

    // Count in-flight and already queued
    const pool = bombPoolRef.current;
    let currentUnburst = 0;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].active && !pool[i].isBursting) currentUnburst++;
    }

    const pendingPool = pendingBurstsRef.current;
    let pendingCount = 0;
    for (let i = 0; i < pendingPool.length; i++) {
      if (pendingPool[i].active) pendingCount++;
    }

    const availableSlots = maxConcurrent - (currentUnburst + pendingCount);
    if (availableSlots <= 0) return;

    const maxBurstConfig = Math.min(3, Math.max(1, curSettings.maxBurstSize ?? 3));
    const rand = Math.random();
    let desiredBurst = 1;
    if (rand < 0.2) {
      desiredBurst = 1;
    } else if (rand < 0.65) {
      desiredBurst = 2;
    } else {
      desiredBurst = 3;
    }
    desiredBurst = Math.min(desiredBurst, maxBurstConfig);
    const burstSize = Math.min(desiredBurst, availableSlots);
    if (burstSize <= 0) return;

    const currentMortars = mortarsRef.current;
    if (!currentMortars || currentMortars.length === 0) return;

    let candidateIndices = currentMortars.map((_, i) => i).filter((i) => i !== lastMortarIdxRef.current);
    if (candidateIndices.length === 0) candidateIndices = [0];
    const mortarIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
    lastMortarIdxRef.current = mortarIdx;

    const baseInterval = Math.max(50, Math.min(100, curSettings.burstIntervalMs || 75));

    for (let i = 0; i < burstSize; i++) {
      const staggerDelay = i === 0 ? 0 : i * baseInterval + (Math.random() - 0.5) * 15;
      let apexOffsetY = 0;
      let vxAngleOffset = 0;

      if (burstSize === 1) {
        apexOffsetY = 0;
        vxAngleOffset = (Math.random() - 0.5) * 40;
      } else if (burstSize === 2) {
        apexOffsetY = i === 0 ? -32 : 32;
        vxAngleOffset = i === 0 ? -90 + (Math.random() - 0.5) * 20 : 90 + (Math.random() - 0.5) * 20;
      } else {
        apexOffsetY = i === 0 ? -40 : i === 1 ? 0 : 40;
        vxAngleOffset =
          i === 0
            ? -110 + (Math.random() - 0.5) * 20
            : i === 1
            ? (Math.random() - 0.5) * 25
            : 110 + (Math.random() - 0.5) * 20;
      }

      // Find inactive slot in pendingBurstsRef
      for (let pIdx = 0; pIdx < pendingPool.length; pIdx++) {
        const slot = pendingPool[pIdx];
        if (!slot.active) {
          slot.active = true;
          slot.mortarIdx = mortarIdx;
          slot.scheduledTime = now + Math.max(0, staggerDelay);
          slot.burstIndex = i;
          slot.totalInBurst = burstSize;
          slot.apexOffsetY = apexOffsetY;
          slot.vxAngleOffset = vxAngleOffset;
          break;
        }
      }
    }

    lastSpawnTimeRef.current = now;
    const minD = curSettings.minSpawnDelayMs || 650;
    const maxD = curSettings.maxSpawnDelayMs || 1400;
    nextSpawnDelayRef.current = minD + Math.random() * (maxD - minD);
  }, []);

  // Handle bomb touch and burst
  const handleBurst = useCallback(
    (slotIdx: number, now: number) => {
      const bomb = bombPoolRef.current[slotIdx];
      if (!bomb || !bomb.active || bomb.isBursting) return;

      bomb.isBursting = true;
      bomb.burstTime = now;

      // 1. Burst sound
      onPlayBurstSoundRef.current(bomb.config);

      // 2. Score callback
      onBombTouchRef.current(bomb.config, bomb.x, bomb.y);

      // 3. Parent particle callback
      onTriggerParticlesRef.current(bomb.x, bomb.y, bomb.config.color);

      // 4. Spawn high-speed canvas explosion
      spawnExplosionEffects(bomb.x, bomb.y, bomb.config.color, now);

      // 5. Add floating score popup in canvas popup pool
      const isPenalty = bomb.config.points < 0;
      const text =
        bomb.config.points > 0
          ? `+${bomb.config.points}`
          : `${bomb.config.points} ${isPenalty ? 'OUCH!' : ''}`;

      const popups = scorePopupsPoolRef.current;
      for (let i = 0; i < popups.length; i++) {
        const p = popups[i];
        if (!p.active) {
          p.active = true;
          p.x = bomb.x;
          p.y = bomb.y;
          p.startY = bomb.y;
          p.text = text;
          p.isPenalty = isPenalty;
          p.startTime = now;
          p.duration = 850;
          break;
        }
      }
    },
    [spawnExplosionEffects]
  );

  // Direct touchscreen tap / mouse hit test for Touch Mode
  const tryBurstBombAt = useCallback(
    (clientX: number, clientY: number) => {
      const now = performance.now();
      const pool = bombPoolRef.current;
      for (let i = 0; i < pool.length; i++) {
        const bomb = pool[i];
        if (!bomb.active || bomb.isBursting || bomb.scale < 0.5) continue;
        const hitRadius = Math.max(20, bomb.radius * 1.25);
        const dx = clientX - bomb.x;
        const dy = clientY - bomb.y;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          handleBurst(i, now);
          break;
        }
      }
    },
    [handleBurst]
  );

  // Synchronize canvas size with window
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 720;
    // Backing store is scaled down in low-end mode; drawing uses CSS-pixel coordinates via setTransform
    const scale = getCanvasRenderScale();
    const bw = Math.round(w * scale);
    const bh = Math.round(h * scale);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }, []);

  // 60FPS High-Precision Animation & Physics Loop (Zero React Re-renders!)
  useEffect(() => {
    if (!isActive) {
      // Clean up all slots
      for (const b of bombPoolRef.current) {
        b.active = false;
        b.isBursting = false;
      }
      for (const p of pendingBurstsRef.current) p.active = false;
      for (const pt of particlesPoolRef.current) pt.active = false;
      for (const sp of scorePopupsPoolRef.current) sp.active = false;

      // Hide all bomb elements
      for (const el of bombSlotElsRef.current) {
        if (el) el.style.display = 'none';
      }

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
    lastSpawnTimeRef.current = startNow - nextSpawnDelayRef.current + 150;

    syncCanvasSize();

    const tick = (frameNow: number) => {
      const rawDt = (frameNow - (lastTickTimeRef.current || frameNow)) / 1000;
      lastTickTimeRef.current = frameNow;
      // Clamped delta-time maintains perfectly consistent trajectory and physics across frame rates
      const dt = Math.max(0.001, Math.min(rawDt, 0.05));

      // Adaptive quality (frame times are recorded by the hand-tracking render loop)
      const isLowEnd = isLowEndHardware();

      const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const screenH = typeof window !== 'undefined' ? window.innerHeight : 720;

      const settingsSnap = settingsRef.current || DEFAULT_BOMB_SETTINGS;
      const maxConcurrent = Math.min(MAX_BOMB_SLOTS, settingsSnap.maxConcurrentBombs || 5);
      const gravMult = settingsSnap.gravityMultiplier || 1.45;
      const effectiveGravity = BASE_GRAVITY * (gravMult / 1.45);

      // 1. Process pending burst shots
      const pendingPool = pendingBurstsRef.current;
      for (let i = 0; i < pendingPool.length; i++) {
        const shot = pendingPool[i];
        if (shot.active && frameNow >= shot.scheduledTime) {
          shot.active = false;
          let inFlightCount = 0;
          for (const b of bombPoolRef.current) {
            if (b.active && !b.isBursting) inFlightCount++;
          }
          if (inFlightCount < maxConcurrent) {
            launchSingleBomb(frameNow, shot);
          }
        }
      }

      // 2. Spawner check
      let committedSlots = 0;
      for (const b of bombPoolRef.current) {
        if (b.active && !b.isBursting) committedSlots++;
      }
      for (const s of pendingPool) {
        if (s.active) committedSlots++;
      }

      if (committedSlots < maxConcurrent) {
        const effectiveDelay =
          committedSlots === 0 ? Math.min(nextSpawnDelayRef.current, 320) : nextSpawnDelayRef.current;
        if (frameNow - lastSpawnTimeRef.current >= effectiveDelay) {
          scheduleBurst(frameNow);
        }
      }

      // 3. Collision touch points (at most 2 active hand positions, zero array allocations)
      let touchPointsCount = 0;
      if (!isTouchModeRef.current) {
        const live = getLiveTrackedHandsRef.current ? getLiveTrackedHandsRef.current() : null;
        const lHand = live ? live.left : leftHandRef.current;
        const rHand = live ? live.right : rightHandRef.current;

        const leftFlame = getHandFlamePosition('left');
        const rightFlame = getHandFlamePosition('right');

        if (leftFlame.active) {
          touchPointsPool.current[touchPointsCount].x = leftFlame.x;
          touchPointsPool.current[touchPointsCount].y = leftFlame.y;
          touchPointsPool.current[touchPointsCount].radius = 46;
          touchPointsCount++;
        } else if (lHand && lHand.detected && lHand.pixelX > 0 && lHand.pixelY > 0) {
          touchPointsPool.current[touchPointsCount].x = lHand.pixelX;
          touchPointsPool.current[touchPointsCount].y = lHand.pixelY;
          touchPointsPool.current[touchPointsCount].radius = 42;
          touchPointsCount++;
        }

        if (rightFlame.active) {
          touchPointsPool.current[touchPointsCount].x = rightFlame.x;
          touchPointsPool.current[touchPointsCount].y = rightFlame.y;
          touchPointsPool.current[touchPointsCount].radius = 46;
          touchPointsCount++;
        } else if (rHand && rHand.detected && rHand.pixelX > 0 && rHand.pixelY > 0) {
          touchPointsPool.current[touchPointsCount].x = rHand.pixelX;
          touchPointsPool.current[touchPointsCount].y = rHand.pixelY;
          touchPointsPool.current[touchPointsCount].radius = 42;
          touchPointsCount++;
        }
      }

      // 4. Kinematics, Arc Physics, Swept Collision & Direct DOM Updates
      const friction = Math.pow(0.94, dt * 60);

      for (const bomb of bombPoolRef.current) {
        if (!bomb.active) continue;

        const slotEl = bombSlotElsRef.current[bomb.slotIndex];
        const rotEl = bombSlotRotElsRef.current[bomb.slotIndex];

        if (bomb.isBursting) {
          const burstElapsed = frameNow - bomb.burstTime;
          if (burstElapsed >= 700) {
            // End of burst lifecycle: return to pool
            bomb.active = false;
            bomb.isBursting = false;
            if (slotEl) slotEl.style.display = 'none';
            continue;
          }

          // Residual drift
          bomb.vx *= friction;
          bomb.vy *= friction;
          bomb.x += bomb.vx * dt;
          bomb.y += bomb.vy * dt;

          // Dissolve bomb SVG quickly into the canvas explosion
          if (slotEl) {
            const dissolveAlpha = Math.max(0, 1 - burstElapsed / 220);
            const expandScale = bomb.scale * (1.0 + Math.sin(Math.min(1.0, burstElapsed / 200) * (Math.PI / 2)) * 0.35);
            slotEl.style.transform = `translate3d(${Math.round(bomb.x - bomb.radius)}px, ${Math.round(
              bomb.y - bomb.radius
            )}px, 0) scale(${expandScale.toFixed(3)})`;
            slotEl.style.opacity = dissolveAlpha.toFixed(2);
            if (dissolveAlpha <= 0) {
              slotEl.style.display = 'none';
            }
          }
          continue;
        }

        bomb.prevX = bomb.x;
        bomb.prevY = bomb.y;

        // Apply fast simulated gravity
        bomb.vy += effectiveGravity * dt;
        bomb.x += bomb.vx * dt;
        bomb.y += bomb.vy * dt;
        bomb.rot += bomb.vRot * dt;

        // Snappy perspective emergence from tube nozzle (0.65 -> 1.0 within 140ms)
        const elapsedSinceLaunch = frameNow - bomb.launchTime;
        bomb.scale = Math.min(1.0, 0.65 + (elapsedSinceLaunch / 140) * 0.35);

        // Ascent sparks throttled to 1 spark per ~35ms
        if (bomb.vy < 0 && (!bomb.lastTrailTime || frameNow - bomb.lastTrailTime >= 35)) {
          bomb.lastTrailTime = frameNow;
          spawnAscentSpark(bomb.x, bomb.y + bomb.radius * 0.7, bomb.config.color, frameNow);
        }

        // Soft screen border bounce
        if (bomb.x < bomb.radius + 15) {
          bomb.x = bomb.radius + 15;
          bomb.vx = Math.abs(bomb.vx) * 0.7;
        } else if (bomb.x > screenW - bomb.radius - 15) {
          bomb.x = screenW - bomb.radius - 15;
          bomb.vx = -Math.abs(bomb.vx) * 0.7;
        }

        // Missed bomb: falls below screen
        if (bomb.y > screenH + 80 && bomb.vy > 0) {
          bomb.active = false;
          if (slotEl) slotEl.style.display = 'none';
          continue;
        }

        // Optimized Swept Continuous Collision Detection:
        // Broad-phase AABB test eliminates 95%+ of calculations before computing squared distance!
        if (!isTouchModeRef.current && bomb.scale >= 0.8 && touchPointsCount > 0) {
          for (let pIdx = 0; pIdx < touchPointsCount; pIdx++) {
            const pt = touchPointsPool.current[pIdx];
            const pad = bomb.radius + pt.radius;

            // Fast broad-phase bounding box check
            const minX = (bomb.prevX < bomb.x ? bomb.prevX : bomb.x) - pad;
            const maxX = (bomb.prevX > bomb.x ? bomb.prevX : bomb.x) + pad;
            if (pt.x < minX || pt.x > maxX) continue;

            const minY = (bomb.prevY < bomb.y ? bomb.prevY : bomb.y) - pad;
            const maxY = (bomb.prevY > bomb.y ? bomb.prevY : bomb.y) + pad;
            if (pt.y < minY || pt.y > maxY) continue;

            // Narrow-phase squared distance test (no Math.sqrt)
            const distSq = distToSegmentSq(pt.x, pt.y, bomb.prevX, bomb.prevY, bomb.x, bomb.y);
            if (distSq <= pad * pad) {
              handleBurst(bomb.slotIndex, frameNow);
              break;
            }
          }
        }

        // Direct hardware-accelerated DOM updates (zero React reconciliation!)
        if (slotEl) {
          slotEl.style.transform = `translate3d(${Math.round(bomb.x - bomb.radius)}px, ${Math.round(
            bomb.y - bomb.radius
          )}px, 0) scale(${bomb.scale.toFixed(3)})`;
          slotEl.style.opacity = '1';
        }
        if (rotEl) {
          rotEl.style.transform = `rotate(${Math.round(bomb.rot)}deg)`;
        }
      }

      // 5. Mortar recoil direct transform update (only when firing in last 240ms)
      const currentMortars = mortarsRef.current;
      for (let mIdx = 0; mIdx < currentMortars.length; mIdx++) {
        const m = currentMortars[mIdx];
        const mEl = mortarElsRef.current[mIdx];
        if (!mEl) continue;
        const elapsed = frameNow - m.lastFiredTime;
        if (elapsed >= 0 && elapsed <= 240) {
          const { kickY, scaleY, scaleX, extraRot } = getMortarRecoilTransform(
            frameNow,
            m.lastFiredTime,
            m.angleDeg
          );
          mEl.style.transform = `translateX(-50%) translateY(${kickY.toFixed(1)}px) scaleX(${scaleX.toFixed(
            2
          )}) scaleY(${scaleY.toFixed(2)}) rotate(${(m.angleDeg + extraRot).toFixed(1)}deg)`;
        } else if (elapsed > 240 && elapsed < 300) {
          mEl.style.transform = `translateX(-50%) translateY(0px) scaleX(1) scaleY(1) rotate(${m.angleDeg}deg)`;
        }
      }

      // 6. Direct 2D Canvas Render: Particles, Exhaust, Explosions & Floating Popups
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Re-sync size when low-end mode switches mid-round, then draw in CSS pixels
          syncCanvasSize();
          ctx.setTransform(canvas.width / screenW, 0, 0, canvas.height / screenH, 0, 0);
          ctx.clearRect(0, 0, screenW, screenH);

          // Rocket propulsion exhaust plumes under ascending bombs
          ctx.save();
          for (const b of bombPoolRef.current) {
            if (b.active && !b.isBursting && b.vy < -150) {
              const exhaustY = b.y + b.radius * 0.72;
              ctx.fillStyle = '#F59E0B';
              ctx.beginPath();
              ctx.ellipse(b.x, exhaustY, 4, 10, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#FEF08A';
              ctx.beginPath();
              ctx.ellipse(b.x, exhaustY - 2, 2.5, 6, 0, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();

          // Render & update canvas particles
          const particles = particlesPoolRef.current;
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.active) continue;

            const elapsed = frameNow - p.startTime;
            if (elapsed >= p.lifetime) {
              p.active = false;
              continue;
            }

            const t = Math.min(1.0, elapsed / p.lifetime);

            if (p.type === 'shockwave') {
              const radius = p.size + (p.maxSize - p.size) * t;
              const alpha = Math.max(0, (1 - t) * 0.95);
              ctx.save();
              ctx.strokeStyle = p.color;
              ctx.lineWidth = Math.max(1, 3.5 * (1 - t));
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            } else if (p.type === 'flash') {
              const radius = p.size + (p.maxSize - p.size) * t;
              const alpha = Math.max(0, (1 - t) * 0.95);
              ctx.save();
              ctx.fillStyle = '#FFFFFF';
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } else if (p.type === 'muzzle') {
              const radius = p.size + (p.maxSize - p.size) * t;
              const alpha = Math.max(0, (1 - t) * 0.9);
              ctx.save();
              ctx.fillStyle = '#FEF08A';
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } else if (p.type === 'ember') {
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              p.vy += 800 * dt; // gravity
              const size = Math.max(1, p.size * (1 - t * 0.7));
              const alpha = Math.max(0, (1 - t) * 0.9);
              ctx.save();
              ctx.fillStyle = p.color;
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } else if (p.type === 'smoke') {
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              const size = p.size + (p.maxSize - p.size) * t;
              const alpha = Math.max(0, (1 - t) * p.alpha);
              ctx.save();
              ctx.fillStyle = p.color;
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } else if (p.type === 'spark') {
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              const size = Math.max(1, p.size * (1 - t * 0.6));
              const alpha = Math.max(0, (1 - t) * 0.85);
              ctx.save();
              ctx.fillStyle = p.color;
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }

          // Floating Score Popups with smooth delta-time float and alpha fade
          const popups = scorePopupsPoolRef.current;
          for (let i = 0; i < popups.length; i++) {
            const p = popups[i];
            if (!p.active) continue;

            const elapsed = frameNow - p.startTime;
            if (elapsed >= p.duration) {
              p.active = false;
              continue;
            }

            const t = elapsed / p.duration;
            const currentY = p.startY - Math.sin(t * (Math.PI / 2)) * 42;
            const alpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.lineWidth = 5;
            ctx.strokeText(p.text, p.x, currentY);

            ctx.fillStyle = p.isPenalty ? '#EF4444' : '#FDE047';
            ctx.fillText(p.text, p.x, currentY);
            ctx.restore();
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    const handleResize = () => {
      syncCanvasSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isActive, scheduleBurst, launchSingleBomb, handleBurst, syncCanvasSize]);

  if (!isActive) return null;

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
      {/* 1. HIGH-SPEED 2D CANVAS FOR PARTICLES, EXPLOSIONS & POPUPS     */}
      {/* ============================================================== */}
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-10" />

      {/* ============================================================== */}
      {/* 2. ROW OF LAUNCH CONTAINERS (MORTARS) ALONG THE BOTTOM          */}
      {/* ============================================================== */}
      <div className="fixed bottom-0 inset-x-0 h-24 pointer-events-none z-20 flex items-end justify-center">
        {/* Bottom Mount Baseline Runner */}
        <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-neutral-950 via-neutral-900 to-amber-950/40 border-t border-amber-500/25 shadow-[0_-4px_20px_rgba(0,0,0,0.8)]" />

        {/* Individual Decorative Brass Launch Mortar Tubes */}
        {mortarsRef.current.map((mortar, idx) => (
          <div
            key={mortar.id}
            ref={(el) => {
              mortarElsRef.current[idx] = el;
            }}
            className="absolute bottom-2 flex flex-col items-center select-none will-change-transform"
            style={{
              left: `${mortar.pctX * 100}%`,
              transform: `translateX(-50%) translateY(0px) scaleX(1) scaleY(1) rotate(${mortar.angleDeg}deg)`,
              transformOrigin: '50% 90%',
            }}
          >
            {/* Ornate Cannon / Mortar Tube */}
            <div className="relative w-12 sm:w-14 h-16 sm:h-20 flex flex-col items-center">
              {/* Dark Inner Bore (Nozzle Mouth) */}
              <div className="relative w-10 sm:w-12 h-3.5 rounded-full bg-neutral-950 border-2 border-amber-400/90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.95)] flex items-center justify-center">
                <div className="w-6 h-1.5 rounded-full bg-amber-500/40 blur-xs" />
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
        ))}
      </div>

      {/* ============================================================== */}
      {/* 3. POOLED BOMB DOM SLOTS (TRANSFORMS UPDATED DIRECTLY VIA RAF)  */}
      {/* ============================================================== */}
      {Array.from({ length: MAX_BOMB_SLOTS }).map((_, slotIdx) => {
        const config = slotConfigs[slotIdx];
        const radius = bombPoolRef.current[slotIdx]?.radius || 52;
        const size = radius * 2;

        return (
          <div
            key={slotIdx}
            ref={(el) => {
              bombSlotElsRef.current[slotIdx] = el;
            }}
            onPointerDown={(e) => {
              if (!isTouchMode) return;
              e.preventDefault();
              e.stopPropagation();
              handleBurst(slotIdx, performance.now());
            }}
            className={`absolute will-change-transform select-none touch-none ${
              isTouchMode ? 'pointer-events-auto cursor-pointer active:scale-95' : 'pointer-events-none'
            }`}
            style={{
              top: 0,
              left: 0,
              width: `${size}px`,
              height: `${size}px`,
              display: 'none',
              transformOrigin: '50% 50%',
            }}
          >
            <div
              ref={(el) => {
                bombSlotRotElsRef.current[slotIdx] = el;
              }}
              className="w-full h-full will-change-transform"
              style={{
                transformOrigin: '50% 55%',
              }}
            >
              {config && (
                <CartoonBombSvg
                  bomb={config}
                  size={size}
                  showBadge={true}
                  isBursting={false}
                  rotation={0}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
