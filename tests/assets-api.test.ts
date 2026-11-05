/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import http from 'http';
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { MongoStorageAdapter } from '../server/storage/mongoAdapter';
import { setStorageInstanceForTest } from '../server/storage/index';
import { GridFSStorageProvider } from '../server/storage/assets/gridfsProvider';
import { LocalStorageProvider } from '../server/storage/assets/localProvider';
import { setAssetStorageProvider } from '../server/storage/assets';
import type { AssetStorageProvider } from '../server/storage/assets';
import { assetsRouter } from '../server/routes/assets';

const VALID_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runApiTests() {
  console.log('▶ Test 6: Safe Asset Content API Delivery Endpoint (/api/assets/:id/content)');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const dbName = 'diwali_fun_play_api_test';

  const adapter = new MongoStorageAdapter(uri, dbName);
  await adapter.init();
  setStorageInstanceForTest(adapter);

  const gridfs = new GridFSStorageProvider(adapter.getDb());
  setAssetStorageProvider(gridfs);

  // Save asset to GridFS and Mongo
  const objectKey = 'brand_logos/api_test_logo.png';
  await gridfs.saveObject(objectKey, VALID_1X1_PNG, 'image/png');

  const asset = await adapter.createAsset({
    category: 'brand_logos',
    originalFilename: 'api_test_logo.png',
    objectKey,
    mimeType: 'image/png',
    fileSize: VALID_1X1_PNG.length,
    uploaderId: 'admin_test',
    uploaderUsername: 'admin',
    isActive: true,
    displayName: 'API Test Logo',
    url: `/api/assets/asset_placeholder/content`,
    storageProvider: 'gridfs'
  });

  const app = express();
  app.use('/api', assetsRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`  6.1 Requesting /api/assets/${asset.id}/content...`);
  const res1 = await fetch(`${baseUrl}/api/assets/${asset.id}/content`);
  assert.strictEqual(res1.status, 200, `Expected 200 OK, got ${res1.status}`);
  assert.strictEqual(res1.headers.get('content-type'), 'image/png');
  assert.strictEqual(res1.headers.get('x-content-type-options'), 'nosniff');
  assert(res1.headers.get('cache-control')?.includes('public'));
  const etag = res1.headers.get('etag');
  assert(Boolean(etag), 'Expected ETag header');

  const body1 = Buffer.from(await res1.arrayBuffer());
  assert.strictEqual(Buffer.compare(body1, VALID_1X1_PNG), 0, 'Binary must match original PNG');
  console.log('  6.2 Verified 200 OK, headers, and binary equality.');

  // Test If-None-Match ETag (304 Not Modified)
  console.log('  6.3 Requesting with If-None-Match header...');
  const res2 = await fetch(`${baseUrl}/api/assets/${asset.id}/content`, {
    headers: { 'If-None-Match': etag! }
  });
  assert.strictEqual(res2.status, 304, `Expected 304 Not Modified, got ${res2.status}`);
  console.log('  6.4 Verified 304 Not Modified cache response.');

  // Test 404 on nonexistent asset
  console.log('  6.5 Requesting non-existent asset...');
  const res3 = await fetch(`${baseUrl}/api/assets/non_existent_id/content`);
  assert.strictEqual(res3.status, 404);
  const json3: any = await res3.json();
  assert.strictEqual(json3.success, false);
  assert.strictEqual(json3.error, 'ASSET_NOT_FOUND');
  console.log('  6.6 Verified 404 structured JSON on missing asset.');

  await runStreamingTests(adapter, gridfs, baseUrl, asset, etag!);

  // Clean up
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await adapter.close?.();
  await mongod.stop();
  console.log('  ✅ Asset Content API Delivery Endpoint PASSED!\n');
  process.exit(0);
}

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

