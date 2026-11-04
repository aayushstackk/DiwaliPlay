/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../storage';
import { authenticateAdmin, requireRole } from '../auth/middleware';
import { kioskRelayManager } from './kioskRelayManager';
import { KioskRemoteAction, KioskDeviceRecord } from '../../src/types/backend';

export const kioskRelayRouter = Router();

// ============================================================================
// Authenticated Admin Endpoints
// ============================================================================

/**
 * GET /api/kiosk-relay/devices
 * Lists all registered devices with live online status and sanitized fields.
 */
kioskRelayRouter.get('/devices', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const devices = await kioskRelayManager.getSafeDevices();
    res.json({
      success: true,
      devices
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: err?.message || 'Failed to fetch kiosk devices.'
    });
  }
});

/**
 * POST /api/kiosk-relay/pair-request
 * Superadmin initiates pairing from Admin Panel, generating a one-time 6-digit code.
 */
kioskRelayRouter.post(
  '/pair-request',
  authenticateAdmin,
  requireRole(['superadmin']),
  async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim() || 'Diwali TV Display';
      const deviceId = 'kiosk_dev_' + crypto.randomBytes(6).toString('hex');
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

      const newDevice = await db.createKioskDevice({
        id: deviceId,
        name,
        deviceToken: '', // assigned once paired
        pairingCode,
        pairingCodeExpiresAt: expiresAt,
        isPaired: false
      });

      res.json({
        success: true,
        deviceId: newDevice.id,
        pairingCode,
        expiresAt,
        message: 'Pairing code generated. Enter this code on the TV PC setup screen.'
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: 'PAIR_INIT_ERROR',
        message: err?.message || 'Failed to generate pairing code.'
      });
    }
  }
);

/**
 * POST /api/kiosk-relay/pair-claim
 * Superadmin pairs a TV PC that generated and displayed a pairing code on screen.
 */
kioskRelayRouter.post(
  '/pair-claim',
  authenticateAdmin,
  requireRole(['superadmin']),
  async (req: Request, res: Response) => {
    try {
      const rawCode = String(req.body?.pairingCode || '').replace(/\D/g, '').trim();
      const customName = String(req.body?.name || '').trim();

      if (!rawCode || rawCode.length !== 6) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CODE_FORMAT',
          message: 'Please provide a valid 6-digit pairing code.'
        });
      }

      const device = await db.findKioskDeviceByPairingCode(rawCode);
      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'CODE_NOT_FOUND',
          message: 'Invalid or expired pairing code. Please generate a fresh code on the TV PC.'
        });
      }

      // Generate secure permanent device token
      const deviceToken = crypto.randomBytes(32).toString('hex');
      const finalName = customName || device.name || 'Diwali TV Display';

      const updated = await db.updateKioskDevice(device.id, {
        name: finalName,
        deviceToken,
        isPaired: true,
        pairingCode: undefined,
        pairingCodeExpiresAt: undefined,
        lastConnectedAt: new Date().toISOString()
      });

      await db.recordAuditLog({
        adminId: req.adminUser!.id,
        username: req.adminUser!.username,
        action: 'KIOSK_DEVICE_PAIRED',
        target: device.id,
        details: { deviceName: finalName, deviceId: device.id }
      });

      const { deviceToken: _, ...safe } = updated!;
      res.json({
        success: true,
        device: {
          ...safe,
          isOnline: kioskRelayManager.isDeviceOnline(device.id)
        },
        message: `Successfully paired "${finalName}"!`
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: 'CLAIM_ERROR',
        message: err?.message || 'Failed to complete pairing claim.'
      });
    }
  }
);

/**
 * POST /api/kiosk-relay/devices/:deviceId/command
 * Dispatches status, enable, disable, or test-exit command to the remote TV PC.
 */
kioskRelayRouter.post(
  '/devices/:deviceId/command',
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const deviceId = req.params.deviceId;
      const action = req.body?.action as KioskRemoteAction;
      const passcode = String(req.body?.passcode || '').trim();

      const validActions: KioskRemoteAction[] = ['status', 'enable', 'disable', 'test-exit'];
      if (!action || !validActions.includes(action)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ACTION',
          message: `Action must be one of: ${validActions.join(', ')}`
        });
      }

      // Role enforcement: modification commands require superadmin role
      if (['enable', 'disable', 'test-exit'].includes(action)) {
        if (req.adminUser?.role !== 'superadmin') {
          return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Superadmin privileges required to modify kiosk protection settings.'
          });
        }
      }

      // Transmit command to device via persistent WebSocket
      const ack = await kioskRelayManager.sendCommandToDevice(
        deviceId,
        action,
        { passcode },
        req.adminUser!
      );

      res.json({
        success: ack.success,
        accepted: true,
        executed: ack.success,
        requestId: ack.requestId,
        status: ack.status,
        message: ack.message || (ack.success ? 'Command executed successfully on TV PC.' : 'Execution failed.'),
        error: ack.error
      });
    } catch (err: any) {
      const isOffline = err?.message?.includes('OFFLINE');
      res.status(isOffline ? 503 : 500).json({
        success: false,
        accepted: false,
        executed: false,
        error: isOffline ? 'DEVICE_OFFLINE' : 'COMMAND_FAILED',
        message: err?.message || 'Failed to execute remote kiosk command.'
      });
    }
  }
);

