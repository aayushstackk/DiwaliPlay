/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import crypto from 'crypto';
import { db } from '../storage';
import {
  KioskDeviceStatus,
  KioskRemoteAction,
  AdminUser,
  KioskDeviceRecord,
  SafeKioskDevice
} from '../../src/types/backend';
import {
  KioskInboundMessage,
  KioskServerCommand,
  KioskServerHeartbeatAck,
  KioskServerPing,
  KioskAgentAck
} from './types';

interface PendingCommand {
  resolve: (ack: KioskAgentAck) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  deviceId: string;
  action: KioskRemoteAction;
  sentAt: number;
}

class KioskRelayManager {
  private activeSockets = new Map<string, WebSocket>();
  private pendingCommands = new Map<string, PendingCommand>();
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Validates device authentication and establishes live WebSocket connection.
   */
  public async handleDeviceConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const deviceId = url.searchParams.get('deviceId') || '';
    let token = url.searchParams.get('token') || '';

    if (!token && req.headers['authorization']) {
      const parts = req.headers['authorization'].split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        token = parts[1];
      }
    }

    if (!deviceId || !token) {
      console.warn(`[KioskRelay] Connection rejected: Missing deviceId or token.`);
      ws.close(4401, 'Unauthorized: Missing deviceId or token');
      return;
    }

    const device = await db.getKioskDeviceById(deviceId);
    if (!device || !device.isPaired || !device.deviceToken) {
      console.warn(`[KioskRelay] Connection rejected: Device ${deviceId} not found or not paired.`);
      ws.close(4401, 'Unauthorized: Device not found or pairing revoked');
      return;
    }

    // Timing-safe comparison of deviceToken
    const providedBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(device.deviceToken);
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      console.warn(`[KioskRelay] Connection rejected: Invalid device token for ${deviceId}.`);
      ws.close(4401, 'Unauthorized: Invalid device token');
      return;
    }

    // Close any previous stale socket for this device
    const existing = this.activeSockets.get(deviceId);
    if (existing && existing.readyState === WebSocket.OPEN) {
      existing.close(1000, 'Replaced by newer connection');
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress || 'unknown';

    this.activeSockets.set(deviceId, ws);
    console.log(`[KioskRelay] Device connected: "${device.name}" (${deviceId}) from IP ${clientIp}`);

    // Update connection metadata in storage
    const nowIso = new Date().toISOString();
    await db.updateKioskDevice(deviceId, {
      lastConnectedAt: nowIso,
      ipAddress: clientIp
    });

    let isAlive = true;
    ws.on('pong', () => {
      isAlive = true;
    });

    // Keepalive ping interval every 25 seconds
    const pingTimer = setInterval(() => {
      if (!isAlive) {
        console.warn(`[KioskRelay] Device ${deviceId} heartbeat timed out. Terminating connection.`);
        this.cleanupSocket(deviceId, ws, pingTimer);
        ws.terminate();
        return;
      }
      isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const pingMsg: KioskServerPing = { type: 'ping', timestamp: Date.now() };
          ws.send(JSON.stringify(pingMsg));
        } catch {
          this.cleanupSocket(deviceId, ws, pingTimer);
        }
      }
    }, 25000);

    this.heartbeatIntervals.set(deviceId, pingTimer);

    // Message processing
    ws.on('message', async (raw) => {
      try {
        const text = raw.toString();
        const msg = JSON.parse(text) as KioskInboundMessage;

        if (msg.type === 'pong') {
          isAlive = true;
          return;
        }

        if (msg.type === 'heartbeat') {
          isAlive = true;
          const heartbeatNow = new Date().toISOString();
          await db.updateKioskDevice(deviceId, {
            lastHeartbeatAt: heartbeatNow,
            status: msg.status
          });

          if (ws.readyState === WebSocket.OPEN) {
            const ackMsg: KioskServerHeartbeatAck = {
              type: 'heartbeat_ack',
              timestamp: Date.now()
            };
            ws.send(JSON.stringify(ackMsg));
          }
          return;
        }

        if (msg.type === 'ack') {
          const pending = this.pendingCommands.get(msg.requestId);
          if (pending && pending.deviceId === deviceId) {
            clearTimeout(pending.timer);
            this.pendingCommands.delete(msg.requestId);

            // Update status cache if provided in ack
            if (msg.status) {
              await db.updateKioskDevice(deviceId, {
                status: msg.status,
                lastHeartbeatAt: new Date().toISOString()
              });
            }

            pending.resolve(msg);
          }
          return;
        }
      } catch (err: any) {
        console.warn(`[KioskRelay] Error handling message from device ${deviceId}:`, err?.message || err);
      }
    });

    ws.on('close', () => {
      console.log(`[KioskRelay] Device disconnected: ${deviceId}`);
      this.cleanupSocket(deviceId, ws, pingTimer);
    });

    ws.on('error', (err) => {
      console.warn(`[KioskRelay] Socket error on device ${deviceId}:`, err.message);
      this.cleanupSocket(deviceId, ws, pingTimer);
    });

    // Immediately trigger a status poll on connect
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const cmd: KioskServerCommand = {
          type: 'command',
          requestId: 'init_status_' + Date.now(),
          action: 'status',
          timestamp: Date.now()
        };
        try {
          ws.send(JSON.stringify(cmd));
        } catch {}
      }
    }, 500);
  }

  private cleanupSocket(deviceId: string, ws: WebSocket, timer?: NodeJS.Timeout): void {
    if (this.activeSockets.get(deviceId) === ws) {
      this.activeSockets.delete(deviceId);
    }
    if (timer) {
      clearInterval(timer);
    }
    const storedTimer = this.heartbeatIntervals.get(deviceId);
    if (storedTimer) {
      clearInterval(storedTimer);
      this.heartbeatIntervals.delete(deviceId);
    }

    // Cancel any pending commands waiting for this socket
    for (const [reqId, pending] of this.pendingCommands.entries()) {
      if (pending.deviceId === deviceId) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(reqId);
        pending.reject(new Error('Device disconnected before acknowledging command.'));
      }
    }
  }

  /**
   * Checks if device currently has an open WebSocket connection.
   */
  public isDeviceOnline(deviceId: string): boolean {
    const ws = this.activeSockets.get(deviceId);
    return Boolean(ws && ws.readyState === WebSocket.OPEN);
  }

  /**
   * Returns sanitized device summary suitable for the browser Admin Panel.
   */
  public async getSafeDevices(): Promise<SafeKioskDevice[]> {
    const rawDevices = await db.getKioskDevices();
    return rawDevices.map((d) => {
      const { deviceToken, pairingCode, ...safe } = d;
      const isOnline = this.isDeviceOnline(d.id);
      return {
        ...safe,
        isOnline
      };
    });
  }

  /**
   * Sends an authenticated command to the specified device and awaits execution ack.
   */
  public async sendCommandToDevice(
    deviceId: string,
    action: KioskRemoteAction,
    params: { passcode?: string } = {},
    adminUser: AdminUser
  ): Promise<KioskAgentAck> {
    const device = await db.getKioskDeviceById(deviceId);
    if (!device) {
      throw new Error(`Device "${deviceId}" not found.`);
    }

    const ws = this.activeSockets.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Device "${device.name}" is currently OFFLINE. Ensure TV PC agent is running.`);
    }

    const requestId = 'cmd_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const commandPayload: KioskServerCommand = {
      type: 'command',
      requestId,
      action,
      params,
      timestamp: Date.now()
    };

    return new Promise<KioskAgentAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new Error(`Command timed out: TV PC did not acknowledge within 12 seconds.`));
      }, 12000);

      this.pendingCommands.set(requestId, {
        resolve: async (ack) => {
          // Record successful audit log
          await db.recordAuditLog({
            adminId: adminUser.id,
            username: adminUser.username,
            action: `KIOSK_REMOTE_${action.toUpperCase()}`,
            target: deviceId,
            details: {
              deviceName: device.name,
              action,
              success: ack.success,
              status: ack.status,
              error: ack.error
            }
          });
          resolve(ack);
        },
        reject,
        timer,
        deviceId,
        action,
        sentAt: Date.now()
      });

      try {
        ws.send(JSON.stringify(commandPayload));
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingCommands.delete(requestId);
        reject(new Error(`Failed to transmit command to device: ${err?.message || err}`));
      }
    });
  }

  /**
   * Forcibly closes any active connection for a device (e.g. on revocation).
   */
  public disconnectDevice(deviceId: string): void {
    const ws = this.activeSockets.get(deviceId);
    if (ws) {
      ws.close(1000, 'Device revoked or disconnected by administrator');
      this.cleanupSocket(deviceId, ws);
    }
  }
}

export const kioskRelayManager = new KioskRelayManager();
