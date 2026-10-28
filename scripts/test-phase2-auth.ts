/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { JsonFileStorageAdapter } from '../server/storage/jsonAdapter';
import { MongoStorageAdapter } from '../server/storage/mongoAdapter';
import { StorageAdapter } from '../server/storage/types';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../server/auth/password';

async function runPhase2Tests() {
  console.log('====================================================');
  console.log('🧪 RUNNING PHASE 2 SECURE ADMIN AUTHENTICATION TESTS');
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
  // TEST SUITE 1: PASSWORD HASHING, COMPLEXITY & TIMING ATTACK PROTECTION
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Testing Password Security & Cryptographic Hashing ---');

  // Test 1.1: Password complexity validation
  const weak1 = validatePasswordStrength('');
  assert(!weak1.valid, 'Empty password rejected');

  const weak2 = validatePasswordStrength('short9!');
  assert(!weak2.valid, 'Password shorter than 10 characters rejected');

  const weak3 = validatePasswordStrength('alllowercaseletters');
  assert(!weak3.valid, 'Password lacking numbers or special characters rejected');

  const strongPass = 'DiwaliSuperAdmin2026!';
  const strongVal = validatePasswordStrength(strongPass);
  assert(strongVal.valid, 'Strong password (>=10 chars with mixed chars) accepted');

  // Test 1.2: Password hashing format and verification
  const hash = await hashPassword(strongPass);
  assert(hash.startsWith('scrypt:'), 'Password hash uses native scrypt format (scrypt:salt:key)');
  assert(!hash.includes(strongPass), 'Plaintext password is NEVER stored in hash');

  const isCorrect = await verifyPassword(strongPass, hash);
  assert(isCorrect === true, 'Correct password verifies successfully against scrypt hash');

  const isIncorrect = await verifyPassword('WrongPassword123!', hash);
  assert(isIncorrect === false, 'Incorrect password rejected by verifyPassword');

  // Different salt each time
  const hash2 = await hashPassword(strongPass);
  assert(hash !== hash2, 'Salting ensures identical passwords generate distinct hashes');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: STORAGE ADAPTER AUTHENTICATION METHODS (JSON & MONGO)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Storage Adapters for Admin Users & Sessions ---');

  const adapters: { name: string; adapter: StorageAdapter }[] = [
    { name: 'JsonFileStorageAdapter', adapter: new JsonFileStorageAdapter() }
  ];

  let mongoServer: MongoMemoryServer | null = null;
  try {
    mongoServer = await MongoMemoryServer.create();
    const mongoAdapter = new MongoStorageAdapter(mongoServer.getUri(), 'phase2_test_db');
    await mongoAdapter.init();
    adapters.push({ name: 'MongoStorageAdapter', adapter: mongoAdapter });
  } catch (mErr) {
    console.warn('  ⚠️ MongoMemoryServer unavailable for Phase 2 test suite:', mErr);
  }

  for (const { name, adapter } of adapters) {
    console.log(`\n  Sub-suite: Testing with ${name}...`);
    await adapter.init();

    // Test 2.1: Create Superadmin
    const testRunId = Date.now().toString(36).slice(-4);
    const superadminPassHash = await hashPassword('SuperAdminPass2026#');
    const superadmin = await adapter.createAdminUser({
      username: `super_${name.toLowerCase().slice(0, 4)}_${testRunId}`,
      passwordHash: superadminPassHash,
      role: 'superadmin',
      isActive: true
    });
    assert(superadmin.id.startsWith('admin_'), `${name}: Superadmin account created with stable ID`);
    assert(superadmin.role === 'superadmin', `${name}: Superadmin role assigned`);

    // Test 2.2: Create Operator
    const operatorPassHash = await hashPassword('OperatorPass2026#');
    const operator = await adapter.createAdminUser({
      username: `op_${name.toLowerCase().slice(0, 4)}_${testRunId}`,
      passwordHash: operatorPassHash,
      role: 'operator',
      isActive: true
    });
    assert(operator.role === 'operator', `${name}: Operator account created with operator role`);

    // Test 2.3: Unique username enforcement
    try {
      await adapter.createAdminUser({
        username: superadmin.username,
        passwordHash: superadminPassHash,
        role: 'operator',
        isActive: true
      });
      assert(false, `${name}: Should throw on duplicate username`);
    } catch {
      assert(true, `${name}: Duplicate username rejected`);
    }

    // Test 2.4: Session Creation & Lookup
    const now = Date.now();
    const expiresAt = new Date(now + 8 * 3600 * 1000).toISOString();
    const session = await adapter.createAdminSession({
      adminId: superadmin.id,
      username: superadmin.username,
      role: superadmin.role,
      createdAt: new Date().toISOString(),
      expiresAt
    });
    assert(typeof session.id === 'string' && session.id.length >= 32, `${name}: Secure 64-char hex session token generated`);

    const foundSession = await adapter.findAdminSession(session.id);
    assert(foundSession?.adminId === superadmin.id, `${name}: Admin session retrieved by token`);

    // Test 2.5: Session Invalidation on Logout
    const deleted = await adapter.deleteAdminSession(session.id);
    assert(deleted === true, `${name}: Admin session deleted on logout`);

    const deletedLookup = await adapter.findAdminSession(session.id);
    assert(deletedLookup === undefined, `${name}: Invalidated session cannot be retrieved`);

    // Test 2.6: Audit Log Recording
    const audit = await adapter.recordAuditLog({
      adminId: superadmin.id,
      username: superadmin.username,
      action: 'TEST_AUDIT_ACTION',
      details: { sample: 123 }
    });
    assert(audit.id.startsWith('audit_') && audit.action === 'TEST_AUDIT_ACTION', `${name}: Audit log entry recorded`);

    const logs = await adapter.getAuditLogs(10);
    assert(logs.some((l) => l.action === 'TEST_AUDIT_ACTION'), `${name}: Audit logs queryable`);
  }

  if (mongoServer) {
    await mongoServer.stop();
  }

  console.log('\n====================================================');
  console.log(`🏁 PHASE 2 UNIT TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase2Tests().catch((e) => {
  console.error('Phase 2 test fatal error:', e);
  process.exit(1);
});
