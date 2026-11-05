/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import http from 'http';
import assert from 'assert';
import { Readable } from 'stream';
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
  // Cap bypass attempts: declared MIME must agree with the extension, cap follows the real type
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.png', mimetype: 'video/mp4', size: 20 * MB, buffer: PNG_HEADER },
      'start_backgrounds'
    ).valid,
    false,
    '.png declared video/mp4 over 15 MB'
  );
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.png', mimetype: 'video/mp4', size: 1000, buffer: PNG_HEADER },
      'start_backgrounds'
    ).valid,
    false,
    '.png declared video/mp4 rejected even when small'
  );
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.mp4', mimetype: 'image/jpeg', size: 1000, buffer: JPEG },
      'start_backgrounds'
    ).valid,
    false,
    '.mp4 declared image/jpeg with JPEG bytes'
  );
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.png', mimetype: 'image/png; x=1', size: 15 * MB + 1, buffer: PNG_HEADER },
      'start_backgrounds'
    ).valid,
    false,
    'image/png with params over 15 MB'
  );
  assert.strictEqual(
    validateUploadedFile(
      { originalname: 'bg.png', mimetype: 'image/png; x=1', size: 1000, buffer: PNG_HEADER },
      'start_backgrounds'
    ).normalizedMime,
    'image/png',
    'params stripped from stored MIME'
  );
  assert(generateSafeObjectKey('start_backgrounds', '.mp4').startsWith('start_backgrounds/bg_'));
  console.log('  ✅ validation PASSED\n');
}

/** Polls because the cursor closes just after the disconnect, not at the same moment. */
async function waitUntil(check: () => Promise<boolean> | boolean, message: string) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    assert(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// An abandoned download must release its cursor: each one left open holds about 16 MB until the server restarts.
async function runAbandonedDownloadTests(adapter: MongoStorageAdapter, baseUrl: string, auth: Record<string, string>) {
  // Larger than one 16 MB cursor batch, or the server closes the cursor by itself and nothing here can fail.
  const form = new FormData();
  form.append('category', 'start_backgrounds');
  form.append('file', new Blob([MP4, Buffer.alloc(30 * MB, 7)], { type: 'video/mp4' }), 'large.mp4');
  const up = await fetch(`${baseUrl}/api/admin/assets/upload`, { method: 'POST', headers: auth, body: form });
  assert.strictEqual(up.status, 201, `large upload status ${up.status}`);
  const url = `${baseUrl}/api/assets/${((await up.json()) as any).asset.id}/content`;

  const openCursors = async (): Promise<number> =>
    (await adapter.getDb().admin().command({ serverStatus: 1 })).metrics.cursor.open.total;
  const noOpenCursors = (when: string) =>
    waitUntil(async () => (await openCursors()) === 0, `cursor left open after ${when}`);

  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve, reject) => {
      const request = http.get(url, (response) => {
        response.once('data', () => {
          request.destroy();
          resolve();
        });
      });
      request.on('error', () => {});
      request.setTimeout(5000, () => reject(new Error('no data from the download')));
    });
  }
  await noOpenCursors('disconnecting during a download');
  console.log('  ✅ disconnecting during a download closes the cursor');

  for (let i = 0; i < 3; i++) {
    assert.strictEqual((await fetch(url, { method: 'HEAD' })).status, 200);
  }
  await noOpenCursors('HEAD');
  console.log('  ✅ HEAD closes the cursor');

  // The client goes while the object is still opening, so the response is already gone when the route gets to it.
  const proto = GridFSStorageProvider.prototype;
  const realOpen = proto.openReadStream;
  const opened: Readable[] = [];
  proto.openReadStream = async function (key: string) {
    const result = await realOpen.call(this, key);
    opened.push(result.stream);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return result;
  };
  try {
    const request = http.get(url);
    request.on('error', () => {});
    setTimeout(() => request.destroy(), 100);
    await waitUntil(() => opened.length === 1 && opened[0].destroyed, 'read stream left open after an early disconnect');
    await noOpenCursors('an early disconnect');
    console.log('  ✅ disconnecting before the response starts closes the read stream');
  } finally {
    proto.openReadStream = realOpen;
  }

  // Still delivers normally after all of that.
  const full = await fetch(url);
  assert.strictEqual(full.status, 200);
  assert.strictEqual((await full.arrayBuffer()).byteLength, MP4.length + 30 * MB);
  await noOpenCursors('a full download');
  console.log('  ✅ full download still complete');
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

  // Multer lets 40 MB through now, so another category's own cap has to catch this.
  const wallpaper = new FormData();
  wallpaper.append('category', 'wallpapers');
  wallpaper.append('file', new Blob([PNG_HEADER, Buffer.alloc(20 * MB)], { type: 'image/png' }), 'big.png');
  const wallpaperRes = await fetch(`${baseUrl}/api/admin/assets/upload`, { method: 'POST', headers: auth, body: wallpaper });
  assert.strictEqual(wallpaperRes.status, 400, `20 MB wallpaper status ${wallpaperRes.status}`);
  assert.strictEqual(((await wallpaperRes.json()) as any).error, 'FILE_VALIDATION_FAILED');
  const wallpapers = await adapter.listAssets({ category: 'wallpapers' });
  assert.strictEqual(wallpapers.length, 0, 'rejected wallpaper stored nothing');
  console.log('  ✅ 20 MB wallpaper rejected through the route');

  await runAbandonedDownloadTests(adapter, baseUrl, auth);

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
