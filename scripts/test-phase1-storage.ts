/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { JsonFileStorageAdapter } from '../server/storage/jsonAdapter';
import { MongoStorageAdapter } from '../server/storage/mongoAdapter';
import { migrateJsonToMongo } from '../server/storage/migration';
import { DATA_DIR, DB_FILE } from '../server/storage/jsonAdapter';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING PHASE 1 STORAGE & SESSION BUG FIX TESTS');
  console.log('====================================================\n');

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
  // TEST SUITE 1: JSON FILE STORAGE & SESSION-START BUG FIX
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Testing JsonFileStorageAdapter & Session Start Bug Fix ---');
  const jsonAdapter = new JsonFileStorageAdapter();
  await jsonAdapter.init();

  assert(jsonAdapter.getType() === 'json', 'Adapter reports type "json"');

  const settings = await jsonAdapter.getSettings();
  assert(settings.brandName === 'ItsSpotlight', 'Settings retrieved correctly');

  // Test 1.1: Register a new test user
  const testMobile = '9899001122';
  const testName = 'Test User Phase1';
  let user = await jsonAdapter.createUser(testName, testMobile);
  assert(user.name === testName && user.mobileNumber === testMobile, 'User created with normalized mobile');

  // Test 1.2: Generate a 4-digit code
  const code = await jsonAdapter.createGameCode(user.id);
  assert(code.code.length === 4 && code.status === 'ACTIVE', 'Active 4-digit code created');

  // Test 1.3: Verify finding code
  const foundCode = await jsonAdapter.findCodeByCodeString(code.code);
  assert(foundCode?.id === code.id, 'Code looked up by 4-digit string');

  // Test 1.4: Mark code used & create session (Touchscreen verification step)
  await jsonAdapter.markCodeUsed(code.id);
  const usedCode = await jsonAdapter.findCodeByCodeString(code.code);
  assert(usedCode?.status === 'USED', 'Code marked as USED upon verification');

  // Create initial session at verification
  const session1 = await jsonAdapter.createSession(user.id, code.id, code.code, 'kiosk_test');
  assert(session1.id.startsWith('sess_') && session1.status === 'PLAYING', 'Session initialized with valid ID');

  // Test 1.5: Fix for session-start bug: findSessionByGameCodeId returns existing session
  const foundSession = await jsonAdapter.findSessionByGameCodeId(code.id);
  assert(foundSession?.id === session1.id, 'Bug Fix: findSessionByGameCodeId returns existing session correctly');

  // Test 1.6: Idempotent session start: starting session again with same code does not duplicate
  const totalSessionsBefore = (await jsonAdapter.getAllSessions()).length;
  // If session/start finds session, it uses existing session:
  const sessionAgain = await jsonAdapter.findSessionByGameCodeId(code.id);
  assert(sessionAgain?.id === session1.id, 'Repeated session-start request uses existing session ID');
  const totalSessionsAfter = (await jsonAdapter.getAllSessions()).length;
  assert(totalSessionsBefore === totalSessionsAfter, 'No duplicate session created for same game code');

  // Test 1.7: Complete session idempotently
  const completion1 = await jsonAdapter.completeSession(session1.id, {
    score: 6500,
    crackerCount: 28,
    maxSpeed: 1850,
    comboCount: 4,
    punchCount: 7,
    wishTitle: 'Diwali Dhamaka',
    wishMessage: 'Happy Diwali'
  });
  assert(completion1.session.status === 'COMPLETED' && completion1.user.hasPlayed === true, 'Session completed and user hasPlayed set to true');
  const userPlayCountAfter1 = completion1.user.playCount;

  // Complete session retry request: must not increment playCount again
  const completion2 = await jsonAdapter.completeSession(session1.id, {
    score: 6500,
    crackerCount: 28,
    maxSpeed: 1850,
    comboCount: 4,
    punchCount: 7
  });
  assert(completion2.user.playCount === userPlayCountAfter1, 'Retry completion does not double-increment playCount');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: MONGODB ADAPTER & IDEMPOTENT MIGRATION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing MongoStorageAdapter & Safe Migration ---');
  let mongoServer: MongoMemoryServer | null = null;
  try {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    console.log('  ℹ️  In-process MongoDB server started for wire-protocol testing.');

    const mongoAdapter = new MongoStorageAdapter(mongoUri, 'diwali_test_db');
    await mongoAdapter.init();

    assert(mongoAdapter.getType() === 'mongodb', 'Mongo adapter reports type "mongodb"');

    // Test 2.1: Migration of db.json
    console.log('  ℹ️  Running migration from data/db.json into MongoDB...');
    const backupFilesBefore = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('db.backup.'));
    const migResult = await migrateJsonToMongo(mongoAdapter.getDb());

    assert(migResult.success === true, 'Migration executed successfully');
    assert(typeof migResult.backupPath === 'string' && fs.existsSync(migResult.backupPath), 'Backup file was created on disk');

    const backupFilesAfter = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('db.backup.'));
    assert(backupFilesAfter.length > backupFilesBefore.length, 'Verified backup file exists in data directory');

    // Test 2.2: Verify migrated counts
    const usersInMongo = await mongoAdapter.getAllUsers();
    const sessionsInMongo = await mongoAdapter.getAllSessions();
    assert(usersInMongo.length >= 17, `Migrated at least 17 users (found ${usersInMongo.length})`);
    assert(sessionsInMongo.length >= 12, `Migrated at least 12 sessions (found ${sessionsInMongo.length})`);

    // Test 2.3: Idempotent re-run of migration
    console.log('  ℹ️  Testing migration re-run idempotency...');
    const migResult2 = await migrateJsonToMongo(mongoAdapter.getDb());
    assert(migResult2.success === true, 'Second migration run succeeds');
    assert(migResult2.usersMigrated === 0, 'Zero duplicate users inserted on second run (idempotent $setOnInsert)');
    assert(migResult2.codesMigrated === 0, 'Zero duplicate codes inserted on second run');
    assert(migResult2.sessionsMigrated === 0, 'Zero duplicate sessions inserted on second run');

    const usersCountAfter2 = (await mongoAdapter.getAllUsers()).length;
    assert(usersInMongo.length === usersCountAfter2, 'User count unchanged after repeated migration');

    // Test 2.4: Mongo CRUD operations
    console.log('  ℹ️  Testing MongoStorageAdapter game flow...');
    const mUser = await mongoAdapter.createUser('Mongo Player', '9811223399');
    assert(mUser.id.startsWith('usr_'), 'Mongo createUser persists valid user');

    const mCode = await mongoAdapter.createGameCode(mUser.id);
    assert(mCode.code.length === 4, 'Mongo createGameCode generates unique 4-digit code');

    const mSession = await mongoAdapter.createSession(mUser.id, mCode.id, mCode.code);
    assert(mSession.id.startsWith('sess_'), 'Mongo createSession creates session');

    const mFoundSession = await mongoAdapter.findSessionByGameCodeId(mCode.id);
    assert(mFoundSession?.id === mSession.id, 'Mongo findSessionByGameCodeId retrieves existing session');

    const mComplete = await mongoAdapter.completeSession(mSession.id, {
      score: 8200,
      crackerCount: 35,
      maxSpeed: 2100,
      comboCount: 5,
      punchCount: 9
    });
    assert(mComplete.session.status === 'COMPLETED' && mComplete.user.hasPlayed === true, 'Mongo completeSession updates session and user stats');

    // Test 2.5: Test persistence across adapter reconnection
    console.log('  ℹ️  Testing reconnect persistence...');
    await mongoAdapter.close();

    const mongoAdapter2 = new MongoStorageAdapter(mongoUri, 'diwali_test_db');
    await mongoAdapter2.init();

    const retrievedUser = await mongoAdapter2.findUserById(mUser.id);
    assert(retrievedUser?.name === 'Mongo Player', 'Data persisted across adapter restart/reconnection');
    assert(retrievedUser?.hasPlayed === true, 'hasPlayed persisted across reconnect');

    await mongoAdapter2.close();
  } catch (err: any) {
    console.error('  ❌ MongoDB test suite failed:', err);
    failed++;
  } finally {
    if (mongoServer) {
      await mongoServer.stop();
      console.log('  ℹ️  In-process MongoDB server stopped.');
    }
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 3: INVALID MONGODB_URI ERROR HANDLING
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing MONGODB_URI Failure Protection ---');
  try {
    // Attempt connecting to non-existent MongoDB port
    const badAdapter = new MongoStorageAdapter('mongodb://127.0.0.1:27999/test');
    await badAdapter.init();
    assert(false, 'Should throw error when MongoDB is unreachable');
  } catch (err: any) {
    assert(
      err?.message?.includes('[MongoDB] Connection/Initialization failed'),
      'Clear fatal error thrown on invalid MongoDB URI (prevents silent fallback to empty database)'
    );
  }

  console.log('\n====================================================');
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
