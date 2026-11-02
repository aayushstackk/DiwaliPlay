/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { GridFSStorageProvider } from '../server/storage/assets/gridfsProvider';
import { S3StorageProvider } from '../server/storage/assets/s3Provider';
import { LocalStorageProvider } from '../server/storage/assets/localProvider';
import {
  setAssetStorageProvider,
  getAssetStorageProvider,
  getStorageProviderByType,
  migrateLocalAssetsToPersistentStorage
} from '../server/storage/assets';
import { MongoStorageAdapter } from '../server/storage/mongoAdapter';
import { setStorageInstanceForTest } from '../server/storage/index';

// Minimal 1x1 valid PNG binary
const VALID_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runTests() {
  console.log('====================================================');
  console.log('🧪 DIWALIPLAY DURABLE ASSET STORAGE PERSISTENCE SUITE');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: GridFS Provider Persistence Across Simulated Server Restarts
  // --------------------------------------------------------------------------
  console.log('▶ Test 1: GridFS Provider Persistence Across Simulated Server Restarts');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const dbName = 'diwali_fun_play_test';

  const client1 = new MongoClient(uri);
  await client1.connect();
  const db1 = client1.db(dbName);

  // Initial server session (Server 1)
  const server1Provider = new GridFSStorageProvider(db1);
  assert.strictEqual(server1Provider.getType(), 'gridfs');
  assert.strictEqual(server1Provider.isConfigured(), true);

  const testKey = 'brand_logos/test_logo_1730000000_abcdef1234.png';
  const testMime = 'image/png';

  console.log('  1.1 Uploading binary asset (1x1 PNG) to GridFS on Server 1...');
  const saveResult = await server1Provider.saveObject(testKey, VALID_1X1_PNG, testMime);
  assert.strictEqual(saveResult.key, testKey);
  assert.strictEqual(saveResult.size, VALID_1X1_PNG.length);

  // Verify binary was persisted into MongoDB collections (fs.files & fs.chunks)
  const filesCount = await db1.collection('asset_uploads.files').countDocuments();
  const chunksCount = await db1.collection('asset_uploads.chunks').countDocuments();
  assert(filesCount >= 1, 'Expected asset_uploads.files to contain file metadata');
  assert(chunksCount >= 1, 'Expected asset_uploads.chunks to contain binary chunks');
  console.log(`  1.2 MongoDB verified: ${filesCount} file record(s), ${chunksCount} chunk(s) stored.`);

  // SIMULATE REDEPLOYMENT / CRASH / RESTART:
  // Disconnect server 1 client and instantiate a completely fresh Server 2 process
  console.log('  1.3 Simulating container restart/redeploy: destroying Server 1 instance...');
  await client1.close();

  console.log('  1.4 Launching Server 2 process connecting to same persistent MongoDB database...');
  const client2 = new MongoClient(uri);
  await client2.connect();
  const db2 = client2.db(dbName);

  const server2Provider = new GridFSStorageProvider(db2);
  assert.strictEqual(server2Provider.isConfigured(), true);

  console.log('  1.5 Reading asset from Server 2...');
  const readResult = await server2Provider.readObject(testKey);

  assert.strictEqual(readResult.mimeType, testMime);
  assert.strictEqual(readResult.data.length, VALID_1X1_PNG.length);
  assert.strictEqual(
    Buffer.compare(readResult.data, VALID_1X1_PNG),
    0,
    'Asset data read by Server 2 must match original uploaded bytes byte-for-byte!'
  );
  console.log('  ✅ GridFS persistence across container restart PASSED! (Byte-exact match)');

  // --------------------------------------------------------------------------
  // TEST 2: Overwrite and Deletion in GridFS
  // --------------------------------------------------------------------------
  console.log('\n▶ Test 2: Overwrite and Deletion in GridFS');
  const updatedPng = Buffer.from(VALID_1X1_PNG);
  updatedPng[0] = 0x89; // identical length, test replacement
  await server2Provider.saveObject(testKey, updatedPng, testMime);
  const reRead = await server2Provider.readObject(testKey);
  assert.strictEqual(reRead.data.length, updatedPng.length);

  const deleted = await server2Provider.deleteObject(testKey);
  assert.strictEqual(deleted, true);

  let notFoundCaught = false;
  try {
    await server2Provider.readObject(testKey);
  } catch (err: any) {
    notFoundCaught = true;
    assert(err.message.includes('not found in GridFS'));
  }
  assert(notFoundCaught, 'Expected 404 / Error after asset deletion');
  console.log('  ✅ GridFS overwrite and deletion PASSED!');

  // --------------------------------------------------------------------------
  // TEST 3: S3 Provider Configuration and URL Generation
  // --------------------------------------------------------------------------
  console.log('\n▶ Test 3: S3 Storage Provider Configuration');
  const s3Custom = new S3StorageProvider({
    bucketName: 'diwali-production-assets',
    region: 'ap-south-1',
    accessKeyId: 'AKIA_TEST_KEY',
    secretAccessKey: 'SECRET_TEST_KEY',
    publicUrlPrefix: 'https://cdn.diwaliplay.com'
  });

  assert.strictEqual(s3Custom.getType(), 's3');
  assert.strictEqual(s3Custom.isConfigured(), true);
  const s3Url = s3Custom.getServingUrl('asset_test123', 'wallpapers/wlp_1.webp');
  assert.strictEqual(s3Url, 'https://cdn.diwaliplay.com/wallpapers/wlp_1.webp');
  console.log(`  3.1 Configured S3 public serving URL: ${s3Url}`);

  const s3Fallback = new S3StorageProvider(); // Unconfigured
  assert.strictEqual(s3Fallback.isConfigured(), false);
  const fallbackUrl = s3Fallback.getServingUrl('asset_test123', 'wallpapers/wlp_1.webp');
  assert.strictEqual(fallbackUrl, '/api/assets/asset_test123/content');
  console.log(`  3.2 Unconfigured S3 fallback URL: ${fallbackUrl}`);
  console.log('  ✅ S3 Provider configuration and URL resolution PASSED!');

  // --------------------------------------------------------------------------
  // TEST 4: Auto-Migration of Local Ephemeral Assets to Persistent GridFS
  // --------------------------------------------------------------------------
  console.log('\n▶ Test 4: Auto-Migration of Ephemeral Local Assets to Persistent GridFS');
  const mongoAdapter = new MongoStorageAdapter(uri, dbName);
  await mongoAdapter.init();

  // Set active storage instance
  setStorageInstanceForTest(mongoAdapter);

  // Set active asset provider to GridFS
  const gridfsActive = new GridFSStorageProvider(mongoAdapter.getDb());
  setAssetStorageProvider(gridfsActive);

  // Create a local asset file in data/uploads
  const localTestKey = 'wallpapers/test_local_migration.png';
  const localProvider = new LocalStorageProvider();
  await localProvider.saveObject(localTestKey, VALID_1X1_PNG, 'image/png');

  // Create an asset database record with storageProvider: 'local'
  const assetRecord = await mongoAdapter.createAsset({
    category: 'wallpapers',
    originalFilename: 'test_local_migration.png',
    objectKey: localTestKey,
    mimeType: 'image/png',
    fileSize: VALID_1X1_PNG.length,
    uploaderId: 'admin_test',
    uploaderUsername: 'admin',
    isActive: true,
    displayName: 'Local Wallpaper',
    url: `/api/assets/asset_legacy/content`,
    storageProvider: 'local'
  });

  console.log(`  4.1 Created legacy local asset record: ${assetRecord.id}`);

  // Run the safe auto-migration
  const migResult = await migrateLocalAssetsToPersistentStorage();
  console.log(`  4.2 Migration executed: ${migResult.migratedCount} migrated, ${migResult.skippedCount} skipped.`);
  assert.strictEqual(migResult.migratedCount, 1);

  // Verify updated record in MongoDB
  const updatedRecord = await mongoAdapter.getAssetById(assetRecord.id);
  assert.strictEqual(updatedRecord?.storageProvider, 'gridfs');
  assert.strictEqual(updatedRecord?.url, `/api/assets/${assetRecord.id}/content`);

  // Verify binary is now retrievable directly from GridFS
  const migratedBinary = await gridfsActive.readObject(localTestKey);
  assert.strictEqual(Buffer.compare(migratedBinary.data, VALID_1X1_PNG), 0);
  console.log('  ✅ Ephemeral-to-persistent auto-migration PASSED!');

  // Clean up local test file
  await localProvider.deleteObject(localTestKey).catch(() => {});

  // --------------------------------------------------------------------------
  // TEST 5: Resilient Asset Lookup by ID, ObjectKey, or Filename
  // --------------------------------------------------------------------------
  console.log('\n▶ Test 5: Resilient Asset Lookup');
  const byId = await mongoAdapter.getAssetById(assetRecord.id);
  const byKey = await mongoAdapter.getAssetById(assetRecord.objectKey);
  const byFilename = await mongoAdapter.getAssetById(assetRecord.originalFilename);

  assert(byId !== undefined, 'Lookup by ID failed');
  assert(byKey !== undefined, 'Lookup by ObjectKey failed');
  assert(byFilename !== undefined, 'Lookup by Filename failed');
  assert.strictEqual(byId.id, byKey.id);
  assert.strictEqual(byId.id, byFilename.id);
  console.log('  ✅ Resilient asset lookup (ID / ObjectKey / Filename) PASSED!');

  // Clean up test MongoDB instance
  await client2.close();
  await mongoAdapter.close?.();
  await mongod.stop();

  console.log('\n====================================================');
  console.log('🎉 ALL PERSISTENT STORAGE TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});

