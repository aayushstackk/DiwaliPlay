/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';

// Ensure reliable DNS resolution for MongoDB Atlas SRV records on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if restricted in runtime
}

// Guarantee .env is loaded from workspace root regardless of process invocation CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initStorage } from '../server/storage/index';
import {
  hashPassword,
  validatePasswordStrength,
  normalizeUsername
} from '../server/auth/password';

/**
 * Local-only, non-destructive administrative password recovery utility.
 *
 * Safety Guarantees:
 * 1. Loads .env consistently and targets the exact active storage backend (MongoDB Atlas or JSON).
 * 2. Does NOT trigger database migration, overwrite, or delete player/game records.
 * 3. Updates ONLY the specified admin user's password hash in the active database.
 * 4. Preserves every other admin field (id, role, isActive, createdAt, lastLoginAt).
 * 5. Preserves all other admin accounts, player registrations, game codes, sessions, settings, and assets.
 * 6. Refuses to run if the username does not exist or storage cannot be safely verified.
 * 7. Validates password strength using validatePasswordStrength().
 * 8. Never prints or logs plain passwords or database connection secrets.
 */

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

function parseCliArgs(): { username?: string; password?: string } {
  const args = process.argv.slice(2);
  const result: { username?: string; password?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--username' && i + 1 < args.length) {
      result.username = args[++i];
    } else if (arg === '--password' && i + 1 < args.length) {
      result.password = args[++i];
    } else if (!arg.startsWith('--') && !result.username) {
      result.username = arg;
    }
  }

  return result;
}

async function runRecovery() {
  console.log('====================================================');
  console.log('🔑 DIWALI FUN PLAY — ADMIN PASSWORD RECOVERY UTILITY');
  console.log('====================================================\n');

  // 1. Initialize active storage adapter without triggering data migration
  let storage;
  try {
    storage = await initStorage({ skipMigration: true });
  } catch (err: any) {
    console.error('[Recovery Error] Failed to initialize active storage adapter:', err?.message || err);
    process.exit(1);
  }

  const storageType = storage.getType();
  if (storageType !== 'json' && storageType !== 'mongodb') {
    console.error(`[Recovery Error] Unrecognized storage backend "${storageType}". Aborting for safety.`);
    process.exit(1);
  }

  let safeDatabaseInfo = 'data/db.json';
  if (storageType === 'mongodb') {
    const mongoUri = process.env.MONGODB_URI || '';
    let safeHost = 'Atlas Cluster';
    try {
      const match = mongoUri.match(/@([^/?]+)/);
      if (match && match[1]) safeHost = match[1];
    } catch {}
    safeDatabaseInfo = `MongoDB Atlas (${safeHost}) | Database: "diwali_fun_play" | Collection: "admin_users"`;
  } else {
    safeDatabaseInfo = 'Local JSON File | Database: "data/db.json" | Map: "adminUsers"';
  }

  console.log(`[Storage] Active backend identified: ${storageType.toUpperCase()}`);
  console.log(`[Storage] Target database: ${safeDatabaseInfo}\n`);

  const cliArgs = parseCliArgs();

  // 2. Resolve username (via env var, CLI argument, or interactive prompt)
  let rawUsername = process.env.ADMIN_USERNAME || cliArgs.username;
  if (!rawUsername) {
    rawUsername = await askQuestion('Enter existing admin username to recover: ');
  }

  const cleanUsername = normalizeUsername(rawUsername);
  if (!cleanUsername) {
    console.error('[Recovery Error] Username is required.');
    process.exit(1);
  }

  // 3. Verify user exists in active database
  const existingAdmin = await storage.findAdminByUsername(cleanUsername);
  if (!existingAdmin) {
    console.error(`\n❌ [Recovery Error] Admin user "${cleanUsername}" was not found in ${storageType.toUpperCase()} storage.`);
    console.log(`\nExisting accounts registered in ${storageType.toUpperCase()}:`);
    try {
      const allAdmins = await storage.getAllAdminUsers();
      if (allAdmins.length === 0) {
        console.log('  (No admin accounts found in database. Initial setup is open via /admin)');
      } else {
        for (const a of allAdmins) {
          console.log(`  - Username: "${a.username}" | Role: ${a.role} | Active: ${a.isActive}`);
        }
      }
    } catch {
      // Ignore enumeration error
    }
    console.log('\nPlease verify the username and re-run.');
    process.exit(1);
  }

  console.log(`[Account Found] ID: ${existingAdmin.id} | Role: ${existingAdmin.role} | Active: ${existingAdmin.isActive}`);

  // 4. Resolve new password (via env var, CLI argument, or interactive prompt)
  let rawPassword = process.env.NEW_ADMIN_PASSWORD || cliArgs.password;
  if (!rawPassword) {
    rawPassword = await askQuestion('Enter new password (min 5 chars, letters + numbers/symbols): ');
  }

  const cleanPassword = (rawPassword || '').trim();

  // 5. Validate password complexity
  const strength = validatePasswordStrength(cleanPassword);
  if (!strength.valid) {
    console.error(`\n❌ [Recovery Error] Password rejected: ${strength.error}`);
    process.exit(1);
  }

  // 6. Cryptographically hash password using native scrypt
  console.log('\n[Security] Hashing new password using native crypto.scrypt...');
  const newHash = await hashPassword(cleanPassword);

  // 7. Update ONLY the passwordHash field on the existing admin record
  console.log(`[Storage] Updating password hash for "${existingAdmin.username}" in ${storageType.toUpperCase()} (${safeDatabaseInfo})...`);
  const updatedAdmin = await storage.updateAdminUser(existingAdmin.id, {
    passwordHash: newHash
  });

  if (!updatedAdmin) {
    console.error('\n❌ [Recovery Error] Failed to update admin record.');
    process.exit(1);
  }

  // 8. Record audit log entry in the active database
  try {
    await storage.recordAuditLog({
      adminId: existingAdmin.id,
      username: existingAdmin.username,
      action: 'ADMIN_PASSWORD_RECOVERY',
      details: {
        method: 'LOCAL_CLI_UTILITY',
        storageBackend: storageType,
        database: storageType === 'mongodb' ? 'diwali_fun_play' : 'db.json'
      }
    });
  } catch (auditErr) {
    console.warn('[Audit Log Notice] Could not append audit log entry:', auditErr);
  }

  if (typeof storage.close === 'function') {
    await storage.close();
  }

  // 9. Safely clear in-memory lockout on running local dev server if active
  try {
    const res = await fetch('http://localhost:3001/api/admin/auth/clear-lockout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(1500)
    });
    if (res.ok) {
      console.log('[Lockout] Cleared in-memory login rate limit on active server.');
    }
  } catch {
    // Dev server is not running or not reachable; no problem.
  }

  console.log('\n====================================================');
  console.log('✅ ADMIN PASSWORD RECOVERY COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
  console.log(`User:      ${existingAdmin.username}`);
  console.log(`Role:      ${existingAdmin.role}`);
  console.log(`Backend:   ${storageType.toUpperCase()}`);
  console.log(`Database:  ${storageType === 'mongodb' ? 'diwali_fun_play (MongoDB Atlas)' : 'data/db.json (Local JSON)'}`);
  console.log('Status:    Active');
  console.log('\nYou can now log in at: http://localhost:3001/admin\n');

  process.exit(0);
}

runRecovery().catch((err) => {
  console.error('[Fatal Error]', err?.message || err);
  process.exit(1);
});