const newAsset = (adapter: MongoStorageAdapter, objectKey: string, size: number, mimeType: string, storageProvider: any) =>
  adapter.createAsset({
    category: 'start_backgrounds',
    originalFilename: path.basename(objectKey),
    objectKey,
    mimeType,
    fileSize: size,
    uploaderId: 'admin_test',
    uploaderUsername: 'admin',
    isActive: true,
    displayName: objectKey,
    url: '',
    storageProvider
  });

const assertDeliveryHeaders = (res: Response) => {
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert(res.headers.get('content-security-policy')?.includes('sandbox'), 'CSP sandbox');
  assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=86400, stale-while-revalidate=3600');
};

async function runStreamingTests(
  adapter: MongoStorageAdapter,
  gridfs: GridFSStorageProvider,
  baseUrl: string,
  logo: { id: string },
  etag: string
) {
  // Every instance of the provider counts: the route gets its own from the registry.
  const proto = GridFSStorageProvider.prototype as any;
  const realRead = proto.readObject;
  const realOpen = proto.openReadStream;
  let reads = 0;
  let opens = 0;
  let lastStream: Readable | null = null;
  proto.readObject = async function (...args: any[]) {
    reads++;
    return realRead.apply(this, args);
  };
  proto.openReadStream = async function (...args: any[]) {
    opens++;
    const result = await realOpen.apply(this, args);
    lastStream = result.stream;
    return result;
  };

  console.log('  6.7 A matching If-None-Match never touches storage...');
  for (const header of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
    reads = opens = 0;
    const res = await fetch(`${baseUrl}/api/assets/${logo.id}/content`, { headers: { 'If-None-Match': header } });
    assert.strictEqual(res.status, 304, `304 for ${header}, got ${res.status}`);
    assert.strictEqual(res.headers.get('etag'), etag);
    assertDeliveryHeaders(res);
    assert.strictEqual(reads + opens, 0, `no storage read for ${header}`);
  }
  const stale = await fetch(`${baseUrl}/api/assets/${logo.id}/content`, { headers: { 'If-None-Match': '"other"' } });
  assert.strictEqual(stale.status, 200);
  await stale.arrayBuffer();

  console.log('  6.8 GridFS bytes are streamed, identical, with the delivery headers...');
  const video = crypto.randomBytes(5 * 1024 * 1024);
  await gridfs.saveObject('start_backgrounds/stream.mp4', video, 'video/mp4');
  const videoAsset = await newAsset(adapter, 'start_backgrounds/stream.mp4', video.length, 'video/mp4', 'gridfs');
  reads = opens = 0;
  const streamed = await fetch(`${baseUrl}/api/assets/${videoAsset.id}/content`);
  assert.strictEqual(streamed.status, 200);
  assert.strictEqual(streamed.headers.get('content-type'), 'video/mp4');
  assert.strictEqual(streamed.headers.get('content-length'), String(video.length));
  assertDeliveryHeaders(streamed);
  assert.strictEqual(sha(Buffer.from(await streamed.arrayBuffer())), sha(video), 'streamed bytes identical');
  assert.strictEqual(opens, 1, 'read through a stream');
  assert.strictEqual(reads, 0, 'not read into a buffer');

  console.log('  6.9 A client that disconnects destroys the read stream...');
  lastStream = null;
  await new Promise<void>((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/assets/${videoAsset.id}/content`, (res) => {
      res.once('data', () => {
        req.destroy();
        resolve();
      });
    });
    req.on('error', (err: any) => (err.code === 'ECONNRESET' ? undefined : reject(err)));
  });
  const deadline = Date.now() + 5000;
  while (!(lastStream as Readable | null)?.destroyed && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert((lastStream as Readable | null)?.destroyed, 'read stream destroyed after disconnect');

  console.log('  6.10 A missing object is the JSON 404, with or without its file record...');
  const missing = await newAsset(adapter, 'start_backgrounds/never_stored.mp4', 100, 'video/mp4', 'gridfs');
  const res404 = await fetch(`${baseUrl}/api/assets/${missing.id}/content`);
  assert.strictEqual(res404.status, 404);
  assert.strictEqual(((await res404.json()) as any).error, 'STORAGE_OBJECT_NOT_FOUND');

  // The file record is there, the chunks aren't: the failure only shows on the first read.
  const orphanBytes = crypto.randomBytes(1024);
  await gridfs.saveObject('start_backgrounds/orphan.mp4', orphanBytes, 'video/mp4');
  await adapter.getDb().collection('asset_uploads.chunks').deleteMany({});
  const orphan = await newAsset(adapter, 'start_backgrounds/orphan.mp4', orphanBytes.length, 'video/mp4', 'gridfs');
  const resOrphan = await fetch(`${baseUrl}/api/assets/${orphan.id}/content`);
  assert.strictEqual(resOrphan.status, 404, `orphan status ${resOrphan.status}`);
  assert.strictEqual(((await resOrphan.json()) as any).error, 'STORAGE_OBJECT_NOT_FOUND');

  proto.readObject = realRead;
  proto.openReadStream = realOpen;

  console.log('  6.11 Local files are streamed too...');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-stream-'));
  const local = new LocalStorageProvider(tmp);
  const localBytes = crypto.randomBytes(2 * 1024 * 1024);
  await local.saveObject('start_backgrounds/local.mp4', localBytes, 'video/mp4');
  const opened = await local.openReadStream('start_backgrounds/local.mp4');
  assert.strictEqual(opened.size, localBytes.length);
  const chunks: Buffer[] = [];
  for await (const c of opened.stream) chunks.push(c as Buffer);
  assert.strictEqual(sha(Buffer.concat(chunks)), sha(localBytes));
  await assert.rejects(local.openReadStream('start_backgrounds/nope.mp4'), 'a missing local file rejects');

  setAssetStorageProvider(local);
  const localAsset = await newAsset(adapter, 'start_backgrounds/local.mp4', localBytes.length, 'video/mp4', undefined);
  const viaRoute = await fetch(`${baseUrl}/api/assets/${localAsset.id}/content`);
  assert.strictEqual(viaRoute.status, 200);
  assert.strictEqual(viaRoute.headers.get('content-length'), String(localBytes.length));
  assert.strictEqual(sha(Buffer.from(await viaRoute.arrayBuffer())), sha(localBytes));

  console.log('  6.12 A provider that can only buffer still works behind the same route...');
  const bufferBytes = crypto.randomBytes(4096);
  const bufferOnly = {
    getType: () => 'local',
    isConfigured: () => true,
    getStatusDetails: () => ({ provider: 'local', configured: true, locationInfo: '', isProductionReady: false }),
    saveObject: async () => ({ key: '', size: 0 }),
    readObject: async () => ({ data: bufferBytes, mimeType: 'video/mp4' }),
    deleteObject: async () => true,
    getServingUrl: () => ''
  } as unknown as AssetStorageProvider;
  setAssetStorageProvider(bufferOnly);
  const bufferAsset = await newAsset(adapter, 'start_backgrounds/s3like.mp4', bufferBytes.length, 'video/mp4', undefined);
  const viaBuffer = await fetch(`${baseUrl}/api/assets/${bufferAsset.id}/content`);
  assert.strictEqual(viaBuffer.status, 200);
  assertDeliveryHeaders(viaBuffer);
  const bufferEtag = viaBuffer.headers.get('etag')!;
  assert.strictEqual(sha(Buffer.from(await viaBuffer.arrayBuffer())), sha(bufferBytes));
  const buffer304 = await fetch(`${baseUrl}/api/assets/${bufferAsset.id}/content`, {
    headers: { 'If-None-Match': bufferEtag }
  });
  assert.strictEqual(buffer304.status, 304);

  setAssetStorageProvider(gridfs);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('  6.13 Verified streaming delivery.');
}

runApiTests().catch((err) => {
  console.error('API test failed:', err);
  process.exit(1);
});

