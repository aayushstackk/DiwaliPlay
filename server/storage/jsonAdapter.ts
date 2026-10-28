/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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

export interface DatabaseSchema {
  users: Record<string, User>; // key: userId
  usersByMobile: Record<string, string>; // mobile -> userId
  gameCodes: Record<string, GameCode>; // key: codeId
  activeCodeIndex: Record<string, string>; // 4-digit code -> codeId (only ACTIVE)
  sessions: Record<string, GameSession>; // key: sessionId
  settings: SystemSettings;
  adminUsers: Record<string, AdminUser>; // key: adminId
  adminSessions: Record<string, AdminSession>; // key: session token
  auditLogs: AdminAuditLog[];
  assets: Record<string, AssetRecord>; // key: assetId
  bombs: Record<string, BombConfig>; // key: bombId
  bombSettings: BombGameSettings;
}

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
  targetScore: 5000
};

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const DB_FILE = path.resolve(DATA_DIR, 'db.json');

export class JsonFileStorageAdapter implements StorageAdapter {
  private data: DatabaseSchema;
  private isSaving = false;
  private savePending = false;

  constructor() {
    this.data = this.loadDatabase();
  }

  public async init(): Promise<void> {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Clean up any historical expired codes if needed
    this.cleanupExpiredCodes();

    // Idempotent historical cleanup:
    // If any audit log recorded action === 'DELETE_BOMB', ensure the target bomb is either marked
    // as isDeleted: true or permanently removed (if unreferenced custom bomb)
    if (this.data.auditLogs && this.data.bombs) {
      let changed = false;
      const deleteLogs = this.data.auditLogs.filter((l) => l.action === 'DELETE_BOMB');
      for (const log of deleteLogs) {
        if (!log.target) continue;
        const targetBomb = this.data.bombs[log.target];
        if (targetBomb && !targetBomb.isDeleted) {
          const isRef = await this.isBombReferenced(log.target);
          const deletedAt = log.timestamp || new Date().toISOString();
          if (targetBomb.isDefault || isRef) {
            this.data.bombs[log.target].isDeleted = true;
            this.data.bombs[log.target].isActive = false;
            this.data.bombs[log.target].deletedAt = deletedAt;
            this.data.bombs[log.target].updatedAt = deletedAt;
          } else {
            delete this.data.bombs[log.target];
          }
          changed = true;
        }
      }
      if (changed) {
        this.persist();
      }
    }
  }

