/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { db } from '../storage';
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
  SystemSettings,
  User,
  GameCode,
  GameSession,
  TRIAL_CODE,
  GameFeedback,
  SubmitFeedbackRequest
} from '../../src/types/backend';
import { authenticateAdmin, requireRole } from '../auth/middleware';
import { adminAuthRouter } from './adminAuth';
import { assetsRouter } from './assets';
import { bombsRouter } from './bombs';
import { rewardsRouter } from './rewards';
import { validatePlayerName, validateMobileNumber } from '../../src/utils/validation';

export const apiRouter = Router();

// Mount Admin Auth router
apiRouter.use('/admin/auth', adminAuthRouter);

// Mount Assets & Media router
apiRouter.use(assetsRouter);

// Mount Bomb Management router
apiRouter.use(bombsRouter);

// Mount Rewards & Spin Wheel router
apiRouter.use(rewardsRouter);

// ============================================================================
// Health Check
// ============================================================================
apiRouter.get('/health', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    storage: db.getType(),
    timestamp: new Date().toISOString(),
    service: 'Diwali Motion Game Backend API'
  });
});

// ============================================================================
// System Settings
// ============================================================================
// Public read-only gameplay settings for Kiosk and Mobile
apiRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await db.getSettings();
    const wallpapers = await db.listAssets({ category: 'wallpapers', isActive: true });
    // Sort wallpaper playlist by order (asc, default to 999), then createdAt (asc), then id (asc)
    const wallpaperPlaylist = wallpapers
      .sort((a, b) => {
        const orderA = typeof a.order === 'number' && !isNaN(a.order) ? a.order : 999;
        const orderB = typeof b.order === 'number' && !isNaN(b.order) ? b.order : 999;
        if (orderA !== orderB) return orderA - orderB;
        const createdDiff = (a.createdAt || '').localeCompare(b.createdAt || '');
        if (createdDiff !== 0) return createdDiff;
        return a.id.localeCompare(b.id);
      })
      .map((w) => ({
        id: w.id,
        url: w.url,
        displayName: w.displayName || w.originalFilename,
        order: w.order
      }));

    res.json({
      success: true,
      settings,
      wallpaperPlaylist
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Protected: Superadmin only can modify settings
apiRouter.post('/settings', authenticateAdmin, requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    const updates: Partial<SystemSettings> = req.body || {};
    const updated = await db.updateSettings(updates);

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'UPDATE_SETTINGS',
        details: { fields: Object.keys(updates) },
        ip: req.ip
      });
    }

    res.json({
      success: true,
      settings: updated,
      message: 'Settings updated successfully'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// User Registration & 4-Digit Code Generation (Mobile Registration Flow)
// ============================================================================
apiRouter.post('/register', async (req: Request<{}, {}, RegisterUserRequest>, res: Response) => {
  try {
    const { name, mobileNumber } = req.body;
    const maskedMobile = typeof mobileNumber === 'string' && mobileNumber.length >= 4
      ? `******${mobileNumber.slice(-4)}`
      : 'unknown';

    // 1. Player Name Validation
    const nameVal = validatePlayerName(name);
    if (!nameVal.valid) {
      console.warn(`[Register] Name validation failed for mobile ${maskedMobile}: ${nameVal.error}`);
      return res.status(400).json({
        success: false,
        error: 'INVALID_NAME',
        message: nameVal.error || 'Please enter a correct name.'
      });
    }

    // 2. Mobile Number Validation
    const mobileVal = validateMobileNumber(mobileNumber);
    if (!mobileVal.valid) {
      console.warn(`[Register] Mobile validation failed for mobile ${maskedMobile}: ${mobileVal.error}`);
      return res.status(400).json({
        success: false,
        error: 'INVALID_MOBILE',
        message: mobileVal.error || 'Please enter a valid 10-digit mobile number.'
      });
    }

    // 3. Terms & Conditions Consent Validation
    if (req.body.termsAccepted !== true) {
      console.warn(`[Register] Terms & Conditions not accepted for mobile ${maskedMobile}`);
      return res.status(400).json({
        success: false,
        error: 'TERMS_NOT_ACCEPTED',
        message: 'You must agree to the Terms & Conditions to request an OTP.'
      });
    }

    const consentData = {
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: req.body.termsVersion || '1.0'
    };

    const cleanName = nameVal.normalized;
    const cleanMobile = mobileVal.normalized;

    let user = await db.findUserByMobile(cleanMobile);

    // 4. Mobile Duplicate Protection: One mobile number = one game chance
    if (user && user.hasPlayed) {
      console.warn(`[Register] User ${user.id} (${maskedMobile}) has already played. Blocked duplicate play.`);
      return res.json({
        success: false,
        error: 'ALREADY_PLAYED',
        message: 'You have already played. Each mobile number gets one chance.',
        user
      });
    }

    if (user) {
      // Update consent and name if changed
      user = (await db.updateUser(user.id, { name: cleanName, ...consentData })) || user;

      // Check if user already has an active or uncompleted code
      const existingCode = await db.findLatestCodeForUser(user.id);
      if (existingCode) {
        console.log(`[Register] Existing code ${existingCode.code} retrieved for user ${user.id} (${maskedMobile})`);
        const responseData: RegisterUserResponse = {
          success: true,
          user,
          code: existingCode.code,
          codeId: existingCode.id,
          expiresAt: existingCode.expiresAt,
          expiresInSeconds: 0,
          isExistingCode: true,
          message: 'Existing game pass retrieved.'
        };
        return res.json(responseData);
      }
    } else {
      // Create new user and persist consent
      user = await db.createUser(cleanName, cleanMobile);
      user = (await db.updateUser(user.id, consentData)) || user;
      console.log(`[Register] New player created: user ${user.id} (${maskedMobile})`);
    }

    // Generate new unique 4-digit code (persists until used, no 2-minute expiration)
    const codeRecord = await db.createGameCode(user.id);
    console.log(`[Register] Issued code ${codeRecord.code} for user ${user.id} (${maskedMobile})`);

    const responseData: RegisterUserResponse = {
      success: true,
      user,
      code: codeRecord.code,
      codeId: codeRecord.id,
      expiresAt: codeRecord.expiresAt,
      expiresInSeconds: 0,
      isExistingCode: false,
      message: '4-digit game code generated successfully.'
    };

    return res.status(201).json(responseData);
  } catch (err: any) {
    console.error('[API /register] Error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to process user registration.'
    });
  }
});

// ============================================================================
// Kiosk Code Verification (Touchscreen Entry Flow)
// ============================================================================
apiRouter.post('/kiosk/verify-code', async (req: Request<{}, {}, VerifyCodeRequest>, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: 'NOT_FOUND',
        message: 'Please enter a 4-digit game code.'
      });
    }

    const cleanCode = code.trim();
    if (cleanCode.length !== 4 || !/^\d{4}$/.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: 'NOT_FOUND',
        message: 'Game code must be exactly 4 digits.'
      });
    }

    // Special Trial Code 8536: Directly allows trial gameplay without touching DB or persisting data
    if (cleanCode === TRIAL_CODE) {
      const trialUser: User = {
        id: 'trial_user_8536',
        name: 'Trial Player',
        mobileNumber: '0000000000',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hasPlayed: false,
        playCount: 0
      };
      const trialCode: GameCode = {
        id: 'trial_code_8536',
        code: TRIAL_CODE,
        userId: 'trial_user_8536',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        status: 'ACTIVE'
      };
      const trialSession: GameSession = {
        id: 'trial_session_8536',
        userId: 'trial_user_8536',
        gameCodeId: 'trial_code_8536',
        code: TRIAL_CODE,
        startTime: new Date().toISOString(),
        score: 0,
        crackerCount: 0,
        maxSpeed: 0,
        comboCount: 0,
        punchCount: 0,
        status: 'INITIALIZED',
        kioskId: 'kiosk_main_65'
      };
      return res.json({
        success: true,
        valid: true,
        user: trialUser,
        code: trialCode,
        session: trialSession,
        isTrial: true,
        message: 'Welcome Trial Player! Trial mode activated.'
      });
    }

    const gameCode = await db.findCodeByCodeString(cleanCode);
    if (!gameCode) {
      return res.status(404).json({
        success: false,
        valid: false,
        reason: 'NOT_FOUND',
        message: 'Code not found. Please register on your mobile device.'
      });
    }

    const user = await db.findUserById(gameCode.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'User associated with this code was not found.'
      });
    }

    // Check duplicate chance: if user has already completed a game
    if (user.hasPlayed) {
      console.warn(`[Verify] Verification rejected: User ${user.id} already completed their game.`);
      return res.json({
        success: true,
        valid: false,
        reason: 'ALREADY_PLAYED',
        user,
        code: gameCode,
        message: 'You have already played. Each mobile number gets one chance.'
      });
    }

    if (gameCode.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: 'CANCELLED',
        code: gameCode,
        message: 'This game code is no longer valid.'
      });
    }

    // Check if code was already marked USED
    if (gameCode.status === 'USED') {
      const existingSession = await db.findSessionByGameCodeId(gameCode.id);
      // If the session associated with this code was already COMPLETED, reject
      if (existingSession && existingSession.status === 'COMPLETED') {
        return res.status(409).json({
          success: false,
          valid: false,
          reason: 'USED',
          code: gameCode,
          message: 'CODE ALREADY USED'
        });
      }

      // If session exists and wasn't completed, or code was marked used without completion, allow resuming!
      let session = existingSession;
      if (!session) {
        session = await db.createSession(user.id, gameCode.id, gameCode.code);
      }

      console.log(`[Verify] Resuming uncompleted game session ${session.id} for user ${user.id} (${cleanCode})`);
      const response: VerifyCodeResponse = {
        success: true,
        valid: true,
        user,
        code: gameCode,
        session,
        message: `Welcome back ${user?.name || 'Player'}! Resuming session.`
      };
      return res.json(response);
    }

    // Code is ACTIVE: Mark code as used/locked upon verification to prevent concurrent use
    await db.markCodeUsed(gameCode.id);
    let session = await db.findSessionByGameCodeId(gameCode.id);
    if (!session) {
      session = await db.createSession(user.id, gameCode.id, gameCode.code);
    }

    const response: VerifyCodeResponse = {
      success: true,
      valid: true,
      user,
      code: gameCode,
      session,
      message: `Welcome ${user?.name || 'Player'}! Code verified successfully.`
    };

    return res.json(response);
  } catch (err: any) {
    console.error('[API /kiosk/verify-code] Error:', err);
    return res.status(500).json({
      success: false,
      valid: false,
      message: err.message || 'Failed to verify code.'
    });
  }
});

