/**
 * Native sound export page script (dev-only tool, never bundled into the web app).
 *
 * Renders every built-in procedural sound of the web `SoundEngine` through an
 * `OfflineAudioContext`, so the native Android app can ship byte-for-byte the same audio
 * as pre-rendered files. Served by Vite (see run.mjs); driven over CDP.
 *
 * How it works:
 * - A fresh `SoundEngine` per sound gets the exact graph `unlockAudio()` builds
 *   (limiter -> masterGain -> destination, effectGain/musicGain -> masterGain, noise buffers),
 *   assigned onto its private fields via `as any`, but on an OfflineAudioContext.
 * - The engine schedules later stages with `setTimeout` / `setInterval`. While engine code runs,
 *   those globals are swapped for an offline scheduler that maps "ms from now" to
 *   `OfflineAudioContext.suspend(t)` (quantised to the 128-frame render quantum, <= 2.7 ms),
 *   so delayed stages land at the right place on the offline timeline.
 * - `Math.random` is swapped for a seeded mulberry32 while engine code runs, so re-exports are
 *   reproducible: one fixed seed for the shared noise buffers, one seed per sound. (Chrome's
 *   renderer itself is not bit-exact run to run: a few samples can differ by 1 LSB.)
 * - Gain staging: masterVolume = 1.0, musicVolume = 1.0, per-sound vol = 1.0, BGM volume = 100;
 *   effectVolume stays at the engine default (0.95). The native app applies master, channel and
 *   per-sound volume itself.
 */
import { SoundEngine, type CrackerSoundType } from '../../src/utils/soundEngine';
import { getOrCreateTickBuffer } from '../../src/utils/spinWheelPhysics';
import { BGM_TRACK_OPTIONS } from '../../src/utils/audioDefaults';
import { mulberry32 } from './mulberry32';

const SAMPLE_RATE = 48000;
const QUANTUM = 128;
const NOISE_SEED = 0x0d1a11; // shared white/pink noise buffers
const EFFECT_RENDER_SECONDS = 12; // longest effect (mega blast / launch rocket) is ~7.8 s
const TRIM_THRESHOLD = Math.pow(10, -60 / 20); // -60 dBFS
const TAIL_PAD_SECONDS = 0.02; // keep 20 ms after the last sample above -60 dBFS
const FADE_SECONDS = 0.005; // linear fade over the last 5 ms of that pad
const BGM_RENDER_PERIODS = 3; // render 3 periods, keep the middle one (steady state)
const SPIN_TICK_GAIN = 0.5; // live tick gain range is 0.2..0.5; export at the max
const SPIN_VICTORY_SECONDS = 2.2; // the last oscillator stops at 1.98 s; nothing is trimmed

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEngine = any;

export interface ManifestIds {
  sounds?: string[];
  crackers?: CrackerSoundType[];
  bombPresets?: string[];
  bgm?: string;
  spinTick?: boolean;
  spinVictory?: boolean;
}

interface Job {
  key: string; // also the output file stem
  kind: 'effect' | 'bgm' | 'tick' | 'victory';
  ids: ManifestIds;
  note: string;
  run?: (e: AnyEngine) => void;
}

const builtIn = (id: string) => (e: AnyEngine) => e.playBuiltIn(id, 1.0);

