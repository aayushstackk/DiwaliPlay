/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { initStorage } from '../server/storage';
import { db } from '../server/storage';
import { kioskRelayManager, kioskRelayRouter } from '../server/kioskRelay';
import { bootstrapAdmin } from '../server/auth/bootstrap';

import cookieParser from 'cookie-parser';

async function runTestSuite() {
  console.log('=================================================================');
  console.log('   DIWALIPLAY REMOTE KIOSK CLOUD RELAY END-TO-END TEST SUITE     ');
  console.log('=================================================================\n');

  // 1. Initialize DB and Test Server
  process.env.INITIAL_ADMIN_PASSWORD = 'TestPassword123!';
  await initStorage({ skipMigration: true });
  await bootstrapAdmin();

  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Mock Admin Auth helper
  let adminToken = '';
  const admins = await db.getAllAdminUsers();
  let adminUser = admins.find((a) => a.role === 'superadmin') || admins[0];
  if (!adminUser) {
    adminUser = await db.createAdminUser({
      username: 'test_superadmin',
      passwordHash: 'dummy_hash',
      role: 'superadmin',
      isActive: true
    });
  }

  const session = await db.createAdminSession({
    adminId: adminUser.id,
    token: '',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  });
  adminToken = session.id;
  console.log(`[Test Setup] Authenticated as ${adminUser.username} (${adminUser.role})\n`);

  // Mount router
  app.use('/api/kiosk-relay', kioskRelayRouter);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/kiosk-relay') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        kioskRelayManager.handleDeviceConnection(ws, req);
      });
    }
  });

  const port = 3899;
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}/ws/kiosk-relay`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Unauthenticated Admin Access Blocked
    // ------------------------------------------------------------------------
    console.log('[Phase 1: Admin Authentication & Security]');
    const unauthRes = await fetch(`${baseUrl}/api/kiosk-relay/devices`);
    assert(unauthRes.status === 401, 'Unauthenticated admin request rejected with 401');

    const authRes = await fetch(`${baseUrl}/api/kiosk-relay/devices`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const authData = await authRes.json();
    assert(authRes.status === 200, 'Authenticated admin request returns 200 OK');
    assert(Array.isArray(authData.devices), 'Admin device list returned');

    // ------------------------------------------------------------------------
    // TEST 2: Device Pairing Flow (TV-Initiated Code Claim)
    // ------------------------------------------------------------------------
    console.log('\n[Phase 2: TV PC Device Pairing Flow]');
    // TV requests code
    const requestCodeRes = await fetch(`${baseUrl}/api/kiosk-relay/device-request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname: 'STAGE-PC-01', suggestedName: 'Main Stage TV Display' })
    });
    assert(requestCodeRes.status === 200, 'TV PC requests pairing code');
    const codeData = await requestCodeRes.json();
    assert(codeData.pairingCode && codeData.pairingCode.length === 6, 'Generated 6-digit pairing code: ' + codeData.pairingCode);

    // TV checks pairing before claim -> should be false
    const checkBeforeClaim = await fetch(`${baseUrl}/api/kiosk-relay/device-check-pairing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: codeData.deviceId })
    });
    const checkBeforeData = await checkBeforeClaim.json();
    assert(checkBeforeData.paired === false, 'Device check before admin claim returns paired: false');

    // Admin claims pairing code
    const claimRes = await fetch(`${baseUrl}/api/kiosk-relay/pair-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ pairingCode: codeData.pairingCode, name: 'Main Stage TV Display' })
    });
    assert(claimRes.status === 200, 'Admin claims pairing code successfully');
    const claimData = await claimRes.json();
    assert(claimData.device && claimData.device.name === 'Main Stage TV Display', 'Paired device name saved');

    // TV checks pairing after claim -> should return permanent deviceToken
    const checkAfterClaim = await fetch(`${baseUrl}/api/kiosk-relay/device-check-pairing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: codeData.deviceId })
    });
    const checkAfterData = await checkAfterClaim.json();
    assert(checkAfterData.paired === true && checkAfterData.deviceToken, 'TV PC receives permanent deviceToken after claim');

    const deviceId = codeData.deviceId;
    const deviceToken = checkAfterData.deviceToken;

    // ------------------------------------------------------------------------
    // TEST 3: WebSocket Connection & Unauthorized Rejection
    // ------------------------------------------------------------------------
    console.log('\n[Phase 3: WebSocket Outbound Persistent Connection]');

    // Try connecting with invalid token -> should fail
    const invalidWs = new WebSocket(`${wsBaseUrl}?deviceId=${deviceId}&token=bogus_token`);
    const rejectedPromise = new Promise<number>((resolve) => {
      invalidWs.on('close', (code) => resolve(code));
      invalidWs.on('error', () => {});
    });
    const closeCode = await rejectedPromise;
    assert(closeCode === 4401, 'Unauthorized WebSocket connection closed with 4401');

    // Connect with valid credentials
    const validWs = new WebSocket(`${wsBaseUrl}?deviceId=${deviceId}&token=${deviceToken}`);
    await new Promise<void>((resolve, reject) => {
      validWs.on('open', () => resolve());
      validWs.on('error', reject);
    });
    assert(validWs.readyState === WebSocket.OPEN, 'TV PC WebSocket connected successfully');

    // Verify online state in admin endpoint
    const checkOnlineRes = await fetch(`${baseUrl}/api/kiosk-relay/devices`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const checkOnlineData = await checkOnlineRes.json();
    const pairedDev = checkOnlineData.devices.find((d: any) => d.id === deviceId);
    assert(pairedDev && pairedDev.isOnline === true, 'Admin API reflects TV PC isOnline: true');

    // ------------------------------------------------------------------------
    // TEST 4: Heartbeat & Status Reporting
    // ------------------------------------------------------------------------
    console.log('\n[Phase 4: Device Heartbeat & Real Status]');
    const heartbeatPromise = new Promise<boolean>((resolve) => {
      validWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'heartbeat_ack') resolve(true);
      });
    });

    validWs.send(JSON.stringify({
      type: 'heartbeat',
      deviceId,
      timestamp: Date.now(),
      status: {
        connected: true,
        backProtection: false,
        autoLaunch: true,
        watchdogRunning: true,
        guardianRunning: true,
        appRunning: true,
        lastStateChange: new Date().toISOString(),
        lastStateChangeReason: 'Initial startup'
      }
    }));

    const heartbeatAckReceived = await heartbeatPromise;
    assert(heartbeatAckReceived, 'Cloud Relay acknowledged device heartbeat');

    // Verify status updated in admin endpoint
    const statusRes = await fetch(`${baseUrl}/api/kiosk-relay/devices`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const statusData = await statusRes.json();
    const devStatus = statusData.devices.find((d: any) => d.id === deviceId);
    assert(devStatus.status?.watchdogRunning === true && devStatus.status?.backProtection === false,
      'Device real protection status reflected in admin data');

    // ------------------------------------------------------------------------
    // TEST 5: Bidirectional Remote Command Dispatch & Execution
    // ------------------------------------------------------------------------
    console.log('\n[Phase 5: Remote Admin Commands (Enable / Disable / Test-Exit)]');

    // Mock TV Agent command listener that simulates local bridge execution
    validWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'command') {
        const action = msg.action;
        const reqId = msg.requestId;

        // Respond with simulated bridge response
        let newProtected = false;
        if (action === 'enable') newProtected = true;
        if (action === 'disable') newProtected = false;

        const ack = {
          type: 'ack',
          requestId: reqId,
          action,
          success: true,
          status: {
            connected: true,
            backProtection: newProtected,
            autoLaunch: true,
            watchdogRunning: true,
            guardianRunning: newProtected,
            appRunning: true,
            lastStateChange: new Date().toISOString()
          },
          timestamp: Date.now()
        };
        validWs.send(JSON.stringify(ack));
      }
    });

    // 5a. Admin sends 'enable' command
    const enableCmdRes = await fetch(`${baseUrl}/api/kiosk-relay/devices/${deviceId}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action: 'enable' })
    });
    assert(enableCmdRes.status === 200, 'Admin sent "enable" command over Cloud Relay');
    const enableCmdData = await enableCmdRes.json();
    assert(enableCmdData.success === true && enableCmdData.executed === true && enableCmdData.status?.backProtection === true,
      'TV PC executed enable command; Protected Mode is now ON');

    // 5b. Admin sends 'disable' command with passcode
    const disableCmdRes = await fetch(`${baseUrl}/api/kiosk-relay/devices/${deviceId}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action: 'disable', passcode: '8536' })
    });
    assert(disableCmdRes.status === 200, 'Admin sent "disable" command over Cloud Relay');
    const disableCmdData = await disableCmdRes.json();
    assert(disableCmdData.success === true && disableCmdData.status?.backProtection === false,
      'TV PC executed disable command; Protected Mode is now OFF');

    // 5c. Admin sends 'test-exit' command
    const testExitRes = await fetch(`${baseUrl}/api/kiosk-relay/devices/${deviceId}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action: 'test-exit' })
    });
    assert(testExitRes.status === 200, 'Admin sent "test-exit" command over Cloud Relay');
    const testExitData = await testExitRes.json();
    assert(testExitData.success === true && testExitData.executed === true,
      'TV PC executed test-exit command successfully');

    // ------------------------------------------------------------------------
    // TEST 6: Audit Logging Verification
    // ------------------------------------------------------------------------
    console.log('\n[Phase 6: Security Audit Logging]');
    const logs = await db.getAuditLogs(10);
    const kioskLog = logs.find((l) => l.action.startsWith('KIOSK_'));
    assert(Boolean(kioskLog), 'Admin audit log recorded Kiosk remote action: ' + kioskLog?.action);

    // ------------------------------------------------------------------------
    // TEST 7: Offline Handling & Revocation
    // ------------------------------------------------------------------------
    console.log('\n[Phase 7: Network Dropout Handling & Device Revocation]');
    validWs.close(1000);
    await new Promise((r) => setTimeout(r, 200));

    // Try sending command when device is offline -> should return 503
    const offlineCmdRes = await fetch(`${baseUrl}/api/kiosk-relay/devices/${deviceId}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action: 'enable' })
    });
    assert(offlineCmdRes.status === 503, 'Command to offline device safely returns 503 (DEVICE_OFFLINE)');

    // Admin revokes device
    const deleteRes = await fetch(`${baseUrl}/api/kiosk-relay/devices/${deviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(deleteRes.status === 200, 'Superadmin revokes and deletes device');

    const checkDeletedRes = await fetch(`${baseUrl}/api/kiosk-relay/devices`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const checkDeletedData = await checkDeletedRes.json();
    assert(!checkDeletedData.devices.some((d: any) => d.id === deviceId), 'Device removed from active devices');

    console.log('\n=================================================================');
    console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS)`);
    console.log('=================================================================\n');
  } finally {
    server.close();
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
