/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HandGesture } from '../types/motion';

export type CrackerSoundType =
  | 'SMALL_CRACKER'
  | 'BOMB'
  | 'ROCKET'
  | 'LADI'
  | 'FLOWER_POT'
  | 'CHAKRI'
  | 'BIG_FIREWORK'
  | 'MEGA_BLAST';

export interface SoundProfileMeta {
  type: CrackerSoundType;
  label: string;
  durationLabel: string;
  durationSec: number;
  description: string;
}

export const SOUND_PROFILES_META: SoundProfileMeta[] = [
  {
    type: 'SMALL_CRACKER',
    label: 'SMALL CRACKER',
    durationLabel: '~0.3s',
    durationSec: 0.35,
    description: 'Crisp energetic pops (Tak! Pat! Pop! Crack!) with randomized transients',
  },
  {
    type: 'BOMB',
    label: 'BOMB / ATOM BOMB',
    durationLabel: '~1.8s',
    durationSec: 1.8,
    description: 'Fuse crackle → suspense pause → heavy DHHAAAMMM explosion with sub-bass',
  },
  {
    type: 'ROCKET',
    label: 'ROCKET',
    durationLabel: '~5.8s',
    durationSec: 5.8,
    description: 'Small ignition → 4.5s rising screaming whistle → loud final sky blast',
  },
  {
    type: 'LADI',
    label: 'LADI (RAPID BURST)',
    durationLabel: '~1.6s',
    durationSec: 1.6,
    description: 'Rapid-fire 16-pop string firecracker sequence with micro-timing variations',
  },
  {
    type: 'FLOWER_POT',
    label: 'FLOWER POT / ANAAR',
    durationLabel: '~3.2s',
    durationSec: 3.2,
    description: 'Rising fountain sizzle with dense granular crackling sparks & plume fizz',
  },
  {
    type: 'CHAKRI',
    label: 'CHAKRI (GROUND SPINNER)',
    durationLabel: '~2.8s',
    durationSec: 2.8,
    description: 'Whirling rotary cyclic modulation with energetic spinning spark ejecta',
  },
  {
    type: 'BIG_FIREWORK',
    label: 'BIG FIREWORK',
    durationLabel: '~3.8s',
    durationSec: 3.8,
    description: 'Ascending launch whoosh → massive celestial burst → secondary crackle tail',
  },
  {
    type: 'MEGA_BLAST',
    label: 'MEGA BLAST (COMBO)',
    durationLabel: '~3.2s',
    durationSec: 3.2,
    description: 'Concussive dual-hand stadium firework barrage with layered sub-bass & whistle',
  },
];