// ---------------------------------------------------------------------------
// Job list. Each job is rendered once; `ids` lists every manifest entry whose live code path
// is identical (same engine calls, same arguments) and therefore shares the file.
// ---------------------------------------------------------------------------
const JOBS: Job[] = [
  // Countdown (playBuiltIn cases)
  { key: 'beep_classic', kind: 'effect', ids: { sounds: ['beep_classic', 'countdown_beep'] }, run: builtIn('beep_classic'),
    note: 'synthBeepClassic; countdown_beep = playCountdownBeep(false), identical code' },
  { key: 'beep_digital', kind: 'effect', ids: { sounds: ['beep_digital'] }, run: builtIn('beep_digital'), note: 'synthBeepDigital' },
  { key: 'bell_chime', kind: 'effect', ids: { sounds: ['bell_chime'] }, run: builtIn('bell_chime'), note: 'synthBellChime' },
  { key: 'drum_tick', kind: 'effect', ids: { sounds: ['drum_tick'] }, run: builtIn('drum_tick'), note: 'synthDrumTick' },
  { key: 'energetic_pop', kind: 'effect', ids: { sounds: ['energetic_pop'] }, run: builtIn('energetic_pop'), note: 'synthEnergeticPop' },
  { key: 'chime_celebration', kind: 'effect', ids: { sounds: ['chime_celebration'] }, run: builtIn('chime_celebration'), note: 'synthChimeCelebration' },
  { key: 'whistle_blast', kind: 'effect', ids: { sounds: ['whistle_blast'] }, run: builtIn('whistle_blast'), note: 'synthWhistleBlast (+bomb at 200 ms)' },
  { key: 'airhorn_power', kind: 'effect', ids: { sounds: ['airhorn_power'] }, run: builtIn('airhorn_power'), note: 'synthAirhornPower' },
  { key: 'gong_impact', kind: 'effect', ids: { sounds: ['gong_impact'] }, run: builtIn('gong_impact'), note: 'synthGongImpact' },
  { key: 'camera_click', kind: 'effect', ids: { sounds: ['camera_click', 'shutter_modern', 'shutter_vintage'] }, run: builtIn('camera_click'),
    note: 'synthCameraClick; all three cases call it identically' },
  { key: 'shutter_sparkle', kind: 'effect', ids: { sounds: ['shutter_sparkle'] }, run: builtIn('shutter_sparkle'), note: 'camera click + bell chime at 0.5' },
  { key: 'countdown_beep_final', kind: 'effect', ids: { sounds: ['countdown_beep_final'] }, run: (e) => e.playCountdownBeep(true),
    note: 'playCountdownBeep(true): GO chime + SMALL_CRACKER via playSound (seeded pitch/vol)' },

  // SFX (playBuiltIn cases)
  { key: 'launch_whoosh', kind: 'effect', ids: { sounds: ['launch_whoosh'] }, run: builtIn('launch_whoosh'), note: 'synthRocket(1.1, 0.6)' },
  { key: 'launch_screamer', kind: 'effect', ids: { sounds: ['launch_screamer'] }, run: builtIn('launch_screamer'), note: 'synthRocket(1.3, 0.85)' },
  { key: 'launch_sub_thump', kind: 'effect', ids: { sounds: ['launch_sub_thump'] }, run: builtIn('launch_sub_thump'), note: 'synthLaunchSubThump' },
  { key: 'explosion_bomb', kind: 'effect', ids: { sounds: ['explosion_bomb'], crackers: ['BOMB'] }, run: builtIn('explosion_bomb'),
    note: 'synthBomb(1, 1, 0) = BOMB cracker at nominal pitch/vol' },
  { key: 'explosion_ladi', kind: 'effect', ids: { sounds: ['explosion_ladi'], crackers: ['LADI'] }, run: builtIn('explosion_ladi'),
    note: 'synthLadi(1, 1, 0) = LADI cracker at nominal pitch/vol' },
  { key: 'explosion_mega', kind: 'effect', ids: { sounds: ['explosion_mega'], crackers: ['MEGA_BLAST'] }, run: builtIn('explosion_mega'),
    note: 'synthMegaBlast(1, 1, 0) = MEGA_BLAST cracker at nominal pitch/vol' },
  { key: 'sparkler_hiss', kind: 'effect', ids: { sounds: ['sparkler_hiss'], crackers: ['FLOWER_POT'], bombPresets: ['sparkle'] }, run: builtIn('sparkler_hiss'),
    note: 'synthFlowerPot(1, 1, 0) = FLOWER_POT cracker = bomb preset sparkle' },
  { key: 'sparkler_crackle', kind: 'effect', ids: { sounds: ['sparkler_crackle'] }, run: builtIn('sparkler_crackle'), note: 'synthSmallCracker(1.1, 1)' },
  { key: 'sparkler_spinning', kind: 'effect', ids: { sounds: ['sparkler_spinning'], crackers: ['CHAKRI'] }, run: builtIn('sparkler_spinning'),
    note: 'synthChakri(1, 1, 0) = CHAKRI cracker at nominal pitch/vol' },
  { key: 'bomb_blast', kind: 'effect', ids: { sounds: ['bomb_blast'], bombPresets: ['blast'] }, run: builtIn('bomb_blast'), note: 'playBombBlast(1, 1)' },
  { key: 'bomb_pop', kind: 'effect', ids: { sounds: ['bomb_pop'], bombPresets: ['pop', 'custom'] }, run: builtIn('bomb_pop'),
    note: 'playBombPop(1, 1); also the playBombBurstSound default branch (custom without URL)' },
  { key: 'bomb_chime', kind: 'effect', ids: { sounds: ['bomb_chime'], bombPresets: ['chime'] }, run: builtIn('bomb_chime'), note: 'playBombChime(1, 1)' },
  { key: 'bomb_buzz', kind: 'effect', ids: { sounds: ['bomb_buzz'], bombPresets: ['penalty_buzz'] }, run: builtIn('bomb_buzz'),
    note: 'playPenaltyBuzz() (ignores vol in the web engine)' },
  { key: 'coin_ping', kind: 'effect', ids: { sounds: ['coin_ping'] }, run: builtIn('coin_ping'), note: 'synthCoinPing' },
  { key: 'combo_ding', kind: 'effect', ids: { sounds: ['combo_ding'] }, run: builtIn('combo_ding'), note: 'synthComboDing' },
  { key: 'combo_energy_burst', kind: 'effect', ids: { sounds: ['combo_energy_burst'] }, run: builtIn('combo_energy_burst'), note: 'synthComboEnergyBurst' },
  { key: 'combo_arcade_bonus', kind: 'effect', ids: { sounds: ['combo_arcade_bonus'] }, run: builtIn('combo_arcade_bonus'), note: 'synthComboArcadeBonus' },
  { key: 'combo_dhol_roll', kind: 'effect', ids: { sounds: ['combo_dhol_roll'] }, run: builtIn('combo_dhol_roll'), note: 'synthComboDholRoll' },
  { key: 'combo_stadium_cheer', kind: 'effect', ids: { sounds: ['combo_stadium_cheer'] }, run: builtIn('combo_stadium_cheer'), note: 'synthComboStadiumCheer' },
  { key: 'score_whoosh', kind: 'effect', ids: { sounds: ['score_whoosh'] }, run: builtIn('score_whoosh'), note: 'synthScoreWhoosh' },
  { key: 'fanfare_triumph', kind: 'effect', ids: { sounds: ['fanfare_triumph', 'fanfare_grand', 'game_over_fanfare'] }, run: builtIn('fanfare_triumph'),
    note: 'playGameOverFanfare (+BIG_FIREWORK via playSound at 700 ms); fanfare_grand calls the same' },
  { key: 'fanfare_festive', kind: 'effect', ids: { sounds: ['fanfare_festive'] }, run: builtIn('fanfare_festive'), note: 'synthFanfareFestive' },

  // Crackers with no playBuiltIn equivalent (nominal pitch 1, vol 1, pan 0)
  { key: 'cracker_small_cracker', kind: 'effect', ids: { crackers: ['SMALL_CRACKER'] }, run: (e) => e.synthSmallCracker(1, 1, 0), note: 'synthSmallCracker(1, 1, 0)' },
  { key: 'cracker_rocket', kind: 'effect', ids: { crackers: ['ROCKET'], bombPresets: ['rocket'] }, run: (e) => e.synthRocket(1, 1, 0),
    note: 'synthRocket(1, 1, 0) = bomb preset rocket' },
  { key: 'cracker_big_firework', kind: 'effect', ids: { crackers: ['BIG_FIREWORK'] }, run: (e) => e.synthBigFirework(1, 1, 0), note: 'synthBigFirework(1, 1, 0)' },

  // Music: one seamless loop period per built-in track (startBgm scheduler)
  ...BGM_TRACK_OPTIONS.map<Job>((t) => ({
    key: t.id,
    kind: 'bgm',
    ids: { bgm: t.id },
    note: 'startBgm(): bar at t=0 then setInterval(period); middle period of 3 rendered',
    run: (e) => {
      e.audioSettings = { ...e.audioSettings, bgm: { activeTrackId: t.id, volume: 100, isMuted: false, loop: true } };
      e.startBgm();
    },
  })),

  // Spin wheel tick (src/utils/spinWheelPhysics.ts getOrCreateTickBuffer)
  { key: 'spin_tick', kind: 'tick', ids: { spinTick: true }, note: `getOrCreateTickBuffer x ${SPIN_TICK_GAIN} (live gain 0.2..0.5)` },

  // Spin wheel win (SpinWheelModal playVictoryChime): its own oscillators, not a SoundEngine sound
  { key: 'spin_victory', kind: 'victory', ids: { spinVictory: true }, note: 'SpinWheelModal playVictoryChime, straight to destination' },
];

