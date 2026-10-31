/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Backend Data Models and API Contracts
 * for Diwali Motion Game Kiosk & Mobile Registration
 */

export type GameFeedback = 'Good' | 'Excellent' | 'Needs Improvement';

export interface User {
  id: string;
  name: string;
  mobileNumber: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  hasPlayed: boolean;
  playCount: number;
  feedback?: GameFeedback | null;
  termsAccepted?: boolean;
  termsAcceptedAt?: string | null;
  termsVersion?: string | null;
}

export type GameCodeStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';

export interface GameCode {
  id: string;
  code: string; // Unique 4-digit code e.g. "7392"
  userId: string;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  usedAt?: string | null; // ISO 8601
  status: GameCodeStatus;
}

export type GameSessionStatus = 'INITIALIZED' | 'PLAYING' | 'COMPLETED' | 'ABANDONED';

export interface GameSession {
  id: string;
  userId: string;
  gameCodeId: string;
  code: string;
  startTime: string; // ISO 8601
  endTime?: string | null; // ISO 8601
  score: number;
  crackerCount: number;
  maxSpeed: number;
  comboCount: number;
  punchCount: number;
  photoUrl?: string | null; // Data URL or storage URL
  wishTitle?: string | null;
  wishMessage?: string | null;
  status: GameSessionStatus;
  kioskId?: string;
  feedback?: GameFeedback | null;
  combosCount?: number;
  penaltyDeductions?: number;
  comboBonusPoints?: number;
  targetScore?: number;
  targetAchieved?: boolean;
  earnedReward?: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    couponCode: string;
    termsAndConditions?: string;
  } | null;
}

export type GameplayInteractionMode = 'camera' | 'touch';

// ============================================================================
// Sound Studio & Game Audio Management Models
// ============================================================================
export type SfxKey =
  | 'firework_launch'
  | 'explosion'
  | 'sparkler'
  | 'bomb_impact'
  | 'points_score'
  | 'game_over'
  | 'photo_shutter';

export interface SoundEffectConfig {
  soundId: string; // built-in ID or custom asset URL
  volume: number; // 0 to 100
  customAssetId?: string | null;
  customUrl?: string | null;
}

export interface BackgroundMusicConfig {
  activeTrackId: string; // built-in ID, asset ID, or 'none'
  activeTrackUrl?: string | null;
  volume: number; // 0 to 100
  isMuted: boolean;
  loop: boolean;
}

export interface ComboAudioConfig {
  soundId: string; // built-in ID ('combo_ding', 'combo_energy_burst', etc.) or custom asset URL
  volume: number; // 0 to 100
  customAssetId?: string | null;
  customUrl?: string | null;
}

export interface AchievementTier {
  id: string;
  title: string;
  subtitle?: string;
  minScore: number;
  maxScore: number | null; // null for open-ended max (e.g. 2000+)
  emoji?: string;
  badgeColor?: string;
  wishes: string[];
}

export interface CountdownAudioConfig {
  soundThree: string; // sound ID or custom URL
  soundTwo: string;
  soundOne: string;
  soundGo: string;
  volume: number; // 0 to 100
  customUrls?: {
    three?: string | null;
    two?: string | null;
    one?: string | null;
    go?: string | null;
  };
}

export interface SoundPreset {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  countdown: CountdownAudioConfig;
  bgm: BackgroundMusicConfig;
  sfx: Record<SfxKey, SoundEffectConfig>;
}

export interface GameAudioSettings {
  activePresetId?: string; // e.g. 'festive_diwali' | 'classic_arcade' | 'premium_celebration'
  masterVolume?: number; // 0 to 100
  isMuted?: boolean;
  bgm: BackgroundMusicConfig;
  combo?: ComboAudioConfig;
  countdown?: CountdownAudioConfig;
  sfx?: Record<string, SoundEffectConfig>;
  presets?: SoundPreset[];
}

export type BrandingDisplayMode = 'both' | 'name' | 'logo';