/**
 * High-Impact Realistic Procedural Audio Engine for Diwali Crackers.
 * Features:
 * - Proper gain staging with master makeup gain & soft-knee limiter for high loudness without clipping
 * - Multi-stage procedural audio events (Fuse -> Build-up -> Whistle -> Explosion -> Tail)
 * - Long 5.8s Rocket sound with genuine multi-second screaming whistle + blast
 * - Heavy Atom Bomb with fuse crackle, suspense gap, and massive sub-bass "DHAAM"
 * - Spatial stereo panning (left hand pans left, right hand pans right)
 * - Extensible architecture supporting external audio asset overrides (/audio/*.mp3)
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;

  public isUnlocked = false;
  public isMuted = false;
  public masterVolume = 0.9;
  public effectVolume = 0.95;
  public musicVolume = 0.8;
  public activeVoices = 0;
  public lastSoundName = 'None';
  private maxPolyphony = 14;

  // Sound trigger cooldowns (ms)
  private lastTriggerLeft = 0;
  private lastTriggerRight = 0;
  private lastTriggerCombo = 0;

  // Cached noise buffers
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  // Optional external audio file overrides (e.g. /audio/rocket.mp3)
  private audioOverrides: Map<CrackerSoundType, AudioBuffer> = new Map();

  constructor(options?: { maxPolyphony?: number; masterVolume?: number }) {
    if (options?.maxPolyphony) this.maxPolyphony = options.maxPolyphony;
    if (options?.masterVolume) this.masterVolume = options.masterVolume;
    this.createDistortionCurve();
  }

  /**
   * Load an external audio file override (e.g., from /audio/rocket.mp3)
   */
  public async loadExternalSound(type: CrackerSoundType, url: string): Promise<boolean> {
    if (!this.ctx) {
      await this.unlockAudio();
    }
    if (!this.ctx) return false;
    try {
      const response = await fetch(url);
      if (!response.ok) return false;
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.audioOverrides.set(type, audioBuffer);
      return true;
    } catch (err) {
      console.warn(`Could not load external audio for ${type} from ${url}:`, err);
      return false;
    }
  }

  /**
   * Checks if an external audio file is loaded for this sound type
   */
  public hasExternalOverride(type: CrackerSoundType): boolean {
    return this.audioOverrides.has(type);
  }

  /**
   * Play an external audio buffer through the effect bus with spatial pan
   */
  private playExternalBuffer(buffer: AudioBuffer, pitch = 1.0, vol = 1.0, pan = 0) {
    if (!this.ctx || !this.effectGain) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(pitch, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * 1.25, now);

    source.connect(gain);
    this.connectToBus(gain, pan);
    this.trackVoice(buffer.duration / pitch);
    source.start(now);
  }

  /**
   * Auto-probes local /audio/ folder for custom recorded cracker assets
   */
  private async attemptAutoLoadExternalSounds() {
    const soundMap: Record<CrackerSoundType, string> = {
      SMALL_CRACKER: '/audio/small_cracker.mp3',
      BOMB: '/audio/bomb.mp3',
      ROCKET: '/audio/rocket.mp3',
      LADI: '/audio/ladi.mp3',
      FLOWER_POT: '/audio/flower_pot.mp3',
      CHAKRI: '/audio/chakri.mp3',
      BIG_FIREWORK: '/audio/big_firework.mp3',
      MEGA_BLAST: '/audio/mega_blast.mp3',
    };

    for (const [type, path] of Object.entries(soundMap)) {
      try {
        const res = await fetch(path, { method: 'HEAD' });
        if (res.ok && res.headers.get('content-type')?.includes('audio')) {
          await this.loadExternalSound(type as CrackerSoundType, path);
        }
      } catch {
        // Procedural Web Audio fallback will be used cleanly
      }
    }
  }

  /**
   * Soft-clipping distortion transfer curve for gunpowder acoustic saturation
   */
  private createDistortionCurve() {
    const k = 2.5;
    const nSamples = 44100;
    const buffer = new ArrayBuffer(nSamples * Float32Array.BYTES_PER_ELEMENT);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.distortionCurve = curve;
  }

  /**
   * Initializes and unlocks AudioContext upon user gesture
   */
  public async unlockAudio(): Promise<boolean> {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!this.ctx) {
        this.ctx = new AudioCtx();

        // 1. Master Brickwall Limiter (prevents digital clipping while maximizing perceived loudness)
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-4, this.ctx.currentTime); // High threshold for punch
        this.limiter.knee.setValueAtTime(4, this.ctx.currentTime);
        this.limiter.ratio.setValueAtTime(14, this.ctx.currentTime);
        this.limiter.attack.setValueAtTime(0.001, this.ctx.currentTime); // Fast brickwall clamp
        this.limiter.release.setValueAtTime(0.08, this.ctx.currentTime);

        // 2. Master Gain with +5dB makeup loudness
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(
          this.isMuted ? 0 : this.masterVolume * 1.35,
          this.ctx.currentTime
        );

        // 3. Effect Bus Gain
        this.effectGain = this.ctx.createGain();
        this.effectGain.gain.setValueAtTime(this.effectVolume * 1.3, this.ctx.currentTime);

        // 4. Music Bus Gain (for future festive audio)
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);

        // Connect graph: Effects -> Master -> Limiter -> Speakers
        this.effectGain.connect(this.masterGain);
        this.musicGain.connect(this.masterGain);
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.ctx.destination);

        // Generate high-density noise buffers
        this.generateNoiseBuffers();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.isUnlocked = true;

      // Play rich affirmative startup ignition
      this.playSoftUnlockChime();

      // Proactively check for any custom audio assets in /audio/
      this.attemptAutoLoadExternalSounds().catch(() => {});
      return true;
    } catch (err) {
      console.warn('Audio unlock error:', err);
      return false;
    }
  }

  /**
   * Generates high-density noise buffers in memory
   */
  private generateNoiseBuffers() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 2.5;

    // White noise
    this.whiteNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const whiteData = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }

    // Pink/Brown noise (for heavy explosion rumble)
    this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const pinkData = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + white * 0.06;
      b1 = 0.95 * b1 + white * 0.12;
      b2 = 0.85 * b2 + white * 0.28;
      pinkData[i] = (b0 + b1 + b2) * 0.45;
    }
  }

  /**
   * Play startup feedback sound
   */
  private playSoftUnlockChime() {
    if (!this.ctx || !this.effectGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.25); // C6

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.effectGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Play countdown beep during 3, 2, 1 or GO!
   */
  public playCountdownBeep(isFinal = false) {
    if (!this.ctx || !this.isUnlocked || this.isMuted || !this.effectGain) return;
    const now = this.ctx.currentTime;

    if (!isFinal) {
      // 3, 2, 1: Crisp energetic ping
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.08); // A5

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.effectGain);
      osc.start(now);
      osc.stop(now + 0.23);
    } else {
      // GO!: High energetic celebratory chime + spark
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = idx === 3 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.03);

        gain.gain.setValueAtTime(0.28, now + idx * 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.effectGain!);
        osc.start(now + idx * 0.03);
        osc.stop(now + 0.46);
      });
      // Trigger a small spark pop
      this.playSound('SMALL_CRACKER', 0);
    }
  }

  /**
   * Play celebratory game-over victory fanfare & fireworks salute
   */
  public playGameOverFanfare() {
    if (!this.ctx || !this.isUnlocked || this.isMuted || !this.effectGain) return;
    const now = this.ctx.currentTime;

    // Victory fanfare arpeggio notes
    const notes = [
      { f: 523.25, t: 0.0, dur: 0.18 }, // C5
      { f: 659.25, t: 0.15, dur: 0.18 }, // E5
      { f: 783.99, t: 0.3, dur: 0.22 }, // G5
      { f: 1046.5, t: 0.5, dur: 0.55 }, // C6
      { f: 1318.5, t: 0.75, dur: 0.7 }, // E6
    ];

    notes.forEach((n) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0.3, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.dur);

      osc.connect(gain);
      gain.connect(this.effectGain!);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.dur);
    });

    // Schedule fireworks burst at peak of fanfare
    setTimeout(() => {
      if (this.isUnlocked && !this.isMuted) {
        this.playSound('BIG_FIREWORK', 0);
      }
    }, 700);
  }

  /**
   * Play crisp punchy cartoon pop (+100 Red Bomb)
   */
  public playBombPop(pitch = 1.0, vol = 1.0) {
    if (!this.ctx || !this.isUnlocked || this.isMuted || !this.effectGain) return;
    const now = this.ctx.currentTime;
    this.lastSoundName = 'Bomb Pop';

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(120 * pitch, now + 0.12);

    const safeVol = Math.max(0, Math.min(1.5, vol));
    gain.gain.setValueAtTime(0.5 * safeVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.effectGain);
    osc.start(now);
    osc.stop(now + 0.15);

    this.synthSmallCracker(pitch * 1.2, 0.45 * safeVol, 0);
  }

  /**
   * Play deep resonant explosion thump (+150 Blue Bomb)
   */
  public playBombBlast(pitch = 1.0, vol = 1.0) {
    if (!this.ctx || !this.isUnlocked || this.isMuted || !this.effectGain) return;
    const now = this.ctx.currentTime;
    this.lastSoundName = 'Bomb Blast';

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(45 * pitch, now + 0.35);

    const safeVol = Math.max(0, Math.min(1.5, vol));
    gain.gain.setValueAtTime(0.7 * safeVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.effectGain);
    osc.start(now);
    osc.stop(now + 0.4);

    this.synthBomb(pitch, 0.6 * safeVol, 0);
  }

  /**
   * Play sparkling festive victory arpeggio chime (+300 Green Bomb)
   */
  public playBombChime(pitch = 1.0, vol = 1.0) {
    if (!this.ctx || !this.isUnlocked || this.isMuted || !this.effectGain) return;
    const now = this.ctx.currentTime;
    this.lastSoundName = 'Celebration Chime';

    const safeVol = Math.max(0, Math.min(1.5, vol));
    const notes = [
      { f: 523.25, dt: 0.0 },
      { f: 659.25, dt: 0.05 },
      { f: 783.99, dt: 0.1 },
      { f: 1046.5, dt: 0.15 },
      { f: 1318.5, dt: 0.2 },
    ];

    notes.forEach((n) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f * pitch, now + n.dt);

      gain.gain.setValueAtTime(0.28 * safeVol, now + n.dt);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.dt + 0.28);

      osc.connect(gain);
      gain.connect(this.effectGain!);
      osc.start(now + n.dt);
      osc.stop(now + n.dt + 0.3);
    });

    this.synthSmallCracker(pitch * 1.5, 0.35 * safeVol, 0);
  }

  /**
   * Play distinct penalty buzzer / discordant thud (-150 Black Bomb)
   */
  public playPenaltyBuzz(pitch = 1.0, vol = 1.0) {
    if (!this.ctx || !this.isUnlocked || this.isMuted || !this.effectGain) return;
    const now = this.ctx.currentTime;
    this.lastSoundName = 'Penalty Buzz';

    const safeVol = Math.max(0, Math.min(1.5, vol));

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(160 * pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(80 * pitch, now + 0.25);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(226 * pitch, now);
    osc2.frequency.exponentialRampToValueAtTime(113 * pitch, now + 0.25);

    gain.gain.setValueAtTime(0.4 * safeVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.effectGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  }

  /**
   * Universal bomb burst sound dispatcher
   */
  public playBombBurstSound(bomb: { soundPreset?: string; soundUrl?: string | null }) {
    if (this.isMuted) return;

    if (bomb.soundUrl) {
      try {
        const audio = new Audio(bomb.soundUrl);
        audio.volume = Math.max(0, Math.min(1, this.masterVolume * this.effectVolume));
        audio.play().catch((err) => {
          console.warn('[SoundEngine] Custom bomb audio playback fallback:', err);
          this.playBombPop();
        });
        return;
      } catch (err) {
        // Fallback to procedural synth
      }
    }

    const preset = bomb.soundPreset || 'pop';
    switch (preset) {
      case 'blast':
        this.playBombBlast();
        break;
      case 'chime':
        this.playBombChime();
        break;
      case 'penalty_buzz':
        this.playPenaltyBuzz();
        break;
      case 'rocket':
        this.synthRocket();
        break;
      case 'sparkle':
        this.synthFlowerPot();
        break;
      case 'pop':
      default:
        this.playBombPop();
        break;
    }
  }

  /**
   * Set Master Volume (0.0 to 1.0)
   */
  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.masterVolume * 1.35, this.ctx.currentTime);
    }
  }

  /**
   * Set Effect Volume (0.0 to 1.0)
   */
  public setEffectVolume(vol: number) {
    this.effectVolume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.effectGain) {
      this.effectGain.gain.setValueAtTime(this.effectVolume * 1.3, this.ctx.currentTime);
    }
  }

  /**
   * Set Music Volume (0.0 to 1.0)
   */
  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
  }

  /**
   * Toggle Mute
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0 : this.masterVolume * 1.35,
        this.ctx.currentTime
      );
    }
    return this.isMuted;
  }

  /**
   * Create a spatial panner node (-1.0 left, +1.0 right)
   */
  private createPanner(pan = 0): StereoPannerNode | null {
    if (!this.ctx || !this.ctx.createStereoPanner) return null;
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);
    return panner;
  }

  /**
   * Track voice duration for polyphony monitoring
   */
  private trackVoice(durationSeconds: number) {
    this.activeVoices++;
    setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, durationSeconds * 1000);
  }

  /**
   * Intelligent audio cooldown handler mapped to hand speed & gesture
   */
  public handleHandMovementSound(
    handSide: 'left' | 'right',
    speed: number,
    gesture: HandGesture,
    isCombo: boolean
  ) {
    if (!this.isUnlocked || this.isMuted || speed < 40) return;

    const now = performance.now();
    const pan = handSide === 'left' ? -0.45 : 0.45;

    // 1. Dual-hand Combo Priority
    if (isCombo) {
      if (now - this.lastTriggerCombo > 280) {
        this.lastTriggerCombo = now;
        this.playSound('MEGA_BLAST', 0);
      }
      return;
    }

    // 2. Cooldown calculation based on hand speed
    let cooldown = 350; // slow
    if (speed > 520) cooldown = 75; // very fast
    else if (speed > 320) cooldown = 115; // fast
    else if (speed > 140) cooldown = 190; // normal

    const lastTrigger = handSide === 'left' ? this.lastTriggerLeft : this.lastTriggerRight;
    if (now - lastTrigger < cooldown) return;

    if (handSide === 'left') this.lastTriggerLeft = now;
    else this.lastTriggerRight = now;

    // 3. Map gesture and speed to full-structure cracker event
    if (gesture === 'FIST') {
      if (speed > 420) {
        this.playSound('BOMB', pan);
      } else {
        this.playSound('SMALL_CRACKER', pan);
      }
      return;
    }

    if (gesture === 'OPEN_PALM') {
      if (Math.random() > 0.4) {
        this.playSound('FLOWER_POT', pan);
      } else {
        this.playSound('CHAKRI', pan);
      }
      return;
    }

    if (gesture === 'PEACE') {
      this.playSound('ROCKET', pan);
      return;
    }

    if (gesture === 'POINTING') {
      this.playSound('LADI', pan);
      return;
    }

    // Rapid speed triggers
    if (speed > 480) {
      if (Math.random() > 0.4) {
        this.playSound('LADI', pan);
      } else {
        this.playSound('BOMB', pan);
      }
    } else if (speed > 220) {
      const picks: CrackerSoundType[] = ['SMALL_CRACKER', 'LADI', 'CHAKRI'];
      this.playSound(picks[Math.floor(Math.random() * picks.length)], pan);
    } else {
      this.playSound('SMALL_CRACKER', pan);
    }
  }

  /**
   * Main sound dispatcher
   */
  public playSound(type: CrackerSoundType, pan = 0) {
    if (!this.ctx || !this.isUnlocked || this.isMuted) return;
    if (this.activeVoices >= this.maxPolyphony) return;

    const meta = SOUND_PROFILES_META.find((m) => m.type === type);
    this.lastSoundName = meta ? meta.label : type;

    // Randomize pitch and volume slightly (±10%)
    const pitch = 0.92 + Math.random() * 0.16;
    const vol = 0.9 + Math.random() * 0.2;

    // Check external audio file override first
    if (this.audioOverrides.has(type)) {
      const buffer = this.audioOverrides.get(type)!;
      this.playExternalBuffer(buffer, pitch, vol, pan);
      return;
    }

    switch (type) {
      case 'SMALL_CRACKER':
        this.synthSmallCracker(pitch, vol, pan);
        break;
      case 'BOMB':
        this.synthBomb(pitch, vol, pan);
        break;
      case 'ROCKET':
        this.synthRocket(pitch, vol, pan);
        break;
      case 'LADI':
        this.synthLadi(pitch, vol, pan);
        break;
      case 'FLOWER_POT':
        this.synthFlowerPot(pitch, vol, pan);
        break;
      case 'CHAKRI':
        this.synthChakri(pitch, vol, pan);
        break;
      case 'BIG_FIREWORK':
        this.synthBigFirework(pitch, vol, pan);
        break;
      case 'MEGA_BLAST':
        this.synthMegaBlast(pitch, vol, pan);
        break;
    }
  }

  // Helper to connect a node to effects with optional spatial pan
  private connectToBus(node: AudioNode, pan = 0): AudioNode {
    if (!this.ctx || !this.effectGain) return node;
    const panner = this.createPanner(pan);
    if (panner) {
      node.connect(panner);
      panner.connect(this.effectGain);
      return panner;
    } else {
      node.connect(this.effectGain);
      return node;
    }
  }

  // =============================================================
  // PROCEDURAL HIGH-ENERGY SOUND SYNTHESIZERS
  // =============================================================

  /**
   * 1. SMALL CRACKER (0.3s)
   * Variations: "TAK!", "PAT!", "POP!", "CRACK!"
   */
  public synthSmallCracker(pitch = 1.0, vol = 1.0, pan = 0) {
    if (!this.ctx || !this.whiteNoiseBuffer) return;
    const now = this.ctx.currentTime;
    const dur = 0.28;
    this.trackVoice(dur);

    // Variation pick (0, 1, 2, 3)
    const varType = Math.floor(Math.random() * 4);
    const centerFreq = [2800, 3600, 1900, 4200][varType] * pitch;

    // Layer 1: High-energy sharp transient crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;
    noise.playbackRate.setValueAtTime(pitch * (1.1 + varType * 0.1), now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, now);
    filter.Q.setValueAtTime(2.2, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.1 * vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    this.connectToBus(noiseGain, pan);

    // Layer 2: Concussive low thump
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(160 * pitch, now);
    sub.frequency.exponentialRampToValueAtTime(45, now + 0.08);

    subGain.gain.setValueAtTime(0.85 * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    sub.connect(subGain);
    this.connectToBus(subGain, pan);

    noise.start(now);
    noise.stop(now + dur);
    sub.start(now);
    sub.stop(now + 0.08);
  }

  /**
   * 2. BOMB / ATOM BOMB (~1.8s)
   * Structure: Fuse "tik-tik/crackle" -> suspense silence -> DHHHAAMMMM explosion with sub-bass!
   */
  public synthBomb(pitch = 1.0, vol = 1.0, pan = 0) {
    if (!this.ctx || !this.pinkNoiseBuffer || !this.whiteNoiseBuffer) return;
    const now = this.ctx.currentTime;
    const totalDur = 1.8;
    this.trackVoice(totalDur);

    // STAGE 1: Fuse Ignition Crackle (0.0s - 0.28s)
    const fuseNoise = this.ctx.createBufferSource();
    fuseNoise.buffer = this.whiteNoiseBuffer;
    fuseNoise.playbackRate.setValueAtTime(1.5, now);

    const fuseFilter = this.ctx.createBiquadFilter();
    fuseFilter.type = 'highpass';
    fuseFilter.frequency.setValueAtTime(3200, now);

    const fuseGain = this.ctx.createGain();
    fuseGain.gain.setValueAtTime(0.35 * vol, now);
    fuseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    fuseNoise.connect(fuseFilter);
    fuseFilter.connect(fuseGain);
    this.connectToBus(fuseGain, pan);

    fuseNoise.start(now);
    fuseNoise.stop(now + 0.28);

    // STAGE 2: Suspense pause (0.28s - 0.38s)

    // STAGE 3: MASSIVE EXPLOSION BLAST ("DHAAM!") at 0.38s
    const blastTime = now + 0.38;

    // Layer 1: Sharp Gunpowder Transient Shockwave
    const blastNoise = this.ctx.createBufferSource();
    blastNoise.buffer = this.pinkNoiseBuffer;
    blastNoise.playbackRate.setValueAtTime(pitch * 0.95, blastTime);

    // WaveShaper saturation for explosive punch
    const shaper = this.ctx.createWaveShaper();
    if (this.distortionCurve) shaper.curve = this.distortionCurve;

    const blastFilter = this.ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(2600 * pitch, blastTime);
    blastFilter.frequency.exponentialRampToValueAtTime(120, blastTime + 1.2);

    const blastGain = this.ctx.createGain();
    blastGain.gain.setValueAtTime(1.6 * vol, blastTime);
    blastGain.gain.exponentialRampToValueAtTime(0.001, blastTime + 1.2);

    blastNoise.connect(shaper);
    shaper.connect(blastFilter);
    blastFilter.connect(blastGain);
    this.connectToBus(blastGain, pan);

    blastNoise.start(blastTime);
    blastNoise.stop(blastTime + 1.2);

    // Layer 2: Deep Sub-Bass Thud (Chest-thumping atom bomb impact)
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(75 * pitch, blastTime);
    sub.frequency.exponentialRampToValueAtTime(22, blastTime + 0.85);

    subGain.gain.setValueAtTime(1.8 * vol, blastTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, blastTime + 0.85);

    sub.connect(subGain);
    this.connectToBus(subGain, pan);

    sub.start(blastTime);
    sub.stop(blastTime + 0.85);

    // Layer 3: Secondary Flying Shrapnel Crackles
    for (let i = 0; i < 4; i++) {
      const popDelay = blastTime + 0.15 + i * 0.08 + Math.random() * 0.04;
      setTimeout(() => {
        if (!this.ctx) return;
        this.synthSmallCracker(pitch * (0.8 + Math.random() * 0.4), vol * 0.7, pan);
      }, (popDelay - now) * 1000);
    }
  }

  /**
   * 3. ROCKET (~5.8s)
   * Structure:
   * 0.0 - 0.4s: Ignition burst
   * 0.4 - 4.8s: 4.4s Long rising rocket whistle ("SSSSSSSSHHHHH...") climbing into sky
   * 4.8 - 5.1s: Apogee pause
   * 5.1s+: LOUD FINAL CELESTIAL EXPLOSION + star crackle tail!
   */
  public synthRocket(pitch = 1.0, vol = 1.0, pan = 0) {
    if (!this.ctx || !this.whiteNoiseBuffer || !this.pinkNoiseBuffer) return;
    const now = this.ctx.currentTime;
    const whistleDuration = 4.4;
    const blastTime = now + 0.4 + whistleDuration + 0.2; // ~5.0s
    this.trackVoice(5.8);

    // STAGE 1: Small Ignition Fuse (0.0s - 0.4s)
    const fuse = this.ctx.createBufferSource();
    fuse.buffer = this.whiteNoiseBuffer;
    const fuseFilter = this.ctx.createBiquadFilter();
    fuseFilter.type = 'bandpass';
    fuseFilter.frequency.setValueAtTime(1800, now);
    const fuseGain = this.ctx.createGain();
    fuseGain.gain.setValueAtTime(0.5 * vol, now);
    fuseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    fuse.connect(fuseFilter);
    fuseFilter.connect(fuseGain);
    this.connectToBus(fuseGain, pan);
    fuse.start(now);
    fuse.stop(now + 0.4);

    // STAGE 2: LONG RISING ROCKET WHISTLE (0.4s to 4.8s)
    const whistleStart = now + 0.35;

    // Dual-oscillator screaming rocket whistle
    const whistleOsc = this.ctx.createOscillator();
    whistleOsc.type = 'sawtooth';
    whistleOsc.frequency.setValueAtTime(360 * pitch, whistleStart);
    whistleOsc.frequency.exponentialRampToValueAtTime(2450 * pitch, whistleStart + whistleDuration);

    // Aerodynamic hiss noise accompanying whistle
    const hiss = this.ctx.createBufferSource();
    hiss.buffer = this.whiteNoiseBuffer;
    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.setValueAtTime(950 * pitch, whistleStart);
    hissFilter.frequency.exponentialRampToValueAtTime(3600 * pitch, whistleStart + whistleDuration);
    hissFilter.Q.setValueAtTime(5.0, whistleStart);

    // Resonant bandpass for sharp whistle tone
    const whistleFilter = this.ctx.createBiquadFilter();
    whistleFilter.type = 'bandpass';
    whistleFilter.frequency.setValueAtTime(450 * pitch, whistleStart);
    whistleFilter.frequency.exponentialRampToValueAtTime(2600 * pitch, whistleStart + whistleDuration);
    whistleFilter.Q.setValueAtTime(6.0, whistleStart);

    // Modulated flutter (simulates turbulent rocket exhaust flame)
    const flutter = this.ctx.createOscillator();
    flutter.frequency.setValueAtTime(18, whistleStart); // 18Hz vibrato
    const flutterGain = this.ctx.createGain();
    flutterGain.gain.setValueAtTime(40, whistleStart);
    flutter.connect(flutterGain);
    flutterGain.connect(whistleOsc.frequency);

    const whistleGain = this.ctx.createGain();
    whistleGain.gain.setValueAtTime(0.05, whistleStart);
    whistleGain.gain.linearRampToValueAtTime(0.75 * vol, whistleStart + 0.5); // loud whistle
    whistleGain.gain.setValueAtTime(0.85 * vol, whistleStart + whistleDuration - 0.4);
    whistleGain.gain.exponentialRampToValueAtTime(0.001, whistleStart + whistleDuration);

    whistleOsc.connect(whistleFilter);
    whistleFilter.connect(whistleGain);
    hiss.connect(hissFilter);
    hissFilter.connect(whistleGain);
    this.connectToBus(whistleGain, pan);

    whistleOsc.start(whistleStart);
    whistleOsc.stop(whistleStart + whistleDuration);
    hiss.start(whistleStart);
    hiss.stop(whistleStart + whistleDuration);
    flutter.start(whistleStart);
    flutter.stop(whistleStart + whistleDuration);

    // STAGE 3: BIG FINAL EXPLOSION & BURST at 5.0s
    setTimeout(() => {
      if (!this.ctx) return;
      this.synthBigFirework(pitch * 0.95, vol * 1.3, pan);
    }, (blastTime - now) * 1000);
  }

  /**
   * 4. LADI / RAPID CRACKER STRING (~1.6s)
   * Rapid-fire sequence of 16 sharp crackle pops
   */
  public synthLadi(pitch = 1.0, vol = 1.0, pan = 0) {
    const popCount = 16;
    this.trackVoice(1.7);

    for (let i = 0; i < popCount; i++) {
      const delayMs = i * (45 + Math.random() * 35);
      const isTerminalPop = i === popCount - 1;
      const popPan = pan + (Math.random() * 0.4 - 0.2);

      setTimeout(() => {
        if (!this.ctx) return;
        if (isTerminalPop) {
          // Bigger terminal pop at the end of the string
          this.synthSmallCracker(pitch * 0.9, vol * 1.3, popPan);
        } else {
          this.synthSmallCracker(
            pitch * (0.85 + Math.random() * 0.35),
            vol * (0.8 + Math.random() * 0.3),
            popPan
          );
        }
      }, delayMs);
    }
  }

  /**
   * 5. FLOWER POT / ANAAR (~3.2s)
   * Longer rising/crackling fountain: initial fizz -> loud granular spark shower -> plume hiss
   */
  public synthFlowerPot(pitch = 1.0, vol = 1.0, pan = 0) {
    if (!this.ctx || !this.pinkNoiseBuffer || !this.whiteNoiseBuffer) return;
    const now = this.ctx.currentTime;
    const dur = 3.2;
    this.trackVoice(dur);

    // Layer 1: Roaring fountain plume noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.pinkNoiseBuffer;
    noise.playbackRate.setValueAtTime(pitch, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600 * pitch, now);
    filter.frequency.exponentialRampToValueAtTime(3200 * pitch, now + 1.2);
    filter.frequency.exponentialRampToValueAtTime(1400 * pitch, now + dur);
    filter.Q.setValueAtTime(3.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.95 * vol, now + 0.6); // Loud fountain spray
    gain.gain.setValueAtTime(0.9 * vol, now + dur - 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    this.connectToBus(gain, pan);

    noise.start(now);
    noise.stop(now + dur);

    // Layer 2: High-frequency sizzling granular sparks
    for (let i = 0; i < 7; i++) {
      const sparkTime = now + 0.3 + i * 0.38 + Math.random() * 0.1;
      setTimeout(() => {
        if (!this.ctx || !this.whiteNoiseBuffer) return;
        const spark = this.ctx.createBufferSource();
        spark.buffer = this.whiteNoiseBuffer;
        const sFilter = this.ctx.createBiquadFilter();
        sFilter.type = 'highpass';
        sFilter.frequency.setValueAtTime(4500, this.ctx.currentTime);
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0.4 * vol, this.ctx.currentTime);
        sGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
        spark.connect(sFilter);
        sFilter.connect(sGain);
        this.connectToBus(sGain, pan);
        spark.start();
        spark.stop(this.ctx.currentTime + 0.18);
      }, (sparkTime - now) * 1000);
    }
  }

  /**
   * 6. CHAKRI (GROUND SPINNER) (~2.8s)
   * Rotating/whirling sound with fast oscillation & spinning sizzle
   */
  public synthChakri(pitch = 1.0, vol = 1.0, pan = 0) {
    if (!this.ctx || !this.whiteNoiseBuffer) return;
    const now = this.ctx.currentTime;
    const dur = 2.8;
    this.trackVoice(dur);

    // Rotary Whir Tone
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180 * pitch, now);
    osc.frequency.linearRampToValueAtTime(480 * pitch, now + 1.2);
    osc.frequency.exponentialRampToValueAtTime(160, now + dur);

    // LFO for rotary doppler oscillation (simulates spinning wheel)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(6.5, now);
    lfo.frequency.linearRampToValueAtTime(11, now + 1.5);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.85 * vol, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Ground friction noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800 * pitch, now);
    filter.Q.setValueAtTime(2.8, now);

    lfo.connect(lfoGain);
    osc.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    this.connectToBus(gain, pan);

    osc.start(now);
    osc.stop(now + dur);
    lfo.start(now);
    lfo.stop(now + dur);
    noise.start(now);
    noise.stop(now + dur);
  }

  /**
   * 7. BIG FIREWORK (~3.8s)
   * Cinematic celestial firework: launch whoosh -> massive explosion -> secondary crackles -> sparkle tail
   */
  public synthBigFirework(pitch = 1.0, vol = 1.0, pan = 0) {
    if (!this.ctx || !this.pinkNoiseBuffer || !this.whiteNoiseBuffer) return;
    const now = this.ctx.currentTime;
    const dur = 3.8;
    this.trackVoice(dur);

    // Layer 1: Launch Whoosh (0.0s - 0.45s)
    const whoosh = this.ctx.createBufferSource();
    whoosh.buffer = this.whiteNoiseBuffer;
    const whooshFilter = this.ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.frequency.setValueAtTime(450, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(2800, now + 0.45);
    const whooshGain = this.ctx.createGain();
    whooshGain.gain.setValueAtTime(0.4 * vol, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    whoosh.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    this.connectToBus(whooshGain, pan);
    whoosh.start(now);
    whoosh.stop(now + 0.45);

    // Layer 2: Massive Celestial Explosion (starts at 0.35s)
    const blastTime = now + 0.35;
    const blastNoise = this.ctx.createBufferSource();
    blastNoise.buffer = this.pinkNoiseBuffer;
    blastNoise.playbackRate.setValueAtTime(pitch * 0.9, blastTime);

    const blastFilter = this.ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(2400 * pitch, blastTime);
    blastFilter.frequency.exponentialRampToValueAtTime(100, blastTime + 2.2);

    const blastGain = this.ctx.createGain();
    blastGain.gain.setValueAtTime(1.5 * vol, blastTime);
    blastGain.gain.exponentialRampToValueAtTime(0.001, blastTime + 2.2);

    blastNoise.connect(blastFilter);
    blastFilter.connect(blastGain);
    this.connectToBus(blastGain, pan);
    blastNoise.start(blastTime);
    blastNoise.stop(blastTime + 2.2);

    // Layer 3: Heavy Sub Bass
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(65 * pitch, blastTime);
    sub.frequency.exponentialRampToValueAtTime(20, blastTime + 1.2);
    subGain.gain.setValueAtTime(1.7 * vol, blastTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, blastTime + 1.2);

    sub.connect(subGain);
    this.connectToBus(subGain, pan);
    sub.start(blastTime);
    sub.stop(blastTime + 1.2);

    // Layer 4: Shimmering Sparkle Willow Tail (starts at 1.0s)
    setTimeout(() => {
      if (!this.ctx || !this.whiteNoiseBuffer) return;
      const tail = this.ctx.createBufferSource();
      tail.buffer = this.whiteNoiseBuffer;
      const tFilter = this.ctx.createBiquadFilter();
      tFilter.type = 'highpass';
      tFilter.frequency.setValueAtTime(4200, this.ctx.currentTime);
      const tGain = this.ctx.createGain();
      tGain.gain.setValueAtTime(0.45 * vol, this.ctx.currentTime);
      tGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.8);

      tail.connect(tFilter);
      tFilter.connect(tGain);
      this.connectToBus(tGain, pan);
      tail.start();
      tail.stop(this.ctx.currentTime + 1.8);
    }, 900);
  }

  /**
   * 8. MEGA BLAST (COMBO) (~3.2s)
   * Stadium-level layered fireworks: Sub concussion + rapid ladi flurry + dual peony bloom
   */
  public synthMegaBlast(pitch = 1.0, vol = 1.0, pan = 0) {
    this.trackVoice(3.4);

    // 1. Massive Initial Concussion
    this.synthBomb(pitch * 0.88, vol * 1.4, pan);

    // 2. Dual Rocket Whistles on left & right
    setTimeout(() => {
      if (!this.ctx) return;
      this.synthRocket(pitch * 1.1, vol * 0.8, -0.6);
      this.synthRocket(pitch * 0.95, vol * 0.8, 0.6);
    }, 120);

    // 3. Simultaneous Rapid Ladi Flurry
    setTimeout(() => {
      if (!this.ctx) return;
      this.synthLadi(pitch * 1.05, vol * 1.1, pan);
    }, 280);

    // 4. Grand Finale Peony
    setTimeout(() => {
      if (!this.ctx) return;
      this.synthBigFirework(pitch * 0.9, vol * 1.4, pan);
    }, 700);
  }
}
