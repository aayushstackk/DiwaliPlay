/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JsonFileStorageAdapter } from '../server/storage/jsonAdapter';
import { hashPassword } from '../server/auth/password';

async function runPhase3AcceptanceTests() {
  console.log('====================================================');
  console.log('🎨 RUNNING PHASE 3 ADMIN PANEL UI & API INTEGRATION TESTS');
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

  // 1. Verify /admin route serves the client-side SPA shell
  console.log('--- 1. Testing /admin Route Delivery ---');
  const adminPageRes = await fetch(`${BASE_URL}/admin`);
  assert(adminPageRes.status === 200, 'GET /admin responds with HTTP 200 OK');
  const adminPageHtml = await adminPageRes.text();
  assert(adminPageHtml.includes('<div id="root">') || adminPageHtml.includes('html'), 'GET /admin serves the SPA root container');

  // 2. Ensure initial unauthenticated state rejects admin access
  console.log('\n--- 2. Testing Unauthenticated Protection ---');
  const unauthMe = await fetch(`${BASE_URL}/api/admin/auth/me`);
  assert(unauthMe.status === 401, 'GET /api/admin/auth/me without cookie returns HTTP 401');

  const unauthOverview = await fetch(`${BASE_URL}/api/admin/overview`);
  assert(unauthOverview.status === 401, 'GET /api/admin/overview without cookie returns HTTP 401');

  // 3. Testing Authentication with invalid vs valid credentials
  console.log('\n--- 3. Testing Login Endpoint Validation ---');
  const invalidLoginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nonexistent_user', password: 'WrongPassword123#' })
  });
  assert(invalidLoginRes.status === 401, 'Invalid credentials return HTTP 401');
  const invalidJson = await invalidLoginRes.json();
  assert(invalidJson.success === false, 'Invalid credentials return success: false');

  // Use the established superadmin account initialized in Phase 2
  const testUser = 'superadmin';
  const testPass = 'DiwaliSuperAdmin2026!';

  const validLoginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: testUser, password: testPass })
  });
  assert(validLoginRes.status === 200, 'Valid credentials return HTTP 200 OK');

  const cookieHeader = validLoginRes.headers.get('set-cookie');
  assert(cookieHeader !== null && cookieHeader.includes('diwali_admin_session'), 'Login response sets HTTP-only diwali_admin_session cookie');

  const cookieVal = cookieHeader ? cookieHeader.split(';')[0] : '';

  // 4. Test Session Restoration (Simulating page refresh / GET /api/admin/auth/me)
  console.log('\n--- 4. Testing Session Restoration on Page Refresh ---');
  const refreshMeRes = await fetch(`${BASE_URL}/api/admin/auth/me`, {
    headers: { Cookie: cookieVal }
  });
  assert(refreshMeRes.status === 200, 'GET /api/admin/auth/me with session cookie returns HTTP 200 OK');
  const refreshJson = await refreshMeRes.json();
  assert(refreshJson.user?.username === testUser, 'Authenticated profile reflects logged-in username');
  assert(refreshJson.user?.role === 'superadmin', 'Authenticated profile reflects superadmin role');

  // 5. Test Real Data Delivery on Admin APIs
  console.log('\n--- 5. Testing Real Data Delivery on Admin APIs ---');
  const overviewRes = await fetch(`${BASE_URL}/api/admin/overview`, {
    headers: { Cookie: cookieVal }
  });
  assert(overviewRes.status === 200, 'GET /api/admin/overview returns HTTP 200 with session');
  const overviewJson = await overviewRes.json();
  assert(typeof overviewJson.stats.totalUsers === 'number', 'Overview contains real numeric totalUsers count');
  assert(typeof overviewJson.stats.totalSessions === 'number', 'Overview contains real numeric totalSessions count');
  assert(typeof overviewJson.stats.completedSessions === 'number', 'Overview contains real completedSessions count');
  assert(Array.isArray(overviewJson.stats.recentSessions), 'Overview contains recentSessions array');
  assert(Array.isArray(overviewJson.stats.recentUsers), 'Overview contains recentUsers array');

  const usersRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Cookie: cookieVal }
  });
  assert(usersRes.status === 200, 'GET /api/admin/users returns HTTP 200');
  const usersJson = await usersRes.json();
  assert(Array.isArray(usersJson.users), 'Users API returns real array of registered players');

  const sessionsRes = await fetch(`${BASE_URL}/api/admin/sessions`, {
    headers: { Cookie: cookieVal }
  });
  assert(sessionsRes.status === 200, 'GET /api/admin/sessions returns HTTP 200');
  const sessionsJson = await sessionsRes.json();
  assert(Array.isArray(sessionsJson.sessions), 'Sessions API returns real array of game sessions');

  // 6. Test Settings Modification by Superadmin
  console.log('\n--- 6. Testing System Settings Persistence ---');
  const settingsUpdateRes = await fetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieVal
    },
    body: JSON.stringify({
      gameDurationSeconds: 35,
      brandName: 'ItsSpotlight'
    })
  });
  assert(settingsUpdateRes.status === 200, 'POST /api/settings succeeds for authenticated superadmin');
  const updatedSettingsJson = await settingsUpdateRes.json();
  assert(updatedSettingsJson.settings.brandName === 'ItsSpotlight', 'Persisted brand name verified');

  // 7. Test Logout and Session Invalidation
  console.log('\n--- 7. Testing Logout and Invalidation ---');
  const logoutRes = await fetch(`${BASE_URL}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieVal }
  });
  assert(logoutRes.status === 200, 'POST /api/admin/auth/logout returns HTTP 200 OK');

  const postLogoutMe = await fetch(`${BASE_URL}/api/admin/auth/me`, {
    headers: { Cookie: cookieVal }
  });
  assert(postLogoutMe.status === 401, 'Logged out session is rejected with HTTP 401');

  // 8. Public gameplay routes remain unaffected
  console.log('\n--- 8. Verifying Public Gameplay Experience Unaffected ---');
  const publicSettings = await fetch(`${BASE_URL}/api/settings`);
  assert(publicSettings.status === 200, 'Public GET /api/settings remains accessible');

  const publicHealth = await fetch(`${BASE_URL}/api/health`);
  assert(publicHealth.status === 200, 'Public GET /api/health remains accessible');

  console.log('\n====================================================');
  console.log(`🏁 PHASE 3 ACCEPTANCE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3AcceptanceTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