// ---------------------------------------------------------------------------
// Determinism helpers
// ---------------------------------------------------------------------------
function seedFor(key: string): number {
  // FNV-1a 32-bit of the job key: per-sound seed, independent of export order
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Offline timer scheduler: maps engine setTimeout/setInterval onto ctx.suspend()
// ---------------------------------------------------------------------------
class OfflineTimers {
  private pending = new Map<number, Array<() => void>>();
  private immediate: Array<() => void> = [];
  private started = false;
  private nextId = 1;
  intervalPeriodsMs: number[] = [];

  constructor(private ctx: OfflineAudioContext, private rng: () => number) {}

  private nowFrame(): number {
    return Math.round(this.ctx.currentTime * this.ctx.sampleRate);
  }

  private schedule(cb: () => void, ms: number) {
    const sr = this.ctx.sampleRate;
    const now = this.nowFrame();
    let frame = Math.round((now + (Math.max(0, ms) / 1000) * sr) / QUANTUM) * QUANTUM;
    if (frame <= now) {
      if (!this.started) {
        this.immediate.push(cb);
        return;
      }
      frame = now + QUANTUM;
    }
    if (frame >= this.ctx.length) return; // beyond the render window
    let list = this.pending.get(frame);
    if (!list) {
      list = [];
      this.pending.set(frame, list);
      this.ctx.suspend(frame / sr).then(() => {
        const cbs = this.pending.get(frame) ?? [];
        this.pending.delete(frame);
        this.runPatched(() => cbs.forEach((c) => c()));
        this.ctx.resume();
      });
    }
    list.push(cb);
  }

  /** Runs engine code with timers and Math.random redirected to the offline/seeded versions. */
  runPatched(fn: () => void) {
    const w = window as unknown as Record<string, unknown>;
    const saved = { st: w.setTimeout, si: w.setInterval, ct: w.clearTimeout, ci: w.clearInterval, rnd: Math.random };
    w.setTimeout = (cb: () => void, ms?: number) => {
      this.schedule(cb, ms ?? 0);
      return this.nextId++;
    };
    w.setInterval = (cb: () => void, ms?: number) => {
      const period = ms ?? 0;
      this.intervalPeriodsMs.push(period);
      const tick = () => {
        cb();
        this.schedule(tick, period);
      };
      this.schedule(tick, period);
      return this.nextId++;
    };
    w.clearTimeout = () => {};
    w.clearInterval = () => {};
    Math.random = this.rng;
    try {
      fn();
      while (!this.started && this.immediate.length) {
        const batch = this.immediate.splice(0);
        batch.forEach((c) => c());
      }
    } finally {
      w.setTimeout = saved.st;
      w.setInterval = saved.si;
      w.clearTimeout = saved.ct;
      w.clearInterval = saved.ci;
      Math.random = saved.rnd;
    }
  }

  async render(): Promise<AudioBuffer> {
    this.started = true;
    return this.ctx.startRendering();
  }
}

// ---------------------------------------------------------------------------
// Engine construction: mirror SoundEngine.unlockAudio()'s graph onto an offline context
// ---------------------------------------------------------------------------
function buildEngine(ctx: OfflineAudioContext): AnyEngine {
  const e: AnyEngine = new SoundEngine();
  e.masterVolume = 1.0; // native applies master volume
  e.musicVolume = 1.0; // native applies bgm volume
  e.isMuted = false;
  e.ctx = ctx;

  const t = ctx.currentTime;
  e.limiter = ctx.createDynamicsCompressor();
  e.limiter.threshold.setValueAtTime(-4, t);
  e.limiter.knee.setValueAtTime(4, t);
  e.limiter.ratio.setValueAtTime(14, t);
  e.limiter.attack.setValueAtTime(0.001, t);
  e.limiter.release.setValueAtTime(0.08, t);

  e.masterGain = ctx.createGain();
  e.masterGain.gain.setValueAtTime(e.isMuted ? 0 : e.masterVolume * 1.35, t);
  e.effectGain = ctx.createGain();
  e.effectGain.gain.setValueAtTime(e.effectVolume * 1.3, t);
  e.musicGain = ctx.createGain();
  e.musicGain.gain.setValueAtTime(e.musicVolume, t);

  e.effectGain.connect(e.masterGain);
  e.musicGain.connect(e.masterGain);
  e.masterGain.connect(e.limiter);
  e.limiter.connect(ctx.destination);

  const savedRandom = Math.random;
  Math.random = mulberry32(NOISE_SEED);
  try {
    e.generateNoiseBuffers();
  } finally {
    Math.random = savedRandom;
  }
  e.isUnlocked = true;
  return e;
}

/** Reads the BGM loop period from the engine's own scheduler (setInterval delay in startBgm). */
function probeBgmPeriodMs(job: Job): number {
  const ctx = new OfflineAudioContext(2, QUANTUM * 4, SAMPLE_RATE);
  const e = buildEngine(ctx);
  const timers = new OfflineTimers(ctx, mulberry32(1));
  timers.runPatched(() => job.run!(e));
  const p = timers.intervalPeriodsMs[0];
  if (!p) throw new Error(`no setInterval period captured for ${job.key}`);
  return p;
}

// ---------------------------------------------------------------------------
// Post-processing, stats and WAV encoding
// ---------------------------------------------------------------------------
interface Stats {
  channels: number;
  frames: number;
  durationSec: number;
  peak: number;
  peakDbfs: number;
  rmsDbfs: number;
  clippedSamples: number;
  periodMs?: number;
  loopEdgeJump?: number; // |first - last| sample jump across the loop point
  loopTailPeakDbfs?: number; // peak of the last 50 ms before the loop point
  nextPeriodDiffDb?: number; // energy of (next period - this period) relative to this period
}

function sliceChannels(chs: Float32Array[], start: number, end: number): Float32Array[] {
  return chs.map((c) => c.slice(start, end));
}

function computeStats(chs: Float32Array[]): Stats {
  let peak = 0;
  let sumSq = 0;
  let clipped = 0;
  for (const c of chs) {
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i]);
      if (a > peak) peak = a;
      if (a > 1) clipped++;
      sumSq += c[i] * c[i];
    }
  }
  const n = chs[0].length * chs.length;
  const db = (x: number) => Math.max(-150, 20 * Math.log10(x)); // -150 = digital silence
  return {
    channels: chs.length,
    frames: chs[0].length,
    durationSec: chs[0].length / SAMPLE_RATE,
    peak,
    peakDbfs: Number(db(peak).toFixed(2)),
    rmsDbfs: Number(db(Math.sqrt(sumSq / Math.max(1, n))).toFixed(2)),
    clippedSamples: clipped,
  };
}

