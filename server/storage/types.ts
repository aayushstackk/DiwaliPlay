/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  User,
  GameCode,
  GameSession,
  SystemSettings,
  LeaderboardEntry,
  AdminOverviewStats,
  AssetRecord,
  AssetCategory,
  GameFeedback,
  BombConfig,
  BombGameSettings,
  RewardItem,
  ScoreRewardRange,
  RewardsSettings,
  SpinRecord,
  KioskDeviceRecord
} from '../../src/types/backend';

export interface CompleteSessionParams {
  score: number;
  crackerCount: number;
  maxSpeed: number;
  comboCount: number;
  punchCount: number;
  photoData?: string;
  wishTitle?: string;
  wishMessage?: string;
  feedback?: GameFeedback;
  combosCount?: number;
  penaltyDeductions?: number;
  comboBonusPoints?: number;
  targetScore?: number;
  targetAchieved?: boolean;
}

export interface MigrationResult {
  success: boolean;
  backupPath?: string;
  usersMigrated: number;
  codesMigrated: number;
  sessionsMigrated: number;
  settingsMigrated: boolean;
  assetsMigrated?: number;
  adminSessionsMigrated?: number;
  adminUsersMigrated?: number;
  auditLogsMigrated?: number;
  errors?: string[];
}

export interface StorageAdapter {
  /**
   * Initializes connections, directories, or database indexes.
   */
  init(): Promise<void>;

  /**
   * Gracefully close connections if applicable.
   */
  close?(): Promise<void>;

  /**
   * Identifies adapter type.
   */
  getType(): 'json' | 'mongodb';

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  getSettings(): Promise<SystemSettings>;
  updateSettings(partial: Partial<SystemSettings>): Promise<SystemSettings>;

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------
  findUserById(id: string): Promise<User | undefined>;
  findUserByMobile(mobile: string): Promise<User | undefined>;
  createUser(name: string, mobileNumber: string): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
  deleteAllUsers(): Promise<number>;

  // --------------------------------------------------------------------------
  // Game Codes
  // --------------------------------------------------------------------------
  findActiveCodeForUser(userId: string): Promise<GameCode | undefined>;
  findLatestCodeForUser(userId: string): Promise<GameCode | undefined>;
  findCodeByCodeString(codeString: string): Promise<GameCode | undefined>;
  createGameCode(userId: string): Promise<GameCode>;
  markCodeUsed(codeId: string): Promise<GameCode | undefined>;
  deleteGameCode(codeId: string): Promise<boolean>;

  // --------------------------------------------------------------------------
  // Game Sessions
  // --------------------------------------------------------------------------
  createSession(
    userId: string,
    gameCodeId: string,
    code: string,
    kioskId?: string
  ): Promise<GameSession>;
  getSessionById(sessionId: string): Promise<GameSession | undefined>;
  findSessionByGameCodeId(gameCodeId: string): Promise<GameSession | undefined>;
  completeSession(
    sessionId: string,
    data: CompleteSessionParams
  ): Promise<{ session: GameSession; user: User }>;
  updateSessionFeedback(
    sessionId: string,
    feedback: GameFeedback
  ): Promise<{ session: GameSession; user: User } | undefined>;
  updateSessionReward(
    sessionId: string,
    earnedReward: NonNullable<GameSession['earnedReward']>
  ): Promise<GameSession | undefined>;
  abandonSession(sessionId: string, reason?: string): Promise<GameSession | undefined>;
  getAllSessions(): Promise<GameSession[]>;
  deleteSession(sessionId: string): Promise<boolean>;
  deleteAllSessions(): Promise<number>;

  // --------------------------------------------------------------------------
  // Leaderboard & Analytics
  // --------------------------------------------------------------------------
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  getAdminOverview(): Promise<AdminOverviewStats>;

  // --------------------------------------------------------------------------
  // Admin Authentication, Accounts & Sessions
  // --------------------------------------------------------------------------
  findAdminByUsername(username: string): Promise<import('../../src/types/backend').AdminUser | undefined>;
  findAdminById(id: string): Promise<import('../../src/types/backend').AdminUser | undefined>;
  createAdminUser(user: Omit<import('../../src/types/backend').AdminUser, 'id' | 'createdAt'>): Promise<import('../../src/types/backend').AdminUser>;
  updateAdminUser(id: string, updates: Partial<import('../../src/types/backend').AdminUser>): Promise<import('../../src/types/backend').AdminUser | undefined>;
  getAllAdminUsers(): Promise<import('../../src/types/backend').AdminUser[]>;

