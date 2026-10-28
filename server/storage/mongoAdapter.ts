/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MongoClient, Db, Collection } from 'mongodb';
import {
  User,
  GameCode,
  GameSession,
  SystemSettings,
  LeaderboardEntry,
  AdminOverviewStats,
  AdminUser,
  AdminSession,
  AdminAuditLog,
  AssetRecord,
  AssetCategory,
  TRIAL_CODE,
  GameFeedback,
  BombConfig,
  BombGameSettings
} from '../../src/types/backend';
import { StorageAdapter, CompleteSessionParams } from './types';
import { DEFAULT_BOMB_CONFIGS, DEFAULT_BOMB_SETTINGS } from './defaultBombs';
import { DEFAULT_AUDIO_SETTINGS } from '../../src/utils/audioDefaults';

const DEFAULT_SETTINGS: SystemSettings = {
  allowMultiplePlaysPerUser: false,
  codeExpirySeconds: 120, // 2 minutes
  gameDurationSeconds: 35,
  brandName: 'ItsSpotlight',
  brandLogoUrl: '',
  wallpaperUrl: '',
  experienceTitle: 'DIWALI FUN PLAY',
  connectorText: 'by',
  logoWidth: 160,
  logoHeight: 48,
  logoPosition: { x: 0, y: 0 },
  wallpaperOpacity: 100,
  wallpaperEnabled: true,
  gameplayMode: 'camera',
  targetScoreEnabled: false,
  targetScore: 5000,
  audioSettings: DEFAULT_AUDIO_SETTINGS
};

export class MongoStorageAdapter implements StorageAdapter {
  private client: MongoClient;
  private db!: Db;
  private uri: string;
  private dbName?: string;

  private usersCol!: Collection<User>;
  private codesCol!: Collection<GameCode>;
  private sessionsCol!: Collection<GameSession>;
  private settingsCol!: Collection<any>;
  private adminUsersCol!: Collection<AdminUser>;
  private adminSessionsCol!: Collection<AdminSession>;
  private auditLogsCol!: Collection<AdminAuditLog>;
  private assetsCol!: Collection<AssetRecord>;
  private bombsCol!: Collection<BombConfig>;
  private bombSettingsCol!: Collection<any>;

  constructor(uri: string, dbName?: string) {
    this.uri = uri;
    this.dbName = dbName;
    this.client = new MongoClient(this.uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
  }

  public getType(): 'json' | 'mongodb' {
    return 'mongodb';
  }

  public async init(): Promise<void> {
    try {
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MongoDB connection timeout (5000ms reached)')), 5000)
        )
      ]);
      this.db = this.client.db(this.dbName || undefined);

      this.usersCol = this.db.collection<User>('users');
      this.codesCol = this.db.collection<GameCode>('game_codes');
      this.sessionsCol = this.db.collection<GameSession>('game_sessions');
      this.settingsCol = this.db.collection<any>('system_settings');
      this.adminUsersCol = this.db.collection<AdminUser>('admin_users');
      this.adminSessionsCol = this.db.collection<AdminSession>('admin_sessions');
      this.auditLogsCol = this.db.collection<AdminAuditLog>('audit_logs');
      this.assetsCol = this.db.collection<AssetRecord>('assets');
      this.bombsCol = this.db.collection<BombConfig>('bomb_configs');
      this.bombSettingsCol = this.db.collection<any>('bomb_settings');

