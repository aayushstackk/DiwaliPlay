/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GameAudioSettings,
  SoundPreset,
  SfxKey,
  CountdownAudioConfig,
  BackgroundMusicConfig,
  SoundEffectConfig
} from '../types/backend';

export interface SoundOptionMeta {
  id: string;
  name: string;
  category: 'countdown_step' | 'countdown_go' | 'bgm' | 'sfx';
  description: string;
  badge?: string;
  previewType?: string;
}

export const COUNTDOWN_STEP_OPTIONS: SoundOptionMeta[] = [
  { id: 'beep_classic', name: 'Classic Beep (Harmonic Ping)', category: 'countdown_step', description: 'Energetic ascending sine ping (660Hz -> 880Hz)' },
  { id: 'beep_digital', name: 'Digital Arcade Blip', category: 'countdown_step', description: 'Sharp 8-bit arcade pulse for punchy countdowns' },
  { id: 'bell_chime', name: 'Puja Temple Chime', category: 'countdown_step', description: 'Resonant bronze bell chime with shimmering harmonics' },
  { id: 'drum_tick', name: 'Wooden Percussion Tick', category: 'countdown_step', description: 'Snappy acoustic rimshot transient tick' },
  { id: 'energetic_pop', name: 'Festive Cracker Pop', category: 'countdown_step', description: 'Quick joyful mini-pop with sparkling tail' },
];

export const COUNTDOWN_GO_OPTIONS: SoundOptionMeta[] = [
  { id: 'chime_celebration', name: 'Celebration Chime & Spark', category: 'countdown_go', description: 'Major C-chord fanfare chime with mini spark pop' },
  { id: 'whistle_blast', name: 'Sky Rocket Whistle Blast', category: 'countdown_go', description: 'Rising sky rocket screech with loud stadium burst' },
  { id: 'airhorn_power', name: 'Stadium Brass Airhorn', category: 'countdown_go', description: 'High-octane stadium horn fanfare for immediate action' },
  { id: 'gong_impact', name: 'Celebration Gong Impact', category: 'countdown_go', description: 'Deep reverberant celebration gong resonance' },
  { id: 'camera_click', name: 'DSLR Camera Click & Flash', category: 'countdown_go', description: 'Crisp mechanical shutter click with flash sound' },
];

export const BGM_TRACK_OPTIONS: SoundOptionMeta[] = [
  { id: 'bgm_festive_rhythm', name: 'Festive Dhol Rhythm', category: 'bgm', description: 'Energetic traditional dhol beats & celebration grooves', badge: 'Popular' },
  { id: 'bgm_ambient_diya', name: 'Sparkling Ambient Diya', category: 'bgm', description: 'Warm, serene melodic chimes and sparkling ambience' },
  { id: 'bgm_arcade_groove', name: 'Arcade Electro Beat', category: 'bgm', description: 'Upbeat modern electronic pulse with Diwali accents' },
  { id: 'bgm_celebration_brass', name: 'Celebration Brass Fanfare', category: 'bgm', description: 'Joyous brass fanfare & celebration groove' },
  { id: 'bgm_temple_fusion', name: 'Temple Fusion Melody', category: 'bgm', description: 'Melodic bells, flute acoustic tones & uplifting percussion' },
];

export const COMBO_SOUND_OPTIONS: SoundOptionMeta[] = [
  { id: 'combo_ding', name: 'Ascending Triple Chime', category: 'sfx', description: 'Bright shimmering sparkle chime arpeggio', badge: 'Default' },
  { id: 'combo_energy_burst', name: 'Supercharged Energy Burst', category: 'sfx', description: 'Harmonic pulse explosion with rising frequency sweep' },
  { id: 'combo_arcade_bonus', name: 'Retro Arcade 1-Up Fanfare', category: 'sfx', description: 'Ascending 8-bit triad bonus fanfare' },
  { id: 'combo_dhol_roll', name: 'Festive Dhol Roll & Pop', category: 'sfx', description: 'Rapid celebratory percussion flurry and cracker pop' },
  { id: 'combo_stadium_cheer', name: 'Stadium Victory Stinger', category: 'sfx', description: 'Power chord fanfare with celebratory sparkle tail' },
];