function trimTail(chs: Float32Array[]): Float32Array[] {
  let last = 0;
  for (const c of chs) {
    for (let i = c.length - 1; i > last; i--) {
      if (Math.abs(c[i]) > TRIM_THRESHOLD) {
        last = i;
        break;
      }
    }
  }
  const end = Math.min(chs[0].length, last + 1 + Math.round(TAIL_PAD_SECONDS * SAMPLE_RATE));
  const out = sliceChannels(chs, 0, end);
  const fade = Math.min(end, Math.round(FADE_SECONDS * SAMPLE_RATE));
  for (const c of out) {
    for (let i = 0; i < fade; i++) c[end - fade + i] *= 1 - (i + 1) / fade;
  }
  return out;
}

function encodeWav16(chs: Float32Array[]): Uint8Array {
  const numCh = chs.length;
  const frames = chs[0].length;
  const dataBytes = frames * numCh * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * numCh * 2, true);
  v.setUint16(32, numCh * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, chs[ch][i]));
      v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

function channelsOf(buf: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) out.push(buf.getChannelData(c).slice());
  return out;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
async function renderEffect(job: Job): Promise<{ chs: Float32Array[]; stats: Stats }> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * EFFECT_RENDER_SECONDS, SAMPLE_RATE);
  const e = buildEngine(ctx);
  const timers = new OfflineTimers(ctx, mulberry32(seedFor(job.key)));
  timers.runPatched(() => job.run!(e));
  const rendered = channelsOf(await timers.render());
  const raw = computeStats(rendered);
  const chs = trimTail(rendered);
  const stats = computeStats(chs);
  // clipping is judged on the untrimmed render (the trim only removes < -60 dBFS)
  stats.clippedSamples = raw.clippedSamples;
  return { chs, stats };
}