// ============================================================================
// Game Session Management
// ============================================================================
apiRouter.post('/session/start', async (req: Request<{}, {}, StartSessionRequest>, res: Response) => {
  try {
    const { code, kioskId } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Game code is required to initiate a session.'
      });
    }

    const cleanCode = code.trim();

    // Special Trial Code 8536: In-memory session start without DB writes
    if (cleanCode === TRIAL_CODE) {
      const trialSession: GameSession = {
        id: 'trial_session_8536',
        userId: 'trial_user_8536',
        gameCodeId: 'trial_code_8536',
        code: TRIAL_CODE,
        startTime: new Date().toISOString(),
        score: 0,
        crackerCount: 0,
        maxSpeed: 0,
        comboCount: 0,
        punchCount: 0,
        status: 'PLAYING',
        kioskId: kioskId || 'kiosk_main_65'
      };
      const trialUser: User = {
        id: 'trial_user_8536',
        name: 'Trial Player',
        mobileNumber: '0000000000',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hasPlayed: false,
        playCount: 0
      };
      return res.status(200).json({
        success: true,
        session: trialSession,
        user: trialUser,
        isTrial: true,
        message: 'Trial game session started (in-memory only).'
      });
    }

    const gameCode = await db.findCodeByCodeString(cleanCode);

    if (!gameCode) {
      return res.status(404).json({
        success: false,
        message: 'Game code not found.'
      });
    }

    const user = await db.findUserById(gameCode.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User associated with this code was not found.'
      });
    }

    // Session Start Bug Fix: Look up session by gameCodeId cleanly on the StorageAdapter
    let session = await db.findSessionByGameCodeId(gameCode.id);

    if (session) {
      // Session already exists for this verified game code.
      // Ensure status is marked as PLAYING if not finished.
      if (session.status !== 'COMPLETED' && session.status !== 'ABANDONED') {
        session.status = 'PLAYING';
      }
    } else {
      // Single-use code starts exactly one valid session
      await db.markCodeUsed(gameCode.id);
      session = await db.createSession(user.id, gameCode.id, gameCode.code, kioskId);
    }

    const response: StartSessionResponse = {
      success: true,
      session,
      user,
      message: 'Game session started.'
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[API /session/start] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to start game session.'
    });
  }
});