export const SFX_OPTIONS: Record<SfxKey, { title: string; description: string; options: SoundOptionMeta[] }> = {
  firework_launch: {
    title: 'Firework Launch',
    description: 'Sound played when a bomb or rocket shoots into the sky',
    options: [
      { id: 'launch_whoosh', name: 'Ascending Noise Whoosh', category: 'sfx', description: 'Pneumatic launch whoosh with high-velocity air friction' },
      { id: 'launch_screamer', name: 'Rocket Screaming Whistle', category: 'sfx', description: 'Piercing rising whistle of a fast rocket ascending' },
      { id: 'launch_sub_thump', name: 'Heavy Mortar Thump', category: 'sfx', description: 'Heavy low-end kickback from a ground launch tube' },
    ],
  },
  explosion: {
    title: 'Crackle & Explosion',
    description: 'Burst sound when fireworks explode in mid-air',
    options: [
      { id: 'explosion_bomb', name: 'Atom Bomb Explosion', category: 'sfx', description: 'Heavy sub-bass DHHAAAM blast with acoustic shockwave' },
      { id: 'explosion_ladi', name: 'Rapid Ladi Firecracker Flurry', category: 'sfx', description: 'Rapid 16-pop string firecracker cascade' },
      { id: 'explosion_mega', name: 'Mega Blast Stadium Peony', category: 'sfx', description: 'Concussive multi-stage celestial stadium fireworks blast' },
    ],
  },
  sparkler: {
    title: 'Sparkler / Anaar Sizzle',
    description: 'Continuous fountain sparkle and sizzling sound',
    options: [
      { id: 'sparkler_hiss', name: 'Dense Fountain Sizzle', category: 'sfx', description: 'Rising fountain sizzle with dense crackling sparks' },
      { id: 'sparkler_crackle', name: 'Micro Spark Showers', category: 'sfx', description: 'High-frequency granular crackling particles' },
      { id: 'sparkler_spinning', name: 'Rotary Chakri Whir', category: 'sfx', description: 'Rotary spinning ground chakri with whirring Doppler' },
    ],
  },
  bomb_impact: {
    title: 'Bomb Touch / Impact',
    description: 'Sound triggered when the player bursts a bomb',
    options: [
      { id: 'bomb_blast', name: 'Classic Blast Thump (+150)', category: 'sfx', description: 'Deep resonant cartoon explosion thump' },
      { id: 'bomb_pop', name: 'Crisp Pop (+100)', category: 'sfx', description: 'Punchy cartoon pop with micro-spark crackle' },
      { id: 'bomb_chime', name: 'Celebration Arpeggio (+300)', category: 'sfx', description: 'Sparkling ascending victory chime arpeggio' },
      { id: 'bomb_buzz', name: 'Penalty Buzz (Deduction)', category: 'sfx', description: 'Low synth buzz indicating a penalty deduction' },
    ],
  },
  points_score: {
    title: 'Score & Points',
    description: 'Sound effect when points or combos are awarded',
    options: [
      { id: 'coin_ping', name: 'Golden Coin Ding', category: 'sfx', description: 'Crisp bright metallic coin ping' },
      { id: 'combo_ding', name: 'Combo Multiplier Sparkle', category: 'sfx', description: 'Ascending high-pitched combo milestone ding' },
      { id: 'score_whoosh', name: 'Score Surge Whoosh', category: 'sfx', description: 'Energetic swoosh for large bonus awards' },
    ],
  },
  game_over: {
    title: 'Victory / Game Over',
    description: 'Celebratory fanfare played when the 35-second round concludes',
    options: [
      { id: 'fanfare_triumph', name: 'Triumph Fanfare & Fireworks', category: 'sfx', description: 'Multi-voice brass arpeggio followed by grand celestial firework' },
      { id: 'fanfare_festive', name: 'Festive Melodic Salute', category: 'sfx', description: 'Joyous traditional celebration fanfare with temple chime' },
      { id: 'fanfare_grand', name: 'Grand Orchestral Chime', category: 'sfx', description: 'Majestic orchestral crescendo and celebratory salute' },
    ],
  },
  photo_shutter: {
    title: 'Photo Countdown & Camera Shutter',
    description: 'Sound effect when the souvenir photo is captured at CLICK!',
    options: [
      { id: 'shutter_modern', name: 'Modern DSLR Shutter', category: 'sfx', description: 'Crisp dual-curtain mechanical DSLR camera shutter click' },
      { id: 'shutter_vintage', name: 'Vintage Motor Drive', category: 'sfx', description: 'Retro motorized camera shutter and electronic capacitor flash' },
      { id: 'shutter_sparkle', name: 'Sparkle Shutter Chime', category: 'sfx', description: 'Celebratory shutter click accented with magic sparkles' },
    ],
  },
};