      // Create necessary indexes for performance and data integrity
      await Promise.all([
        this.usersCol.createIndex({ id: 1 }, { unique: true }),
        this.usersCol.createIndex({ mobileNumber: 1 }, { unique: true }),
        this.codesCol.createIndex({ id: 1 }, { unique: true }),
        this.codesCol.createIndex({ code: 1, status: 1 }),
        this.codesCol.createIndex({ userId: 1, status: 1 }),
        this.sessionsCol.createIndex({ id: 1 }, { unique: true }),
        this.sessionsCol.createIndex({ gameCodeId: 1 }),
        this.sessionsCol.createIndex({ userId: 1 }),
        this.sessionsCol.createIndex({ status: 1, score: -1 }),
        this.adminUsersCol.createIndex({ id: 1 }, { unique: true }),
        this.adminUsersCol.createIndex({ username: 1 }, { unique: true }),
        this.adminSessionsCol.createIndex({ id: 1 }, { unique: true }),
        this.adminSessionsCol.createIndex({ expiresAt: 1 }),
        this.adminSessionsCol.createIndex({ adminId: 1 }),
        this.auditLogsCol.createIndex({ timestamp: -1 }),
        this.auditLogsCol.createIndex({ adminId: 1 }),
        this.assetsCol.createIndex({ id: 1 }, { unique: true }),
        this.assetsCol.createIndex({ objectKey: 1 }, { unique: true }),
        this.assetsCol.createIndex({ category: 1, createdAt: -1 }),
        this.bombsCol.createIndex({ id: 1 }, { unique: true }),
        this.bombsCol.createIndex({ isActive: 1 })
      ]);

      // Ensure global settings document exists
      const existingSettings = await this.settingsCol.findOne({ _id: 'global_settings' as any });
      if (!existingSettings) {
        await this.settingsCol.insertOne({
          _id: 'global_settings',
          ...DEFAULT_SETTINGS,
          updatedAt: new Date().toISOString()
        });
      }

      // Ensure default bomb configs exist if collection is empty
      const bombCount = await this.bombsCol.countDocuments();
      if (bombCount === 0) {
        await this.bombsCol.insertMany(DEFAULT_BOMB_CONFIGS.map((b) => ({ ...b })));
      }

      // Ensure global bomb settings document exists
      const existingBombSettings = await this.bombSettingsCol.findOne({ _id: 'global_bomb_settings' as any });
      if (!existingBombSettings) {
        await this.bombSettingsCol.insertOne({
          _id: 'global_bomb_settings',
          ...DEFAULT_BOMB_SETTINGS,
          updatedAt: new Date().toISOString()
        });
      }