/**
 * PATCH /api/kiosk-relay/devices/:deviceId
 * Superadmin updates device friendly name.
 */
kioskRelayRouter.patch(
  '/devices/:deviceId',
  authenticateAdmin,
  requireRole(['superadmin']),
  async (req: Request, res: Response) => {
    try {
      const deviceId = req.params.deviceId;
      const name = String(req.body?.name || '').trim();
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'NAME_REQUIRED',
          message: 'Device name cannot be blank.'
        });
      }

      const updated = await db.updateKioskDevice(deviceId, { name });
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Device not found.'
        });
      }

      const { deviceToken: _, ...safe } = updated;
      res.json({
        success: true,
        device: {
          ...safe,
          isOnline: kioskRelayManager.isDeviceOnline(deviceId)
        }
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: 'UPDATE_ERROR',
        message: err?.message || 'Failed to update device.'
      });
    }
  }
);

/**
 * DELETE /api/kiosk-relay/devices/:deviceId
 * Superadmin revokes and deletes a paired device.
 */
kioskRelayRouter.delete(
  '/devices/:deviceId',
  authenticateAdmin,
  requireRole(['superadmin']),
  async (req: Request, res: Response) => {
    try {
      const deviceId = req.params.deviceId;
      const device = await db.getKioskDeviceById(deviceId);
      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Device not found.'
        });
      }

      // Forcibly close any open WebSocket
      kioskRelayManager.disconnectDevice(deviceId);

      await db.deleteKioskDevice(deviceId);

      await db.recordAuditLog({
        adminId: req.adminUser!.id,
        username: req.adminUser!.username,
        action: 'KIOSK_DEVICE_REVOKED',
        target: deviceId,
        details: { deviceName: device.name, deviceId }
      });

      res.json({
        success: true,
        message: `Device "${device.name}" successfully revoked.`
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: 'DELETE_ERROR',
        message: err?.message || 'Failed to delete device.'
      });
    }
  }
);

// ============================================================================
// Public TV PC Agent Pairing Endpoints
// ============================================================================

/**
 * POST /api/kiosk-relay/device-pair
 * TV PC Agent connects using a code generated by Admin Panel.
 */
kioskRelayRouter.post('/device-pair', async (req: Request, res: Response) => {
  try {
    const rawCode = String(req.body?.pairingCode || '').replace(/\D/g, '').trim();
    const hostname = String(req.body?.hostname || '').trim();

    if (!rawCode || rawCode.length !== 6) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CODE',
        message: 'A 6-digit pairing code is required.'
      });
    }

    const device = await db.findKioskDeviceByPairingCode(rawCode);
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'CODE_NOT_FOUND',
        message: 'Invalid or expired pairing code.'
      });
    }

    const deviceToken = crypto.randomBytes(32).toString('hex');
    const updated = await db.updateKioskDevice(device.id, {
      deviceToken,
      isPaired: true,
      pairingCode: undefined,
      pairingCodeExpiresAt: undefined,
      name: device.name || (hostname ? `TV (${hostname})` : 'Diwali TV Display'),
      lastConnectedAt: new Date().toISOString()
    });

    console.log(`[KioskRelay] Device paired via device-pair: ${device.id} (${updated?.name})`);

    res.json({
      success: true,
      deviceId: device.id,
      deviceToken,
      name: updated?.name,
      message: 'Pairing successful.'
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'PAIR_ERROR',
      message: err?.message || 'Device pairing failed.'
    });
  }
});

/**
 * POST /api/kiosk-relay/device-request-code
 * TV PC Agent requests a 6-digit code to display on its local screen for Admin to claim.
 */
kioskRelayRouter.post('/device-request-code', async (req: Request, res: Response) => {
  try {
    const hostname = String(req.body?.hostname || '').trim();
    const suggestedName = String(req.body?.suggestedName || '').trim() || (hostname ? `TV PC (${hostname})` : 'Diwali TV PC');
    const deviceId = 'kiosk_dev_' + crypto.randomBytes(6).toString('hex');
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.createKioskDevice({
      id: deviceId,
      name: suggestedName,
      deviceToken: '',
      pairingCode,
      pairingCodeExpiresAt: expiresAt,
      isPaired: false
    });

    res.json({
      success: true,
      deviceId,
      pairingCode,
      expiresAt
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'REQUEST_CODE_ERROR',
      message: err?.message || 'Failed to request pairing code.'
    });
  }
});

/**
 * POST /api/kiosk-relay/device-check-pairing
 * TV PC Agent checks if the admin has claimed its requested code.
 */
kioskRelayRouter.post('/device-check-pairing', async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.body?.deviceId || '').trim();
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'DEVICE_ID_REQUIRED' });
    }

    const device = await db.getKioskDeviceById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'DEVICE_NOT_FOUND' });
    }

    if (device.isPaired && device.deviceToken) {
      return res.json({
        success: true,
        paired: true,
        deviceId: device.id,
        deviceToken: device.deviceToken,
        name: device.name
      });
    }

    res.json({
      success: true,
      paired: false
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'CHECK_ERROR',
      message: err?.message || 'Failed to check pairing status.'
    });
  }
});