apiRouter.post('/session/complete', async (req: Request<{}, {}, CompleteSessionRequest>, res: Response) => {
  try {
    const {
      sessionId,
      score,
      crackerCount,
      maxSpeed,
      comboCount,
      punchCount,
      photoData,
      wishTitle,
      wishMessage,
      feedback,
      combosCount,
      penaltyDeductions,
      comboBonusPoints,
      targetScore,
      targetAchieved
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required.'
      });
    }

    // Special Trial Session: Ephemeral completion without DB writes, audits, or asset uploads
    if (sessionId === 'trial_session_8536' || sessionId.startsWith('trial_')) {
      const trialSession: GameSession = {
        id: sessionId,
        userId: 'trial_user_8536',
        gameCodeId: 'trial_code_8536',
        code: TRIAL_CODE,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        score: Number(score) || 0,
        crackerCount: Number(crackerCount) || 0,
        maxSpeed: Number(maxSpeed) || 0,
        comboCount: Number(comboCount) || 0,
        punchCount: Number(punchCount) || 0,
        photoUrl: photoData || null,
        wishTitle: wishTitle || 'Happy Diwali!',
        wishMessage: wishMessage || 'Wishing you joyous festivities!',
        status: 'COMPLETED',
        combosCount: typeof combosCount === 'number' ? combosCount : undefined,
        penaltyDeductions: typeof penaltyDeductions === 'number' ? penaltyDeductions : undefined,
        comboBonusPoints: typeof comboBonusPoints === 'number' ? comboBonusPoints : undefined,
        targetScore: typeof targetScore === 'number' ? targetScore : undefined,
        targetAchieved: typeof targetAchieved === 'boolean' ? targetAchieved : undefined
      };
      const trialUser: User = {
        id: 'trial_user_8536',
        name: 'Trial Player',
        mobileNumber: '0000000000',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hasPlayed: false,
        playCount: 0
      };
      return res.json({
        success: true,
        session: trialSession,
        user: trialUser,
        isTrial: true,
        message: 'Trial session completed (not recorded in database).'
      });
    }

    const existing = await db.getSessionById(sessionId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Game session ${sessionId} not found.`
      });
    }

    const validFeedbacks: GameFeedback[] = ['Good', 'Excellent', 'Needs Improvement'];
    const sanitizedFeedback = feedback && validFeedbacks.includes(feedback) ? feedback : undefined;

    const { session, user } = await db.completeSession(sessionId, {
      score: Number(score) || 0,
      crackerCount: Number(crackerCount) || 0,
      maxSpeed: Number(maxSpeed) || 0,
      comboCount: Number(comboCount) || 0,
      punchCount: Number(punchCount) || 0,
      photoData,
      wishTitle,
      wishMessage,
      feedback: sanitizedFeedback,
      combosCount: typeof combosCount === 'number' ? combosCount : undefined,
      penaltyDeductions: typeof penaltyDeductions === 'number' ? penaltyDeductions : undefined,
      comboBonusPoints: typeof comboBonusPoints === 'number' ? comboBonusPoints : undefined,
      targetScore: typeof targetScore === 'number' ? targetScore : undefined,
      targetAchieved: typeof targetAchieved === 'boolean' ? targetAchieved : undefined
    });

    const response: CompleteSessionResponse = {
      success: true,
      session,
      user,
      message: 'Game session completed and recorded successfully.'
    };

    return res.json(response);
  } catch (err: any) {
    console.error('[API /session/complete] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to complete game session.'
    });
  }
});

// ============================================================================
// Public / Admin session photo retrieval endpoint
// Returns binary JPEG/PNG image for direct viewing, linking in CSV, or browser download
// ============================================================================
apiRouter.get('/session/:id/photo', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).send('Session ID is required.');
    }

    const session = await db.getSessionById(id);
    if (!session || !session.photoUrl) {
      return res.status(404).send('Photo not found.');
    }

    // If it's already an external HTTP/HTTPS URL, redirect directly
    if (session.photoUrl.startsWith('http://') || session.photoUrl.startsWith('https://')) {
      return res.redirect(session.photoUrl);
    }

    // If it's a data URL, decode base64 and send binary image
    if (session.photoUrl.startsWith('data:image/')) {
      const matches = session.photoUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        const mimeSub = matches[1].toLowerCase();
        const mimeType = mimeSub === 'jpg' ? 'image/jpeg' : `image/${mimeSub}`;
        const imgBuffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Length', imgBuffer.length);
        return res.send(imgBuffer);
      }
    }

    return res.status(404).send('Invalid photo format.');
  } catch (err: any) {
    console.error('[API /session/:id/photo] Error:', err);
    return res.status(500).send('Error retrieving photo.');
  }
});

apiRouter.get('/sessions/:id/photo', async (req: Request, res: Response) => {
  res.redirect(`/api/session/${req.params.id}/photo`);
});

// ============================================================================
// Game Feedback Submission
// ============================================================================
apiRouter.post('/session/feedback', async (req: Request<{}, {}, SubmitFeedbackRequest>, res: Response) => {
  try {
    const { sessionId, feedback } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required.'
      });
    }

    const validFeedbacks: GameFeedback[] = ['Good', 'Excellent', 'Needs Improvement'];
    if (!feedback || !validFeedbacks.includes(feedback)) {
      return res.status(400).json({
        success: false,
        message: 'Valid feedback option is required (Good, Excellent, or Needs Improvement).'
      });
    }

    // Special Trial Session: Ephemeral acknowledgement without DB writes
    if (sessionId === 'trial_session_8536' || sessionId.startsWith('trial_')) {
      return res.json({
        success: true,
        feedback,
        isTrial: true,
        message: 'Trial session feedback skipped (not recorded in database).'
      });
    }

    const session = await db.getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: `Game session ${sessionId} not found.`
      });
    }

    if (session.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Feedback can only be submitted for completed games.'
      });
    }

    await db.updateSessionFeedback(sessionId, feedback);

    return res.json({
      success: true,
      feedback,
      message: 'Feedback submitted successfully.'
    });
  } catch (err: any) {
    console.error('[API /session/feedback] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to submit feedback.'
    });
  }
});

apiRouter.post('/session/abandon', async (req: Request<{}, {}, AbandonSessionRequest>, res: Response) => {
  try {
    const { sessionId, reason } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required.' });
    }

    // Special Trial Session
    if (sessionId === 'trial_session_8536' || sessionId.startsWith('trial_')) {
      return res.json({
        success: true,
        message: 'Trial session abandoned (not recorded in database).'
      });
    }

    const session = await db.abandonSession(sessionId, reason);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    return res.json({
      success: true,
      session,
      message: 'Game session marked as abandoned.'
    });
  } catch (err: any) {
    console.error('[API /session/abandon] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/session/:id', async (req: Request, res: Response) => {
  try {
    if (req.params.id === 'trial_session_8536' || req.params.id.startsWith('trial_')) {
      return res.json({
        success: true,
        session: {
          id: req.params.id,
          userId: 'trial_user_8536',
          code: TRIAL_CODE,
          status: 'COMPLETED',
          score: 0,
          crackerCount: 0,
          maxSpeed: 0,
          comboCount: 0,
          punchCount: 0,
          startTime: new Date().toISOString()
        },
        user: {
          id: 'trial_user_8536',
          name: 'Trial Player',
          mobileNumber: '0000000000'
        }
      });
    }

    const session = await db.getSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const user = await db.findUserById(session.userId);
    return res.json({ success: true, session, user });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// User Queries
// ============================================================================
apiRouter.get('/user/:id', async (req: Request, res: Response) => {
  try {
    const user = await db.findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const activeCode = await db.findActiveCodeForUser(user.id);
    const userSessions = (await db.getAllSessions()).filter((s) => s.userId === user.id);
    return res.json({ success: true, user, activeCode, sessions: userSessions });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/user/by-phone/:mobile', async (req: Request, res: Response) => {
  try {
    const user = await db.findUserByMobile(req.params.mobile);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const activeCode = await db.findActiveCodeForUser(user.id);
    const userSessions = (await db.getAllSessions()).filter((s) => s.userId === user.id);
    return res.json({ success: true, user, activeCode, sessions: userSessions });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// Admin & Dashboard Foundations (Analytics & Leaderboard) - Protected
// ============================================================================
apiRouter.get('/admin/overview', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await db.getAdminOverview();
    return res.json({
      success: true,
      stats
    });
  } catch (err: any) {
    console.error('[API /admin/overview] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/admin/users', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await db.getAllUsers();
    return res.json({ success: true, users, count: users.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/admin/users/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Player record not found.' });
    }
    const deleted = await db.deleteUser(userId);
    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'DELETE_USER',
        details: { userId, userName: user.name, mobile: user.mobileNumber }
      });
    }
    return res.json({ success: deleted, message: 'Player registration deleted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/admin/users', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const count = await db.deleteAllUsers();
    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'DELETE_ALL_USERS',
        details: { deletedCount: count }
      });
    }
    return res.json({ success: true, count, message: `Successfully deleted ${count} player registrations.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/admin/sessions', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const sessions = await db.getAllSessions();
    return res.json({ success: true, sessions, count: sessions.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/admin/sessions/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id;
    const session = await db.getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session record not found.' });
    }
    const deleted = await db.deleteSession(sessionId);
    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'DELETE_SESSION',
        details: { sessionId, score: session.score, userId: session.userId }
      });
    }
    return res.json({ success: deleted, message: 'Game session deleted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/admin/sessions', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const count = await db.deleteAllSessions();
    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'DELETE_ALL_SESSIONS',
        details: { deletedCount: count }
      });
    }
    return res.json({ success: true, count, message: `Successfully deleted ${count} game sessions.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/admin/leaderboard', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const leaderboard = await db.getLeaderboard(limit);
    return res.json({ success: true, leaderboard });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
