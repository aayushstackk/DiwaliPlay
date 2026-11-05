/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import http from 'http';
import assert from 'assert';
import { MongoStorageAdapter } from '../server/storage/mongoAdapter';
import { setStorageInstanceForTest } from '../server/storage/index';
import { GridFSStorageProvider } from '../server/storage/assets/gridfsProvider';
import { setAssetStorageProvider } from '../server/storage/assets';
import { validateUploadedFile, generateSafeObjectKey } from '../server/storage/assets/validation';
import { apiRouter } from '../server/routes/api';

const MB = 1024 * 1024;
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(32)]);

function mp4File(size: number) {
  return { originalname: 'bg.mp4', mimetype: 'video/mp4', size, buffer: MP4 };
}

function runValidationTests() {
  console.log('▶ Start background validation');
  assert.strictEqual(validateUploadedFile(mp4File(MP4.length), 'start_backgrounds').valid, true, 'valid mp4');
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.mp4', mimetype: 'video/mp4', size: 44, buffer: Buffer.alloc(44) },
      'start_backgrounds'
    ).valid,
    false,
    'mp4 without ftyp'
  );
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.png', mimetype: 'image/png', size: 15 * MB + 1, buffer: PNG_HEADER },
      'start_backgrounds'
    ).valid,
    false,
    'image over 15 MB'
  );
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.png', mimetype: 'image/png', size: 15 * MB, buffer: PNG_HEADER },
      'start_backgrounds'
    ).valid,
    true,
    'image at 15 MB'
  );
  assert.strictEqual(validateUploadedFile(mp4File(40 * MB), 'start_backgrounds').valid, true, 'video at 40 MB');
  assert.strictEqual(validateUploadedFile(mp4File(40 * MB + 1), 'start_backgrounds').valid, false, 'video over 40 MB');
  assert.strictEqual(validateUploadedFile(mp4File(MP4.length), 'wallpapers').valid, false, 'mp4 not a wallpaper');
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'a.mp3', mimetype: 'audio/mpeg', size: 100, buffer: Buffer.from('ID3' + 'x'.repeat(100)) },
      'start_backgrounds'
    ).valid,
    false,
    'audio rejected'
  );
  assert(generateSafeObjectKey('start_backgrounds', '.mp4').startsWith('start_backgrounds/bg_'));
  console.log('  ✅ validation PASSED\n');
}

async function runApiTests() {
  console.log('▶ Start background API');
  const mongod = await MongoMemoryServer.create();
  const adapter = new MongoStorageAdapter(mongod.getUri(), 'start_bg_test');
  await adapter.init();
  setStorageInstanceForTest(adapter);
  setAssetStorageProvider(new GridFSStorageProvider(adapter.getDb()));

  const admin = await adapter.createAdminUser({
    username: 'bg_test_admin',
    passwordHash: 'dummy_hash',
    role: 'superadmin',
    isActive: true
  } as any);
  const session = await adapter.createAdminSession({
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  });
  const auth = { Authorization: `Bearer ${session.id}` };

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  // Upload a real MP4 through the route
  const form = new FormData();
  form.append('category', 'start_backgrounds');
  form.append('file', new Blob([MP4], { type: 'video/mp4' }), 'bg.mp4');
  const up = await fetch(`${baseUrl}/api/admin/assets/upload`, { method: 'POST', headers: auth, body: form });
  assert.strictEqual(up.status, 201, `upload status ${up.status}`);
  const asset = ((await up.json()) as any).asset;

  // Not in the wallpaper playlist
  const settingsRes: any = await (await fetch(`${baseUrl}/api/settings`)).json();
  assert(
    !settingsRes.wallpaperPlaylist.some((w: any) => w.id === asset.id),
    'start background must not appear in wallpaperPlaylist'
  );
  console.log('  ✅ omitted from wallpaperPlaylist');

  // Delete refused while assigned
  await adapter.updateSettings({ startBackgroundUrl: asset.url, startBackgroundType: 'video' });
  const del = await fetch(`${baseUrl}/api/admin/assets/${asset.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(del.status, 409, `delete status ${del.status}`);
  assert.strictEqual(((await del.json()) as any).error, 'ASSET_IN_USE');
  console.log('  ✅ delete refused while in use');

  // Unassigned: delete allowed
  await adapter.updateSettings({ startBackgroundUrl: null });
  const del2 = await fetch(`${baseUrl}/api/admin/assets/${asset.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(del2.status, 200, `delete status after unassign ${del2.status}`);

  // Over 40 MB upload -> 413 FILE_TOO_LARGE
  const big = new FormData();
  big.append('category', 'start_backgrounds');
  big.append('file', new Blob([Buffer.alloc(40 * MB + 1024)], { type: 'video/mp4' }), 'big.mp4');
  const bigRes = await fetch(`${baseUrl}/api/admin/assets/upload`, { method: 'POST', headers: auth, body: big });
  assert.strictEqual(bigRes.status, 413, `big upload status ${bigRes.status}`);
  const bigJson: any = await bigRes.json();
  assert.strictEqual(bigJson.success, false);
  assert.strictEqual(bigJson.error, 'FILE_TOO_LARGE');
  assert(typeof bigJson.message === 'string' && bigJson.message.length > 0);
  console.log('  ✅ oversize upload returns 413 FILE_TOO_LARGE');

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await adapter.close?.();
  await mongod.stop();
  console.log('  ✅ API PASSED\n');
}

async function main() {
  runValidationTests();
  await runApiTests();
  process.exit(0);
}

main().catch((err) => {
  console.error('Start background test failed:', err);
  process.exit(1);
});
