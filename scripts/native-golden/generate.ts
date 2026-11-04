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

export const generators: Record<string, Generator> = {
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
