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
  BombGameSettings,
  RewardItem,
  ScoreRewardRange,
  RewardsSettings,
  SpinRecord,
  KioskDeviceRecord
} from '../../src/types/backend';
import { StorageAdapter, CompleteSessionParams } from './types';
import { DEFAULT_BOMB_CONFIGS, DEFAULT_BOMB_SETTINGS } from './defaultBombs';
import { DEFAULT_REWARDS, DEFAULT_SCORE_REWARDS, DEFAULT_REWARDS_SETTINGS } from './defaultRewards';
import { DEFAULT_AUDIO_SETTINGS } from '../../src/utils/audioDefaults';

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
  rewards: Record<string, RewardItem>;
  scoreRewards: Record<string, ScoreRewardRange>;
  rewardsSettings: RewardsSettings;
  spinResults: SpinRecord[];
  kioskDevices: Record<string, KioskDeviceRecord>;
}

const DEFAULT_SETTINGS: SystemSettings = {
  allowMultiplePlaysPerUser: false,
  codeExpirySeconds: 120, // 2 minutes
  gameDurationSeconds: 35,
  brandName: 'ItsSpotlight',
  brandLogoUrl: '',
  brandingDisplayMode: 'both',
  wallpaperUrl: '',
  useBuiltInWallpaper: false,
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

        const defaultRewardsMap: Record<string, RewardItem> = {};
        DEFAULT_REWARDS.forEach((r) => {
          defaultRewardsMap[r.id] = { ...r };
        });

        const defaultScoreRewardsMap: Record<string, ScoreRewardRange> = {};
        DEFAULT_SCORE_REWARDS.forEach((sr) => {
          defaultScoreRewardsMap[sr.id] = { ...sr };
        });

        const loadedRewards = parsed.rewards && Object.keys(parsed.rewards).length > 0
          ? parsed.rewards
          : defaultRewardsMap;

        const loadedScoreRewards = parsed.scoreRewards && Object.keys(parsed.scoreRewards).length > 0
          ? parsed.scoreRewards
          : defaultScoreRewardsMap;

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
          bombSettings: { ...DEFAULT_BOMB_SETTINGS, ...(parsed.bombSettings || {}) },
          rewards: loadedRewards,
          scoreRewards: loadedScoreRewards,
          rewardsSettings: parsed.rewardsSettings || { ...DEFAULT_REWARDS_SETTINGS },
          spinResults: Array.isArray(parsed.spinResults) ? parsed.spinResults : [],
          kioskDevices: parsed.kioskDevices || {}
        };
      }
    } catch (err) {
      console.error('[JsonStorage] Failed to read database file, initializing fresh memory state:', err);
    }

    const initialBombsMap: Record<string, BombConfig> = {};
    DEFAULT_BOMB_CONFIGS.forEach((b) => {
      initialBombsMap[b.id] = { ...b };
    });

    const initialRewardsMap: Record<string, RewardItem> = {};
    DEFAULT_REWARDS.forEach((r) => {
      initialRewardsMap[r.id] = { ...r };
    });

    const initialScoreRewardsMap: Record<string, ScoreRewardRange> = {};
    DEFAULT_SCORE_REWARDS.forEach((sr) => {
      initialScoreRewardsMap[sr.id] = { ...sr };
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
      bombSettings: { ...DEFAULT_BOMB_SETTINGS },
      rewards: initialRewardsMap,
      scoreRewards: initialScoreRewardsMap,
      rewardsSettings: { ...DEFAULT_REWARDS_SETTINGS },
      spinResults: [],
      kioskDevices: {}
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
      fs.writeFileSync(tempPath, JSON.stringify(this.data), 'utf-8');
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
    // Also remove any active/unused codes belonging to this user
    for (const [cId, code] of Object.entries(this.data.gameCodes)) {
      if (code.userId === id) {
        delete this.data.gameCodes[cId];
      }
    }
    this.persist();
    return true;
  }

  public async deleteAllUsers(): Promise<number> {
    const count = Object.keys(this.data.users).length;
    this.data.users = {};
    this.data.usersByMobile = {};
    this.data.gameCodes = {};
    this.persist();
    return count;
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

    // Score-based rewards assignment (if rewards feature is enabled)
    if (this.data.rewardsSettings?.enabled !== false && this.data.rewards) {
      const finalScore = Number(data.score) || 0;
      // 1. Check direct score range configured on rewards (Score Based mode)
      const rewardsWithRanges = Object.values(this.data.rewards).filter(
        (r) =>
          r.isActive !== false &&
          (r.mode === 'score' || (!r.mode && typeof r.minScore === 'number')) &&
          typeof r.minScore === 'number' &&
          typeof r.maxScore === 'number'
      );
      for (const reward of rewardsWithRanges) {
        if (finalScore >= (reward.minScore ?? 0) && finalScore <= (reward.maxScore ?? Infinity)) {
          session.earnedReward = {
            id: reward.id,
            name: reward.name,
            description: reward.description,
            imageUrl: reward.imageUrl,
            couponCode: reward.couponCode,
            termsAndConditions: reward.termsAndConditions
          };
          break;
        }
      }

      // 2. Fallback to scoreRewards collection if not matched
      if (!session.earnedReward && this.data.scoreRewards) {
        const scoreRanges = Object.values(this.data.scoreRewards).sort((a, b) => a.minScore - b.minScore);
        for (const range of scoreRanges) {
          if (finalScore >= range.minScore && finalScore <= range.maxScore) {
            const reward = this.data.rewards[range.rewardId];
            if (reward && reward.isActive !== false) {
              session.earnedReward = {
                id: reward.id,
                name: reward.name,
                description: reward.description,
                imageUrl: reward.imageUrl,
                couponCode: reward.couponCode,
                termsAndConditions: reward.termsAndConditions
              };
              break;
            }
          }
        }
      }
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

  public async updateSessionReward(
    sessionId: string,
    earnedReward: NonNullable<GameSession['earnedReward']>
  ): Promise<GameSession | undefined> {
    const session = this.data.sessions[sessionId];
    if (!session) return undefined;

    session.earnedReward = earnedReward;
    this.persist();
    return session;
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

  public async deleteAllSessions(): Promise<number> {
    const count = Object.keys(this.data.sessions).length;
    this.data.sessions = {};
    this.persist();
    return count;
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
    if (this.data.assets[id]) return this.data.assets[id];
    return Object.values(this.data.assets).find(
      (a) => a.objectKey === id || a.originalFilename === id
    );
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

  // --------------------------------------------------------------------------
  // Rewards & Spin Wheel Module
  // --------------------------------------------------------------------------
  public async getRewards(includeInactive = false): Promise<RewardItem[]> {
    if (!this.data.rewards || Object.keys(this.data.rewards).length === 0) {
      this.data.rewards = {};
      DEFAULT_REWARDS.forEach((r) => {
        this.data.rewards[r.id] = { ...r };
      });
      this.persist();
    }
    return Object.values(this.data.rewards).filter((r) => includeInactive || r.isActive !== false);
  }

  public async getRewardById(id: string): Promise<RewardItem | undefined> {
    if (!id) return undefined;
    if (this.data.rewards?.[id]) return this.data.rewards[id];
    return Object.values(this.data.rewards || {}).find((r) => r.id === id);
  }

  public async createReward(reward: Omit<RewardItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<RewardItem> {
    const id = `reward_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const newReward: RewardItem = {
      ...reward,
      id,
      isActive: reward.isActive !== undefined ? reward.isActive : true,
      chances: typeof reward.chances === 'number' && reward.chances > 0 ? reward.chances : 10,
      createdAt: now,
      updatedAt: now
    };
    if (!this.data.rewards) this.data.rewards = {};
    this.data.rewards[id] = newReward;
    this.persist();
    return newReward;
  }

  public async updateReward(id: string, updates: Partial<RewardItem>): Promise<RewardItem | undefined> {
    if (!id) return undefined;
    let key = id;
    if (!this.data.rewards?.[key]) {
      const found = Object.entries(this.data.rewards || {}).find(([k, r]) => r.id === id || k === id);
      if (found) {
        key = found[0];
      }
    }
    const existing = this.data.rewards?.[key];
    if (!existing) return undefined;
    const updated: RewardItem = {
      ...existing,
      ...updates,
      id: existing.id || id,
      updatedAt: new Date().toISOString()
    };
    this.data.rewards[key] = updated;
    this.persist();
    return updated;
  }

  public async deleteReward(id: string): Promise<boolean> {
    if (!id) return false;
    let key = id;
    if (!this.data.rewards?.[key]) {
      const found = Object.entries(this.data.rewards || {}).find(([k, r]) => r.id === id || k === id);
      if (found) {
        key = found[0];
      }
    }
    if (!this.data.rewards?.[key]) return false;
    delete this.data.rewards[key];
    // Also clean up any score ranges that referenced this deleted reward
    if (this.data.scoreRewards) {
      for (const [sKey, range] of Object.entries(this.data.scoreRewards)) {
        if (range.rewardId === id || range.rewardId === key) {
          delete this.data.scoreRewards[sKey];
        }
      }
    }
    this.persist();
    return true;
  }

  public async getScoreRewards(): Promise<ScoreRewardRange[]> {
    if (!this.data.scoreRewards || Object.keys(this.data.scoreRewards).length === 0) {
      this.data.scoreRewards = {};
      DEFAULT_SCORE_REWARDS.forEach((sr) => {
        this.data.scoreRewards[sr.id] = { ...sr };
      });
      this.persist();
    }
    const ranges = Object.values(this.data.scoreRewards).sort((a, b) => a.minScore - b.minScore);
    return ranges.map((r) => ({
      ...r,
      reward: this.data.rewards?.[r.rewardId]
    }));
  }

  public async getScoreRewardById(id: string): Promise<ScoreRewardRange | undefined> {
    const r = this.data.scoreRewards?.[id];
    if (!r) return undefined;
    return { ...r, reward: this.data.rewards?.[r.rewardId] };
  }

  public async createScoreReward(range: Omit<ScoreRewardRange, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScoreRewardRange> {
    const minScore = Number(range.minScore) || 0;
    const maxScore = Number(range.maxScore) || 0;
    if (minScore > maxScore) {
      throw new Error('Minimum score cannot be greater than maximum score.');
    }

    // Validate overlap
    const existing = Object.values(this.data.scoreRewards || {});
    for (const other of existing) {
      if (minScore <= other.maxScore && maxScore >= other.minScore) {
        throw new Error(`Score range [${minScore} - ${maxScore}] overlaps with existing range [${other.minScore} - ${other.maxScore}].`);
      }
    }

    const id = `score_range_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const newRange: ScoreRewardRange = {
      ...range,
      id,
      minScore,
      maxScore,
      createdAt: now,
      updatedAt: now
    };
    if (!this.data.scoreRewards) this.data.scoreRewards = {};
    this.data.scoreRewards[id] = newRange;
    this.persist();
    return { ...newRange, reward: this.data.rewards?.[newRange.rewardId] };
  }

  public async updateScoreReward(id: string, updates: Partial<ScoreRewardRange>): Promise<ScoreRewardRange | undefined> {
    const existing = this.data.scoreRewards?.[id];
    if (!existing) return undefined;
    const minScore = updates.minScore !== undefined ? Number(updates.minScore) : existing.minScore;
    const maxScore = updates.maxScore !== undefined ? Number(updates.maxScore) : existing.maxScore;
    if (minScore > maxScore) {
      throw new Error('Minimum score cannot be greater than maximum score.');
    }

    // Validate overlap excluding current range
    const allRanges = Object.values(this.data.scoreRewards || {}).filter((r) => r.id !== id);
    for (const other of allRanges) {
      if (minScore <= other.maxScore && maxScore >= other.minScore) {
        throw new Error(`Score range [${minScore} - ${maxScore}] overlaps with existing range [${other.minScore} - ${other.maxScore}].`);
      }
    }

    const updated: ScoreRewardRange = {
      ...existing,
      ...updates,
      id,
      minScore,
      maxScore,
      updatedAt: new Date().toISOString()
    };
    this.data.scoreRewards[id] = updated;
    this.persist();
    return { ...updated, reward: this.data.rewards?.[updated.rewardId] };
  }

  public async deleteScoreReward(id: string): Promise<boolean> {
    if (!this.data.scoreRewards?.[id]) return false;
    delete this.data.scoreRewards[id];
    this.persist();
    return true;
  }

  public async getRewardsSettings(): Promise<RewardsSettings> {
    if (!this.data.rewardsSettings) {
      this.data.rewardsSettings = { ...DEFAULT_REWARDS_SETTINGS };
      this.persist();
    }
    return { ...DEFAULT_REWARDS_SETTINGS, ...this.data.rewardsSettings };
  }

  public async updateRewardsSettings(settings: Partial<RewardsSettings>): Promise<RewardsSettings> {
    this.data.rewardsSettings = {
      ...(this.data.rewardsSettings || DEFAULT_REWARDS_SETTINGS),
      ...settings
    };
    this.persist();
    return this.data.rewardsSettings;
  }

  public async recordSpinResult(record: Omit<SpinRecord, 'id' | 'timestamp'>): Promise<SpinRecord> {
    const id = `spin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const newRecord: SpinRecord = {
      ...record,
      id,
      timestamp: now
    };
    if (!Array.isArray(this.data.spinResults)) {
      this.data.spinResults = [];
    }
    this.data.spinResults.unshift(newRecord);
    if (this.data.spinResults.length > 10000) {
      this.data.spinResults = this.data.spinResults.slice(0, 10000);
    }
    this.persist();
    return newRecord;
  }

  public async getSpinResults(limit = 5000): Promise<SpinRecord[]> {
    if (!Array.isArray(this.data.spinResults)) {
      this.data.spinResults = [];
    }
    return this.data.spinResults.slice(0, limit);
  }

  public async getSpinResultBySessionId(sessionId: string): Promise<SpinRecord | undefined> {
    if (!sessionId || !Array.isArray(this.data.spinResults)) {
      return undefined;
    }
    return this.data.spinResults.find((r) => r.sessionId === sessionId);
  }

  // --------------------------------------------------------------------------
  // Remote Kiosk Cloud Relay Devices
  // --------------------------------------------------------------------------
  public async getKioskDevices(): Promise<KioskDeviceRecord[]> {
    if (!this.data.kioskDevices) {
      this.data.kioskDevices = {};
    }
    return Object.values(this.data.kioskDevices);
  }

  public async getKioskDeviceById(id: string): Promise<KioskDeviceRecord | undefined> {
    if (!this.data.kioskDevices) return undefined;
    return this.data.kioskDevices[id];
  }

  public async getKioskDeviceByToken(token: string): Promise<KioskDeviceRecord | undefined> {
    if (!token || !this.data.kioskDevices) return undefined;
    return Object.values(this.data.kioskDevices).find((d) => d.deviceToken === token);
  }

  public async findKioskDeviceByPairingCode(code: string): Promise<KioskDeviceRecord | undefined> {
    if (!code || !this.data.kioskDevices) return undefined;
    const now = new Date().toISOString();
    return Object.values(this.data.kioskDevices).find(
      (d) => d.pairingCode === code && (!d.pairingCodeExpiresAt || d.pairingCodeExpiresAt > now)
    );
  }

  public async createKioskDevice(device: Omit<KioskDeviceRecord, 'registeredAt'>): Promise<KioskDeviceRecord> {
    if (!this.data.kioskDevices) {
      this.data.kioskDevices = {};
    }
    const newRecord: KioskDeviceRecord = {
      ...device,
      registeredAt: new Date().toISOString()
    };
    this.data.kioskDevices[newRecord.id] = newRecord;
    this.persist();
    return newRecord;
  }

  public async updateKioskDevice(
    id: string,
    updates: Partial<KioskDeviceRecord>
  ): Promise<KioskDeviceRecord | undefined> {
    if (!this.data.kioskDevices || !this.data.kioskDevices[id]) {
      return undefined;
    }
    const existing = this.data.kioskDevices[id];
    const updated: KioskDeviceRecord = {
      ...existing,
      ...updates
    };
    this.data.kioskDevices[id] = updated;
    this.persist();
    return updated;
  }

  public async deleteKioskDevice(id: string): Promise<boolean> {
    if (!this.data.kioskDevices || !this.data.kioskDevices[id]) {
      return false;
    }
    delete this.data.kioskDevices[id];
    this.persist();
    return true;
  }
}

