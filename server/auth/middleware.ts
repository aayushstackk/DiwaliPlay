/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../storage';
import { AdminUser, AdminSession, AdminRole } from '../../src/types/backend';

// Extend Express Request to include authenticated admin information
declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUser;
      adminSession?: AdminSession;
    }
  }
}

export const ADMIN_COOKIE_NAME = 'diwali_admin_session';

// In-memory brute force protection tracking
interface AttemptRecord {
  failures: number;
  lockedUntil?: number;
  lastAttempt: number;
}
const loginAttempts = new Map<string, AttemptRecord>();
const MAX_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(req: Request, res: Response, next: NextFunction) {
  const isProd = process.env.NODE_ENV === 'production';
  // In local development, bypass the in-memory 15-minute lockout to avoid halting development workflow
  if (!isProd) {
    return next();
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').trim().toLowerCase();
  const key = `${ip}:${username}`;

  const record = loginAttempts.get(key);
  if (record && record.lockedUntil && record.lockedUntil > Date.now()) {
    const remainingMins = Math.ceil((record.lockedUntil - Date.now()) / (60 * 1000));
    return res.status(429).json({
      success: false,
      error: 'TOO_MANY_ATTEMPTS',
      message: `Too many failed login attempts. Account locked for ${remainingMins} more minute(s).`
    });
  }

  next();
}

export function recordFailedLogin(req: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').trim().toLowerCase();
  const key = `${ip}:${username}`;
  const now = Date.now();

  const record = loginAttempts.get(key) || { failures: 0, lastAttempt: now };
  record.failures += 1;
  record.lastAttempt = now;

  if (isProd && record.failures >= MAX_FAILURES) {
    record.lockedUntil = now + LOCKOUT_WINDOW_MS;
    console.warn(`[Admin Auth] Brute force threshold exceeded for ${key}. Locked for 15 minutes.`);
  }

  loginAttempts.set(key, record);
}

export function clearFailedLogins(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').trim().toLowerCase();
  const key = `${ip}:${username}`;
  loginAttempts.delete(key);
}

/**
 * Safely clears all in-memory login lockout rate limits.
 */
export function resetAllLoginRateLimits(): void {
  loginAttempts.clear();
}

/**
 * Authentication middleware for all admin endpoints.
 * Extracts session token from HTTP-only cookie or Authorization: Bearer <token>.
 */
export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // 1. Check HTTP-only cookie
    if (req.cookies && req.cookies[ADMIN_COOKIE_NAME]) {
      token = req.cookies[ADMIN_COOKIE_NAME];
    }

    // 2. Fallback to Authorization: Bearer <token>
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Authentication required to access admin resources.'
      });
    }

    const session = await db.findAdminSession(token);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Admin session is invalid or expired. Please log in again.'
      });
    }

    const admin = await db.findAdminById(session.adminId);
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Admin account associated with session was not found.'
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_DISABLED',
        message: 'This admin account has been deactivated.'
      });
    }

    req.adminUser = admin;
    req.adminSession = session;
    next();
  } catch (err: any) {
    console.error('[Admin Auth] Error in authentication middleware:', err);
    return res.status(500).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Failed to verify admin authentication.'
    });
  }
}

/**
 * Role-based authorization middleware.
 */
export function requireRole(allowedRoles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminUser) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.adminUser.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Insufficient privileges. Required role: ' + allowedRoles.join(' or ')
      });
    }

    next();
  };
}