  createAdminSession(session: Omit<import('../../src/types/backend').AdminSession, 'id'>): Promise<import('../../src/types/backend').AdminSession>;
  findAdminSession(token: string): Promise<import('../../src/types/backend').AdminSession | undefined>;
  deleteAdminSession(token: string): Promise<boolean>;
  deleteExpiredAdminSessions(): Promise<number>;

  // --------------------------------------------------------------------------
  // Audit Logs
  // --------------------------------------------------------------------------
  recordAuditLog(log: Omit<import('../../src/types/backend').AdminAuditLog, 'id' | 'timestamp'>): Promise<import('../../src/types/backend').AdminAuditLog>;
  getAuditLogs(limit?: number): Promise<import('../../src/types/backend').AdminAuditLog[]>;

  // --------------------------------------------------------------------------
  // Assets & Media (Phase 4A)
  // --------------------------------------------------------------------------
  createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssetRecord>;
  getAssetById(id: string): Promise<AssetRecord | undefined>;
  getAssetByObjectKey(objectKey: string): Promise<AssetRecord | undefined>;
  listAssets(filter?: { category?: AssetCategory; isActive?: boolean }): Promise<AssetRecord[]>;
  updateAsset(id: string, updates: Partial<AssetRecord>): Promise<AssetRecord | undefined>;
  deleteAsset(id: string): Promise<boolean>;

  // --------------------------------------------------------------------------
  // Bomb Configuration & Game Settings
  // --------------------------------------------------------------------------
  getBombConfigs(includeInactive?: boolean): Promise<BombConfig[]>;
  getBombConfigById(id: string): Promise<BombConfig | undefined>;
  createBombConfig(config: Omit<BombConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<BombConfig>;
  updateBombConfig(id: string, updates: Partial<BombConfig>): Promise<BombConfig | undefined>;
  deleteBombConfig(id: string): Promise<boolean>;
  isBombReferenced(id: string): Promise<boolean>;
  getBombGameSettings(): Promise<BombGameSettings>;
  updateBombGameSettings(settings: Partial<BombGameSettings>): Promise<BombGameSettings>;

  // --------------------------------------------------------------------------
  // Rewards & Spin Wheel Module
  // --------------------------------------------------------------------------
  getRewards(includeInactive?: boolean): Promise<RewardItem[]>;
  getRewardById(id: string): Promise<RewardItem | undefined>;
  createReward(reward: Omit<RewardItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<RewardItem>;
  updateReward(id: string, updates: Partial<RewardItem>): Promise<RewardItem | undefined>;
  deleteReward(id: string): Promise<boolean>;

  getScoreRewards(): Promise<ScoreRewardRange[]>;
  getScoreRewardById(id: string): Promise<ScoreRewardRange | undefined>;
  createScoreReward(range: Omit<ScoreRewardRange, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScoreRewardRange>;
  updateScoreReward(id: string, updates: Partial<ScoreRewardRange>): Promise<ScoreRewardRange | undefined>;
  deleteScoreReward(id: string): Promise<boolean>;

  getRewardsSettings(): Promise<RewardsSettings>;
  updateRewardsSettings(settings: Partial<RewardsSettings>): Promise<RewardsSettings>;

  recordSpinResult(record: Omit<SpinRecord, 'id' | 'timestamp'>): Promise<SpinRecord>;
  getSpinResults(limit?: number): Promise<SpinRecord[]>;
  getSpinResultBySessionId(sessionId: string): Promise<SpinRecord | undefined>;

  // --------------------------------------------------------------------------
  // Remote Kiosk Cloud Relay Devices
  // --------------------------------------------------------------------------
  getKioskDevices(): Promise<KioskDeviceRecord[]>;
  getKioskDeviceById(id: string): Promise<KioskDeviceRecord | undefined>;
  getKioskDeviceByToken(token: string): Promise<KioskDeviceRecord | undefined>;
  findKioskDeviceByPairingCode(code: string): Promise<KioskDeviceRecord | undefined>;
  createKioskDevice(device: Omit<KioskDeviceRecord, 'registeredAt'>): Promise<KioskDeviceRecord>;
  updateKioskDevice(id: string, updates: Partial<KioskDeviceRecord>): Promise<KioskDeviceRecord | undefined>;
  deleteKioskDevice(id: string): Promise<boolean>;
}

