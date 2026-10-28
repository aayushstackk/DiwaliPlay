/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BombConfig, BombGameSettings } from '../types/backend';

export const DEFAULT_BOMB_SETTINGS: BombGameSettings = {
  minSpawnDelayMs: 650,
  maxSpawnDelayMs: 1400,
  maxConcurrentBombs: 5,
  bombRadius: 52,
  bombLifetimeMs: 5500,
  launchSpeedMultiplier: 1.45,
  gravityMultiplier: 1.45,
  maxBurstSize: 3,
  burstIntervalMs: 75,
};

export const DEFAULT_BOMB_CONFIGS: BombConfig[] = [
  {
    id: 'bomb_red',
    name: 'Red Bomb',
    color: '#EF4444',
    points: 100,
    spawnWeight: 10,
    soundPreset: 'pop',
    soundAssetId: null,
    soundUrl: null,
    imagePreset: 'red_classic',
    imageAssetId: null,
    imageUrl: null,
    isActive: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'bomb_blue',
    name: 'Blue Bomb',
    color: '#3B82F6',
    points: 150,
    spawnWeight: 8,
    soundPreset: 'blast',
    soundAssetId: null,
    soundUrl: null,
    imagePreset: 'blue_happy',
    imageAssetId: null,
    imageUrl: null,
    isActive: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'bomb_green',
    name: 'Green Bomb',
    color: '#10B981',
    points: 300,
    spawnWeight: 4,
    soundPreset: 'chime',
    soundAssetId: null,
    soundUrl: null,
    imagePreset: 'green_super',
    imageAssetId: null,
    imageUrl: null,
    isActive: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'bomb_black',
    name: 'Black Bomb',
    color: '#1E293B',
    points: -150,
    spawnWeight: 6,
    soundPreset: 'penalty_buzz',
    soundAssetId: null,
    soundUrl: null,
    imagePreset: 'black_penalty',
    imageAssetId: null,
    imageUrl: null,
    isActive: true,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

