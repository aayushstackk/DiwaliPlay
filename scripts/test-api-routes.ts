/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { initStorage, db } from '../server/storage';
import { apiRouter } from '../server/routes/api';

async function testRoutes() {
  console.log('=== TESTING API ROUTES & BOMB MANAGEMENT ENDPOINTS ===');
  await initStorage();
  console.log('[Storage Backend]:', db.getType());

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  console.log(`Test server listening on port ${port}`);

  const baseUrl = `http://127.0.0.1:${port}/api`;

  // Test 1: Public /api/bombs
  try {
    const res = await fetch(`${baseUrl}/bombs`);
    console.log(`GET /api/bombs -> status ${res.status}`);
    const data = await res.json();
    console.log(`  success: ${data.success}, bombs count: ${data.bombs?.length}`);
  } catch (err: any) {
    console.error('Error GET /api/bombs:', err.message);
  }

  // Test 2: Admin /api/admin/bombs (without auth token)
  try {
    const res = await fetch(`${baseUrl}/admin/bombs`);
    console.log(`GET /api/admin/bombs (no auth) -> status ${res.status}`);
    const data = await res.json();
    console.log('  response:', data);
  } catch (err: any) {
    console.error('Error GET /api/admin/bombs (no auth):', err.message);
  }

  // Test 3: Authenticated Admin /api/admin/bombs
  // Let's create an admin session token in db or log in
  try {
    const adminUser = await db.findAdminByUsername('superadmin');
    console.log('Superadmin user found:', !!adminUser);
    if (adminUser) {
      const session = await db.createAdminSession({
        adminId: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        ip: '127.0.0.1',
        userAgent: 'test-agent',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString()
      });
      console.log('Created test admin session:', session.id);

      const authRes = await fetch(`${baseUrl}/admin/bombs`, {
        headers: {
          'Authorization': `Bearer ${session.id}`,
          'Accept': 'application/json'
        }
      });
      console.log(`GET /api/admin/bombs (with auth) -> status ${authRes.status}`);
      const authData = await authRes.json();
      console.log(`  success: ${authData.success}, bombs count: ${authData.bombs?.length}`);
      if (authData.bombs) {
        authData.bombs.forEach((b: any) => console.log(`  - ${b.id}: ${b.name} (${b.points} pts)`));
      }

      // Test 4: Admin bomb settings
      const settingsRes = await fetch(`${baseUrl}/admin/bombs/settings`, {
        headers: {
          'Authorization': `Bearer ${session.id}`,
          'Accept': 'application/json'
        }
      });
      console.log(`GET /api/admin/bombs/settings -> status ${settingsRes.status}`);
      const settingsData = await settingsRes.json();
      console.log('  settings:', settingsData.settings);

      // Test 5: PUT /api/admin/bombs/settings
      const updateSettingsRes = await fetch(`${baseUrl}/admin/bombs/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.id}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ maxConcurrentBombs: 4 })
      });
      console.log(`PUT /api/admin/bombs/settings -> status ${updateSettingsRes.status}`);
      const updatedSettings = await updateSettingsRes.json();
      console.log('  updated settings:', updatedSettings.settings);
    }
  } catch (err: any) {
    console.error('Error in auth tests:', err);
  }

  server.close();
}

testRoutes().catch(console.error);