async function renderBgm(job: Job): Promise<{ chs: Float32Array[]; stats: Stats }> {
  const periodMs = probeBgmPeriodMs(job);
  const periodFrames = Math.round((periodMs / 1000) * SAMPLE_RATE);
  if (periodFrames % QUANTUM !== 0) throw new Error(`${job.key}: period ${periodMs} ms is not quantum-aligned`);
  const ctx = new OfflineAudioContext(2, periodFrames * BGM_RENDER_PERIODS, SAMPLE_RATE);
  const e = buildEngine(ctx);
  const timers = new OfflineTimers(ctx, mulberry32(seedFor(job.key)));
  timers.runPatched(() => job.run!(e));
  const all = channelsOf(await timers.render());
  // Middle period: it already contains whatever the previous bar (and the limiter's
  // lookahead/release) carries over, exactly as it does in a continuous live loop.
  const loop = sliceChannels(all, periodFrames, 2 * periodFrames);
  const next = sliceChannels(all, 2 * periodFrames, 3 * periodFrames);
  // Seam diagnostics. A loop is seamless when the extracted period, played again, continues
  // exactly like the next rendered period does: compare the loop's head with the next period's
  // head (should be ~identical) and measure the sample jump across the loop point.
  let edge = 0;
  let tailPeak = 0;
  let diffSq = 0;
  let refSq = 0;
  const tailFrames = Math.round(0.05 * SAMPLE_RATE);
  for (let c = 0; c < loop.length; c++) {
    edge = Math.max(edge, Math.abs(loop[c][0] - loop[c][periodFrames - 1]));
    for (let i = periodFrames - tailFrames; i < periodFrames; i++) tailPeak = Math.max(tailPeak, Math.abs(loop[c][i]));
    for (let i = 0; i < periodFrames; i++) {
      const d = loop[c][i] - next[c][i];
      diffSq += d * d;
      refSq += loop[c][i] * loop[c][i];
    }
  }
  const stats = computeStats(loop);
  stats.periodMs = periodMs;
  stats.loopEdgeJump = edge;
  // -150 stands for digital silence / identical (keeps the JSON numeric)
  stats.loopTailPeakDbfs = Number(Math.max(-150, 20 * Math.log10(tailPeak)).toFixed(1));
  stats.nextPeriodDiffDb = Number(Math.max(-150, 10 * Math.log10(diffSq / Math.max(refSq, 1e-30))).toFixed(1));
  return { chs: loop, stats };
}