  public getType(): 'json' | 'mongodb' {
    return 'json';
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const defaultBombsMap: Record<string, BombConfig> = {};
        DEFAULT_BOMB_CONFIGS.forEach((b) => {
          defaultBombsMap[b.id] = { ...b };
        });

        const loadedBombs = parsed.bombs && Object.keys(parsed.bombs).length > 0
          ? parsed.bombs
          : defaultBombsMap;

        return {
          users: parsed.users || {},
          usersByMobile: parsed.usersByMobile || {},
          gameCodes: parsed.gameCodes || {},
          activeCodeIndex: parsed.activeCodeIndex || {},
          sessions: parsed.sessions || {},
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          adminUsers: parsed.adminUsers || {},
          adminSessions: parsed.adminSessions || {},
          auditLogs: parsed.auditLogs || [],
          assets: parsed.assets || {},
          bombs: loadedBombs,
          bombSettings: { ...DEFAULT_BOMB_SETTINGS, ...(parsed.bombSettings || {}) }
        };
      }
    } catch (err) {
      console.error('[JsonStorage] Failed to read database file, initializing fresh memory state:', err);
    }

    const initialBombsMap: Record<string, BombConfig> = {};
    DEFAULT_BOMB_CONFIGS.forEach((b) => {
      initialBombsMap[b.id] = { ...b };
    });

    return {
      users: {},
      usersByMobile: {},
      gameCodes: {},
      activeCodeIndex: {},
      sessions: {},
      settings: { ...DEFAULT_SETTINGS },
      adminUsers: {},
      adminSessions: {},
      auditLogs: [],
      assets: {},
      bombs: initialBombsMap,
      bombSettings: { ...DEFAULT_BOMB_SETTINGS }
    };
  }

  private persist() {
    if (this.isSaving) {
      this.savePending = true;
      return;
    }

    this.isSaving = true;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[JsonStorage] Error persisting database to disk:', err);
    } finally {
      this.isSaving = false;
      if (this.savePending) {
        this.savePending = false;
        this.persist();
      }
    }
  }

  public getRawData(): DatabaseSchema {
    return this.data;
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  public async getSettings(): Promise<SystemSettings> {
    return { ...this.data.settings };
  }

  public async updateSettings(partial: Partial<SystemSettings>): Promise<SystemSettings> {
    this.data.settings = {
      ...this.data.settings,
      ...partial
    };
    this.persist();
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
    return this.data.users[id];
  }

  public async findUserByMobile(mobile: string): Promise<User | undefined> {
    const normalized = this.normalizeMobile(mobile);
    const userId = this.data.usersByMobile[normalized];
    if (userId) {
      return this.data.users[userId];
    }
    return undefined;
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

    this.data.users[id] = user;
    this.data.usersByMobile[normalized] = id;
    this.persist();
    return user;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.data.users[id];
    if (!user) return undefined;

    const updatedUser: User = {
      ...user,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.data.users[id] = updatedUser;
    if (updates.mobileNumber) {
      const normalized = this.normalizeMobile(updates.mobileNumber);
      this.data.usersByMobile[normalized] = id;
    }
    this.persist();
    return updatedUser;
  }

  public async getAllUsers(): Promise<User[]> {
    return Object.values(this.data.users);
  }

  public async deleteUser(id: string): Promise<boolean> {
    const user = this.data.users[id];
    if (!user) return false;
    delete this.data.users[id];
    if (this.data.usersByMobile && user.mobileNumber) {
      const normalized = this.normalizeMobile(user.mobileNumber);
      if (this.data.usersByMobile[normalized] === id) {
        delete this.data.usersByMobile[normalized];
      }
      if (this.data.usersByMobile[user.mobileNumber] === id) {
        delete this.data.usersByMobile[user.mobileNumber];
      }
    }
    this.persist();
    return true;
  }

  // --------------------------------------------------------------------------
  // Game Codes (4-Digit Unique)
  // --------------------------------------------------------------------------
  private cleanupExpiredCodes(): void {
    // Codes remain active until used
  }

  public async findActiveCodeForUser(userId: string): Promise<GameCode | undefined> {
    for (const code of Object.values(this.data.gameCodes)) {
      if (code.userId === userId && code.status === 'ACTIVE') {
        return code;
      }
    }
    return undefined;
  }

  public async findLatestCodeForUser(userId: string): Promise<GameCode | undefined> {
    const active = await this.findActiveCodeForUser(userId);
    if (active) return active;

    const userCodes = Object.values(this.data.gameCodes)
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return userCodes[0];
  }

  public async findCodeByCodeString(codeString: string): Promise<GameCode | undefined> {
    const cleanCode = codeString.trim();
    const codeId = this.data.activeCodeIndex[cleanCode];
    if (codeId) {
      return this.data.gameCodes[codeId];
    }

    for (const gc of Object.values(this.data.gameCodes)) {
      if (gc.code === cleanCode) {
        return gc;
      }
    }

    return undefined;
  }

  private generateUnique4DigitCode(): string {
    for (let attempts = 0; attempts < 10000; attempts++) {
      const num = Math.floor(1000 + Math.random() * 9000);
      const candidate = num.toString();
      if (candidate === TRIAL_CODE) continue; // Reserved special trial code
      if (!this.data.activeCodeIndex[candidate]) {
        return candidate;
      }
    }
    throw new Error('Unable to generate unique 4-digit code: active code capacity reached');
  }

  public async createGameCode(userId: string): Promise<GameCode> {
    const now = new Date();
    // Valid for 1 year or until used
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const code = this.generateUnique4DigitCode();
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

    this.data.gameCodes[id] = record;
    this.data.activeCodeIndex[code] = id;
    this.persist();

    return record;
  }

  public async markCodeUsed(codeId: string): Promise<GameCode | undefined> {
    const record = this.data.gameCodes[codeId];
    if (!record) return undefined;

    record.status = 'USED';
    record.usedAt = new Date().toISOString();
    delete this.data.activeCodeIndex[record.code];
    this.persist();

    return record;
  }

  public async deleteGameCode(codeId: string): Promise<boolean> {
    const code = this.data.gameCodes[codeId];
    if (!code) return false;
    delete this.data.gameCodes[codeId];
    if (this.data.activeCodeIndex && this.data.activeCodeIndex[code.code] === codeId) {
      delete this.data.activeCodeIndex[code.code];
    }
    this.persist();
    return true;
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

    this.data.sessions[id] = session;
    this.persist();
    return session;
  }

  public async getSessionById(sessionId: string): Promise<GameSession | undefined> {
    return this.data.sessions[sessionId];
  }

  public async findSessionByGameCodeId(gameCodeId: string): Promise<GameSession | undefined> {
    for (const session of Object.values(this.data.sessions)) {
      if (session.gameCodeId === gameCodeId) {
        return session;
      }
    }
    return undefined;
  }

  public async completeSession(
    sessionId: string,
    data: CompleteSessionParams
  ): Promise<{ session: GameSession; user: User }> {
    const session = this.data.sessions[sessionId];
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = new Date().toISOString();
    const isAlreadyCompleted = session.status === 'COMPLETED';

    session.endTime = session.endTime || now;
    session.score = data.score;
    session.crackerCount = data.crackerCount;
    session.maxSpeed = data.maxSpeed;
    session.comboCount = data.comboCount;
    session.punchCount = data.punchCount;
    if (data.photoData) {
      session.photoUrl = data.photoData;
    }
    if (data.wishTitle) {
      session.wishTitle = data.wishTitle;
    }
    if (data.wishMessage) {
      session.wishMessage = data.wishMessage;
    }
    if (data.feedback) {
      session.feedback = data.feedback;
    }
    if (typeof data.combosCount === 'number') {
      session.combosCount = data.combosCount;
    }
    if (typeof data.penaltyDeductions === 'number') {
      session.penaltyDeductions = data.penaltyDeductions;
    }
    if (typeof data.comboBonusPoints === 'number') {
      session.comboBonusPoints = data.comboBonusPoints;
    }
    if (typeof data.targetScore === 'number') {
      session.targetScore = data.targetScore;
    }
    if (typeof data.targetAchieved === 'boolean') {
      session.targetAchieved = data.targetAchieved;
    }
    session.status = 'COMPLETED';

    // Update player stats idempotently (do not double-increment playCount on retries)
    const user = this.data.users[session.userId];
    if (user) {
      user.hasPlayed = true;
      if (data.feedback) {
        user.feedback = data.feedback;
      }
      if (!isAlreadyCompleted) {
        user.playCount = (user.playCount || 0) + 1;
      }
      user.updatedAt = now;
    }

    this.persist();
    return {
      session,
      user: user || {
        id: session.userId,
        name: 'Player',
        mobileNumber: '',
        createdAt: now,
        updatedAt: now,
        hasPlayed: true,
        playCount: 1
      }
    };
  }

  public async updateSessionFeedback(
    sessionId: string,
    feedback: GameFeedback
  ): Promise<{ session: GameSession; user: User } | undefined> {
    const session = this.data.sessions[sessionId];
    if (!session) return undefined;

    session.feedback = feedback;
    let user: User | undefined;
    if (session.userId && this.data.users[session.userId]) {
      user = this.data.users[session.userId];
      user.feedback = feedback;
      user.updatedAt = new Date().toISOString();
    }
    this.persist();
    return { session, user: user || this.data.users[session.userId] };
  }

  public async abandonSession(sessionId: string, reason?: string): Promise<GameSession | undefined> {
    const session = this.data.sessions[sessionId];
    if (!session) return undefined;

    session.status = 'ABANDONED';
    session.endTime = new Date().toISOString();
    this.persist();
    return session;
  }

  public async getAllSessions(): Promise<GameSession[]> {
    return Object.values(this.data.sessions);
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.data.sessions[sessionId]) return false;
    delete this.data.sessions[sessionId];
    this.persist();
    return true;
  }

  // --------------------------------------------------------------------------
  // Analytics & Admin Aggregations
  // --------------------------------------------------------------------------
  public async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const completed = Object.values(this.data.sessions).filter(
      (s) => s.status === 'COMPLETED'
    );

    completed.sort((a, b) => b.score - a.score);

    return completed.slice(0, limit).map((s, index) => {
      const user = this.data.users[s.userId];
      return {
        rank: index + 1,
        sessionId: s.id,
        userId: s.userId,
        userName: user?.name || 'Anonymous Champion',
        score: s.score,
        crackerCount: s.crackerCount,
        maxSpeed: s.maxSpeed,
        completedAt: s.endTime || s.startTime
      };
    });
  }

  public async getAdminOverview(): Promise<AdminOverviewStats> {
    const users = Object.values(this.data.users);
    const sessions = Object.values(this.data.sessions);
    const completed = sessions.filter((s) => s.status === 'COMPLETED');
    const activeCodeCount = Object.keys(this.data.activeCodeIndex).length;

    const totalScores = completed.reduce((acc, s) => acc + s.score, 0);
    const averageScore = completed.length > 0 ? Math.round(totalScores / completed.length) : 0;
    const highestScore = completed.length > 0 ? Math.max(...completed.map((s) => s.score)) : 0;

    const recentSessions = [...sessions]
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 10);

    const recentUsers = [...users]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    return {
      totalUsers: users.length,
      totalSessions: sessions.length,
      completedSessions: completed.length,
      activeCodes: activeCodeCount,
      averageScore,
      highestScore,
      leaderboard: await this.getLeaderboard(10),
      recentSessions,
      recentUsers
    };
  }

  // --------------------------------------------------------------------------
  // Admin Authentication, Accounts & Sessions
  // --------------------------------------------------------------------------
  public async findAdminByUsername(username: string): Promise<AdminUser | undefined> {
    const clean = (username || '').trim().toLowerCase();
    for (const admin of Object.values(this.data.adminUsers)) {
      if (admin.username.toLowerCase() === clean) {
        return admin;
      }
    }
    return undefined;
  }

  public async findAdminById(id: string): Promise<AdminUser | undefined> {
    return this.data.adminUsers[id];
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

    this.data.adminUsers[id] = record;
    this.persist();
    return record;
  }

  public async updateAdminUser(id: string, updates: Partial<AdminUser>): Promise<AdminUser | undefined> {
    const admin = this.data.adminUsers[id];
    if (!admin) return undefined;

    if (updates.username) {
      const cleanUsername = updates.username.trim().toLowerCase();
      const existing = await this.findAdminByUsername(cleanUsername);
      if (existing && existing.id !== id) {
        throw new Error(`Admin username "${cleanUsername}" is already in use.`);
      }
      updates.username = cleanUsername;
    }

    const updated = {
      ...admin,
      ...updates
    };

    this.data.adminUsers[id] = updated;
    this.persist();
    return updated;
  }

  public async getAllAdminUsers(): Promise<AdminUser[]> {
    return Object.values(this.data.adminUsers);
  }

  public async createAdminSession(session: Omit<AdminSession, 'id'>): Promise<AdminSession> {
    const token = crypto.randomBytes(32).toString('hex');

    const record: AdminSession = {
      id: token,
      ...session
    };

    this.data.adminSessions[token] = record;
    this.persist();
    return record;
  }

  public async findAdminSession(token: string): Promise<AdminSession | undefined> {
    if (!token) return undefined;
    const session = this.data.adminSessions[token];
    if (!session) return undefined;

    // Check expiration
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      delete this.data.adminSessions[token];
      this.persist();
      return undefined;
    }

    return session;
  }

  public async deleteAdminSession(token: string): Promise<boolean> {
    if (!token || !this.data.adminSessions[token]) return false;
    delete this.data.adminSessions[token];
    this.persist();
    return true;
  }

  public async deleteExpiredAdminSessions(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [token, session] of Object.entries(this.data.adminSessions)) {
      if (new Date(session.expiresAt).getTime() <= now) {
        delete this.data.adminSessions[token];
        count++;
      }
    }
    if (count > 0) {
      this.persist();
    }
    return count;
  }

  // --------------------------------------------------------------------------
  // Audit Logs
  // --------------------------------------------------------------------------
  public async recordAuditLog(log: Omit<AdminAuditLog, 'id' | 'timestamp'>): Promise<AdminAuditLog> {
    const record: AdminAuditLog = {
      id: `audit_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      ...log
    };

    this.data.auditLogs.unshift(record);
    // Keep last 1,000 logs in JSON mode
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 1000);
    }
    this.persist();
    return record;
  }

  public async getAuditLogs(limit = 50): Promise<AdminAuditLog[]> {
    return this.data.auditLogs.slice(0, limit);
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

    if (!this.data.assets) {
      this.data.assets = {};
    }
    this.data.assets[id] = record;
    this.persist();
    return record;
  }

  public async getAssetById(id: string): Promise<AssetRecord | undefined> {
    if (!this.data.assets) return undefined;
    return this.data.assets[id];
  }

  public async getAssetByObjectKey(objectKey: string): Promise<AssetRecord | undefined> {
    if (!this.data.assets) return undefined;
    return Object.values(this.data.assets).find((a) => a.objectKey === objectKey);
  }

  public async listAssets(filter?: { category?: AssetCategory; isActive?: boolean }): Promise<AssetRecord[]> {
    if (!this.data.assets) return [];
    let list = Object.values(this.data.assets);
    if (filter?.category) {
      list = list.filter((a) => a.category === filter.category);
    }
    if (filter?.isActive !== undefined) {
      list = list.filter((a) => a.isActive === filter.isActive);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  public async updateAsset(id: string, updates: Partial<AssetRecord>): Promise<AssetRecord | undefined> {
    if (!this.data.assets || !this.data.assets[id]) return undefined;
    const existing = this.data.assets[id];
    const updated: AssetRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };
    this.data.assets[id] = updated;
    this.persist();
    return updated;
  }

  public async deleteAsset(id: string): Promise<boolean> {
    if (!this.data.assets || !this.data.assets[id]) return false;
    delete this.data.assets[id];
    this.persist();
    return true;
  }

  // --------------------------------------------------------------------------
  // Bomb Configuration & Game Settings
  // --------------------------------------------------------------------------
  public async getBombConfigs(includeInactive = false): Promise<BombConfig[]> {
    if (!this.data.bombs) this.data.bombs = {};
    let changed = false;
    for (const defBomb of DEFAULT_BOMB_CONFIGS) {
      if (!this.data.bombs[defBomb.id]) {
        this.data.bombs[defBomb.id] = { ...defBomb };
        changed = true;
      }
    }
    if (changed) {
      this.persist();
    }

    let list = Object.values(this.data.bombs);
    if (!includeInactive) {
      list = list.filter((b) => b.isActive && !b.isDeleted);
    }
    list.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
    return list;
  }

  public async getBombConfigById(id: string): Promise<BombConfig | undefined> {
    return this.data.bombs?.[id];
  }

  public async createBombConfig(config: Omit<BombConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<BombConfig> {
    if (!this.data.bombs) this.data.bombs = {};
    const id = `bomb_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    const newBomb: BombConfig = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.data.bombs[id] = newBomb;
    this.persist();
    return newBomb;
  }

  public async updateBombConfig(id: string, updates: Partial<BombConfig>): Promise<BombConfig | undefined> {
    if (!this.data.bombs || !this.data.bombs[id] || (this.data.bombs[id].isDeleted && updates.isDeleted === undefined)) return undefined;
    const existing = this.data.bombs[id];
    const updated: BombConfig = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };
    this.data.bombs[id] = updated;
    this.persist();
    return updated;
  }

  public async isBombReferenced(id: string): Promise<boolean> {
    // 1. Check sessions
    const sessions = Object.values(this.data.sessions || {});
    const hasSessionRef = sessions.some((s: any) =>
      s.bombId === id ||
      s.bombs?.some?.((b: any) => b.id === id) ||
      s.bombHits?.some?.((b: any) => b.bombId === id) ||
      s.details?.bombId === id
    );
    if (hasSessionRef) return true;

    // 2. Check audit logs (excluding initial creation/deletion)
    const auditLogs = this.data.auditLogs || [];
    const hasAuditRef = auditLogs.some((l: any) =>
      l.target === id && l.action !== 'CREATE_BOMB' && l.action !== 'DELETE_BOMB'
    );
    if (hasAuditRef) return true;

    return false;
  }

  public async deleteBombConfig(id: string): Promise<boolean> {
    if (!this.data.bombs || !this.data.bombs[id] || this.data.bombs[id].isDeleted) {
      console.warn('[BombDelete Storage:JSON] deleteBombConfig: bomb not found or already deleted:', { id });
      return false;
    }
    const existing = this.data.bombs[id];
    const isReferenced = await this.isBombReferenced(id);
    const now = new Date().toISOString();
    const strategy = existing.isDefault || isReferenced ? 'soft-delete' : 'permanent-delete';

    console.log('[BombDelete Storage:JSON] Step 5: Executing storage operation for bomb:', {
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
      this.data.bombs[id].isDeleted = true;
      this.data.bombs[id].isActive = false;
      this.data.bombs[id].deletedAt = now;
      this.data.bombs[id].updatedAt = now;
      this.persist();
      success = true;
    } else {
      // Unreferenced custom bombs are permanently removed
      delete this.data.bombs[id];
      this.persist();
      success = true;
    }

    console.log('[BombDelete Storage:JSON] Step 5: Operation result:', { id, strategy, success });
    return success;
  }

  public async getBombGameSettings(): Promise<BombGameSettings> {
    if (!this.data.bombSettings) {
      this.data.bombSettings = { ...DEFAULT_BOMB_SETTINGS };
      this.persist();
    }
    return { ...DEFAULT_BOMB_SETTINGS, ...this.data.bombSettings };
  }

  public async updateBombGameSettings(settings: Partial<BombGameSettings>): Promise<BombGameSettings> {
    this.data.bombSettings = {
      ...(this.data.bombSettings || DEFAULT_BOMB_SETTINGS),
      ...settings
    };
    this.persist();
    return this.data.bombSettings;
  }
}

