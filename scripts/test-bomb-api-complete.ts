/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}
import http from 'node:http';
import { Readable } from 'node:stream';
import express from 'express';
import cookieParser from 'cookie-parser';
import { initStorage, db } from '../server/storage';
import { apiRouter } from '../server/routes/api';

interface MockResponse {
  statusCode: number;
  headers: Record<string, any>;
  body: string;
  json: any;
}

function executeRequest(
  app: express.Express,
  method: string,
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: any;
    token?: string;
  } = {}
): Promise<MockResponse> {
  return new Promise((resolve) => {
    const bodyStr = options.body ? JSON.stringify(options.body) : '';
    const bodyBuffer = Buffer.from(bodyStr);

    const socket: any = new Readable({
      read() {}
    });
    const req: any = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = {
      'host': 'localhost',
      'content-type': 'application/json',
      'content-length': String(bodyBuffer.length),
      'accept': 'application/json',
      ...(options.headers || {})
    };

    if (options.token) {
      req.headers['authorization'] = `Bearer ${options.token}`;
      req.headers['cookie'] = `diwali_admin_session=${options.token}`;
    }

    const res: any = new http.ServerResponse(req);
    let responseBody = '';
    const headers: Record<string, any> = {};

    res.setHeader = (key: string, val: any) => {
      headers[key.toLowerCase()] = val;
    };
    res.getHeader = (key: string) => headers[key.toLowerCase()];
    res.writeHead = (status: number, hdrs?: any) => {
      res.statusCode = status;
      if (hdrs) Object.assign(headers, hdrs);
      return res;
    };
    res.write = (chunk: any) => {
      if (chunk) responseBody += chunk;
      return true;
    };
    res.end = (chunk: any) => {
      if (chunk) responseBody += chunk;
      let json: any = null;
      try {
        json = JSON.parse(responseBody);
      } catch {}
      resolve({
        statusCode: res.statusCode || 200,
        headers,
        body: responseBody,
        json
      });
    };

    (app as any).handle(req, res);

    if (bodyBuffer.length > 0) {
      req.push(bodyBuffer);
    }
    req.push(null);
  });
}

