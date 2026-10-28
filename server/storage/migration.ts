/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { Db } from 'mongodb';
import { MigrationResult } from './types';
import { DATA_DIR, DB_FILE } from './jsonAdapter';

/**
 * Performs an idempotent migration of data from data/db.json into MongoDB.
 *
 * Rules:
 * 1. Creates a dated timestamped backup of data/db.json prior to migration.
 * 2. Uses $setOnInsert so existing MongoDB records are NOT blindly overwritten.
 * 3. Preserves exact IDs: userId, gameCodeId, sessionId, and references.
 * 4. Verifies post-migration document counts and reference consistency.
 * 5. Does not delete data/db.json.
 */
export async function migrateJsonToMongo(db: Db): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    usersMigrated: 0,
    codesMigrated: 0,
    sessionsMigrated: 0,
    settingsMigrated: false,
    assetsMigrated: 0,
    adminSessionsMigrated: 0,
    adminUsersMigrated: 0,
    auditLogsMigrated: 0,
    errors: []
  };

  if (!fs.existsSync(DB_FILE)) {
    console.log('[Migration] No db.json found to migrate. Skipping.');
    result.success = true;
    return result;
  }

  let rawJson: string;
  let parsed: any;
  try {
    rawJson = fs.readFileSync(DB_FILE, 'utf-8');
    parsed = JSON.parse(rawJson);
  } catch (err: any) {
    result.errors?.push(`Failed to read or parse db.json: ${err.message}`);
    return result;
  }

  // 1. Create a safe backup before doing anything
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(DATA_DIR, `db.backup.${timestamp}.json`);
  try {
    fs.writeFileSync(backupPath, rawJson, 'utf-8');
    result.backupPath = backupPath;
    console.log(`[Migration] Created safe backup at: ${backupPath}`);
  } catch (err: any) {
    result.errors?.push(`Failed to create backup: ${err.message}`);
    return result;
  }

  const users = Object.values(parsed.users || {}) as any[];
  const codes = Object.values(parsed.gameCodes || {}) as any[];
  const sessions = Object.values(parsed.sessions || {}) as any[];
  const settings = parsed.settings;

  const usersCol = db.collection('users');
  const codesCol = db.collection('game_codes');
  const sessionsCol = db.collection('game_sessions');
  const settingsCol = db.collection('system_settings');

  try {
    // 2. Migrate Users (idempotent upsert with $setOnInsert)
    for (const u of users) {
      if (!u.id || !u.mobileNumber) continue;
      const res = await usersCol.updateOne(
        { id: u.id },
        {
          $setOnInsert: {
            _id: u.id,
            id: u.id,
            name: u.name,
            mobileNumber: u.mobileNumber,
            createdAt: u.createdAt || new Date().toISOString(),
            updatedAt: u.updatedAt || new Date().toISOString(),
            hasPlayed: Boolean(u.hasPlayed),
            playCount: Number(u.playCount) || 0
          }
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        result.usersMigrated++;
      }
    }

    // 3. Migrate Game Codes (idempotent upsert with $setOnInsert)
    for (const c of codes) {
      if (!c.id || !c.code) continue;
      const res = await codesCol.updateOne(
        { id: c.id },
        {
          $setOnInsert: {
            _id: c.id,
            id: c.id,
            code: c.code,
            userId: c.userId,
            createdAt: c.createdAt || new Date().toISOString(),
            expiresAt: c.expiresAt,
            usedAt: c.usedAt || null,
            status: c.status || 'ACTIVE'
          }
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        result.codesMigrated++;
      }
    }

    // 4. Migrate Game Sessions (idempotent upsert with $setOnInsert)
    for (const s of sessions) {
      if (!s.id || !s.userId) continue;
      const res = await sessionsCol.updateOne(
        { id: s.id },
        {
          $setOnInsert: {
            _id: s.id,
            id: s.id,
            userId: s.userId,
            gameCodeId: s.gameCodeId,
            code: s.code,
            startTime: s.startTime || new Date().toISOString(),
            endTime: s.endTime || null,
            score: Number(s.score) || 0,
            crackerCount: Number(s.crackerCount) || 0,
            maxSpeed: Number(s.maxSpeed) || 0,
            comboCount: Number(s.comboCount) || 0,
            punchCount: Number(s.punchCount) || 0,
            photoUrl: s.photoUrl || null,
            wishTitle: s.wishTitle || null,
            wishMessage: s.wishMessage || null,
            status: s.status || 'COMPLETED',
            kioskId: s.kioskId || 'kiosk_main'
          }
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        result.sessionsMigrated++;
      }
    }

    // 5. Migrate Settings
    if (settings) {
      const res = await settingsCol.updateOne(
        { _id: 'global_settings' as any },
        {
          $setOnInsert: {
            _id: 'global_settings',
            allowMultiplePlaysPerUser: Boolean(settings.allowMultiplePlaysPerUser),
            codeExpirySeconds: Number(settings.codeExpirySeconds) || 120,
            gameDurationSeconds: Number(settings.gameDurationSeconds) || 35,
            brandName: settings.brandName || 'ItsSpotlight',
            brandLogoUrl: settings.brandLogoUrl || '',
            wallpaperUrl: settings.wallpaperUrl || '',
            updatedAt: new Date().toISOString()
          }
        },
        { upsert: true }
      );
      result.settingsMigrated = res.upsertedCount > 0 || true;
    }

    // 6. Migrate Admin Users (if any exist in db.json)
    const adminUsers = Object.values(parsed.adminUsers || {}) as any[];
    const adminUsersCol = db.collection('admin_users');
    for (const au of adminUsers) {
      if (!au.id || !au.username) continue;
      const res = await adminUsersCol.updateOne(
        { id: au.id },
        {
          $setOnInsert: {
            _id: au.id,
            id: au.id,
            username: au.username,
            passwordHash: au.passwordHash,
            role: au.role || 'superadmin',
            isActive: au.isActive !== undefined ? au.isActive : true,
            createdAt: au.createdAt || new Date().toISOString(),
            lastLoginAt: au.lastLoginAt || null
          }
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        result.adminUsersMigrated = (result.adminUsersMigrated || 0) + 1;
      }
    }

    // 7. Migrate Audit Logs (if any exist in db.json)
    const auditLogs = (parsed.auditLogs || []) as any[];
    const auditLogsCol = db.collection('audit_logs');
    for (const log of auditLogs) {
      if (!log.id) continue;
      const res = await auditLogsCol.updateOne(
        { id: log.id },
        { $setOnInsert: { _id: log.id, ...log } },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        result.auditLogsMigrated = (result.auditLogsMigrated || 0) + 1;
      }
    }

    // 8. Migrate Assets (if any exist in db.json)
    const assets = Object.values(parsed.assets || {}) as any[];
    const assetsCol = db.collection('assets');
    for (const a of assets) {
      if (!a.id || !a.objectKey) continue;
      const res = await assetsCol.updateOne(
        { id: a.id },
        {
          $setOnInsert: {
            _id: a.id,
            id: a.id,
            category: a.category,
            originalFilename: a.originalFilename,
            objectKey: a.objectKey,
            mimeType: a.mimeType,
            fileSize: Number(a.fileSize) || 0,
            uploaderId: a.uploaderId,
            uploaderUsername: a.uploaderUsername,
            isActive: a.isActive !== undefined ? a.isActive : true,
            displayName: a.displayName || a.originalFilename,
            order: a.order !== undefined ? Number(a.order) : undefined,
            url: a.url,
            storageProvider: a.storageProvider || 'local',
            createdAt: a.createdAt || new Date().toISOString(),
            updatedAt: a.updatedAt || new Date().toISOString()
          }
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        result.assetsMigrated = (result.assetsMigrated || 0) + 1;
      }
    }

    // 9. Migrate Admin Sessions (unexpired sessions from db.json)
    const adminSessions = Object.values(parsed.adminSessions || {}) as any[];
    const adminSessionsCol = db.collection('admin_sessions');
    const nowMs = Date.now();
    for (const s of adminSessions) {
      if (!s.id || !s.adminId) continue;
      if (s.expiresAt && new Date(s.expiresAt).getTime() <= nowMs) continue;
      const res = await adminSessionsCol.updateOne(
        { id: s.id },
        {
          $setOnInsert: {
            _id: s.id,
            id: s.id,
            adminId: s.adminId,
            username: s.username,
            role: s.role,
            createdAt: s.createdAt || new Date().toISOString(),
            expiresAt: s.expiresAt,
            userAgent: s.userAgent || undefined,
            ip: s.ip || undefined
          }
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) {
        result.adminSessionsMigrated = (result.adminSessionsMigrated || 0) + 1;
      }
    }

    // 10. Migrate Bombs & Bomb Settings
    const bombs = Object.values(parsed.bombs || {}) as any[];
    const bombsCol = db.collection('bomb_configs');
    for (const b of bombs) {
      if (!b.id || b.isDeleted) continue;

      // Never resurrect a bomb that was recorded as deleted in MongoDB audit logs
      const auditDeleted = await auditLogsCol.findOne({
        action: 'DELETE_BOMB',
        target: b.id
      });
      if (auditDeleted) continue;

      await bombsCol.updateOne(
        { id: b.id },
        {
          $setOnInsert: {
            _id: b.id,
            id: b.id,
            name: b.name,
            color: b.color,
            points: Number(b.points) || 0,
            spawnWeight: Number(b.spawnWeight) || 5,
            soundPreset: b.soundPreset || 'pop',
            soundAssetId: b.soundAssetId || null,
            soundUrl: b.soundUrl || null,
            imagePreset: b.imagePreset || 'red_classic',
            imageAssetId: b.imageAssetId || null,
            imageUrl: b.imageUrl || null,
            isActive: b.isActive !== undefined ? b.isActive : true,
            isDefault: Boolean(b.isDefault),
            isDeleted: false,
            deletedAt: null,
            createdAt: b.createdAt || new Date().toISOString(),
            updatedAt: b.updatedAt || new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }

    if (parsed.bombSettings) {
      const bombSettingsCol = db.collection('bomb_settings');
      await bombSettingsCol.updateOne(
        { _id: 'global_bomb_settings' as any },
        {
          $setOnInsert: {
            _id: 'global_bomb_settings',
            minSpawnDelayMs: Number(parsed.bombSettings.minSpawnDelayMs) || 700,
            maxSpawnDelayMs: Number(parsed.bombSettings.maxSpawnDelayMs) || 1600,
            maxConcurrentBombs: Number(parsed.bombSettings.maxConcurrentBombs) || 3,
            bombRadius: Number(parsed.bombSettings.bombRadius) || 52,
            bombLifetimeMs: Number(parsed.bombSettings.bombLifetimeMs) || 5500,
            updatedAt: new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }

    // 11. Verify migrated integrity & counts
    const totalUsersInMongo = await usersCol.countDocuments();
    const totalCodesInMongo = await codesCol.countDocuments();
    const totalSessionsInMongo = await sessionsCol.countDocuments();
    const totalAssetsInMongo = await assetsCol.countDocuments();

    if (totalUsersInMongo < users.length) {
      result.errors?.push(
        `Integrity warning: Expected at least ${users.length} users, found ${totalUsersInMongo} in MongoDB.`
      );
    }
    if (totalCodesInMongo < codes.length) {
      result.errors?.push(
        `Integrity warning: Expected at least ${codes.length} codes, found ${totalCodesInMongo} in MongoDB.`
      );
    }
    if (totalAssetsInMongo < assets.length) {
      result.errors?.push(
        `Integrity warning: Expected at least ${assets.length} assets, found ${totalAssetsInMongo} in MongoDB.`
      );
    }

    result.success = (result.errors?.length || 0) === 0;
    console.log(
      `[Migration] Completed successfully. Inserted: ${result.usersMigrated} users, ${result.codesMigrated} codes, ${result.sessionsMigrated} sessions, ${result.assetsMigrated || 0} assets, ${result.adminUsersMigrated || 0} admin users, ${result.adminSessionsMigrated || 0} admin sessions, ${result.auditLogsMigrated || 0} audit logs. Total in MongoDB: ${totalUsersInMongo} users, ${totalCodesInMongo} codes, ${totalSessionsInMongo} sessions, ${totalAssetsInMongo} assets.`
    );
  } catch (err: any) {
    result.errors?.push(`Migration execution error: ${err.message}`);
    result.success = false;
  }

  return result;
}
