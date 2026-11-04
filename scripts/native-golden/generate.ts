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
import type { GameScoreState, HandGesture } from '../../src/types/motion';
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