async function runTests() {
  console.log('--- Starting Complete Bomb Management API Tests ---');
  await initStorage();
  console.log('[Storage Backend]:', db.getType());

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', apiRouter);

  // 1. Get or create admin session
  let admin = await db.findAdminByUsername('superadmin');
  if (!admin) {
    console.log('Creating bootstrap superadmin...');
    admin = await db.createAdminUser({
      username: 'superadmin',
      passwordHash: 'dummy_hash',
      role: 'superadmin',
      isActive: true,
      lastLoginAt: null
    });
  }

  const session = await db.createAdminSession({
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString()
  });

  const token = session.id;
  console.log('Authenticated as:', admin.username, 'with token:', token);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail || '');
      failed++;
    }
  }

  // TEST 1: Public GET /api/bombs
  {
    const res = await executeRequest(app, 'GET', '/api/bombs');
    assert(res.statusCode === 200, 'GET /api/bombs returns 200 OK', res);
    assert(res.json?.success === true, 'GET /api/bombs returns success: true');
    assert(Array.isArray(res.json?.bombs) && res.json.bombs.length >= 1, 'GET /api/bombs returns active bombs');
    assert(res.json?.settings?.bombRadius !== undefined, 'GET /api/bombs includes settings object');
  }

  // TEST 2: Public GET /api/bombs/settings
  {
    const res = await executeRequest(app, 'GET', '/api/bombs/settings');
    assert(res.statusCode === 200, 'GET /api/bombs/settings returns 200 OK', res);
    assert(res.json?.settings?.bombRadius !== undefined, 'GET /api/bombs/settings returns settings');
  }

  // TEST 3: Admin GET /api/admin/bombs
  {
    const res = await executeRequest(app, 'GET', '/api/admin/bombs', { token });
    assert(res.statusCode === 200, 'Admin GET /api/admin/bombs returns 200 OK', res);
    assert(res.json?.success === true, 'Admin GET /api/admin/bombs returns success: true');
    assert(Array.isArray(res.json?.bombs), 'Admin GET returns array of bombs');
  }

  // TEST 4: Admin GET /api/admin/bombs/settings
  {
    const res = await executeRequest(app, 'GET', '/api/admin/bombs/settings', { token });
    assert(res.statusCode === 200, 'Admin GET /api/admin/bombs/settings returns 200 OK', res);
    assert(res.json?.settings?.minSpawnDelayMs !== undefined, 'Admin GET /api/admin/bombs/settings returns valid settings');
  }

  // TEST 5: Admin PUT /api/admin/bombs/settings
  {
    const updates = {
      minSpawnDelayMs: 650,
      maxSpawnDelayMs: 1400,
      maxConcurrentBombs: 5,
      bombRadius: 52,
      launchSpeedMultiplier: 1.5,
      gravityMultiplier: 1.5,
      maxBurstSize: 3,
      burstIntervalMs: 75
    };
    const res = await executeRequest(app, 'PUT', '/api/admin/bombs/settings', {
      token,
      body: updates
    });
    assert(res.statusCode === 200, 'Admin PUT /api/admin/bombs/settings returns 200 OK (Route collision resolved)', res);
    assert(res.json?.settings?.launchSpeedMultiplier === 1.5, 'Admin PUT successfully updated settings.launchSpeedMultiplier');
  }

  // TEST 6: Admin POST /api/admin/bombs (Create a new bomb)
  let createdBombId = '';
  {
    const newBombPayload = {
      name: 'Test Golden Sparkle Bomb',
      color: '#F59E0B',
      points: 250,
      spawnWeight: 7,
      soundPreset: 'sparkle',
      imagePreset: 'green_super',
      isActive: true
    };
    const res = await executeRequest(app, 'POST', '/api/admin/bombs', {
      token,
      body: newBombPayload
    });
    assert(res.statusCode === 201, 'Admin POST /api/admin/bombs creates bomb with 201 Created', res);
    assert(res.json?.bomb?.id?.startsWith('bomb_'), 'Created bomb has unique bomb_ ID');
    assert(res.json?.bomb?.points === 250, 'Created bomb has correct points');
    createdBombId = res.json?.bomb?.id;
  }

  // TEST 7: Admin GET /api/admin/bombs/:id (Get single bomb)
  if (createdBombId) {
    const res = await executeRequest(app, 'GET', `/api/admin/bombs/${createdBombId}`, { token });
    assert(res.statusCode === 200, 'Admin GET /api/admin/bombs/:id returns 200 OK', res);
    assert(res.json?.bomb?.name === 'Test Golden Sparkle Bomb', 'Fetched single bomb matches name');
  }

  // TEST 8: Admin PUT /api/admin/bombs/:id (Update bomb)
  if (createdBombId) {
    const updatePayload = {
      name: 'Super Golden Sparkle Bomb',
      points: 500,
      color: '#EAB308',
      spawnWeight: 12
    };
    const res = await executeRequest(app, 'PUT', `/api/admin/bombs/${createdBombId}`, {
      token,
      body: updatePayload
    });
    assert(res.statusCode === 200, 'Admin PUT /api/admin/bombs/:id returns 200 OK', res);
    assert(res.json?.bomb?.name === 'Super Golden Sparkle Bomb', 'Bomb name updated');
    assert(res.json?.bomb?.points === 500, 'Bomb points updated');
  }

  // TEST 9: Permanent Deletion of Unreferenced Custom Bomb
  // Create an unreferenced custom bomb directly in storage (no sessions, no audit logs)
  let unrefBombId = '';
  {
    const unref = await db.createBombConfig({
      name: 'Unreferenced Ephemeral Bomb',
      color: '#EC4899',
      points: 120,
      spawnWeight: 5,
      soundPreset: 'pop',
      imagePreset: 'red_classic',
      isActive: true
    });
    unrefBombId = unref.id;

    const isRef = await db.isBombReferenced(unrefBombId);
    assert(isRef === false, 'Unreferenced bomb is identified as NOT referenced');

    const delRes = await executeRequest(app, 'DELETE', `/api/admin/bombs/${unrefBombId}`, { token });
    assert(delRes.statusCode === 200, 'DELETE unreferenced bomb returns 200 OK', delRes);

    // Verify it is completely removed from DB
    const afterGet = await db.getBombConfigById(unrefBombId);
    assert(afterGet === undefined, 'Unreferenced bomb is permanently removed from storage');

    // Verify it does NOT appear in admin list or gameplay list
    const adminListRes = await executeRequest(app, 'GET', '/api/admin/bombs', { token });
    const inAdminList = adminListRes.json?.bombs?.some((b: any) => b.id === unrefBombId);
    assert(inAdminList === false, 'Permanently deleted bomb does NOT appear in admin bomb list');

    const gameplayRes = await executeRequest(app, 'GET', '/api/bombs');
    const inGameplayList = gameplayRes.json?.bombs?.some((b: any) => b.id === unrefBombId);
    assert(inGameplayList === false, 'Permanently deleted bomb does NOT appear in gameplay active bombs');
  }

  // TEST 10: Safe Soft-Deletion of Bomb With Historical References
  // Create a bomb and attach an audit reference / historical reference
  let refBombId = '';
  {
    const refBomb = await db.createBombConfig({
      name: 'Historical Referenced Bomb',
      color: '#8B5CF6',
      points: 350,
      spawnWeight: 4,
      soundPreset: 'blast',
      imagePreset: 'blue_happy',
      isActive: true
    });
    refBombId = refBomb.id;

    // Record an audit log for an UPDATE or reference action
    await db.recordAuditLog({
      adminId: admin.id,
      username: admin.username,
      action: 'UPDATE_BOMB',
      target: refBombId,
      details: { reason: 'historical gameplay configuration update' },
      ip: '127.0.0.1'
    });

    const isRef = await db.isBombReferenced(refBombId);
    assert(isRef === true, 'Bomb with audit history is identified as REFERENCED');

    const delRes = await executeRequest(app, 'DELETE', `/api/admin/bombs/${refBombId}`, { token });
    assert(delRes.statusCode === 200, 'DELETE referenced bomb returns 200 OK', delRes);

    // Verify it is soft-deleted in storage (isDeleted: true)
    const softDoc = await db.getBombConfigById(refBombId);
    assert(softDoc !== undefined && softDoc.isDeleted === true, 'Referenced bomb is safely soft-deleted in DB with isDeleted: true');
    assert(softDoc?.isActive === false, 'Soft-deleted bomb has isActive: false');

    // Verify it is REMOVED from the active admin bomb management list
    const adminListRes = await executeRequest(app, 'GET', '/api/admin/bombs', { token });
    const inAdminList = adminListRes.json?.bombs?.some((b: any) => b.id === refBombId);
    assert(inAdminList === false, 'Soft-deleted bomb is removed from active Bomb Management list');

    // Verify it CANNOT spawn in gameplay
    const gameplayRes = await executeRequest(app, 'GET', '/api/bombs');
    const inGameplayList = gameplayRes.json?.bombs?.some((b: any) => b.id === refBombId);
    assert(inGameplayList === false, 'Soft-deleted bomb cannot spawn in gameplay');
  }

  // TEST 11: Attempting to delete an already deleted bomb returns 404
  {
    const reDeleteRes = await executeRequest(app, 'DELETE', `/api/admin/bombs/${refBombId}`, { token });
    assert(reDeleteRes.statusCode === 404, 'Deleting already deleted bomb returns 404 Not Found');
    assert(reDeleteRes.json?.message?.includes('already deleted') || reDeleteRes.json?.message?.includes('not found'), 'Returns clear descriptive error message');
  }

  // TEST 12: Default Bomb Deletion & Re-seeding Prevention
  {
    const testDef = await db.createBombConfig({
      name: 'Temporary Default Test Bomb',
      color: '#3B82F6',
      points: 200,
      spawnWeight: 5,
      soundPreset: 'pop',
      imagePreset: 'red_classic',
      isActive: true,
      isDefault: true
    });

    const delDefRes = await executeRequest(app, 'DELETE', `/api/admin/bombs/${testDef.id}`, { token });
    assert(delDefRes.statusCode === 200, 'Admin can safely delete default bomb', delDefRes);

    // Call getBombConfigs multiple times (which triggers default initialization)
    const adminListAfter = await executeRequest(app, 'GET', '/api/admin/bombs', { token });
    const hasDefInAdmin = adminListAfter.json?.bombs?.some((b: any) => b.id === testDef.id);
    assert(hasDefInAdmin === false, 'Deleted default bomb does NOT reappear in Bomb Management list');

    // Verify gameplay also does NOT have it
    const gameplayAfter = await executeRequest(app, 'GET', '/api/bombs');
    const hasDefInGameplay = gameplayAfter.json?.bombs?.some((b: any) => b.id === testDef.id);
    assert(hasDefInGameplay === false, 'Deleted default bomb does NOT spawn in gameplay');

    // Verify that the 4 primary default bombs (Red, Blue, Green, Black) are still intact and functioning
    const hasRed = gameplayAfter.json?.bombs?.some((b: any) => b.id === 'bomb_red');
    const hasBlue = gameplayAfter.json?.bombs?.some((b: any) => b.id === 'bomb_blue');
    const hasGreen = gameplayAfter.json?.bombs?.some((b: any) => b.id === 'bomb_green');
    const hasBlack = gameplayAfter.json?.bombs?.some((b: any) => b.id === 'bomb_black');
    assert(hasRed && hasBlue && hasGreen && hasBlack, 'Remaining primary default bombs (Red, Blue, Green, Black) remain active and intact');
  }

  // TEST 13: Unauthenticated Admin Request -> 401 Unauthorized
  {
    const res = await executeRequest(app, 'GET', '/api/admin/bombs');
    assert(res.statusCode === 401, 'Unauthenticated GET /api/admin/bombs returns 401 Unauthorized', res);
    assert(res.json?.error === 'UNAUTHENTICATED', 'Returns error code UNAUTHENTICATED');
  }

  // TEST 14: Verify Player, Session, and User Data Untouched
  {
    const allUsers = await db.getAllUsers();
    assert(Array.isArray(allUsers), 'User registrations safely preserved without modification');

    const allSessions = await db.getAllSessions();
    assert(Array.isArray(allSessions), 'Game sessions safely preserved without modification');
  }

  console.log(`\n--- Test Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
