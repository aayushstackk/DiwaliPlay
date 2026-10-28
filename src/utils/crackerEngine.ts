/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HandGesture } from '../types/motion';

export type CrackerStyle =
  | 'SPARK_BURST'
  | 'ANAR_FLOWERPOT'
  | 'ROCKET_TRAIL'
  | 'RADIAL_BOMB'
  | 'GOLDEN_SHOWER'
  | 'COLOR_FIREWORK'
  | 'CHAKRI_SPIN'
  | 'PUNCH_BLAST'
  | 'LAD_POPPERS'
  | 'MEGA_COMBO';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  size: number;
  color: string;
  glowColor: string;
  gravity: number;
  drag: number;
  flicker: boolean;
  trailX: number;
  trailY: number;
}

interface ShockwaveRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  speed: number;
}

// Festive Diwali Fireworks Color Palettes
const COLOR_PALETTES = {
  gold: ['#FFFBEB', '#FEF08A', '#FDE047', '#F59E0B', '#D97706'],
  saffron: ['#FFF7ED', '#FFEDD5', '#FB923C', '#EA580C', '#C2410C'],
  ruby: ['#FFF1F2', '#FECDD3', '#FB7185', '#F43F5E', '#E11D48'],
  emerald: ['#ECFDF5', '#A7F3D0', '#34D399', '#10B981', '#059669'],
  royal: ['#FAF5FF', '#E9D5FF', '#C084FC', '#A855F7', '#7E22CE'],
  electric: ['#F0FDF4', '#6EE7B7', '#38BDF8', '#818CF8', '#C084FC'],
};

const ALL_PALETTE_NAMES = ['gold', 'saffron', 'ruby', 'emerald', 'royal', 'electric'] as const;

function randomFrom<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * High-performance Object-Pooled Diwali Cracker Particle Simulation Engine.
 * Recycles particles to ensure 60 FPS without Garbage Collection pauses.
 */
export class CrackerEngine {
  private particles: Particle[];
  private maxParticles = 700;
  private rings: ShockwaveRing[];
  private maxRings = 40;

  // Statistics
  public totalBursts = 0;
  public activeCount = 0;
  public lastStyle: CrackerStyle = 'SPARK_BURST';

  // Screen flash vignette on mega explosions
  public flashIntensity = 0;

