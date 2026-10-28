/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore
}

import express from 'express';
import http from 'http';
import { initStorage, getStorage } from '../server/storage';
import { MongoStorageAdapter } from '../server/storage/mongoAdapter';
import { apiRouter } from '../server/routes/api';
import { TRIAL_CODE } from '../src/types/backend';

async function runTest() {
  console.log('====================================================');
  console.log('🧪 VERIFICATION TEST: SPECIAL TRIAL CODE 8536');
  console.log('====================================================\n');

  // 1. Initialize Storage
  const storage = await initStorage();
  if (storage.getType() !== 'mongodb') {
    throw new Error(`Expected MongoDB storage, but got: ${storage.getType()}`);
  }
  const mongoAdapter = storage as MongoStorageAdapter;
  const db = mongoAdapter.getDb();
  console.log(`✅ Step 1: Storage initialized. Confirmed database name: "${db.databaseName}"`);

  // 2. Snapshot pre-test document counts
  const preCounts = {
    users: await db.collection('users').countDocuments(),
    game_codes: await db.collection('game_codes').countDocuments(),
    game_sessions: await db.collection('game_sessions').countDocuments(),
    system_settings: await db.collection('system_settings').countDocuments(),
    admin_users: await db.collection('admin_users').countDocuments(),
    admin_sessions: await db.collection('admin_sessions').countDocuments(),
    assets: await db.collection('assets').countDocuments(),
    audit_logs: await db.collection('audit_logs').countDocuments(),
  };

  console.log('📊 Pre-test MongoDB collection counts:');
  console.table(preCounts);

  // 3. Spin up an in-process ephemeral Express server on a random port for API testing
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`✅ Step 2: Ephemeral test API server listening at ${baseUrl}`);

  try {
    // 4. Test Verification of Trial Code 8536
    console.log('\n--- Test 4.1: POST /api/kiosk/verify-code with code 8536 ---');
    const verifyRes = await fetch(`${baseUrl}/kiosk/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: TRIAL_CODE })
    });
    const verifyData = await verifyRes.json();
    console.log(`HTTP ${verifyRes.status}:`, verifyData);

    if (!verifyRes.ok || !verifyData.valid || !verifyData.isTrial) {
      throw new Error(`Verification failed for trial code: ${JSON.stringify(verifyData)}`);
    }
    if (verifyData.user.name !== 'Trial Player' || verifyData.code.code !== '8536') {
      throw new Error(`Unexpected user/code payload: ${JSON.stringify(verifyData)}`);
    }
    console.log('✅ Trial code 8536 verification succeeded with isTrial: true!');

    // 5. Test Session Start with Trial Code 8536
    console.log('\n--- Test 4.2: POST /api/session/start with code 8536 ---');
    const startRes = await fetch(`${baseUrl}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: TRIAL_CODE, kioskId: 'test_kiosk' })
    });
    const startData = await startRes.json();
    console.log(`HTTP ${startRes.status}:`, startData);

    if (!startRes.ok || !startData.success || !startData.isTrial) {
      throw new Error(`Session start failed for trial code: ${JSON.stringify(startData)}`);
    }
    if (startData.session.id !== 'trial_session_8536' || startData.session.status !== 'PLAYING') {
      throw new Error(`Unexpected session payload: ${JSON.stringify(startData)}`);
    }
    console.log('✅ Trial session start succeeded with in-memory session!');

    // 6. Test Session Complete with Trial Session
    console.log('\n--- Test 4.3: POST /api/session/complete with trial session ---');
    const completeRes = await fetch(`${baseUrl}/session/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'trial_session_8536',
        score: 3200,
        crackerCount: 42,
        maxSpeed: 890,
        comboCount: 12,
        punchCount: 55,
        photoData: 'data:image/jpeg;base64,mockphotodata',
        wishTitle: 'Diwali Mubarak',
        wishMessage: 'Happy Festive Season'
      })
    });
    const completeData = await completeRes.json();
    console.log(`HTTP ${completeRes.status}:`, completeData);

    if (!completeRes.ok || !completeData.success || !completeData.isTrial) {
      throw new Error(`Session complete failed for trial code: ${JSON.stringify(completeData)}`);
    }
    if (completeData.session.score !== 3200 || completeData.session.status !== 'COMPLETED') {
      throw new Error(`Unexpected complete session payload: ${JSON.stringify(completeData)}`);
    }
    console.log('✅ Trial session complete succeeded without errors!');

    // 7. Test Trial Code Re-usability (must NOT be locked or used up)
    console.log('\n--- Test 4.4: POST /api/kiosk/verify-code with code 8536 (Second Time) ---');
    const verifyAgainRes = await fetch(`${baseUrl}/kiosk/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: TRIAL_CODE })
    });
    const verifyAgainData = await verifyAgainRes.json();
    if (!verifyAgainRes.ok || !verifyAgainData.valid || !verifyAgainData.isTrial) {
      throw new Error(`Trial code was locked or failed on second play: ${JSON.stringify(verifyAgainData)}`);
    }
    console.log('✅ Trial code 8536 is reusable indefinitely!');

    // 8. Test Normal Code Verification (non-existent code still rejected properly)
    console.log('\n--- Test 4.5: POST /api/kiosk/verify-code with invalid code 0000 ---');
    const invalidRes = await fetch(`${baseUrl}/kiosk/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '0000' })
    });
    const invalidData = await invalidRes.json();
    console.log(`HTTP ${invalidRes.status}:`, invalidData);
    if (invalidRes.status !== 404 || invalidData.valid !== false) {
      throw new Error(`Invalid code 0000 was unexpectedly accepted: ${JSON.stringify(invalidData)}`);
    }
    console.log('✅ Normal code verification flow remains fully intact!');

    // 9. Inspect MongoDB directly: Ensure ZERO records were created
    console.log('\n--- Test 4.6: Database Integrity & Zero-Persistence Audit ---');
    const userInDb = await db.collection('users').findOne({ id: 'trial_user_8536' });
    const codeInDb = await db.collection('game_codes').findOne({ code: '8536' });
    const sessionInDb = await db.collection('game_sessions').findOne({ id: 'trial_session_8536' });

    if (userInDb) {
      throw new Error('LEAK: trial_user_8536 was found in MongoDB users collection!');
    }
    if (codeInDb) {
      throw new Error('LEAK: code 8536 was found in MongoDB game_codes collection!');
    }
    if (sessionInDb) {
      throw new Error('LEAK: trial_session_8536 was found in MongoDB game_sessions collection!');
    }
    console.log('✅ Zero trial documents exist in MongoDB collections!');

    // 10. Check collection counts after test
    const postCounts = {
      users: await db.collection('users').countDocuments(),
      game_codes: await db.collection('game_codes').countDocuments(),
      game_sessions: await db.collection('game_sessions').countDocuments(),
      system_settings: await db.collection('system_settings').countDocuments(),
      admin_users: await db.collection('admin_users').countDocuments(),
      admin_sessions: await db.collection('admin_sessions').countDocuments(),
      assets: await db.collection('assets').countDocuments(),
      audit_logs: await db.collection('audit_logs').countDocuments(),
    };

    console.log('\n📊 Post-test MongoDB collection counts:');
    console.table(postCounts);

    for (const key of Object.keys(preCounts) as (keyof typeof preCounts)[]) {
      if (preCounts[key] !== postCounts[key]) {
        throw new Error(
          `Count mismatch for ${key}: pre was ${preCounts[key]}, post is ${postCounts[key]}!`
        );
      }
    }
    console.log('✅ All 8 collection counts are 100% IDENTICAL before and after!');

  } finally {
    server.close();
    if (storage.close) {
      await storage.close();
    }
  }

  console.log('\n====================================================');
  console.log('🎉 ALL TRIAL CODE 8536 VERIFICATION TESTS PASSED!');
  console.log('====================================================');
}

runTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

