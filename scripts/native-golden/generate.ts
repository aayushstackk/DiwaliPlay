/**
 * Golden fixture generator for the native Android port.
 *
 * Usage:
 *   npx tsx scripts/native-golden/generate.ts --out <dir> [--out-tracking <dir>]
 *
 * Add a fixture by adding one entry to `generators`. Each entry has a `target`
 * ("game" -> --out, "tracking" -> --out-tracking) and a `run()` that returns
 * JSON-serialisable data, written to <target dir>/<name>.json.
 * Generators that use randomness should call `withSeededRandom(seed, fn)`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mulberry32 } from './mulberry32';
import { formatGameTimer, calculateBurstPoints, getScoreTier } from '../../src/utils/scoreSystem';
import { calculateAchievement, getPersonalizedWish, DEFAULT_ACHIEVEMENT_TIERS } from '../../src/utils/achievements';
import {
  HAND_BONES, LEFT_TARGET_AREA, RIGHT_TARGET_AREA, getPalmCenterScreen, isPointInsideRect, categorizeSpeed,
  calculateMovementDirection, extrapolateLandmarks, evaluateGameMapping,
} from '../../src/utils/motionMath';
import { recognizeHandGesture } from '../../src/utils/gestureRecognition';
import type { GameScoreState, HandGesture, LandmarkPoint } from '../../src/types/motion';
import type { AchievementTier } from '../../src/types/backend';

type Target = 'game' | 'tracking';

export interface Generator {
  target: Target;
  run: () => unknown | Promise<unknown>;
}

/** Runs fn with Math.random patched to mulberry32(seed); always restores it. */
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function sequence(seed: number, count: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => rng());
}

const GESTURES: HandGesture[] = ['OPEN_PALM', 'FIST', 'THUMBS_UP', 'POINTING', 'PEACE', 'UNKNOWN'];

/** Two tiers with an open-ended top (maxScore null), a gap (501..999) and sparse optional fields. */
const CUSTOM_TIERS: AchievementTier[] = [
  { id: 'c1', title: 'Low', minScore: 0, maxScore: 500, wishes: ['ONE LINE {playerName}'] },
  { id: 'c2', title: 'High', subtitle: 'Top', minScore: 1000, maxScore: null, emoji: '🏆', badgeColor: 'from-red-500', wishes: [] },
];

/** Custom tiers exercising wish line-count branches and every placeholder. */
const WISH_TIERS: AchievementTier[] = [
  { id: 'w1', title: 'W1', minScore: 0, maxScore: 999, wishes: ['Only one line {playerName}', 'A\nB', 'H {playerName}\n\n  {score} {rank}  \nS {brandName} {playerName}'] },
  { id: 'w2', title: 'W2', minScore: 1000, maxScore: null, wishes: [] },
];

function scoreRange(max: number, step: number): number[] {
  const out: number[] = [];
  for (let s = 0; s <= max; s += step) out.push(s);
  return out;
}

const stat = (score: number): GameScoreState => ({ score, multiplier: 1, crackersBurst: 0, maxSpeed: 0, comboCount: 0, punchCount: 0, comboDurationSec: 0, bombsBurst: 0, combosAwarded: 0, penaltyDeductions: 0, comboBonusPoints: 0, targetScore: undefined, targetAchieved: false });


const CANVAS_W = 1920;
const CANVAS_H = 1080;

/** Builds a 21-point hand pointing up the screen; `ext` = [thumb, index, middle, ring, pinky] extended. */
function poseHand(ext: boolean[], thumbUp = false): LandmarkPoint[] {
  const pts: LandmarkPoint[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }));
  pts[0] = { x: 0.5, y: 0.8, z: 0 };
  const mcpX = [0.46, 0.5, 0.54, 0.58]; // index..pinky MCP columns relative to wrist x 0.5
  const mcpY = [0.62, 0.6, 0.62, 0.65];
  pts[1] = { x: 0.45, y: 0.76, z: 0 };
  pts[2] = { x: 0.43, y: 0.72, z: 0 };
  if (ext[0]) {
    pts[3] = { x: 0.36, y: thumbUp ? 0.5 : 0.68, z: 0 };
    pts[4] = { x: 0.3, y: thumbUp ? 0.4 : 0.64, z: 0 };
  } else {
    pts[3] = { x: 0.46, y: 0.7, z: 0 };
    pts[4] = { x: 0.5, y: 0.68, z: 0 };
  }
  for (let f = 0; f < 4; f++) {
    const base = 5 + f * 4;
    const x = mcpX[f] + (f - 1.5) * 0.005;
    const y = mcpY[f];
    pts[base] = { x, y, z: 0 };
    if (ext[f + 1]) {
      pts[base + 1] = { x, y: y - 0.08, z: 0 };
      pts[base + 2] = { x, y: y - 0.14, z: 0 };
      pts[base + 3] = { x, y: y - 0.2, z: 0 };
    } else {
      pts[base + 1] = { x, y: y - 0.07, z: 0 };
      pts[base + 2] = { x, y: y - 0.03, z: 0 };
      pts[base + 3] = { x, y: y + 0.03, z: 0 };
    }
  }
  return pts;
}

