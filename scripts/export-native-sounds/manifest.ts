/**
 * Writes android-native/app/src/main/assets/sounds/manifest.json from <wavDir>/plan.json and
 * checks that every built-in sound id the web app can reference resolves to an existing file.
 * Exits non-zero on any miss. Run by convert.sh:
 *
 *   npx tsx scripts/export-native-sounds/manifest.ts <wavDir> <soundsAssetDir>
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BGM_TRACK_OPTIONS,
  COMBO_SOUND_OPTIONS,
  COUNTDOWN_GO_OPTIONS,
  COUNTDOWN_STEP_OPTIONS,
  DEFAULT_AUDIO_PRESETS,
  DEFAULT_AUDIO_SETTINGS,
  SFX_OPTIONS,
} from '../../src/utils/audioDefaults';
import { DEFAULT_BOMB_CONFIGS } from '../../src/utils/bombDefaults';
import { SOUND_PROFILES_META } from '../../src/utils/soundEngine';

interface PlanEntry {
  key: string;
  kind: 'effect' | 'bgm' | 'tick' | 'victory';
  ids: { sounds?: string[]; crackers?: string[]; bombPresets?: string[]; bgm?: string; spinTick?: boolean; spinVictory?: boolean };
}

interface Manifest {
  sounds: Record<string, string>;
  crackers: Record<string, string>;
  bombPresets: Record<string, string>;
  bgm: Record<string, { file: string; loop: true }>;
  spinTick: string;
  spinVictory: string;
}

const [wavDir, assetDir] = process.argv.slice(2);
if (!wavDir || !assetDir) {
  console.error('usage: manifest.ts <wavDir> <soundsAssetDir>');
  process.exit(2);
}
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const plan: { entries: PlanEntry[] } = JSON.parse(fs.readFileSync(path.join(wavDir, 'plan.json'), 'utf8'));

// ---------------------------------------------------------------- build
const manifest: Manifest = { sounds: {}, crackers: {}, bombPresets: {}, bgm: {}, spinTick: '', spinVictory: '' };
const errors: string[] = [];
const put = (table: Record<string, string>, id: string, file: string, what: string) => {
  if (table[id] && table[id] !== file) errors.push(`${what} '${id}' mapped twice (${table[id]}, ${file})`);
  table[id] = file;
};
for (const e of plan.entries) {
  const file = `${e.key}.flac`;
  e.ids.sounds?.forEach((id) => put(manifest.sounds, id, file, 'sound'));
  e.ids.crackers?.forEach((id) => put(manifest.crackers, id, file, 'cracker'));
  e.ids.bombPresets?.forEach((id) => put(manifest.bombPresets, id, file, 'bomb preset'));
  if (e.ids.bgm) manifest.bgm[e.ids.bgm] = { file, loop: true };
  if (e.ids.spinTick) manifest.spinTick = file;
  if (e.ids.spinVictory) manifest.spinVictory = file;
}
const sortObj = <T>(o: Record<string, T>) =>
  Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])) as Record<string, T>;
const out = {
  sounds: sortObj(manifest.sounds),
  crackers: sortObj(manifest.crackers),
  bombPresets: sortObj(manifest.bombPresets),
  bgm: sortObj(manifest.bgm),
  spinTick: manifest.spinTick,
  spinVictory: manifest.spinVictory,
};
fs.writeFileSync(path.join(assetDir, 'manifest.json'), JSON.stringify(out, null, 2) + '\n');

// ---------------------------------------------------------------- check
const need = (table: Record<string, unknown>, id: string | undefined, where: string) => {
  if (!id) return;
  if (!(id in table)) errors.push(`missing ${where}: '${id}'`);
};

// audioDefaults presets + default settings
const settingsList = [
  ...DEFAULT_AUDIO_PRESETS.map((p) => ({ name: `preset ${p.id}`, countdown: p.countdown, bgm: p.bgm, sfx: p.sfx, combo: undefined as { soundId?: string } | undefined })),
  { name: 'DEFAULT_AUDIO_SETTINGS', countdown: DEFAULT_AUDIO_SETTINGS.countdown, bgm: DEFAULT_AUDIO_SETTINGS.bgm, sfx: DEFAULT_AUDIO_SETTINGS.sfx, combo: DEFAULT_AUDIO_SETTINGS.combo },
];
let checked = 0;
for (const s of settingsList) {
  for (const k of ['soundThree', 'soundTwo', 'soundOne', 'soundGo'] as const) {
    need(out.sounds, s.countdown?.[k], `${s.name} countdown.${k}`);
    checked++;
  }
  need(out.bgm, s.bgm?.activeTrackId, `${s.name} bgm.activeTrackId`);
  checked++;
  for (const [key, item] of Object.entries(s.sfx ?? {})) {
    need(out.sounds, item?.soundId, `${s.name} sfx.${key}`);
    checked++;
  }
  if (s.combo) {
    need(out.sounds, s.combo.soundId, `${s.name} combo`);
    checked++;
  }
}
// selectable options
for (const o of [...COUNTDOWN_STEP_OPTIONS, ...COUNTDOWN_GO_OPTIONS, ...COMBO_SOUND_OPTIONS]) {
  need(out.sounds, o.id, `option ${o.category}`);
  checked++;
}
for (const [key, group] of Object.entries(SFX_OPTIONS)) {
  for (const o of group.options) {
    need(out.sounds, o.id, `SFX_OPTIONS.${key}`);
    checked++;
  }
}
for (const t of BGM_TRACK_OPTIONS) {
  need(out.bgm, t.id, 'BGM_TRACK_OPTIONS');
  checked++;
}
// crackers + bombs
for (const m of SOUND_PROFILES_META) {
  need(out.crackers, m.type, 'CrackerSoundType');
  checked++;
}
for (const b of DEFAULT_BOMB_CONFIGS) {
  need(out.bombPresets, b.soundPreset, `DEFAULT_BOMB_CONFIGS ${b.id}`);
  checked++;
}
// every case of playBuiltIn and playBombBurstSound in the engine source
const engineSrc = fs.readFileSync(path.join(REPO, 'src/utils/soundEngine.ts'), 'utf8');
const casesOf = (fn: string) => {
  const start = engineSrc.indexOf(`public ${fn}(`);
  if (start < 0) {
    errors.push(`engine function ${fn} not found`);
    return [];
  }
  const body = engineSrc.slice(start, engineSrc.indexOf('\n  }\n', start));
  return [...body.matchAll(/case '([^']+)':/g)].map((m) => m[1]);
};
for (const id of casesOf('playBuiltIn')) {
  need(out.sounds, id, 'SoundEngine.playBuiltIn case');
  checked++;
}
for (const id of casesOf('playBombBurstSound')) {
  need(out.bombPresets, id, 'SoundEngine.playBombBurstSound case');
  checked++;
}
if (!out.spinTick) errors.push('missing spinTick');
if (!out.spinVictory) errors.push('missing spinVictory');

// files: every referenced file exists, every audio file is referenced
const referenced = new Set<string>([
  ...Object.values(out.sounds),
  ...Object.values(out.crackers),
  ...Object.values(out.bombPresets),
  ...Object.values(out.bgm).map((b) => b.file),
  out.spinTick,
  out.spinVictory,
]);
for (const f of referenced) {
  if (f && !fs.existsSync(path.join(assetDir, f))) errors.push(`file missing on disk: ${f}`);
}
for (const f of fs.readdirSync(assetDir).filter((f) => f.endsWith('.flac') || f.endsWith('.ogg'))) {
  if (!referenced.has(f)) errors.push(`orphan file not in manifest: ${f}`);
}

const counts = `${Object.keys(out.sounds).length} sounds, ${Object.keys(out.crackers).length} crackers, ` +
  `${Object.keys(out.bombPresets).length} bomb presets, ${Object.keys(out.bgm).length} bgm, spinTick ${out.spinTick ? 1 : 0}, spinVictory ${out.spinVictory ? 1 : 0}; ` +
  `${referenced.size} files`;
if (errors.length) {
  console.error(`[manifest] FAIL (${errors.length} problems):`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`[manifest] OK: ${checked} references resolved; ${counts}`);
