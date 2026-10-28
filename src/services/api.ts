/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RegisterUserRequest,
  RegisterUserResponse,
  VerifyCodeRequest,
  VerifyCodeResponse,
  StartSessionRequest,
  StartSessionResponse,
  CompleteSessionRequest,
  CompleteSessionResponse,
  AbandonSessionRequest,
  AdminOverviewStats,
  LeaderboardEntry,
  SystemSettings,
  User,
  GameSession,
  AdminLoginRequest,
  AdminLoginResponse,
  AdminMeResponse,
  AdminSetupRequest,
  AdminAuditLog,
  AssetRecord,
  AssetCategory,
  ListAssetsResponse,
  UploadAssetResponse,
  UpdateAssetRequest,
  UpdateAdminAccountRequest,
  UpdateAdminAccountResponse,
  GameFeedback,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
  BombConfig,
  BombGameSettings,
  ListBombsResponse,
  BombOperationResponse
} from '../types/backend';

const BASE_URL = (typeof window !== 'undefined' && (window as any).__API_BASE_URL__) || import.meta.env.VITE_API_BASE_URL || '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let res: Response;
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const baseHeaders: Record<string, string> = {
    Accept: 'application/json'
  };
  if (!isFormData) {
    baseHeaders['Content-Type'] = 'application/json';
  }

  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      credentials: 'include',
      headers: {
        ...baseHeaders,
        ...options?.headers
      },
      ...options
    });
  } catch (netErr: any) {
    const error: any = new Error(netErr?.message || 'Unable to reach game server. Please check your connection.');
    error.status = 0;
    throw error;
  }

  // Attempt to parse JSON safely
  let data: any = null;
  const rawText = await res.text().catch(() => '');

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Body is not JSON
    }
  }

  if (!data) {
    let fallbackMessage = `Server returned HTTP ${res.status}`;
    if (res.status === 403) {
      fallbackMessage = 'You have already played. Each mobile number gets one chance.';
    } else if (rawText && rawText.length < 150 && !rawText.includes('<')) {
      fallbackMessage = rawText;
    }
    data = {
      success: false,
      message: fallbackMessage
    };
  }

  if (!res.ok && !data.success) {
    const errorMsg = data.message || (res.status === 403 ? 'You have already played. Each mobile number gets one chance.' : `Request failed with status ${res.status}`);
    const error: any = new Error(errorMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const gameApi = {
  /**
   * Register a user with name & 10-digit mobile number, generating/retrieving their 4-digit code.
   */
  async registerUser(req: RegisterUserRequest): Promise<RegisterUserResponse> {
    return request<RegisterUserResponse>('/register', {
      method: 'POST',
      body: JSON.stringify(req)
    });
  },

  /**
   * Verify a 4-digit code on the kiosk.
   */
  async verifyKioskCode(code: string): Promise<VerifyCodeResponse> {
    return request<VerifyCodeResponse>('/kiosk/verify-code', {
      method: 'POST',
      body: JSON.stringify({ code } as VerifyCodeRequest)
    });
  },

  /**
   * Start a gameplay session when player enters code and enters countdown.
   */
  async startSession(code: string, kioskId?: string): Promise<StartSessionResponse> {
    return request<StartSessionResponse>('/session/start', {
      method: 'POST',
      body: JSON.stringify({ code, kioskId } as StartSessionRequest)
    });
  },

  /**
   * Complete a session at Game Over with final scores, cracker counts, captured photo, and personalized wish.
   */
  async completeSession(req: CompleteSessionRequest): Promise<CompleteSessionResponse> {
    return request<CompleteSessionResponse>('/session/complete', {
      method: 'POST',
      body: JSON.stringify(req)
    });
  },

  /**
   * Submit player feedback for a completed game session.
   */
  async submitFeedback(sessionId: string, feedback: GameFeedback): Promise<SubmitFeedbackResponse> {
    return request<SubmitFeedbackResponse>('/session/feedback', {
      method: 'POST',
      body: JSON.stringify({ sessionId, feedback } as SubmitFeedbackRequest)
    });
  },

  /**
   * Mark a session as abandoned if aborted prematurely.
   */
  async abandonSession(req: AbandonSessionRequest): Promise<{ success: boolean; session: GameSession }> {
    return request('/session/abandon', {
      method: 'POST',
      body: JSON.stringify(req)
    });
  },

  /**
   * Fetch a specific game session by ID.
   */
  async getSession(sessionId: string): Promise<{ success: boolean; session: GameSession; user: User }> {
    return request(`/session/${sessionId}`);
  },

  /**
   * Fetch user details by ID.
   */
  async getUser(userId: string): Promise<{ success: boolean; user: User }> {
    return request(`/user/${userId}`);
  },

  /**
   * Fetch user details by mobile number.
   */
  async getUserByPhone(mobile: string): Promise<{ success: boolean; user: User }> {
    return request(`/user/by-phone/${mobile}`);
  },

  /**
   * Fetch high-level admin statistics and analytics.
   */
  async getAdminOverview(): Promise<{ success: boolean; stats: AdminOverviewStats }> {
    return request('/admin/overview');
  },

  /**
   * Fetch leaderboard rankings.
   */
  async getLeaderboard(limit = 10): Promise<{ success: boolean; leaderboard: LeaderboardEntry[] }> {
    return request(`/admin/leaderboard?limit=${limit}`);
  },

  /**
   * Get system settings.
   */
  async getSettings(): Promise<{
    success: boolean;
    settings: SystemSettings;
    wallpaperPlaylist?: Array<{ id: string; url: string; displayName?: string; order?: number }>;
  }> {
    return request('/settings');
  },

  /**
   * Update system settings.
   */
  async updateSettings(settings: Partial<SystemSettings>): Promise<{ success: boolean; settings: SystemSettings }> {
    return request('/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  /**
   * Fetch active bomb configs and game settings for gameplay.
   */
  async getBombs(): Promise<ListBombsResponse> {
    return request<ListBombsResponse>('/bombs');
  }
};

export const adminApi = {
  /**
   * Admin login with username and password. Sets HTTP-only session cookie.
   */
  async login(req: AdminLoginRequest): Promise<AdminLoginResponse> {
    return request<AdminLoginResponse>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(req)
    });
  },

  /**
   * Admin logout. Clears session cookie and invalidates token.
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    return request('/admin/auth/logout', {
      method: 'POST'
    });
  },

  /**
   * Check authenticated session profile.
   */
  async getMe(): Promise<AdminMeResponse> {
    return request<AdminMeResponse>('/admin/auth/me');
  },

  /**
   * Update admin account settings (change email, change password).
   */
  async updateAccount(req: UpdateAdminAccountRequest): Promise<UpdateAdminAccountResponse> {
    return request<UpdateAdminAccountResponse>('/admin/auth/account', {
      method: 'POST',
      body: JSON.stringify(req)
    });
  },

  /**
   * One-time initial superadmin account setup if no admin accounts exist.
   */
  async setup(req: AdminSetupRequest): Promise<{ success: boolean; message: string }> {
    return request('/admin/auth/setup', {
      method: 'POST',
      body: JSON.stringify(req)
    });
  },

  /**
   * Fetch aggregated overview metrics.
   */
  async getOverview(): Promise<{ success: boolean; stats: AdminOverviewStats }> {
    return request('/admin/overview');
  },

  /**
   * Fetch all registered players.
   */
  async getUsers(): Promise<{ success: boolean; users: User[]; count: number }> {
    return request('/admin/users');
  },

  /**
   * Fetch all game sessions.
   */
  async getSessions(): Promise<{ success: boolean; sessions: GameSession[]; count: number }> {
    return request('/admin/sessions');
  },

  /**
   * Fetch top leaderboard entries.
   */
  async getLeaderboard(limit = 10): Promise<{ success: boolean; leaderboard: LeaderboardEntry[] }> {
    return request(`/admin/leaderboard?limit=${limit}`);
  },

  /**
   * Get system settings.
   */
  async getSettings(): Promise<{ success: boolean; settings: SystemSettings }> {
    return request('/settings');
  },

  /**
   * Update system settings (Superadmin only).
   */
  async updateSettings(settings: Partial<SystemSettings>): Promise<{ success: boolean; settings: SystemSettings }> {
    return request('/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  /**
   * Fetch security audit logs (Superadmin only).
   */
  async getAuditLogs(limit = 50): Promise<{ success: boolean; logs: AdminAuditLog[] }> {
    return request(`/admin/auth/audit-logs?limit=${limit}`);
  },

  /**
   * List assets with optional category filter and pagination.
   */
  async listAssets(category?: AssetCategory, page = 1, pageSize = 20): Promise<ListAssetsResponse> {
    const query = new URLSearchParams();
    if (category) query.set('category', category);
    query.set('page', String(page));
    query.set('pageSize', String(pageSize));
    return request<ListAssetsResponse>(`/admin/assets?${query.toString()}`);
  },

  /**
   * Upload binary asset to configured storage provider.
   */
  async uploadAsset(
    file: File,
    category: AssetCategory,
    displayName?: string,
    order?: number
  ): Promise<UploadAssetResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    if (displayName) formData.append('displayName', displayName);
    if (order !== undefined) formData.append('order', String(order));

    return request<UploadAssetResponse>('/admin/assets/upload', {
      method: 'POST',
      body: formData
    });
  },

  /**
   * Retrieve asset metadata.
   */
  async getAsset(id: string): Promise<{ success: boolean; asset: AssetRecord }> {
    return request<{ success: boolean; asset: AssetRecord }>(`/admin/assets/${id}`);
  },

  /**
   * Update asset metadata.
   */
  async updateAsset(id: string, updates: UpdateAssetRequest): Promise<{ success: boolean; asset: AssetRecord }> {
    return request<{ success: boolean; asset: AssetRecord }>(`/admin/assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Delete asset safely (binary object & database record).
   */
  async deleteAsset(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/admin/assets/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * List all bombs (including inactive) and bomb settings.
   */
  async getBombs(): Promise<ListBombsResponse> {
    return request<ListBombsResponse>('/admin/bombs');
  },

  /**
   * Create a new bomb config.
   */
  async createBomb(bomb: Partial<BombConfig>): Promise<BombOperationResponse> {
    return request<BombOperationResponse>('/admin/bombs', {
      method: 'POST',
      body: JSON.stringify(bomb)
    });
  },

  /**
   * Update an existing bomb config.
   */
  async updateBomb(id: string, updates: Partial<BombConfig>): Promise<BombOperationResponse> {
    return request<BombOperationResponse>(`/admin/bombs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Deactivate / delete a bomb config.
   */
  async deleteBomb(id: string): Promise<{
    success: boolean;
    bombId?: string;
    name?: string;
    isDefault?: boolean;
    action?: string;
    message: string;
  }> {
    console.log(`[BombDelete API-Client] Step 3: Invoking DELETE /api/admin/bombs/${id}`);
    const res = await request<{
      success: boolean;
      bombId?: string;
      name?: string;
      isDefault?: boolean;
      action?: string;
      message: string;
    }>(`/admin/bombs/${id}`, {
      method: 'DELETE'
    });
    console.log(`[BombDelete API-Client] Step 4: DELETE response received for ${id}:`, res);
    return res;
  },

  /**
   * Fetch bomb game settings.
   */
  async getBombSettings(): Promise<{ success: boolean; settings: BombGameSettings }> {
    return request<{ success: boolean; settings: BombGameSettings }>('/admin/bombs/settings');
  },

  /**
   * Update bomb game settings.
   */
  async updateBombSettings(settings: Partial<BombGameSettings>): Promise<{ success: boolean; settings: BombGameSettings }> {
    return request<{ success: boolean; settings: BombGameSettings }>('/admin/bombs/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }
};