export interface SystemSettings {
  allowMultiplePlaysPerUser: boolean;
  codeExpirySeconds: number; // default: 120 (2 minutes)
  gameDurationSeconds: number; // default: 35
  gameplayMode?: GameplayInteractionMode; // 'camera' (Webcam Hand Tracking) | 'touch' (Direct Touchscreen/Click) (default: 'camera')
  brandName: string; // default: "ItsSpotlight"
  brandLogoUrl?: string; // dynamic company logo URL
  brandingDisplayMode?: BrandingDisplayMode; // 'both' (Name + Logo) | 'name' (Name Only) | 'logo' (Logo Only) (default: 'both')
  wallpaperUrl?: string; // dynamic full-screen wallpaper URL
  experienceTitle?: string; // Line 1: Experience Title (default: "DIWALI FUN PLAY")
  connectorText?: string; // Line 2: Connector Text (default: "by")
  logoWidth?: number; // width in px (default: 160)
  logoHeight?: number; // height in px (default: 48)
  logoPosition?: { x: number; y: number }; // position offset { x: 0, y: 0 }
  wallpaperOpacity?: number; // 0-100 (default: 100)
  wallpaperEnabled?: boolean; // ON: show uploaded wallpaper; OFF: show live webcam background (default: true)
  targetScoreEnabled?: boolean; // ON: track target score progress bar and popup; OFF: disabled (default: false)
  targetScore?: number; // target points to achieve, e.g. 5000 (default: 5000)
  rewardsEnabled?: boolean; // Main ON/OFF toggle for Rewards & Spin Wheel (default: true)
  audioSettings?: GameAudioSettings;
  achievementTiers?: AchievementTier[];
}

// Request / Response DTOs

export interface RegisterUserRequest {
  name: string;
  mobileNumber: string;
  termsAccepted?: boolean;
  termsVersion?: string;
}

export interface RegisterUserResponse {
  success: boolean;
  user: User;
  code: string; // 4-digit code
  codeId: string;
  expiresAt: string;
  expiresInSeconds: number;
  isExistingCode?: boolean;
  message?: string;
}

export const TRIAL_CODE = '8536';

export interface VerifyCodeRequest {
  code: string;
}

export interface VerifyCodeResponse {
  success: boolean;
  valid: boolean;
  user?: User;
  code?: GameCode;
  session?: GameSession;
  reason?: 'NOT_FOUND' | 'EXPIRED' | 'USED' | 'CANCELLED' | 'ALREADY_PLAYED';
  message: string;
  isTrial?: boolean;
}

export interface StartSessionRequest {
  code: string;
  kioskId?: string;
}

export interface StartSessionResponse {
  success: boolean;
  session: GameSession;
  user: User;
  message?: string;
  isTrial?: boolean;
}

export interface CompleteSessionRequest {
  sessionId: string;
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
  earnedReward?: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    couponCode: string;
    termsAndConditions?: string;
  } | null;
}

export interface CompleteSessionResponse {
  success: boolean;
  session: GameSession;
  user: User;
  message?: string;
  isTrial?: boolean;
}

export interface SubmitFeedbackRequest {
  sessionId: string;
  feedback: GameFeedback;
}

export interface SubmitFeedbackResponse {
  success: boolean;
  message: string;
  feedback?: GameFeedback;
  isTrial?: boolean;
}

export interface AbandonSessionRequest {
  sessionId: string;
  reason?: string;
}

export interface LeaderboardEntry {
  rank: number;
  sessionId: string;
  userId: string;
  userName: string;
  score: number;
  crackerCount: number;
  maxSpeed: number;
  completedAt: string;
}

export interface AdminOverviewStats {
  totalUsers: number;
  totalSessions: number;
  completedSessions: number;
  activeCodes: number;
  averageScore: number;
  highestScore: number;
  leaderboard: LeaderboardEntry[];
  recentSessions: GameSession[];
  recentUsers: User[];
}

// ============================================================================
// Admin Authentication & Access Control Models
// ============================================================================
export type AdminRole = 'superadmin' | 'operator';

export interface AdminUser {
  id: string;
  username: string; // unique, lowercase normalized
  passwordHash: string; // scrypt:<salt>:<derivedKey>
  role: AdminRole;
  isActive: boolean;
  createdAt: string; // ISO 8601
  lastLoginAt?: string | null;
  email?: string;
}

export interface AdminSession {
  id: string; // Secure random token
  adminId: string;
  username: string;
  role: AdminRole;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ip?: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  username: string;
  action: string; // e.g. 'ADMIN_LOGIN', 'UPDATE_SETTINGS', 'CREATE_OPERATOR'
  target?: string;
  details?: Record<string, any>;
  ip?: string;
  timestamp: string; // ISO 8601
}

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface AdminLoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    email?: string;
    role: AdminRole;
    lastLoginAt?: string | null;
  };
  message?: string;
}

export interface AdminMeResponse {
  success: boolean;
  user?: {
    id: string;
    username: string;
    email?: string;
    role: AdminRole;
    lastLoginAt?: string | null;
  };
  message?: string;
}

export interface AdminSetupRequest {
  username: string;
  password: string;
}

export interface CreateAdminUserRequest {
  username: string;
  password: string;
  role: AdminRole;
}