export const DEFAULT_AUDIO_PRESETS: SoundPreset[] = [
  {
    id: 'festive_diwali',
    name: 'Festive Diwali',
    description: 'Traditional joyful Diwali celebration with energetic countdown, dhol rhythm, sparkling crackers, and grand fanfare.',
    isDefault: true,
    countdown: {
      soundThree: 'beep_classic',
      soundTwo: 'beep_classic',
      soundOne: 'beep_classic',
      soundGo: 'chime_celebration',
      volume: 90,
    },
    bgm: {
      activeTrackId: 'bgm_festive_rhythm',
      volume: 75,
      isMuted: false,
      loop: true,
    },
    sfx: {
      firework_launch: { soundId: 'launch_whoosh', volume: 90 },
      explosion: { soundId: 'explosion_bomb', volume: 95 },
      sparkler: { soundId: 'sparkler_hiss', volume: 85 },
      bomb_impact: { soundId: 'bomb_blast', volume: 90 },
      points_score: { soundId: 'coin_ping', volume: 85 },
      game_over: { soundId: 'fanfare_triumph', volume: 100 },
      photo_shutter: { soundId: 'shutter_modern', volume: 95 },
    },
  },
  {
    id: 'classic_arcade',
    name: 'Classic Arcade',
    description: 'Crisp retro arcade blips, driving rhythmic synth bass, snappy cartoon bomb pops, and stadium victory fanfare.',
    countdown: {
      soundThree: 'beep_digital',
      soundTwo: 'beep_digital',
      soundOne: 'beep_digital',
      soundGo: 'airhorn_power',
      volume: 85,
    },
    bgm: {
      activeTrackId: 'bgm_arcade_groove',
      volume: 70,
      isMuted: false,
      loop: true,
    },
    sfx: {
      firework_launch: { soundId: 'launch_screamer', volume: 85 },
      explosion: { soundId: 'explosion_ladi', volume: 90 },
      sparkler: { soundId: 'sparkler_crackle', volume: 80 },
      bomb_impact: { soundId: 'bomb_pop', volume: 85 },
      points_score: { soundId: 'combo_ding', volume: 85 },
      game_over: { soundId: 'fanfare_festive', volume: 95 },
      photo_shutter: { soundId: 'shutter_vintage', volume: 90 },
    },
  },
  {
    id: 'premium_celebration',
    name: 'Premium Celebration',
    description: 'Acoustic temple bells, warm ambient celebration theme, cinematic celestial fireworks, and majestic brass fanfare.',
    countdown: {
      soundThree: 'bell_chime',
      soundTwo: 'bell_chime',
      soundOne: 'bell_chime',
      soundGo: 'gong_impact',
      volume: 95,
    },
    bgm: {
      activeTrackId: 'bgm_ambient_diya',
      volume: 65,
      isMuted: false,
      loop: true,
    },
    sfx: {
      firework_launch: { soundId: 'launch_whoosh', volume: 95 },
      explosion: { soundId: 'explosion_mega', volume: 100 },
      sparkler: { soundId: 'sparkler_hiss', volume: 90 },
      bomb_impact: { soundId: 'bomb_chime', volume: 95 },
      points_score: { soundId: 'score_whoosh', volume: 90 },
      game_over: { soundId: 'fanfare_grand', volume: 100 },
      photo_shutter: { soundId: 'shutter_sparkle', volume: 95 },
    },
  },
];

export const DEFAULT_AUDIO_SETTINGS: GameAudioSettings = {
  activePresetId: 'festive_diwali',
  masterVolume: 90,
  isMuted: false,
  bgm: { ...DEFAULT_AUDIO_PRESETS[0].bgm },
  combo: { soundId: 'combo_ding', volume: 90 },
  countdown: { ...DEFAULT_AUDIO_PRESETS[0].countdown },
  sfx: { ...DEFAULT_AUDIO_PRESETS[0].sfx },
  presets: DEFAULT_AUDIO_PRESETS,
};