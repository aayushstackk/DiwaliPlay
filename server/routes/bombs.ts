/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { db } from '../storage';
import { authenticateAdmin, requireRole } from '../auth/middleware';
import { BombConfig, BombGameSettings } from '../../src/types/backend';

export const bombsRouter = Router();

// ============================================================================
// Public Bomb Data (for Gameplay Client)
// ============================================================================
bombsRouter.get('/bombs', async (_req: Request, res: Response) => {
  try {
    const [bombs, settings] = await Promise.all([
      db.getBombConfigs(false), // only active
      db.getBombGameSettings()
    ]);

    res.json({
      success: true,
      bombs,
      settings
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public read-only endpoint for bomb game settings
bombsRouter.get('/bombs/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await db.getBombGameSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// Admin Bomb Management Endpoints
// Note: Literal sub-paths (/settings) MUST be defined BEFORE wildcard /:id routes
// to avoid Express capturing 'settings' as a bomb ID.
// ============================================================================

// List all bombs (including inactive) + settings
bombsRouter.get('/admin/bombs', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const [bombs, settings] = await Promise.all([
      db.getBombConfigs(true), // include inactive
      db.getBombGameSettings()
    ]);

    res.json({
      success: true,
      bombs,
      settings
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get bomb game settings (literal route before :id)
bombsRouter.get('/admin/bombs/settings', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const settings = await db.getBombGameSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update bomb game settings (literal route before :id)
bombsRouter.put(
  '/admin/bombs/settings',
  authenticateAdmin,
  requireRole(['superadmin', 'operator']),
  async (req: Request, res: Response) => {
    try {
      const updates: Partial<BombGameSettings> = req.body || {};

      if (updates.minSpawnDelayMs !== undefined) {
        updates.minSpawnDelayMs = Math.max(200, Math.min(10000, Number(updates.minSpawnDelayMs) || 700));
      }
      if (updates.maxSpawnDelayMs !== undefined) {
        updates.maxSpawnDelayMs = Math.max(
          updates.minSpawnDelayMs || 500,
          Math.min(15000, Number(updates.maxSpawnDelayMs) || 1600)
        );
      }
      if (updates.maxConcurrentBombs !== undefined) {
        updates.maxConcurrentBombs = Math.max(1, Math.min(8, Number(updates.maxConcurrentBombs) || 3));
      }
      if (updates.bombRadius !== undefined) {
        updates.bombRadius = Math.max(30, Math.min(120, Number(updates.bombRadius) || 52));
      }
      if (updates.bombLifetimeMs !== undefined) {
        updates.bombLifetimeMs = Math.max(2000, Math.min(20000, Number(updates.bombLifetimeMs) || 5500));
      }
      if (updates.launchSpeedMultiplier !== undefined) {
        updates.launchSpeedMultiplier = Math.max(0.8, Math.min(2.5, Number(updates.launchSpeedMultiplier) || 1.45));
      }
      if (updates.gravityMultiplier !== undefined) {
        updates.gravityMultiplier = Math.max(0.8, Math.min(2.5, Number(updates.gravityMultiplier) || 1.45));
      }
      if (updates.maxBurstSize !== undefined) {
        updates.maxBurstSize = Math.max(1, Math.min(3, Number(updates.maxBurstSize) || 3));
      }
      if (updates.burstIntervalMs !== undefined) {
        updates.burstIntervalMs = Math.max(50, Math.min(300, Number(updates.burstIntervalMs) || 75));
      }

      const updated = await db.updateBombGameSettings(updates);

      if (req.adminUser) {
        await db.recordAuditLog({
          adminId: req.adminUser.id,
          username: req.adminUser.username,
          action: 'UPDATE_BOMB_SETTINGS',
          details: { updates },
          ip: req.ip
        });
      }

      res.json({
        success: true,
        settings: updated,
        message: 'Bomb game settings updated successfully.'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Create new bomb configuration
bombsRouter.post(
  '/admin/bombs',
  authenticateAdmin,
  requireRole(['superadmin', 'operator']),
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        color,
        points,
        spawnWeight,
        soundPreset,
        soundAssetId,
        soundUrl,
        imagePreset,
        imageAssetId,
        imageUrl,
        isActive
      } = req.body || {};

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Bomb name is required.' });
      }

      if (typeof points !== 'number' || isNaN(points)) {
        return res.status(400).json({ success: false, message: 'Bomb points must be a valid number.' });
      }

      const newBomb = await db.createBombConfig({
        name: name.trim(),
        color: color || '#EF4444',
        points: Math.round(points),
        spawnWeight: Math.max(1, Math.min(100, Number(spawnWeight) || 5)),
        soundPreset: soundPreset || 'pop',
        soundAssetId: soundAssetId || null,
        soundUrl: soundUrl || null,
        imagePreset: imagePreset || 'red_classic',
        imageAssetId: imageAssetId || null,
        imageUrl: imageUrl || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        isDefault: false
      });

      if (req.adminUser) {
        await db.recordAuditLog({
          adminId: req.adminUser.id,
          username: req.adminUser.username,
          action: 'CREATE_BOMB',
          target: newBomb.id,
          details: { name: newBomb.name, points: newBomb.points, color: newBomb.color },
          ip: req.ip
        });
      }

      res.status(201).json({
        success: true,
        bomb: newBomb,
        message: `Bomb "${newBomb.name}" created successfully.`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Get single bomb by ID
bombsRouter.get('/admin/bombs/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bomb = await db.getBombConfigById(id);
    if (!bomb || bomb.isDeleted) {
      return res.status(404).json({ success: false, message: 'Bomb configuration not found.' });
    }
    res.json({ success: true, bomb });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update existing bomb configuration
bombsRouter.put(
  '/admin/bombs/:id',
  authenticateAdmin,
  requireRole(['superadmin', 'operator']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates: Partial<BombConfig> = req.body || {};

      if (updates.name !== undefined) {
        if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
          return res.status(400).json({ success: false, message: 'Bomb name cannot be empty.' });
        }
        updates.name = updates.name.trim();
      }

      if (updates.points !== undefined) {
        if (typeof updates.points !== 'number' || isNaN(updates.points)) {
          return res.status(400).json({ success: false, message: 'Bomb points must be a valid number.' });
        }
        updates.points = Math.round(updates.points);
      }

      if (updates.spawnWeight !== undefined) {
        updates.spawnWeight = Math.max(1, Math.min(100, Number(updates.spawnWeight) || 5));
      }

      const updated = await db.updateBombConfig(id, updates);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Bomb configuration not found.' });
      }

      if (req.adminUser) {
        await db.recordAuditLog({
          adminId: req.adminUser.id,
          username: req.adminUser.username,
          action: 'UPDATE_BOMB',
          target: id,
          details: { updates: Object.keys(updates) },
          ip: req.ip
        });
      }

      res.json({
        success: true,
        bomb: updated,
        message: `Bomb "${updated.name}" updated successfully.`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Delete / deactivate bomb configuration
bombsRouter.delete(
  '/admin/bombs/:id',
  authenticateAdmin,
  requireRole(['superadmin', 'operator']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      console.log(`[BombDelete Server] Step 3: Received DELETE /api/admin/bombs/${id}`, {
        adminUser: req.adminUser?.username,
        role: req.adminUser?.role,
        ip: req.ip
      });

      const existing = await db.getBombConfigById(id);
      console.log(`[BombDelete Server] Existing record for ${id}:`, {
        found: Boolean(existing),
        id: existing?.id,
        name: existing?.name,
        isDefault: existing?.isDefault,
        isActive: existing?.isActive,
        isDeleted: existing?.isDeleted
      });

      if (!existing || existing.isDeleted) {
        console.warn(`[BombDelete Server] Bomb ${id} not found or already deleted.`);
        return res.status(404).json({ success: false, message: 'Bomb not found or already deleted.' });
      }

      const deleted = await db.deleteBombConfig(id);
      if (!deleted) {
        console.error(`[BombDelete Server] Storage delete operation returned false for bomb ${id}.`);
        return res.status(500).json({ success: false, message: 'Failed to delete bomb configuration in storage.' });
      }

      if (req.adminUser) {
        await db.recordAuditLog({
          adminId: req.adminUser.id,
          username: req.adminUser.username,
          action: 'DELETE_BOMB',
          target: id,
          details: { name: existing.name, isDefault: Boolean(existing.isDefault) },
          ip: req.ip
        });
      }

      const responsePayload = {
        success: true,
        bombId: id,
        name: existing.name,
        isDefault: Boolean(existing.isDefault),
        action: existing.isDefault ? 'soft_deleted' : 'permanently_deleted',
        message: `Bomb "${existing.name}" ${existing.isDefault ? 'disabled and archived' : 'deleted'} successfully.`
      };

      console.log(`[BombDelete Server] Step 4: Responding HTTP 200:`, responsePayload);
      res.json(responsePayload);
    } catch (err: any) {
      console.error(`[BombDelete Server] Exception in DELETE handler for ${req.params.id}:`, err?.message);
      res.status(500).json({ success: false, message: err.message || 'Internal error deleting bomb' });
    }
  }
);