function renderTick(job: Job): { chs: Float32Array[]; stats: Stats } {
  const ctx = new OfflineAudioContext(1, QUANTUM, SAMPLE_RATE);
  const savedRandom = Math.random;
  Math.random = mulberry32(seedFor(job.key));
  let data: Float32Array;
  try {
    data = getOrCreateTickBuffer(ctx as unknown as AudioContext).getChannelData(0).slice();
  } finally {
    Math.random = savedRandom;
  }
  for (let i = 0; i < data.length; i++) data[i] *= SPIN_TICK_GAIN;
  const chs = [data];
  return { chs, stats: computeStats(chs) };
}

/**
 * SpinWheelModal's playVictoryChime, with the same oscillators and timings. It lives outside the SoundEngine and plays
 * straight to the destination, so there is no limiter, bus or master gain here, and the voices are free to sum past
 * full scale as they do live. The tail isn't trimmed: the chord's decay is part of the sound.
 */
async function renderVictory(): Promise<{ chs: Float32Array[]; stats: Stats }> {
  const ctx = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * SPIN_VICTORY_SECONDS), SAMPLE_RATE);
  const now = 0;

  // Stage 1: ascending arpeggio (C5 -> E5 -> G5 -> B5 -> C6 -> E6)
  [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + idx * 0.075);

    gain.gain.setValueAtTime(0, now + idx * 0.075);
    gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.075 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.075 + 0.65);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + idx * 0.075);
    osc.stop(now + idx * 0.075 + 0.7);
  });

  // Stage 2: finale chord (C5 + G5 + C6 + E6) with a shimmer harmonic on each voice
  const chordTime = now + 0.48;
  [523.25, 783.99, 1046.5, 1318.51].forEach((freq) => {
    const osc = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, chordTime);

    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(freq * 2.01, chordTime);

    gain.gain.setValueAtTime(0, chordTime);
    gain.gain.linearRampToValueAtTime(0.18, chordTime + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, chordTime + 1.45);

    osc.connect(gain);
    oscHarmonic.connect(gain);
    gain.connect(ctx.destination);

    osc.start(chordTime);
    oscHarmonic.start(chordTime);
    osc.stop(chordTime + 1.5);
    oscHarmonic.stop(chordTime + 1.5);
  });

  const chs = channelsOf(await ctx.startRendering());
  return { chs, stats: computeStats(chs) };
}

