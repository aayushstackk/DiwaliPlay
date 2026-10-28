/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

async function runHttpTests() {
  console.log('====================================================');
  console.log('🌐 RUNNING PHASE 2 HTTP ENDPOINT & SECURITY TESTS');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:3000/api';
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
  // 1. Unauthenticated Access Protection on Admin APIs
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Unauthenticated Rejections (HTTP 401) ---');

  const unauthOverview = await fetch(`${BASE_URL}/admin/overview`);
  assert(unauthOverview.status === 401, 'GET /api/admin/overview without token returns HTTP 401');

  const unauthUsers = await fetch(`${BASE_URL}/admin/users`);
  assert(unauthUsers.status === 401, 'GET /api/admin/users without token returns HTTP 401');

  const unauthSessions = await fetch(`${BASE_URL}/admin/sessions`);
  assert(unauthSessions.status === 401, 'GET /api/admin/sessions without token returns HTTP 401');

  const unauthLeaderboard = await fetch(`${BASE_URL}/admin/leaderboard`);
  assert(unauthLeaderboard.status === 401, 'GET /api/admin/leaderboard without token returns HTTP 401');

  const unauthSettingsPost = await fetch(`${BASE_URL}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandName: 'Hacked' })
  });
  assert(unauthSettingsPost.status === 401, 'POST /api/settings without token returns HTTP 401');

  // --------------------------------------------------------------------------
  // 2. Public Gameplay APIs Accessibility
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Verifying Public Gameplay APIs Remain Unblocked ---');

  const publicHealth = await fetch(`${BASE_URL}/health`);
  assert(publicHealth.status === 200, 'GET /api/health is publicly accessible');

  const publicSettings = await fetch(`${BASE_URL}/settings`);
  assert(publicSettings.status === 200, 'GET /api/settings (read-only branding) is publicly accessible');

  const publicRegister = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Public Tester', mobileNumber: '9811223344' })
  });
  assert(publicRegister.status === 200 || publicRegister.status === 201, 'POST /api/register is publicly accessible');

  // --------------------------------------------------------------------------
  // 3. Initial Setup Endpoint Protection
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Initial Admin Account Setup ---');

  // Test setup with weak password (< 10 chars)
  const weakSetup = await fetch(`${BASE_URL}/admin/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: '123' })
  });
  // Note: if an admin already exists from a previous run, it returns 403; if none, it returns 400 for weak password
  assert(weakSetup.status === 400 || weakSetup.status === 403, 'Weak password rejected or already initialized');

  const superPassword = 'DiwaliSuperAdmin2026!';
  const setupRes = await fetch(`${BASE_URL}/admin/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: superPassword })
  });
  // If first time, 201 Created; if already initialized, 403 Forbidden
  assert(setupRes.status === 201 || setupRes.status === 403, 'Setup endpoint operates securely');

  // Second call must definitely be 403 Forbidden (already initialized)
  const secondSetup = await fetch(`${BASE_URL}/admin/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'intruder', password: 'IntruderPass2026!' })
  });
  assert(secondSetup.status === 403, 'Setup endpoint returns HTTP 403 once an admin account exists');

  // --------------------------------------------------------------------------
  // 4. Admin Login & Authentication
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing Admin Login & Session Generation ---');

  // Invalid password
  const badLogin = await fetch(`${BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'WrongPassword999!' })
  });
  assert(badLogin.status === 401, 'Incorrect password returns HTTP 401');

  // Valid login
  const loginRes = await fetch(`${BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: superPassword })
  });
  assert(loginRes.status === 200, 'Valid login returns HTTP 200 OK');

  const setCookie = loginRes.headers.get('set-cookie');
  assert(Boolean(setCookie && setCookie.includes('diwali_admin_session')), 'Login sets HTTP-only diwali_admin_session cookie');

  const loginData = await loginRes.json();
  const superToken = loginData.token;
  assert(Boolean(superToken && loginData.user?.role === 'superadmin'), 'Login returns session token and superadmin role');

  // --------------------------------------------------------------------------
  // 5. Authenticated Admin Endpoints with Bearer Token
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Testing Protected Endpoints with Authentication ---');

  const meRes = await fetch(`${BASE_URL}/admin/auth/me`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  assert(meRes.status === 200, 'GET /api/admin/auth/me returns authenticated profile');

  const overviewRes = await fetch(`${BASE_URL}/admin/overview`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  assert(overviewRes.status === 200, 'GET /api/admin/overview accessible with valid token');

  const usersRes = await fetch(`${BASE_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  assert(usersRes.status === 200, 'GET /api/admin/users accessible with valid token');

  // Test superadmin modifying settings
  const settingsUpdate = await fetch(`${BASE_URL}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superToken}`
    },
    body: JSON.stringify({ brandName: 'ItsSpotlight' })
  });
  assert(settingsUpdate.status === 200, 'POST /api/settings succeeds for authenticated superadmin');

  // --------------------------------------------------------------------------
  // 6. Role-Based Access Control (RBAC): Superadmin vs Operator
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Testing Role-Based Privileges (Superadmin vs Operator) ---');

  // Superadmin creates an operator account
  const opUsername = 'event_operator_1';
  const opPassword = 'OperatorSecret2026!';
  const createOpRes = await fetch(`${BASE_URL}/admin/auth/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superToken}`
    },
    body: JSON.stringify({ username: opUsername, password: opPassword, role: 'operator' })
  });
  assert(createOpRes.status === 201 || createOpRes.status === 409, 'Superadmin can create operator account');

  // Operator logs in
  const opLogin = await fetch(`${BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: opUsername, password: opPassword })
  });
  assert(opLogin.status === 200, 'Operator login succeeds');
  const opToken = (await opLogin.json()).token;

  // Operator attempts to create another admin user -> Must return HTTP 403 Forbidden!
  const opForbiddenCreate = await fetch(`${BASE_URL}/admin/auth/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opToken}`
    },
    body: JSON.stringify({ username: 'intruder_op', password: 'IntruderPass2026!', role: 'superadmin' })
  });
  assert(opForbiddenCreate.status === 403, 'Operator forbidden from creating admin users (HTTP 403)');

  // Operator attempts to modify settings -> Must return HTTP 403 Forbidden!
  const opForbiddenSettings = await fetch(`${BASE_URL}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opToken}`
    },
    body: JSON.stringify({ brandName: 'OperatorOverride' })
  });
  assert(opForbiddenSettings.status === 403, 'Operator forbidden from updating protected settings (HTTP 403)');

  // Operator CAN view dashboard overview -> HTTP 200
  const opAllowedOverview = await fetch(`${BASE_URL}/admin/overview`, {
    headers: { Authorization: `Bearer ${opToken}` }
  });
  assert(opAllowedOverview.status === 200, 'Operator permitted to view admin overview (HTTP 200)');

  // --------------------------------------------------------------------------
  // 7. Logout & Session Invalidation
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Testing Logout & Token Invalidation ---');

  const logoutRes = await fetch(`${BASE_URL}/admin/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opToken}` }
  });
  assert(logoutRes.status === 200, 'POST /api/admin/auth/logout succeeds');

  // Attempting request with invalidated operator token -> Must return HTTP 401!
  const invalidatedReq = await fetch(`${BASE_URL}/admin/overview`, {
    headers: { Authorization: `Bearer ${opToken}` }
  });
  assert(invalidatedReq.status === 401, 'Subsequent request with invalidated session returns HTTP 401');

  console.log('\n====================================================');
  console.log(`🏁 HTTP SECURITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runHttpTests().catch((e) => {
  console.error('HTTP test fatal error:', e);
  process.exit(1);
});
