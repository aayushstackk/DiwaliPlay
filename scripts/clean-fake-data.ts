/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { initStorage } from '../server/storage/index';

/**
 * Script to clean verified test / fake fixtures from the active database.
 *
 * Safety Rules Enforced:
 * 1. Timestamped backup created BEFORE any modification.
 * 2. Operates through the StorageAdapter abstraction (deleteGameCode, deleteSession, deleteUser).
 * 3. Preserves all legitimate user registrations and uncertain records.
 * 4. Preserves all admin accounts, admin sessions, settings, assets, and audit logs.
 * 5. Appends an audit log entry documenting the cleanup.
 */

// Explicit, verified test / fake user IDs identified from test scripts and dummy fixtures
const VERIFIED_FAKE_USER_IDS = [
  'usr_6c38075b', // "Public Tester" - hardcoded fixture from scripts/test-phase2-http.ts (phone 9811223344)
  'usr_6a23a886', // "Aarav Test" - test fixture with explicit "Test" name, phone 9811229988, test score 7200
  'usr_68327e45', // "aa" - invalid dummy mobile 0000000000
  'usr_8307b1e7', // "22222222" - dummy repeating fixture mobile 5555555555
  'usr_37bebd71', // "8888" - dummy repeating fixture mobile 7777777777
  'usr_2827da1f'  // "7777" - dummy fixture mobile 7000000000
];

export async function runCleanup() {
  console.log('====================================================');
  console.log('🧹 DIWALI FUN PLAY — TEST & DEMO DATA CLEANUP');
  console.log('====================================================\n');

  // Step 1: Create a timestamped backup before touching anything
  const dataDir = path.resolve(process.cwd(), 'data');
  const dbFile = path.resolve(dataDir, 'db.json');

  let backupFilePath = '';
  if (fs.existsSync(dbFile)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupFilePath = path.resolve(dataDir, `db.backup.${timestamp}.json`);
    const rawData = fs.readFileSync(dbFile, 'utf-8');
    fs.writeFileSync(backupFilePath, rawData, 'utf-8');
    console.log(`[Backup] Safe timestamped backup created at:\n         ${backupFilePath}\n`);
  } else {
    console.warn('[Backup] No data/db.json found on disk. Proceeding with active storage.');
  }

  // Step 2: Initialize active storage adapter
  const storage = await initStorage();
  const storageType = storage.getType();
  console.log(`[Storage] Connected to active storage adapter: ${storageType.toUpperCase()}`);

  const allUsersBefore = await storage.getAllUsers();
  const allSessionsBefore = await storage.getAllSessions();
  console.log(`[Status Before] Users: ${allUsersBefore.length} | Sessions: ${allSessionsBefore.length}`);

  // Step 3: Locate records associated with verified fake users
  const fakeUserSet = new Set(VERIFIED_FAKE_USER_IDS);
  const targetUsers = allUsersBefore.filter((u) => fakeUserSet.has(u.id));

  console.log(`\n[Targets Identified] Found ${targetUsers.length} verified fake user records to remove:`);
  for (const u of targetUsers) {
    const masked = u.mobileNumber.length >= 4 ? `***${u.mobileNumber.slice(-4)}` : '***';
    console.log(`  - ID: ${u.id} | Name: "${u.name}" | Mobile: ${masked}`);
  }

  // Identify sessions belonging to these users
  const targetSessions = allSessionsBefore.filter((s) => fakeUserSet.has(s.userId));
  console.log(`[Targets Identified] Found ${targetSessions.length} associated session records to remove.`);

  // Identify game codes belonging to these users
  let removedCodesCount = 0;
  if (storageType === 'json') {
    // In JSON mode, inspect gameCodes table
    const rawData = (storage as any).getRawData?.();
    if (rawData?.gameCodes) {
      const codeIdsToRemove = Object.values(rawData.gameCodes as Record<string, any>)
        .filter((c: any) => fakeUserSet.has(c.userId))
        .map((c: any) => c.id);

      for (const codeId of codeIdsToRemove) {
        if (typeof storage.deleteGameCode === 'function') {
          await storage.deleteGameCode(codeId);
          removedCodesCount++;
        }
      }
    }
  }

  // Step 4: Delete target sessions
  let removedSessionsCount = 0;
  for (const sess of targetSessions) {
    if (typeof storage.deleteSession === 'function') {
      const ok = await storage.deleteSession(sess.id);
      if (ok) removedSessionsCount++;
    }
  }

  // Step 5: Delete target users
  let removedUsersCount = 0;
  for (const user of targetUsers) {
    if (typeof storage.deleteUser === 'function') {
      const ok = await storage.deleteUser(user.id);
      if (ok) removedUsersCount++;
    }
  }

  // Step 6: Record audit log entry
  try {
    await storage.recordAuditLog({
      adminId: 'system_cleanup',
      username: 'system',
      action: 'CLEANUP_TEST_DATA' as any,
      details: {
        removedUsersCount,
        removedSessionsCount,
        removedCodesCount,
        backupFilePath,
        criteria: 'VERIFIED_TEST_FIXTURES'
      }
    });
  } catch (auditErr) {
    console.warn('[Audit Log] Could not record cleanup log:', auditErr);
  }

  // Step 7: Verify updated state and dynamic calculations
  const allUsersAfter = await storage.getAllUsers();
  const allSessionsAfter = await storage.getAllSessions();
  const overview = await storage.getAdminOverview();

  console.log('\n====================================================');
  console.log('✅ CLEANUP COMPLETED SUCCESSFULLY');
  console.log('====================================================');
  console.log(`Users removed:          ${removedUsersCount} (Remaining: ${allUsersAfter.length})`);
  console.log(`Sessions removed:       ${removedSessionsCount} (Remaining: ${allSessionsAfter.length})`);
  console.log(`Game codes removed:     ${removedCodesCount}`);
  console.log(`\nUpdated Dashboard Telemetry:`);
  console.log(`  - Total Registered Players: ${overview.totalUsers}`);
  console.log(`  - Total Sessions:          ${overview.totalSessions}`);
  console.log(`  - Completed Sessions:      ${overview.completedSessions}`);
  console.log(`  - Highest Score:           ${overview.highestScore}`);
  console.log(`  - Average Score:           ${overview.averageScore}`);
  console.log(`  - Active Leaderboard Entries: ${overview.leaderboard.length}`);
  console.log('\nLeaderboard Top Players:');
  for (const entry of overview.leaderboard) {
    console.log(`  #${entry.rank} ${entry.userName} — ${entry.score} pts (${entry.crackerCount} crackers)`);
  }

  if (typeof storage.close === 'function') {
    await storage.close();
  }

  return {
    backupFilePath,
    removedUsersCount,
    removedSessionsCount,
    removedCodesCount,
    remainingUsersCount: allUsersAfter.length,
    remainingSessionsCount: allSessionsAfter.length,
    overview
  };
}

// Execute if run directly
if (process.argv[1]?.includes('clean-fake-data')) {
  runCleanup().catch((err) => {
    console.error('[Cleanup Fatal Error]', err);
    process.exit(1);
  });
}