export interface UpdateAdminAccountRequest {
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateAdminAccountResponse {
  success: boolean;
  user?: {
    id: string;
    username: string;
    email?: string;
    role: AdminRole;
    lastLoginAt?: string | null;
  };
  message?: string;
}

// ============================================================================
// Asset Storage & Management Models (Phase 4A)
// ============================================================================
export type AssetCategory = 'wallpapers' | 'brand_logos' | 'audio_tracks' | 'cracker_effects' | 'bomb_assets' | 'reward_images';

export interface AssetRecord {
  id: string; // Stable unique ID e.g. "asset_abc123"
  category: AssetCategory;
  originalFilename: string;
  objectKey: string; // Generated sanitized key e.g. "wallpapers/wlp_1728639200_a1b2c3d4.jpg"
  mimeType: string;
  fileSize: number; // In bytes
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  uploaderId: string;
  uploaderUsername: string;
  isActive: boolean;
  displayName?: string;
  order?: number;
  url: string; // Serving URL e.g. "/api/assets/asset_abc123/content"
  storageProvider: 'local' | 'gcs';
}

export interface ListAssetsResponse {
  success: boolean;
  assets: AssetRecord[];
  total: number;
  page: number;
  pageSize: number;
  storageProvider: 'local' | 'gcs';
  isProductionReady: boolean;
  setupHelp?: string;
}

export interface UploadAssetResponse {
  success: boolean;
  asset: AssetRecord;
  message?: string;
}

export interface UpdateAssetRequest {
  displayName?: string;
  order?: number;
  isActive?: boolean;
}

// ============================================================================
// Bomb Configuration & Gameplay Settings Models
// ============================================================================
export type BombSoundPreset = 'pop' | 'blast' | 'chime' | 'penalty_buzz' | 'rocket' | 'sparkle' | 'custom';
export type BombImagePreset = 'red_classic' | 'blue_happy' | 'green_super' | 'black_penalty' | 'custom';

export interface BombConfig {
  id: string;
  name: string;
  color: string;
  points: number;
  spawnWeight: number;
  soundPreset: BombSoundPreset;
  soundAssetId?: string | null;
  soundUrl?: string | null;
  imagePreset: BombImagePreset;
  imageAssetId?: string | null;
  imageUrl?: string | null;
  sizePercent?: number;
  isActive: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BombGameSettings {
  minSpawnDelayMs: number;
  maxSpawnDelayMs: number;
  maxConcurrentBombs: number;
  bombRadius: number;
  bombLifetimeMs: number;
  launchSpeedMultiplier?: number;
  gravityMultiplier?: number;
  maxBurstSize?: number;
  burstIntervalMs?: number;
}

export interface ListBombsResponse {
  success: boolean;
  bombs: BombConfig[];
  settings: BombGameSettings;
  message?: string;
}

export interface BombOperationResponse {
  success: boolean;
  bomb?: BombConfig;
  settings?: BombGameSettings;
  message?: string;
}

// ============================================================================
// Rewards & Spin Wheel Module
// ============================================================================

export type RewardMode = 'chance' | 'score';

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  couponCode: string;
  termsAndConditions: string;
  chances: number; // Probability weight for Chance Based rewards
  mode?: RewardMode; // 'chance' (default) or 'score'
  isActive?: boolean;
  minScore?: number; // Minimum score bracket for Score Based reward
  maxScore?: number; // Maximum score bracket for Score Based reward
  createdAt: string;
  updatedAt: string;
}

export interface ScoreRewardRange {
  id: string;
  minScore: number;
  maxScore: number;
  rewardId: string;
  reward?: RewardItem; // Populated reward details if available
  createdAt: string;
  updatedAt: string;
}

export interface RewardsSettings {
  enabled: boolean; // Main ON/OFF toggle for complete Rewards & Spin Wheel feature
}

export interface SpinRecord {
  id: string;
  userId?: string;
  playerName: string;
  mobileNumber?: string;
  sessionId?: string;
  rewardId: string;
  rewardName: string;
  couponCode: string;
  rewardImageUrl: string;
  termsAndConditions?: string;
  timestamp: string;
}

export interface SpinWheelRequest {
  userId?: string;
  playerName?: string;
  mobileNumber?: string;
  sessionId?: string;
}

export interface SpinWheelResponse {
  success: boolean;
  reward?: RewardItem;
  rewardIndex?: number;
  spinRecord?: SpinRecord;
  alreadySpun?: boolean;
  isMaster?: boolean;
  message?: string;
}

export interface RewardsDataResponse {
  success: boolean;
  enabled: boolean;
  rewards: RewardItem[];
  scoreRewards?: ScoreRewardRange[];
  spinResults?: SpinRecord[];
  message?: string;
}