  constructor(maxParticles = 700) {
    this.maxParticles = maxParticles;
    this.particles = new Array(maxParticles).fill(null).map(() => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      alpha: 0,
      decay: 0.02,
      size: 2,
      color: '#F59E0B',
      glowColor: 'rgba(245, 158, 11, 0.5)',
      gravity: 0.12,
      drag: 0.97,
      flicker: false,
      trailX: 0,
      trailY: 0,
    }));

    this.rings = new Array(this.maxRings).fill(null).map(() => ({
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 80,
      color: '#FEF08A',
      alpha: 1,
      speed: 4,
    }));
  }

  /**
   * Spawns a particle from the recycled pool
   */
  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    glowColor: string,
    size: number,
    decay: number,
    gravity = 0.12,
    drag = 0.97,
    flicker = true
  ) {
    // Find next inactive particle in ring buffer
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.trailX = x;
        p.trailY = y;
        p.vx = vx;
        p.vy = vy;
        p.color = color;
        p.glowColor = glowColor;
        p.size = size;
        p.alpha = 1.0;
        p.decay = decay;
        p.gravity = gravity;
        p.drag = drag;
        p.flicker = flicker;
        return;
      }
    }
  }

  /**
   * Spawns a shockwave blast ring
   */
  private spawnRing(x: number, y: number, maxRadius: number, color: string, speed = 4) {
    for (let i = 0; i < this.maxRings; i++) {
      const r = this.rings[i];
      if (!r.active) {
        r.active = true;
        r.x = x;
        r.y = y;
        r.radius = 4;
        r.maxRadius = maxRadius;
        r.color = color;
        r.alpha = 0.9;
        r.speed = speed;
        return;
      }
    }
  }

  /**
   * Triggers a cracker burst based on hand kinematics and gesture
   */
  public triggerCracker(
    x: number,
    y: number,
    speed: number,
    gesture: HandGesture,
    isCombo = false
  ) {
    this.totalBursts++;

    // Multiplier based on speed and combo
    const speedFactor = Math.min(Math.max((speed - 40) / 450, 0.2), 2.2);
    const comboMult = isCombo ? 1.7 : 1.0;

    // Fast fist/punch -> Massive radial bomb burst
    if (gesture === 'FIST') {
      if (speed > 420) {
        this.createPunchBlast(x, y, speedFactor * comboMult);
        this.lastStyle = 'PUNCH_BLAST';
      } else {
        this.createRadialBomb(x, y, speedFactor * comboMult);
        this.lastStyle = 'RADIAL_BOMB';
      }
      return;
    }

    // Open palm -> spark shower or flowerpot anar
    if (gesture === 'OPEN_PALM') {
      if (Math.random() > 0.4) {
        this.createAnarFlowerpot(x, y, speedFactor * comboMult);
        this.lastStyle = 'ANAR_FLOWERPOT';
      } else {
        this.createGoldenShower(x, y, speedFactor * comboMult);
        this.lastStyle = 'GOLDEN_SHOWER';
      }
      return;
    }

    // Peace sign -> double rocket blooming fireworks
    if (gesture === 'PEACE') {
      this.createRocketBurst(x, y, speedFactor * comboMult);
      this.lastStyle = 'ROCKET_TRAIL';
      return;
    }

    // Pointing -> popping lad crackers
    if (gesture === 'POINTING') {
      this.createLadPoppers(x, y, speedFactor * comboMult);
      this.lastStyle = 'LAD_POPPERS';
      return;
    }

    // Random procedural selection for natural hand movement
    const styles: Array<() => void> = [
      () => this.createSparkBurst(x, y, speedFactor * comboMult),
      () => this.createAnarFlowerpot(x, y, speedFactor * comboMult),
      () => this.createChakriSpin(x, y, speedFactor * comboMult),
      () => this.createColorfulFirework(x, y, speedFactor * comboMult),
      () => this.createGoldenShower(x, y, speedFactor * comboMult),
    ];

    const pick = randomFrom(styles);
    pick();
  }

  /**
   * Spawns trailing festive stardust sparkles that follow hand movements smoothly
   */
  public addMotionSparkles(x: number, y: number, side: 'left' | 'right', speed: number) {
    if (speed < 40) return; // Silent & clean when idle
    const count = speed > 240 ? 2 : 1;
    const pal = side === 'left' ? COLOR_PALETTES.gold : COLOR_PALETTES.ruby;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = randomRange(0.4, 1.8);
      const color = randomFrom(pal);
      this.spawnParticle(
        x + randomRange(-6, 6),
        y + randomRange(-6, 6),
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        color,
        randomRange(1.2, 2.2),
        randomRange(0.045, 0.08),
        0.05,
        0.96,
        true
      );
    }
  }

  // 1. Phuljhadi / Spark Burst (Sizzling festive sparks)
  public createSparkBurst(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(14, 22) * intensity);
    const palKey = randomFrom(ALL_PALETTE_NAMES);
    const pal = COLOR_PALETTES[palKey];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = randomRange(2, 6) * intensity;
      const color = randomFrom(pal);
      this.spawnParticle(
        x + randomRange(-6, 6),
        y + randomRange(-6, 6),
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        color,
        randomRange(1.4, 2.8),
        randomRange(0.025, 0.055),
        0.08,
        0.96,
        true
      );
    }
  }

  // 2. Anar / Flowerpot Fountain (Upward sparkling fountain plume)
  public createAnarFlowerpot(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(18, 30) * intensity);
    const pal = Math.random() > 0.5 ? COLOR_PALETTES.gold : COLOR_PALETTES.saffron;

    for (let i = 0; i < count; i++) {
      const angle = randomRange(-Math.PI * 0.75, -Math.PI * 0.25); // spray upwards
      const vel = randomRange(3.5, 9.5) * intensity;
      const color = randomFrom(pal);
      this.spawnParticle(
        x + randomRange(-10, 10),
        y + randomRange(-3, 3),
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        color,
        randomRange(1.4, 2.6),
        randomRange(0.022, 0.045),
        0.18, // gravity pulls sparks down in graceful arcs
        0.98,
        true
      );
    }
    this.spawnRing(x, y, 32 * intensity, '#FDE047', 3);
  }

  // 3. Radial Atom Bomb Explosion (Loud burst with expanding shockwave)
  public createRadialBomb(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(24, 40) * intensity);
    const palKey = randomFrom(['ruby', 'saffron', 'gold'] as const);
    const pal = COLOR_PALETTES[palKey];

    this.spawnRing(x, y, 65 * intensity, '#F59E0B', 5);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = randomRange(2.8, 8.5) * intensity;
      const color = randomFrom(pal);
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        color,
        randomRange(2.0, 3.4),
        randomRange(0.02, 0.045),
        0.09,
        0.965,
        true
      );
    }
  }

  // 4. Punch Blast / Fast Fist Overdrive Explosion
  public createPunchBlast(x: number, y: number, intensity = 1.2) {
    const count = Math.round(randomRange(36, 60) * intensity);
    this.flashIntensity = Math.min(this.flashIntensity + 0.3, 0.6);

    this.spawnRing(x, y, 95 * intensity, '#FFFFFF', 6.5);
    this.spawnRing(x, y, 55 * intensity, '#F43F5E', 4);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = randomRange(4.5, 12) * intensity;
      const color = Math.random() > 0.3 ? randomFrom(COLOR_PALETTES.ruby) : '#FFFFFF';
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        '#FEF08A',
        randomRange(2.2, 3.8),
        randomRange(0.016, 0.036),
        0.10,
        0.97,
        true
      );
    }
  }

  // 5. Chakri Wheel Spin (Vortex of spiral sparks)
  public createChakriSpin(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(20, 34) * intensity);
    const pal = COLOR_PALETTES.electric;
    const baseAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < count; i++) {
      const arm = (i % 4) * (Math.PI / 2);
      const angle = baseAngle + arm + randomRange(-0.25, 0.25);
      const vel = randomRange(2.5, 6.8) * intensity;
      const color = randomFrom(pal);
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        color,
        randomRange(1.6, 3.0),
        randomRange(0.025, 0.048),
        0.04,
        0.975,
        true
      );
    }
  }

  // 6. Rocket Firework Bloom
  public createRocketBurst(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(26, 42) * intensity);
    const pal = COLOR_PALETTES.royal;

    this.spawnRing(x, y, 70 * intensity, '#C084FC', 4.5);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const vel = randomRange(3.5, 7.5) * intensity;
      const color = randomFrom(pal);
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        color,
        randomRange(1.8, 3.2),
        randomRange(0.022, 0.042),
        0.07,
        0.98,
        true
      );
    }
  }

  // 7. Golden Spark Shower
  public createGoldenShower(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(14, 26) * intensity);
    for (let i = 0; i < count; i++) {
      const vx = randomRange(-3.5, 3.5) * intensity;
      const vy = randomRange(-1, 4.5) * intensity;
      const color = randomFrom(COLOR_PALETTES.gold);
      this.spawnParticle(
        x + randomRange(-12, 12),
        y + randomRange(-12, 12),
        vx,
        vy,
        color,
        color,
        randomRange(1.4, 2.4),
        randomRange(0.025, 0.048),
        0.16,
        0.97,
        true
      );
    }
  }

  // 8. Colorful Multi-Star Firework
  public createColorfulFirework(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(20, 34) * intensity);
    for (let i = 0; i < count; i++) {
      const palKey = randomFrom(ALL_PALETTE_NAMES);
      const color = randomFrom(COLOR_PALETTES[palKey]);
      const angle = Math.random() * Math.PI * 2;
      const vel = randomRange(2.5, 6.8) * intensity;
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        color,
        color,
        randomRange(1.8, 3.0),
        randomRange(0.024, 0.046),
        0.08,
        0.97,
        true
      );
    }
  }

  // 9. Popping Lad Crackers (Crackling string fireworks)
  public createLadPoppers(x: number, y: number, intensity = 1.0) {
    const count = Math.round(randomRange(10, 18) * intensity);
    for (let i = 0; i < count; i++) {
      const offsetX = randomRange(-20, 20);
      const offsetY = randomRange(-20, 20);
      const angle = Math.random() * Math.PI * 2;
      const vel = randomRange(1.2, 3.8);
      this.spawnParticle(
        x + offsetX,
        y + offsetY,
        Math.cos(angle) * vel,
        Math.sin(angle) * vel,
        randomFrom(COLOR_PALETTES.ruby),
        '#FFFFFF',
        randomRange(1.4, 2.4),
        randomRange(0.05, 0.09),
        0.06,
        0.95,
        true
      );
    }
  }

  // 10. MEGA COMBO BLAST (Triggered when both hands are moving fast)
  public createMegaComboBlast(x1: number, y1: number, x2: number, y2: number) {
    this.lastStyle = 'MEGA_COMBO';
    this.totalBursts += 2;
    this.flashIntensity = 0.65;

    // Center point between both hands
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    this.spawnRing(midX, midY, 140, '#F59E0B', 7);
    this.spawnRing(x1, y1, 85, '#F43F5E', 5.5);
    this.spawnRing(x2, y2, 85, '#38BDF8', 5.5);

    this.createPunchBlast(x1, y1, 1.2);
    this.createPunchBlast(x2, y2, 1.2);
    this.createAnarFlowerpot(midX, midY, 1.2);
  }

  /**
   * Updates particle positions, velocities, lifetimes, and rings
   */
  public update() {
    let active = 0;

    // Decay screen flash
    if (this.flashIntensity > 0) {
      this.flashIntensity = Math.max(0, this.flashIntensity - 0.04);
    }

    // Update particles
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      active++;
      p.trailX = p.x;
      p.trailY = p.y;

      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;

      p.x += p.vx;
      p.y += p.vy;

      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        p.active = false;
      }
    }

    // Update rings
    for (let i = 0; i < this.maxRings; i++) {
      const r = this.rings[i];
      if (!r.active) continue;

      r.radius += r.speed;
      r.alpha = 1 - r.radius / r.maxRadius;

      if (r.radius >= r.maxRadius || r.alpha <= 0) {
        r.active = false;
      }
    }

    this.activeCount = active;
  }

  /**
   * Renders fireworks and spark effects onto the canvas context.
   * Uses 'lighter' blend mode for luminescent radiant glow without per-particle shadowBlur overhead.
   */
  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    // 1. Screen flash effect on mega explosions
    if (this.flashIntensity > 0.02) {
      ctx.fillStyle = `rgba(255, 245, 210, ${this.flashIntensity * 0.3})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Use additive lighting for radiant firework glows
    ctx.globalCompositeOperation = 'lighter';

    // 2. Render shockwave blast rings
    ctx.lineWidth = 2.5;
    for (let i = 0; i < this.maxRings; i++) {
      const r = this.rings[i];
      if (!r.active) continue;

      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.alpha);
      ctx.stroke();
    }

    // 3. Render glowing cracker spark particles (fast batched rendering)
    ctx.lineCap = 'round';
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      const alpha = p.flicker && Math.random() > 0.85 ? p.alpha * 0.6 : p.alpha;
      if (alpha <= 0.02) continue;

      ctx.globalAlpha = alpha;

      // Draw particle spark streak
      ctx.beginPath();
      ctx.moveTo(p.trailX, p.trailY);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.stroke();

      // Spark head point
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }

    // Restore standard blend mode and alpha
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Clears all particles and resets stats
   */
  public reset() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles[i].active = false;
    }
    for (let i = 0; i < this.maxRings; i++) {
      this.rings[i].active = false;
    }
    this.totalBursts = 0;
    this.activeCount = 0;
    this.flashIntensity = 0;
  }
}
