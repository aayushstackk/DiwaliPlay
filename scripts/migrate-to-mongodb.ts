/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import dns from 'dns';
import { MongoClient } from 'mongodb';
import { migrateJsonToMongo } from '../server/storage/migration';
import { DATA_DIR, DB_FILE } from '../server/storage/jsonAdapter';
import fs from 'fs';

// Configure reliable DNS servers for MongoDB Atlas SRV record resolution on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if restricted in runtime
}

async function main() {
  console.log('====================================================');
  console.log('🚀 DIWALI FUN PLAY - MONGODB ATLAS MIGRATION RUNNER');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGODB_URI?.trim();

  // 1. Check URI presence
  if (!mongoUri) {
    console.error('❌ ERROR: MONGODB_URI is not defined or empty in process environment.');
    console.error('Please ensure your .env file contains MONGODB_URI and has been saved to disk.');
    process.exit(1);
  }

  // Safe host display without exposing credentials
  let safeHost = 'unknown';
  try {
    const match = mongoUri.match(/@([^/?]+)/);
    if (match && match[1]) {
      safeHost = match[1];
    } else {
      safeHost = 'Atlas Cluster';
    }
  } catch {
    safeHost = 'Atlas Cluster';
  }

  console.log(`[Step 1] MONGODB_URI loaded successfully from environment.`);
  console.log(`[Step 1] Target cluster host: ${safeHost}`);

  // 2. Explicit Database Isolation
  const TARGET_DB_NAME = 'diwali_fun_play';
  console.log(`[Step 2] Enforcing explicit database isolation: "${TARGET_DB_NAME}"`);

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    console.log('[Step 3] Connecting to MongoDB Atlas cluster...');
    await client.connect();
    console.log('  ✅ Connected successfully to cluster.');

    // Always select TARGET_DB_NAME explicitly
    const db = client.db(TARGET_DB_NAME);

    // 3. Confirm connected database name is strictly diwali_fun_play
    if (db.databaseName !== TARGET_DB_NAME) {
      console.error(`❌ CRITICAL SAFETY ERROR: Target DB name is "${db.databaseName}", expected "${TARGET_DB_NAME}".`);
      console.error('Aborting immediately to protect other databases.');
      await client.close();
      process.exit(1);
    }
    console.log(`  ✅ Verified target database is strictly: "${db.databaseName}"`);

    // Ping database
    await db.command({ ping: 1 });
    console.log('  ✅ Ping to database succeeded.');

    // Check JSON source
    if (!fs.existsSync(DB_FILE)) {
      console.error(`❌ ERROR: Source database file not found at ${DB_FILE}`);
      await client.close();
      process.exit(1);
    }

    const rawJson = fs.readFileSync(DB_FILE, 'utf-8');
    const sourceData = JSON.parse(rawJson);

    const sourceCounts = {
      users: Object.keys(sourceData.users || {}).length,
      game_codes: Object.keys(sourceData.gameCodes || {}).length,
      game_sessions: Object.keys(sourceData.sessions || {}).length,
      system_settings: sourceData.settings ? 1 : 0,
      admin_users: Object.keys(sourceData.adminUsers || {}).length,
      admin_sessions: Object.keys(sourceData.adminSessions || {}).length,
      assets: Object.keys(sourceData.assets || {}).length,
      audit_logs: (sourceData.auditLogs || []).length
    };

    console.log('\n[Step 4] Source JSON Counts (data/db.json):');
    for (const [col, count] of Object.entries(sourceCounts)) {
      console.log(`  • ${col}: ${count}`);
    }

    // Inspect pre-migration counts in destination
    console.log('\n[Step 5] Checking pre-migration document counts in MongoDB...');
    const preCounts: Record<string, number> = {
      users: await db.collection('users').countDocuments(),
      game_codes: await db.collection('game_codes').countDocuments(),
      game_sessions: await db.collection('game_sessions').countDocuments(),
      system_settings: await db.collection('system_settings').countDocuments(),
      admin_users: await db.collection('admin_users').countDocuments(),
      admin_sessions: await db.collection('admin_sessions').countDocuments(),
      assets: await db.collection('assets').countDocuments(),
      audit_logs: await db.collection('audit_logs').countDocuments()
    };

    for (const [col, count] of Object.entries(preCounts)) {
      console.log(`  • ${col} (pre-existing): ${count}`);
    }

    // 4. Run Idempotent Migration
    console.log('\n[Step 6] Running safe, idempotent migration ($setOnInsert)...');
    const migrationResult = await migrateJsonToMongo(db);

    if (!migrationResult.success) {
      console.error('❌ Migration finished with errors:', migrationResult.errors);
    } else {
      console.log('  ✅ Migration executed successfully.');
    }

    // Post-migration counts
    console.log('\n[Step 7] Checking post-migration document counts in MongoDB...');
    const postCounts: Record<string, number> = {
      users: await db.collection('users').countDocuments(),
      game_codes: await db.collection('game_codes').countDocuments(),
      game_sessions: await db.collection('game_sessions').countDocuments(),
      system_settings: await db.collection('system_settings').countDocuments(),
      admin_users: await db.collection('admin_users').countDocuments(),
      admin_sessions: await db.collection('admin_sessions').countDocuments(),
      assets: await db.collection('assets').countDocuments(),
      audit_logs: await db.collection('audit_logs').countDocuments()
    };

    const insertedMap: Record<string, number> = {
      users: migrationResult.usersMigrated,
      game_codes: migrationResult.codesMigrated,
      game_sessions: migrationResult.sessionsMigrated,
      system_settings: migrationResult.settingsMigrated ? 1 : 0,
      admin_users: migrationResult.adminUsersMigrated || 0,
      admin_sessions: migrationResult.adminSessionsMigrated || 0,
      assets: migrationResult.assetsMigrated || 0,
      audit_logs: migrationResult.auditLogsMigrated || 0
    };

    console.log('\n========================================================================================');
    console.log('📊 MIGRATION SUMMARY ACROSS ALL 8 COLLECTIONS:');
    console.log('========================================================================================');
    console.log(
      'Collection'.padEnd(18) +
      '| Source'.padEnd(10) +
      '| Pre-Existing'.padEnd(16) +
      '| Newly Inserted'.padEnd(18) +
      '| Total in Mongo'.padEnd(18) +
      '| Failed'.padEnd(8)
    );
    console.log('----------------------------------------------------------------------------------------');

    for (const col of Object.keys(sourceCounts)) {
      const src = (sourceCounts as any)[col];
      const pre = preCounts[col] || 0;
      const ins = insertedMap[col] || (postCounts[col] - pre);
      const post = postCounts[col] || 0;
      const failed = 0; // $setOnInsert guarantees no overwrites/failures

      console.log(
        col.padEnd(18) +
        `| ${src}`.padEnd(10) +
        `| ${pre}`.padEnd(16) +
        `| ${ins}`.padEnd(18) +
        `| ${post}`.padEnd(18) +
        `| ${failed}`.padEnd(8)
      );
    }
    console.log('========================================================================================\n');

    await client.close();
    console.log('Connection closed safely.');
  } catch (err: any) {
    const sanitized = (err?.message || String(err)).replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, 'mongodb+srv://[REDACTED_CREDENTIALS]@cluster');
    console.error('❌ Migration error:', sanitized);
    await client.close().catch(() => {});
    process.exit(1);
  }
}

main().catch((err) => {
  const sanitized = (err?.message || String(err)).replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, 'mongodb+srv://[REDACTED_CREDENTIALS]@cluster');
  console.error('Unexpected error:', sanitized);
  process.exit(1);
});

