/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import dns from 'dns';
import { MongoClient } from 'mongodb';

// Ensure reliable DNS resolution for MongoDB Atlas SRV records on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if restricted in runtime
}

function sanitizeError(msg: string): string {
  return msg.replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, 'mongodb+srv://[REDACTED_CREDENTIALS]@cluster');
}

async function testConnection() {
  console.log('====================================================');
  console.log('🔍 MONGODB ATLAS: CONNECTION-ONLY TEST');
  console.log('====================================================\n');

  // 1. Verify MONGODB_URI is present
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    console.error('❌ CHECK FAILED: MONGODB_URI is not defined or is empty in .env');
    process.exit(1);
  }
  console.log('✅ Step 1: MONGODB_URI is present in process environment.');

  // Extract cluster hostname safely without printing credentials
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
  console.log(`✅ Step 2: Target cluster host resolved: ${safeHost}`);

  // 2. Connect to MongoDB Atlas
  const TARGET_DB_NAME = 'diwali_fun_play';
  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    console.log('⏳ Step 3: Establishing connection to MongoDB Atlas...');
    await client.connect();
    console.log('✅ Step 3: Connected and authenticated successfully.');

    // 3. Explicitly select diwali_fun_play
    const db = client.db(TARGET_DB_NAME);

    // 4. Confirm selected database name is exactly diwali_fun_play
    if (db.databaseName !== TARGET_DB_NAME) {
      console.error(`❌ Check failed: Selected database name is "${db.databaseName}", expected "${TARGET_DB_NAME}".`);
      await client.close();
      process.exit(1);
    }
    console.log(`✅ Step 4: Confirmed target database name is strictly: "${db.databaseName}"`);

    // 5. Ping the database
    const pingResult = await db.command({ ping: 1 });
    if (pingResult && pingResult.ok === 1) {
      console.log('✅ Step 5: Database ping succeeded (ok: 1).');
    } else {
      console.warn('⚠️ Warning: Ping returned non-1 status:', pingResult);
    }

    // 6. Close connection immediately (NO writes, NO reads of collections, NO migration)
    await client.close();
    console.log('✅ Step 6: Connection closed cleanly. Zero database writes performed.\n');

    console.log('====================================================');
    console.log('🎉 CONNECTION TEST RESULT: SUCCESSFUL');
    console.log('====================================================');
  } catch (err: any) {
    const sanitized = sanitizeError(err?.message || String(err));
    console.error(`\n❌ CONNECTION TEST FAILED: ${sanitized}`);
    await client.close().catch(() => {});
    process.exit(1);
  }
}

testConnection().catch((err) => {
  const sanitized = sanitizeError(err?.message || String(err));
  console.error(`\n❌ UNEXPECTED ERROR: ${sanitized}`);
  process.exit(1);
});