const CANONICAL_POSES: { name: string; expected: HandGesture; landmarks: LandmarkPoint[] }[] = [
  { name: 'fist', expected: 'FIST', landmarks: poseHand([false, false, false, false, false]) },
  { name: 'open_palm', expected: 'OPEN_PALM', landmarks: poseHand([true, true, true, true, true]) },
  { name: 'peace', expected: 'PEACE', landmarks: poseHand([false, true, true, false, false]) },
  { name: 'pointing', expected: 'POINTING', landmarks: poseHand([false, true, false, false, false]) },
];

function motionHandSets() {
  const rng = mulberry32(5150);
  const r = (a: number, b: number) => a + (b - a) * rng();
  const sets: { name: string; landmarks: LandmarkPoint[] }[] = [];
  for (const p of CANONICAL_POSES) {
    if (recognizeHandGesture(p.landmarks) !== p.expected) {
      throw new Error(`canonical pose ${p.name} did not recognise as ${p.expected}`);
    }
    sets.push({ name: 'canonical_' + p.name, landmarks: p.landmarks });
  }
  // 100 fully random hands (coordinates slightly outside 0..1 to exercise clamping)
  for (let i = 0; i < 100; i++) {
    sets.push({
      name: 'random_' + i,
      landmarks: Array.from({ length: 21 }, () => ({ x: r(-0.05, 1.05), y: r(-0.05, 1.05), z: r(-0.2, 0.2) })),
    });
  }
  // 100 structured hands: random finger extension + noise + random placement and z
  for (let i = 0; i < 100; i++) {
    const ext = Array.from({ length: 5 }, () => rng() < 0.5);
    const dx = r(-0.3, 0.3);
    const dy = r(-0.15, 0.15);
    const scale = r(0.5, 1.5);
    sets.push({
      name: 'structured_' + i,
      landmarks: poseHand(ext, rng() < 0.5).map((p) => ({
        x: 0.5 + (p.x - 0.5) * scale + dx + r(-0.01, 0.01),
        y: 0.8 + (p.y - 0.8) * scale + dy + r(-0.01, 0.01),
        z: r(-0.1, 0.1),
      })),
    });
  }
  return sets;
}

const GESTURE_LIST: HandGesture[] = ['OPEN_PALM', 'FIST', 'THUMBS_UP', 'POINTING', 'PEACE', 'UNKNOWN'];

