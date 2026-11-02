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

  // Clean up
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await adapter.close?.();
  await mongod.stop();
  console.log('  ✅ Asset Content API Delivery Endpoint PASSED!\n');
}

runApiTests().catch((err) => {
  console.error('API test failed:', err);
  process.exit(1);
});