      // Safe idempotent cleanup of historical deleted bombs:
      // If any audit log recorded action === 'DELETE_BOMB', ensure the target bomb is either marked
      // as isDeleted: true or permanently removed (if unreferenced custom bomb)
      try {
        const deleteAuditLogs = await this.auditLogsCol.find({ action: 'DELETE_BOMB' }).toArray();
        for (const log of deleteAuditLogs) {
          if (!log.target) continue;
          const targetBomb = await this.bombsCol.findOne({ id: log.target });
          if (targetBomb && !targetBomb.isDeleted) {
            const isRef = await this.isBombReferenced(log.target);
            const deletedAt = log.timestamp || new Date().toISOString();
            if (targetBomb.isDefault || isRef) {
              await this.bombsCol.updateOne(
                { id: log.target },
                { $set: { isDeleted: true, isActive: false, deletedAt, updatedAt: deletedAt } }
              );
              this.syncDeleteToJson(log.target, true, deletedAt);
            } else {
              await this.bombsCol.deleteOne({ id: log.target });
              this.syncDeleteToJson(log.target, false, deletedAt);
            }
          }
        }
      } catch (cleanupErr: any) {
        console.warn('[Storage] Historical bomb cleanup notice:', cleanupErr?.message);
      }
    } catch (err: any) {
      const sanitizedMsg = err?.message?.replace(/\/\/.*@/, '//***:***@') || String(err);
      throw new Error(`[MongoDB] Connection/Initialization failed: ${sanitizedMsg}`);
    }
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  public getDb(): Db {
    return this.db;
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  public async getSettings(): Promise<SystemSettings> {
    const doc = await this.settingsCol.findOne({ _id: 'global_settings' });
    if (!doc) {
      return { ...DEFAULT_SETTINGS };
    }
    const { _id, ...rest } = doc;
    return { ...DEFAULT_SETTINGS, ...rest };
  }

  public async updateSettings(partial: Partial<SystemSettings>): Promise<SystemSettings> {
    const current = await this.getSettings();
    const next = { ...current, ...partial, updatedAt: new Date().toISOString() };

    await this.settingsCol.updateOne(
      { _id: 'global_settings' },
      { $set: next },
      { upsert: true }
    );

    return this.getSettings();
  }

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------
  private normalizeMobile(mobile: string): string {
    const digits = mobile.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    return digits;
  }

  public async findUserById(id: string): Promise<User | undefined> {
    const doc = await this.usersCol.findOne({ id });
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as User;
  }

  public async findUserByMobile(mobile: string): Promise<User | undefined> {
    const normalized = this.normalizeMobile(mobile);
    const doc = await this.usersCol.findOne({ mobileNumber: normalized });
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as User;
  }

  public async createUser(name: string, mobileNumber: string): Promise<User> {
    const normalized = this.normalizeMobile(mobileNumber);
    const now = new Date().toISOString();
    const id = `usr_${crypto.randomUUID().slice(0, 8)}`;

    const user: User = {
      id,
      name: name.trim(),
      mobileNumber: normalized,
      createdAt: now,
      updatedAt: now,
      hasPlayed: false,
      playCount: 0
    };

    await this.usersCol.insertOne({
      _id: id,
      ...user
    } as any);

    return user;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const now = new Date().toISOString();
    const cleanUpdates = { ...updates, updatedAt: now };
    if (cleanUpdates.mobileNumber) {
      cleanUpdates.mobileNumber = this.normalizeMobile(cleanUpdates.mobileNumber);
    }

    await this.usersCol.updateOne(
      { id },
      { $set: cleanUpdates }
    );

    return this.findUserById(id);
  }

  public async getAllUsers(): Promise<User[]> {
    const docs = await this.usersCol.find({}).toArray();
    return docs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as User;
    });
  }

  public async deleteUser(id: string): Promise<boolean> {
    await this.codesCol.deleteMany({ userId: id });
    const res = await this.usersCol.deleteOne({ id });
    return res.deletedCount > 0;
  }

  public async deleteAllUsers(): Promise<number> {
    await this.codesCol.deleteMany({});
    const res = await this.usersCol.deleteMany({});
    return res.deletedCount || 0;
  }

  // --------------------------------------------------------------------------
  // Game Codes (4-Digit Unique)
  // --------------------------------------------------------------------------
  public async findActiveCodeForUser(userId: string): Promise<GameCode | undefined> {
    const doc = await this.codesCol.findOne({ userId, status: 'ACTIVE' });
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as GameCode;
  }

  public async findLatestCodeForUser(userId: string): Promise<GameCode | undefined> {
    const active = await this.findActiveCodeForUser(userId);
    if (active) return active;

    const doc = await this.codesCol.find({ userId }).sort({ createdAt: -1 }).limit(1).toArray();
    if (!doc || doc.length === 0) return undefined;
    const { _id, ...clean } = doc[0] as any;
    return clean as GameCode;
  }

  public async findCodeByCodeString(codeString: string): Promise<GameCode | undefined> {
    const cleanCode = codeString.trim();
    // First look for active code
    let doc = await this.codesCol.findOne({ code: cleanCode, status: 'ACTIVE' });
    if (!doc) {
      // Fallback to any code with that string
      doc = await this.codesCol.findOne({ code: cleanCode });
    }
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as GameCode;
  }

  private async generateUnique4DigitCode(): Promise<string> {
    for (let attempts = 0; attempts < 10000; attempts++) {
      const num = Math.floor(1000 + Math.random() * 9000);
      const candidate = num.toString();
      if (candidate === TRIAL_CODE) continue; // Reserved special trial code
      const existing = await this.codesCol.findOne({ code: candidate, status: 'ACTIVE' });
      if (!existing) {
        return candidate;
      }
    }
    throw new Error('Unable to generate unique 4-digit code: active code capacity reached');
  }

  public async createGameCode(userId: string): Promise<GameCode> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const code = await this.generateUnique4DigitCode();
    const id = `code_${crypto.randomUUID().slice(0, 8)}`;

    const record: GameCode = {
      id,
      code,
      userId,
      createdAt: now.toISOString(),
      expiresAt,
      usedAt: null,
      status: 'ACTIVE'
    };

    await this.codesCol.insertOne({
      _id: id,
      ...record
    } as any);

    return record;
  }

  public async markCodeUsed(codeId: string): Promise<GameCode | undefined> {
    const now = new Date().toISOString();
    await this.codesCol.updateOne(
      { id: codeId },
      { $set: { status: 'USED', usedAt: now } }
    );

    const doc = await this.codesCol.findOne({ id: codeId });
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as GameCode;
  }

  public async deleteGameCode(codeId: string): Promise<boolean> {
    const res = await this.codesCol.deleteOne({ id: codeId });
    return res.deletedCount > 0;
  }

  // --------------------------------------------------------------------------
  // Game Sessions
  // --------------------------------------------------------------------------
  public async createSession(
    userId: string,
    gameCodeId: string,
    code: string,
    kioskId?: string
  ): Promise<GameSession> {
    const id = `sess_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const session: GameSession = {
      id,
      userId,
      gameCodeId,
      code,
      startTime: now,
      endTime: null,
      score: 0,
      crackerCount: 0,
      maxSpeed: 0,
      comboCount: 0,
      punchCount: 0,
      photoUrl: null,
      wishTitle: null,
      wishMessage: null,
      status: 'PLAYING',
      kioskId: kioskId || 'kiosk_main'
    };

    await this.sessionsCol.insertOne({
      _id: id,
      ...session
    } as any);

    return session;
  }

  public async getSessionById(sessionId: string): Promise<GameSession | undefined> {
    const doc = await this.sessionsCol.findOne({ id: sessionId });
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as GameSession;
  }

  public async findSessionByGameCodeId(gameCodeId: string): Promise<GameSession | undefined> {
    const doc = await this.sessionsCol.findOne({ gameCodeId });
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as GameSession;
  }

  public async completeSession(
    sessionId: string,
    data: CompleteSessionParams
  ): Promise<{ session: GameSession; user: User }> {
    const existingSession = await this.getSessionById(sessionId);
    if (!existingSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = new Date().toISOString();
    const isAlreadyCompleted = existingSession.status === 'COMPLETED';

    const updates: Partial<GameSession> = {
      endTime: existingSession.endTime || now,
      score: data.score,
      crackerCount: data.crackerCount,
      maxSpeed: data.maxSpeed,
      comboCount: data.comboCount,
      punchCount: data.punchCount,
      status: 'COMPLETED'
    };

    if (data.photoData) updates.photoUrl = data.photoData;
    if (data.wishTitle) updates.wishTitle = data.wishTitle;
    if (data.wishMessage) updates.wishMessage = data.wishMessage;
    if (data.feedback) updates.feedback = data.feedback;
    if (typeof data.combosCount === 'number') updates.combosCount = data.combosCount;
    if (typeof data.penaltyDeductions === 'number') updates.penaltyDeductions = data.penaltyDeductions;
    if (typeof data.comboBonusPoints === 'number') updates.comboBonusPoints = data.comboBonusPoints;
    if (typeof data.targetScore === 'number') updates.targetScore = data.targetScore;
    if (typeof data.targetAchieved === 'boolean') updates.targetAchieved = data.targetAchieved;

    await this.sessionsCol.updateOne(
      { id: sessionId },
      { $set: updates }
    );

    // Update player stats idempotently
    const userDoc = await this.findUserById(existingSession.userId);
    if (userDoc) {
      const userUpdates: Partial<User> = {
        hasPlayed: true,
        updatedAt: now
      };
      if (data.feedback) {
        userUpdates.feedback = data.feedback;
      }
      if (!isAlreadyCompleted) {
        userUpdates.playCount = (userDoc.playCount || 0) + 1;
      }
      await this.updateUser(userDoc.id, userUpdates);
    }

    const updatedSession = (await this.getSessionById(sessionId)) || existingSession;
    const updatedUser = (await this.findUserById(existingSession.userId)) || {
      id: existingSession.userId,
      name: 'Player',
      mobileNumber: '',
      createdAt: now,
      updatedAt: now,
      hasPlayed: true,
      playCount: 1
    };

    return { session: updatedSession, user: updatedUser };
  }

  public async updateSessionFeedback(
    sessionId: string,
    feedback: GameFeedback
  ): Promise<{ session: GameSession; user: User } | undefined> {
    const session = await this.getSessionById(sessionId);
    if (!session) return undefined;

    await this.sessionsCol.updateOne(
      { id: sessionId },
      { $set: { feedback } }
    );

    let user: User | undefined;
    if (session.userId) {
      user = await this.updateUser(session.userId, { feedback });
    }

    const updatedSession = (await this.getSessionById(sessionId)) || session;
    return {
      session: updatedSession,
      user: user || (await this.findUserById(session.userId))!
    };
  }

  public async abandonSession(sessionId: string, reason?: string): Promise<GameSession | undefined> {
    const now = new Date().toISOString();
    await this.sessionsCol.updateOne(
      { id: sessionId },
      { $set: { status: 'ABANDONED', endTime: now } }
    );

    return this.getSessionById(sessionId);
  }

  public async getAllSessions(): Promise<GameSession[]> {
    const docs = await this.sessionsCol.find({}).toArray();
    return docs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as GameSession;
    });
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const res = await this.sessionsCol.deleteOne({ id: sessionId });
    return res.deletedCount > 0;
  }

  public async deleteAllSessions(): Promise<number> {
    const res = await this.sessionsCol.deleteMany({});
    return res.deletedCount || 0;
  }

  // --------------------------------------------------------------------------
  // Analytics & Admin Aggregations
  // --------------------------------------------------------------------------
  public async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const completed = await this.sessionsCol
      .find({ status: 'COMPLETED' })
      .sort({ score: -1 })
      .limit(limit)
      .toArray();

    const userIds = [...new Set(completed.map((s) => s.userId))];
    const userDocs = await this.usersCol.find({ id: { $in: userIds } }).toArray();
    const userMap = new Map<string, string>();
    for (const u of userDocs) {
      userMap.set(u.id, u.name);
    }

    return completed.map((s: any, index: number) => {
      return {
        rank: index + 1,
        sessionId: s.id,
        userId: s.userId,
        userName: userMap.get(s.userId) || 'Anonymous Champion',
        score: s.score,
        crackerCount: s.crackerCount,
        maxSpeed: s.maxSpeed,
        completedAt: s.endTime || s.startTime
      };
    });
  }

  public async getAdminOverview(): Promise<AdminOverviewStats> {
    const [totalUsers, totalSessions, completedSessions, activeCodesCount, scoresAgg, recentSessionsDocs, recentUsersDocs] =
      await Promise.all([
        this.usersCol.countDocuments(),
        this.sessionsCol.countDocuments(),
        this.sessionsCol.countDocuments({ status: 'COMPLETED' }),
        this.codesCol.countDocuments({ status: 'ACTIVE' }),
        this.sessionsCol
          .aggregate([
            { $match: { status: 'COMPLETED' } },
            {
              $group: {
                _id: null,
                totalScores: { $sum: '$score' },
                highestScore: { $max: '$score' },
                count: { $sum: 1 }
              }
            }
          ])
          .toArray(),
        this.sessionsCol.find({}).sort({ startTime: -1 }).limit(10).toArray(),
        this.usersCol.find({}).sort({ createdAt: -1 }).limit(10).toArray()
      ]);

    const aggData = scoresAgg[0] || { totalScores: 0, highestScore: 0, count: 0 };
    const averageScore = aggData.count > 0 ? Math.round(aggData.totalScores / aggData.count) : 0;
    const highestScore = aggData.highestScore || 0;

    const recentSessions = recentSessionsDocs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as GameSession;
    });

    const recentUsers = recentUsersDocs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as User;
    });

    const leaderboard = await this.getLeaderboard(10);

    return {
      totalUsers,
      totalSessions,
      completedSessions,
      activeCodes: activeCodesCount,
      averageScore,
      highestScore,
      leaderboard,
      recentSessions,
      recentUsers
    };
  }

  // --------------------------------------------------------------------------
  // Admin Authentication, Accounts & Sessions
  // --------------------------------------------------------------------------
  public async findAdminByUsername(username: string): Promise<AdminUser | undefined> {
    const clean = (username || '').trim().toLowerCase();
    const doc = await this.adminUsersCol.findOne({ username: clean });
    if (!doc) return undefined;
    const { _id, ...cleanUser } = doc as any;
    return cleanUser as AdminUser;
  }

  public async findAdminById(id: string): Promise<AdminUser | undefined> {
    const doc = await this.adminUsersCol.findOne({ id });
    if (!doc) return undefined;
    const { _id, ...cleanUser } = doc as any;
    return cleanUser as AdminUser;
  }

  public async createAdminUser(user: Omit<AdminUser, 'id' | 'createdAt'>): Promise<AdminUser> {
    const cleanUsername = user.username.trim().toLowerCase();
    const existing = await this.findAdminByUsername(cleanUsername);
    if (existing) {
      throw new Error(`Admin username "${cleanUsername}" already exists.`);
    }

    const id = `admin_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record: AdminUser = {
      id,
      username: cleanUsername,
      passwordHash: user.passwordHash,
      role: user.role,
      isActive: user.isActive !== undefined ? user.isActive : true,
      createdAt: now,
      lastLoginAt: user.lastLoginAt || null
    };

    await this.adminUsersCol.insertOne({
      _id: id as any,
      ...record
    });

    return record;
  }

  public async updateAdminUser(id: string, updates: Partial<AdminUser>): Promise<AdminUser | undefined> {
    if (updates.username) {
      const cleanUsername = updates.username.trim().toLowerCase();
      const existing = await this.findAdminByUsername(cleanUsername);
      if (existing && existing.id !== id) {
        throw new Error(`Admin username "${cleanUsername}" is already in use.`);
      }
      updates.username = cleanUsername;
    }

    await this.adminUsersCol.updateOne({ id }, { $set: updates });
    return this.findAdminById(id);
  }

  public async getAllAdminUsers(): Promise<AdminUser[]> {
    const docs = await this.adminUsersCol.find({}).toArray();
    return docs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as AdminUser;
    });
  }

  public async createAdminSession(session: Omit<AdminSession, 'id'>): Promise<AdminSession> {
    const token = crypto.randomBytes(32).toString('hex');

    const record: AdminSession = {
      id: token,
      ...session
    };

    await this.adminSessionsCol.insertOne({
      _id: token as any,
      ...record
    });

    return record;
  }

  public async findAdminSession(token: string): Promise<AdminSession | undefined> {
    if (!token) return undefined;
    const doc = await this.adminSessionsCol.findOne({ id: token });
    if (!doc) return undefined;

    // Check expiration
    if (new Date(doc.expiresAt).getTime() <= Date.now()) {
      await this.adminSessionsCol.deleteOne({ id: token });
      return undefined;
    }

    const { _id, ...clean } = doc as any;
    return clean as AdminSession;
  }

  public async deleteAdminSession(token: string): Promise<boolean> {
    if (!token) return false;
    const res = await this.adminSessionsCol.deleteOne({ id: token });
    return res.deletedCount > 0;
  }

  public async deleteExpiredAdminSessions(): Promise<number> {
    const nowIso = new Date().toISOString();
    const res = await this.adminSessionsCol.deleteMany({ expiresAt: { $lte: nowIso } });
    return res.deletedCount;
  }

  // --------------------------------------------------------------------------
  // Audit Logs
  // --------------------------------------------------------------------------
  public async recordAuditLog(log: Omit<AdminAuditLog, 'id' | 'timestamp'>): Promise<AdminAuditLog> {
    const id = `audit_${crypto.randomUUID().slice(0, 8)}`;
    const record: AdminAuditLog = {
      id,
      timestamp: new Date().toISOString(),
      ...log
    };

    await this.auditLogsCol.insertOne({
      _id: id as any,
      ...record
    });

    return record;
  }

  public async getAuditLogs(limit = 50): Promise<AdminAuditLog[]> {
    const docs = await this.auditLogsCol.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
    return docs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as AdminAuditLog;
    });
  }

  // --------------------------------------------------------------------------
  // Assets & Media (Phase 4A)
  // --------------------------------------------------------------------------
  public async createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssetRecord> {
    const id = `asset_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const record: AssetRecord = {
      id,
      createdAt: now,
      updatedAt: now,
      ...asset
    };

    await this.assetsCol.insertOne({
      _id: id as any,
      ...record
    });

    return record;
  }

  public async getAssetById(id: string): Promise<AssetRecord | undefined> {
    const doc: any = await this.assetsCol.findOne({ id });
    if (!doc) return undefined;
    const { _id, ...clean } = doc;
    return clean as AssetRecord;
  }

  public async getAssetByObjectKey(objectKey: string): Promise<AssetRecord | undefined> {
    const doc: any = await this.assetsCol.findOne({ objectKey });
    if (!doc) return undefined;
    const { _id, ...clean } = doc;
    return clean as AssetRecord;
  }

  public async listAssets(filter?: { category?: AssetCategory; isActive?: boolean }): Promise<AssetRecord[]> {
    const query: any = {};
    if (filter?.category) {
      query.category = filter.category;
    }
    if (filter?.isActive !== undefined) {
      query.isActive = filter.isActive;
    }

    const docs = await this.assetsCol.find(query).sort({ createdAt: -1 }).toArray();
    return docs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as AssetRecord;
    });
  }

  public async updateAsset(id: string, updates: Partial<AssetRecord>): Promise<AssetRecord | undefined> {
    const now = new Date().toISOString();
    const cleanUpdates = { ...updates, updatedAt: now };
    delete (cleanUpdates as any).id;
    delete (cleanUpdates as any)._id;

    const res = await this.assetsCol.findOneAndUpdate(
      { id },
      { $set: cleanUpdates },
      { returnDocument: 'after' }
    );

    if (!res) return undefined;
    const { _id, ...clean } = res as any;
    return clean as AssetRecord;
  }

  public async deleteAsset(id: string): Promise<boolean> {
    const res = await this.assetsCol.deleteOne({ id });
    return res.deletedCount > 0;
  }

  // --------------------------------------------------------------------------
  // Bomb Configuration & Game Settings
  // --------------------------------------------------------------------------
  public async getBombConfigs(includeInactive = false): Promise<BombConfig[]> {
    // Ensure the 4 foundational default bombs exist idempotently
    for (const defBomb of DEFAULT_BOMB_CONFIGS) {
      const exists = await this.bombsCol.findOne({ id: defBomb.id });
      if (!exists) {
        await this.bombsCol.insertOne({ ...defBomb } as any);
      }
    }

    const query: any = {};
    if (!includeInactive) {
      query.isActive = true;
      query.isDeleted = { $ne: true };
    }
    const docs = await this.bombsCol.find(query).toArray();
    const cleanList = docs.map((d: any) => {
      const { _id, ...clean } = d;
      return clean as BombConfig;
    });
    cleanList.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
    return cleanList;
  }

  public async getBombConfigById(id: string): Promise<BombConfig | undefined> {
    const doc = await this.bombsCol.findOne({ id });
    if (!doc) return undefined;
    const { _id, ...clean } = doc as any;
    return clean as BombConfig;
  }

  public async createBombConfig(config: Omit<BombConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<BombConfig> {
    const crypto = await import('crypto');
    const id = `bomb_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    const newBomb: BombConfig = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now
    };
    await this.bombsCol.insertOne({ ...newBomb } as any);
    return newBomb;
  }

  public async updateBombConfig(id: string, updates: Partial<BombConfig>): Promise<BombConfig | undefined> {
    const now = new Date().toISOString();
    const cleanUpdates = { ...updates, updatedAt: now };
    delete (cleanUpdates as any).id;
    delete (cleanUpdates as any)._id;

    const filter: any = { id };
    if (updates.isDeleted === undefined) {
      filter.isDeleted = { $ne: true };
    }

    const res = await this.bombsCol.findOneAndUpdate(
      filter,
      { $set: cleanUpdates },
      { returnDocument: 'after' }
    );
    if (!res) return undefined;
    const { _id, ...clean } = res as any;

    this.syncUpdateToJson(id, cleanUpdates);

    return clean as BombConfig;
  }

  public async isBombReferenced(id: string): Promise<boolean> {
    // 1. Check if any game session references this bomb
    const sessionDoc = await this.sessionsCol.findOne({
      $or: [
        { 'bombHits.bombId': id },
        { 'bombs.id': id },
        { bombId: id },
        { 'details.bombId': id }
      ]
    });
    if (sessionDoc) return true;

    // 2. Check if any audit log references this bomb (excluding initial creation/deletion)
    const auditDoc = await this.auditLogsCol.findOne({
      target: id,
      action: { $nin: ['CREATE_BOMB', 'DELETE_BOMB'] }
    });
    if (auditDoc) return true;

    return false;
  }

  public async deleteBombConfig(id: string): Promise<boolean> {
    const existing = await this.getBombConfigById(id);
    if (!existing || existing.isDeleted) {
      console.warn('[BombDelete Storage:Mongo] deleteBombConfig: bomb not found or already deleted:', { id });
      return false;
    }

    const isReferenced = await this.isBombReferenced(id);
    const now = new Date().toISOString();
    const strategy = existing.isDefault || isReferenced ? 'soft-delete' : 'permanent-delete';

    console.log('[BombDelete Storage:Mongo] Step 5: Executing storage operation for bomb:', {
      id,
      name: existing.name,
      isDefault: Boolean(existing.isDefault),
      isReferenced,
      strategy
    });

    let success = false;
    // Default bombs and bombs with historical references are safely soft-deleted
    // to preserve historical game data and prevent default re-seeding
    if (existing.isDefault || isReferenced) {
      const res = await this.bombsCol.updateOne(
        { id },
        { $set: { isDeleted: true, isActive: false, deletedAt: now, updatedAt: now } }
      );
      success = Boolean(res.acknowledged && (res.modifiedCount > 0 || res.matchedCount > 0));
    } else {
      // Unreferenced custom bombs are permanently removed
      const res = await this.bombsCol.deleteOne({ id });
      success = Boolean(res.acknowledged && (res.deletedCount ?? 0) > 0);
    }

    console.log('[BombDelete Storage:Mongo] Step 5: Operation result:', { id, strategy, success });

    if (success) {
      this.syncDeleteToJson(id, Boolean(existing.isDefault || isReferenced), now);
    }

    return success;
  }

  private syncUpdateToJson(id: string, updates: Partial<BombConfig>): void {
    try {
      const dbPath = path.resolve(process.cwd(), 'data', 'db.json');
      if (!fs.existsSync(dbPath)) return;

      const raw = fs.readFileSync(dbPath, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.bombs || !data.bombs[id]) return;

      data.bombs[id] = {
        ...data.bombs[id],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Best-effort local sync
    }
  }

  private syncDeleteToJson(id: string, isSoftDelete: boolean, deletedAt: string): void {
    try {
      const dbPath = path.resolve(process.cwd(), 'data', 'db.json');
      if (!fs.existsSync(dbPath)) return;

      const raw = fs.readFileSync(dbPath, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.bombs || !data.bombs[id]) return;

      if (isSoftDelete) {
        data.bombs[id].isDeleted = true;
        data.bombs[id].isActive = false;
        data.bombs[id].deletedAt = deletedAt;
        data.bombs[id].updatedAt = deletedAt;
      } else {
        delete data.bombs[id];
      }

      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Best-effort local sync
    }
  }

  public async getBombGameSettings(): Promise<BombGameSettings> {
    const doc = await this.bombSettingsCol.findOne({ _id: 'global_bomb_settings' as any });
    if (!doc) {
      await this.bombSettingsCol.insertOne({
        _id: 'global_bomb_settings',
        ...DEFAULT_BOMB_SETTINGS,
        updatedAt: new Date().toISOString()
      } as any);
      return { ...DEFAULT_BOMB_SETTINGS };
    }
    const { _id, updatedAt, ...clean } = doc as any;
    return { ...DEFAULT_BOMB_SETTINGS, ...clean } as BombGameSettings;
  }

  public async updateBombGameSettings(settings: Partial<BombGameSettings>): Promise<BombGameSettings> {
    const now = new Date().toISOString();
    const cleanUpdates = { ...settings, updatedAt: now };
    delete (cleanUpdates as any)._id;

    const res = await this.bombSettingsCol.findOneAndUpdate(
      { _id: 'global_bomb_settings' as any },
      { $set: cleanUpdates },
      { returnDocument: 'after', upsert: true }
    );
    const { _id, updatedAt, ...clean } = (res || {}) as any;
    return { ...DEFAULT_BOMB_SETTINGS, ...clean } as BombGameSettings;
  }
}

