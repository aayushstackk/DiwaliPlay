/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JsonFileStorageAdapter } from '../server/storage/jsonAdapter';
import { MongoStorageAdapter } from '../server/storage/mongoAdapter';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { StorageAdapter } from '../server/storage/types';
import {
  validateUploadedFile,
  verifyMagicBytes,
  generateSafeObjectKey,
  CATEGORY_RULES
} from '../server/storage/assets/validation';
import { LocalStorageProvider } from '../server/storage/assets/localProvider';

async function runPhase4ATests() {
  console.log('====================================================');
  console.log('📦 RUNNING PHASE 4A ASSET STORAGE & SECURITY TESTS');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:3000';
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 1: FILE VALIDATION, MAGIC BYTES & PATH TRAVERSAL DEFENSE
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing File Signatures, Limits & Security Validation ---');

  // 1.1 Valid JPEG
  const validJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const jpegCheck = verifyMagicBytes(validJpegBuffer, 'image/jpeg', '.jpg');
  assert(jpegCheck.valid, 'Valid JPEG binary header signature accepted');

  // 1.2 Fake JPEG (text buffer renamed to .jpg)
  const fakeJpegBuffer = Buffer.from('this is malicious plain text masquerading as image');
  const fakeJpegCheck = verifyMagicBytes(fakeJpegBuffer, 'image/jpeg', '.jpg');
  assert(!fakeJpegCheck.valid, 'Spoofed JPEG with invalid header rejected');

  // 1.3 Valid PNG
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
  const pngCheck = verifyMagicBytes(validPngBuffer, 'image/png', '.png');
  assert(pngCheck.valid, 'Valid PNG binary header signature accepted');

  // 1.4 Malicious SVG with embedded <script>
  const xssSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const svgCheck = verifyMagicBytes(xssSvg, 'image/svg+xml', '.svg');
  assert(!svgCheck.valid, 'SVG containing embedded <script> tag rejected');

  // 1.5 Safe vector SVG
  const safeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="gold"/></svg>');
  const safeSvgCheck = verifyMagicBytes(safeSvg, 'image/svg+xml', '.svg');
  assert(safeSvgCheck.valid, 'Safe vector SVG accepted');

  // 1.6 File size limits
  const oversizedFile = {
    originalname: 'huge_wallpaper.jpg',
    mimetype: 'image/jpeg',
    size: 20 * 1024 * 1024, // 20 MB > 15 MB limit
    buffer: validJpegBuffer
  };
  const sizeVal = validateUploadedFile(oversizedFile, 'wallpapers');
  assert(!sizeVal.valid, 'Oversized file exceeding category limit (15MB) rejected');

  // 1.7 Disallowed file extension (.exe)
  const badExtFile = {
    originalname: 'payload.exe',
    mimetype: 'image/png',
    size: 1024,
    buffer: validPngBuffer
  };
  const extVal = validateUploadedFile(badExtFile, 'wallpapers');
  assert(!extVal.valid, 'Disallowed executable file extension rejected');

  // 1.8 Safe Key Generation & Path Traversal Immunity
  const safeKey1 = generateSafeObjectKey('wallpapers', '.jpg');
  assert(safeKey1.startsWith('wallpapers/wlp_') && safeKey1.endsWith('.jpg'), 'Object key matches clean deterministic format');
  assert(!safeKey1.includes('..') && !safeKey1.includes('\\'), 'Object key is sanitized against directory traversal');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: STORAGE ADAPTER ASSET PERSISTENCE (JSON & MONGO)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Storage Adapters for Asset Metadata ---');

  const adapters: { name: string; adapter: StorageAdapter }[] = [
    { name: 'JsonFileStorageAdapter', adapter: new JsonFileStorageAdapter() }
  ];

  let mongoServer: MongoMemoryServer | null = null;
  try {
    mongoServer = await MongoMemoryServer.create();
    const mongoAdapter = new MongoStorageAdapter(mongoServer.getUri(), 'phase4a_test_db');
    await mongoAdapter.init();
    adapters.push({ name: 'MongoStorageAdapter', adapter: mongoAdapter });
  } catch (mErr) {
    console.warn('  ⚠️ MongoMemoryServer unavailable:', mErr);
  }

  for (const { name, adapter } of adapters) {
    await adapter.init();

    // Create asset metadata
    const created = await adapter.createAsset({
      category: 'wallpapers',
      originalFilename: 'diwali_gold_4k.jpg',
      objectKey: `wallpapers/wlp_test_${name.slice(0, 4)}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 1024 * 500,
      uploaderId: 'admin_test_1',
      uploaderUsername: 'superadmin',
      isActive: true,
      displayName: 'Diwali Gold 4K',
      url: `/api/assets/test_url_${name}/content`,
      storageProvider: 'local'
    });

    assert(created.id.startsWith('asset_'), `${name}: Asset record created with stable ID`);
    assert(created.category === 'wallpapers', `${name}: Category assigned correctly`);

    // Lookup by ID
    const found = await adapter.getAssetById(created.id);
    assert(found?.displayName === 'Diwali Gold 4K', `${name}: Asset retrieved by ID`);

    // List filter
    const wallpapersList = await adapter.listAssets({ category: 'wallpapers' });
    assert(wallpapersList.some((a) => a.id === created.id), `${name}: Asset returned in category list query`);

    // Update metadata
    const updated = await adapter.updateAsset(created.id, { displayName: 'Updated Gold 4K' });
    assert(updated?.displayName === 'Updated Gold 4K', `${name}: Asset metadata updated`);

    // Delete asset
    const deleted = await adapter.deleteAsset(created.id);
    assert(deleted === true, `${name}: Asset record deleted from database`);

    const deletedCheck = await adapter.getAssetById(created.id);
    assert(deletedCheck === undefined, `${name}: Deleted asset cannot be retrieved`);
  }

  if (mongoServer) {
    await mongoServer.stop();
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 3: HTTP API AUTHENTICATION & MANAGEMENT ENDPOINTS
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing HTTP Security & Management Endpoints ---');

  // 3.1 Unauthenticated requests must return 401
  const unauthList = await fetch(`${BASE_URL}/api/admin/assets`);
  assert(unauthList.status === 401, 'GET /api/admin/assets without auth returns HTTP 401');

  const unauthUpload = await fetch(`${BASE_URL}/api/admin/assets/upload`, { method: 'POST' });
  assert(unauthUpload.status === 401, 'POST /api/admin/assets/upload without auth returns HTTP 401');

  const unauthDelete = await fetch(`${BASE_URL}/api/admin/assets/asset_123`, { method: 'DELETE' });
  assert(unauthDelete.status === 401, 'DELETE /api/admin/assets/:id without auth returns HTTP 401');

  // Log in as superadmin
  const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'DiwaliSuperAdmin2026!' })
  });
  assert(loginRes.status === 200, 'Superadmin logged in for asset testing');
  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const cookieVal = cookieHeader.split(';')[0];

  // 3.2 List assets authenticated
  const authList = await fetch(`${BASE_URL}/api/admin/assets`, {
    headers: { Cookie: cookieVal }
  });
  assert(authList.status === 200, 'GET /api/admin/assets with session returns HTTP 200');
  const listJson = await authList.json();
  assert(Array.isArray(listJson.assets), 'Assets API returns asset array');
  assert(typeof listJson.storageProvider === 'string', 'Storage provider identified in response');

  // 3.3 Upload a valid test PNG image via multipart/form-data
  console.log('\n--- 4. Testing Live Multipart Upload & In-Use Protection ---');

  // Valid 1x1 transparent PNG binary bytes
  const samplePngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const formData = new FormData();
  const blob = new Blob([samplePngBytes], { type: 'image/png' });
  formData.append('file', blob, 'test_brand_logo.png');
  formData.append('category', 'brand_logos');
  formData.append('displayName', 'Test Brand Logo');

  const uploadRes = await fetch(`${BASE_URL}/api/admin/assets/upload`, {
    method: 'POST',
    headers: { Cookie: cookieVal },
    body: formData
  });
  assert(uploadRes.status === 201, 'POST /api/admin/assets/upload returns HTTP 201 Created');
  const uploadJson = await uploadRes.json();
  const uploadedAsset = uploadJson.asset;
  assert(uploadedAsset?.id.startsWith('asset_'), 'Uploaded asset has stable unique ID');
  assert(uploadedAsset?.category === 'brand_logos', 'Asset categorized correctly');

  // 3.4 Public Content Delivery
  const contentRes = await fetch(`${BASE_URL}${uploadedAsset.url}`);
  assert(contentRes.status === 200, 'GET /api/assets/:id/content returns HTTP 200 OK');
  assert(contentRes.headers.get('content-type') === 'image/png', 'Content delivery sets correct Content-Type');
  assert(contentRes.headers.get('x-content-type-options') === 'nosniff', 'Content delivery sets nosniff header');

  // 3.5 In-Use Deletion Protection Test
  // Assign uploaded asset as active brand logo in settings
  await fetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieVal },
    body: JSON.stringify({ brandLogoUrl: uploadedAsset.url })
  });

  // Attempt to delete active asset -> must return HTTP 409 Conflict!
  const inUseDeleteRes = await fetch(`${BASE_URL}/api/admin/assets/${uploadedAsset.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookieVal }
  });
  assert(inUseDeleteRes.status === 409, 'Deleting asset in active use returns HTTP 409 Conflict');
  const inUseJson = await inUseDeleteRes.json();
  assert(inUseJson.error === 'ASSET_IN_USE', 'Error code ASSET_IN_USE reported');

  // Clear from settings
  await fetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieVal },
    body: JSON.stringify({ brandLogoUrl: '' })
  });

  // Deletion now succeeds
  const cleanDeleteRes = await fetch(`${BASE_URL}/api/admin/assets/${uploadedAsset.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookieVal }
  });
  assert(cleanDeleteRes.status === 200, 'Deleting unassigned asset returns HTTP 200 OK');

  // Confirm content endpoint now returns 404
  const deletedContentRes = await fetch(`${BASE_URL}${uploadedAsset.url}`);
  assert(deletedContentRes.status === 404, 'Deleted asset content returns HTTP 404');

  // --------------------------------------------------------------------------
  // TEST SUITE 4: PRESERVATION OF EXISTING PLAYER & GAME RECORDS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Verifying Preservation of Existing Records ---');
  const usersRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Cookie: cookieVal }
  });
  const usersData = await usersRes.json();
  assert(usersData.count >= 15, 'Existing player records preserved intact (>= 15 players)');

  const sessionsRes = await fetch(`${BASE_URL}/api/admin/sessions`, {
    headers: { Cookie: cookieVal }
  });
  const sessionsData = await sessionsRes.json();
  assert(sessionsData.count >= 10, 'Existing gameplay sessions preserved intact (>= 10 sessions)');

  console.log('\n====================================================');
  console.log(`🏁 PHASE 4A TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase4ATests().catch((e) => {
  console.error('Fatal Phase 4A test error:', e);
  process.exit(1);
});
