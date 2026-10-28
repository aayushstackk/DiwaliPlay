/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { initStorage } from '../server/storage';
import { DEFAULT_BOMB_CONFIGS, DEFAULT_BOMB_SETTINGS } from '../src/utils/bombDefaults';

async function runTests() {
  console.log('=== STARTING BOMB GAME INTEGRATION TEST ===\n');

  const storage = await initStorage();
  console.log(`[Storage Backend] Using: ${storage.getType()}`);

  // 1. Test fetching initial bombs
  const initialBombs = await storage.getBombConfigs(true);
  console.log(`[1] getBombConfigs returned ${initialBombs.length} bombs`);

  const red = initialBombs.find((b) => b.id === 'bomb_red' || b.name.includes('Red'));
  const blue = initialBombs.find((b) => b.id === 'bomb_blue' || b.name.includes('Blue'));
  const green = initialBombs.find((b) => b.id === 'bomb_green' || b.name.includes('Green'));
  const black = initialBombs.find((b) => b.id === 'bomb_black' || b.name.includes('Black'));

  if (!red || red.points !== 100) throw new Error(`Red bomb validation failed: ${JSON.stringify(red)}`);
  if (!blue || blue.points !== 150) throw new Error(`Blue bomb validation failed: ${JSON.stringify(blue)}`);
  if (!green || green.points !== 300) throw new Error(`Green bomb validation failed: ${JSON.stringify(green)}`);
  if (!black || black.points !== -150) throw new Error(`Black penalty bomb validation failed: ${JSON.stringify(black)}`);

  console.log('✔ All 4 default bombs validated:');
  console.log(`  - Red: ${red.points} pts, color: ${red.color}, preset: ${red.imagePreset}`);
  console.log(`  - Blue: ${blue.points} pts, color: ${blue.color}, preset: ${blue.imagePreset}`);
  console.log(`  - Green: ${green.points} pts, color: ${green.color}, preset: ${green.imagePreset}`);
  console.log(`  - Black: ${black.points} pts, color: ${black.color}, preset: ${black.imagePreset}`);

  // 2. Test Bomb Game Settings
  const settings = await storage.getBombGameSettings();
  console.log(`\n[2] getBombGameSettings:`, settings);
  if (!settings.minSpawnDelayMs || !settings.maxSpawnDelayMs || !settings.maxConcurrentBombs) {
    throw new Error('Invalid bomb game settings structure');
  }
  console.log('✔ Bomb settings validated');

  // 3. Test creating a new bomb
  console.log('\n[3] Testing creation of a custom test bomb...');
  const created = await storage.createBombConfig({
    name: 'Temporary Test Gold Bomb',
    color: '#F59E0B',
    points: 500,
    spawnWeight: 2,
    soundPreset: 'chime',
    soundAssetId: null,
    soundUrl: null,
    imagePreset: 'green_super',
    imageAssetId: null,
    imageUrl: null,
    isActive: true,
    isDefault: false
  });
  console.log(`✔ Created bomb: ${created.id} - ${created.name} (${created.points} pts)`);

  // 4. Test updating bomb
  console.log('\n[4] Testing updating the custom bomb...');
  const updated = await storage.updateBombConfig(created.id, {
    points: 600,
    name: 'Updated Gold Bomb'
  });
  if (!updated || updated.points !== 600) throw new Error('Update bomb failed');
  console.log(`✔ Updated bomb: ${updated.id} - ${updated.name} (${updated.points} pts)`);

  // 5. Test safe deletion
  console.log('\n[5] Testing safe deletion of custom bomb...');
  const deleted = await storage.deleteBombConfig(created.id);
  if (!deleted) throw new Error('Delete bomb failed');
  const fetchedDeleted = await storage.getBombConfigById(created.id);
  if (fetchedDeleted) {
    throw new Error('Unreferenced bomb should be permanently removed');
  }
  console.log(`✔ Successfully deleted unreferenced custom bomb`);

  // Active list should not include deleted bomb
  const activeOnly = await storage.getBombConfigs(false);
  const foundInActive = activeOnly.some((b) => b.id === created.id);
  if (foundInActive) throw new Error('Deleted bomb still present in active list');
  console.log(`✔ Active list correctly excludes deleted bomb`);

  // 6. Test updating settings
  console.log('\n[6] Testing updating bomb settings...');
  const prevDelay = settings.minSpawnDelayMs;
  const updatedSettings = await storage.updateBombGameSettings({ minSpawnDelayMs: 650 });
  if (updatedSettings.minSpawnDelayMs !== 650) throw new Error('Update bomb settings failed');
  // Revert back
  await storage.updateBombGameSettings({ minSpawnDelayMs: prevDelay });
  console.log('✔ Bomb settings update & revert validated');

  if (storage.close) {
    await storage.close();
  }

  console.log('\n=== ALL BOMB GAME INTEGRATION TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