export const generators: Record<string, Generator> = {
  score_system: {
    target: 'game',
    run: () => ({
      timer: [-1, 0, 0.2, 9.99, 35, 61.5, 3600].map((input) => ({ input, output: formatGameTimer(input) })),
      burst: Array.from({ length: 31 }, (_, i) => i * 50).flatMap((speed) =>
        GESTURES.flatMap((gesture) =>
          [true, false].map((isCombo) => ({ speed, gesture, isCombo, ...calculateBurstPoints(speed, gesture, isCombo) })),
        ),
      ),
      tiers: scoreRange(6000, 25).map((score) => ({ score, ...getScoreTier(score) })),
    }),
  },
  achievements: {
    target: 'game',
    run: () => ({
      defaultTiers: DEFAULT_ACHIEVEMENT_TIERS,
      customTiers: CUSTOM_TIERS,
      achievements: scoreRange(6000, 25).map((score) => ({
        score,
        default: calculateAchievement(stat(score)),
        custom: calculateAchievement(stat(score), CUSTOM_TIERS),
      })),
      wishes: Array.from({ length: 50 }, (_, i) => {
        const score = [0, 120, 999, 1000, 1234, 1500, 2000, 5432, 1234567][i % 9];
        const playerName = i % 7 === 3 ? '' : i % 5 === 0 ? 'Ayesha' : 'Player ' + i;
        const brandName = i % 6 === 2 ? '' : i % 4 === 0 ? 'Skuka' : 'ItsSpotlight';
        const rank = i % 3 === 0 ? undefined : i % 3 === 1 ? String(i) : '';
        const tiers = i % 10 < 4 ? undefined : i % 10 < 7 ? WISH_TIERS : CUSTOM_TIERS;
        const seed = 1000 + i;
        const stats = stat(score);
        const out = withSeededRandom(seed, () =>
          getPersonalizedWish(stats, calculateAchievement(stats, tiers), playerName, brandName, tiers, rank),
        );
        return { seed, score, playerName, brandName, rank: rank ?? null, tiers: tiers === undefined ? 'default' : tiers === WISH_TIERS ? 'wish' : 'custom', ...out };
      }),
      wishTiers: WISH_TIERS,
    }),
  },
  random_sequence: {
    target: 'game',
    run: () => ({
      count: 1000,
      sequences: [
        { seed: 42, values: sequence(42, 1000) },
        { seed: -7, values: sequence(-7, 1000) },
      ],
    }),
  },
  motion_math: {
    target: 'tracking',
    run: () => {
      const sets = motionHandSets();
      const velocities = [[0, 0], [30, 30], [44.9, 0], [45, 0], [500, 10], [300, 300], [0, 800], [-300, 300], [-800, 0], [-300, -300], [0, -800], [300, -300], [-1000, 5], [-1000, -5], [200, 83], [-83, 200], [1920, 1080], [-1920, -1080]];
      const dts = [0, 0.016, 0.033, 0.1];
      const dampings = [undefined, 0, 0.3, 1];
      const speeds = [-5, 0, 39.99, 40, 100, 179.99, 180, 300, 449.99, 450, 2000];
      const speedPairs: [number, number][] = [];
      for (const a of [0, 39, 40, 139, 140, 319, 320, 499, 500, 1000]) for (const b of [0, 40, 281, 300, 600]) speedPairs.push([a, b]);
      speedPairs.push([281, 281], [280, 280], [280, 281], [1e4, 1e4]);
      return {
        width: CANVAS_W,
        height: CANVAS_H,
        bones: HAND_BONES,
        leftArea: LEFT_TARGET_AREA,
        rightArea: RIGHT_TARGET_AREA,
        hands: sets.map((s, i) => ({
          name: s.name,
          landmarks: s.landmarks,
          palmCenter: getPalmCenterScreen(s.landmarks),
          extrapolated: (i < 8 ? velocities.map((v, j) => j) : [0, 1].map((k) => (i * 2 + k) % velocities.length)).map((j) => {
            const [vx, vy] = velocities[j];
            const dt = dts[(i + j) % dts.length];
            const damping = dampings[(i + j) % dampings.length];
            return { vx, vy, dt, damping: damping ?? null, out: extrapolateLandmarks(s.landmarks, vx, vy, dt, CANVAS_W, CANVAS_H, damping) };
          }),
        })),
        emptyPalm: getPalmCenterScreen([]),
        shortPalm: getPalmCenterScreen([{ x: 0.2, y: 0.4, z: 0 }]),
        emptyExtrapolate: extrapolateLandmarks([], 100, 100, 0.1, CANVAS_W, CANVAS_H),
        zeroSizeExtrapolate: extrapolateLandmarks(sets[4].landmarks, 100, 100, 0.1, 0, 0, 0.5),
        rectChecks: [
          [0, 0.5], [0.0, 0.02], [0.52, 0.98], [0.5, 0.5], [0.48, 0.5], [0.4799, 0.5], [0.5201, 0.5], [1, 0.98], [1, 0.99], [0.3, 0.01], [0.7, 1], [-0.1, 0.5],
          ...Array.from({ length: 60 }, (_, i) => [(i % 12) / 11, Math.floor(i / 12) / 4] as [number, number]),
        ].map(([x, y]) => ({
          x, y,
          left: isPointInsideRect({ x, y }, LEFT_TARGET_AREA),
          right: isPointInsideRect({ x, y }, RIGHT_TARGET_AREA),
        })),
        speeds: speeds.map((input) => ({ input, output: categorizeSpeed(input) })),
        directions: [
          ...velocities.map(([vx, vy]) => [vx, vy]),
          ...Array.from({ length: 72 }, (_, k) => [Math.cos((k * 5 * Math.PI) / 180) * 100, Math.sin((k * 5 * Math.PI) / 180) * 100]),
          [-100, 0], [-100, -0], [-100, 1e-9], [-100, -1e-9], [46, 0], [44, 0],
        ].map(([vx, vy]) => ({ vx, vy, output: calculateMovementDirection(vx, vy) })),
        mappings: speedPairs.flatMap(([l, r]) =>
          GESTURE_LIST.flatMap((lg, gi) => {
            const rg = GESTURE_LIST[(gi + l + r) % GESTURE_LIST.length];
            return [{ leftSpeed: l, rightSpeed: r, leftGesture: lg, rightGesture: rg, ...evaluateGameMapping(l, r, lg, rg) }];
          }),
        ),
      };
    },
  },
  gestures: {
    target: 'tracking',
    run: () => ({
      cases: motionHandSets().map((s) => ({ name: s.name, landmarks: s.landmarks, gesture: recognizeHandGesture(s.landmarks) })),
      short: recognizeHandGesture(motionHandSets()[0].landmarks.slice(0, 20)),
      empty: recognizeHandGesture([]),
      thumbsUpPoses: [true, false].map((up) => {
        const lm = poseHand([true, false, false, false, false], up);
        return { thumbUp: up, landmarks: lm, gesture: recognizeHandGesture(lm) };
      }),
    }),
  },
};

function parseArgs(argv: string[]): Record<Target, string | undefined> {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { game: get('--out'), tracking: get('--out-tracking') };
}

async function main() {
  const dirs = parseArgs(process.argv.slice(2));
  if (!dirs.game) {
    console.error('Usage: generate.ts --out <dir> [--out-tracking <dir>]');
    process.exit(1);
  }
  for (const [name, gen] of Object.entries(generators)) {
    const dir = dirs[gen.target];
    if (!dir) {
      console.warn(`skip ${name}: no output dir for target "${gen.target}"`);
      continue;
    }
    mkdirSync(resolve(dir), { recursive: true });
    const file = join(resolve(dir), `${name}.json`);
    writeFileSync(file, JSON.stringify(await gen.run()) + '\n');
    console.log(`wrote ${file}`);
  }
}

main();