// ---------------------------------------------------------------------------
// Page API (driven by run.mjs over CDP)
// ---------------------------------------------------------------------------
export interface ExportPlanEntry {
  key: string;
  kind: Job['kind'];
  ids: ManifestIds;
  note: string;
}

function exportPlan(): ExportPlanEntry[] {
  return JOBS.map(({ key, kind, ids, note }) => ({ key, kind, ids, note }));
}

async function exportSound(key: string): Promise<{ key: string; kind: string; wavBase64: string; stats: Stats }> {
  const job = JOBS.find((j) => j.key === key);
  if (!job) throw new Error(`unknown job ${key}`);
  const { chs, stats } =
    job.kind === 'bgm'
      ? await renderBgm(job)
      : job.kind === 'tick'
        ? renderTick(job)
        : job.kind === 'victory'
          ? await renderVictory()
          : await renderEffect(job);
  return { key, kind: job.kind, wavBase64: toBase64(encodeWav16(chs)), stats };
}

async function exportAllSounds() {
  const out = [];
  for (const j of JOBS) out.push(await exportSound(j.key));
  return out;
}

const w = window as unknown as Record<string, unknown>;
w.exportPlan = exportPlan;
w.exportSound = exportSound;
w.exportAllSounds = exportAllSounds;
w.exportReady = true;

const status = document.getElementById('status');
if (status) status.textContent = `Ready: ${JOBS.length} renders. Call exportSound(key) / exportAllSounds().`;
