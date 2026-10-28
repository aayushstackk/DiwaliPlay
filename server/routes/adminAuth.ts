/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { db } from '../storage';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  normalizeUsername
} from '../auth/password';
import {
  authenticateAdmin,
  requireRole,
  checkLoginRateLimit,
  recordFailedLogin,
  clearFailedLogins,
  resetAllLoginRateLimits,
  ADMIN_COOKIE_NAME
} from '../auth/middleware';
import {
  AdminLoginRequest,
  AdminLoginResponse,
  AdminMeResponse,
  AdminSetupRequest,
  CreateAdminUserRequest,
  UpdateAdminAccountRequest,
  UpdateAdminAccountResponse,
  AdminUser
} from '../../src/types/backend';

export const adminAuthRouter = Router();

const SESSION_DURATION_HOURS = 8;

/**
 * Cookie options helper adhering to security best practices.
 */
function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, // Secure in production HTTPS
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DURATION_HOURS * 60 * 60 * 1000
  };
}

// ============================================================================
// One-Time Initial Setup (Only accessible when 0 admins exist)
// ============================================================================
adminAuthRouter.post('/setup', async (req: Request<{}, {}, AdminSetupRequest>, res: Response) => {
  try {
    const existingAdmins = await db.getAllAdminUsers();
    if (existingAdmins.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'ALREADY_INITIALIZED',
        message: 'Admin account has already been initialized. Please use standard login.'
      });
    }

    const { username, password } = req.body;
    const cleanUsername = normalizeUsername(username);

    if (!cleanUsername || cleanUsername.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_USERNAME',
        message: 'Username must be at least 3 characters long.'
      });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: strength.error || 'Password does not meet complexity requirements.'
      });
    }

    const passwordHash = await hashPassword(password);
    const superadmin = await db.createAdminUser({
      username: cleanUsername,
      passwordHash,
      role: 'superadmin',
      isActive: true
    });

    await db.recordAuditLog({
      adminId: superadmin.id,
      username: superadmin.username,
      action: 'INITIAL_ADMIN_SETUP',
      details: { role: 'superadmin' },
      ip: req.ip
    });

    return res.status(201).json({
      success: true,
      message: `Initial superadmin account "${cleanUsername}" created successfully. Please log in.`
    });
  } catch (err: any) {
    console.error('[Admin Auth /setup] Error:', err);
    return res.status(500).json({
      success: false,
      error: 'SETUP_ERROR',
      message: err.message || 'Failed to initialize admin account.'
    });
  }
});

// ============================================================================
// Admin Login (Protected by brute force rate-limiter)
// ============================================================================
adminAuthRouter.post(
  '/login',
  checkLoginRateLimit,
  async (req: Request<{}, {}, AdminLoginRequest>, res: Response) => {
    try {
      const { username, password } = req.body;
      const cleanUsername = normalizeUsername(username);

      if (!cleanUsername || !password) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CREDENTIALS',
          message: 'Username and password are required.'
        });
      }

      const admin = await db.findAdminByUsername(cleanUsername);
      if (!admin) {
        recordFailedLogin(req);
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password.'
        });
      }

      if (!admin.isActive) {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_DISABLED',
          message: 'This admin account has been deactivated.'
        });
      }

      const isMatch = await verifyPassword(password, admin.passwordHash);
      if (!isMatch) {
        recordFailedLogin(req);
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password.'
        });
      }

      // Successful authentication
      clearFailedLogins(req);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();

      const session = await db.createAdminSession({
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        createdAt: now.toISOString(),
        expiresAt,
        userAgent: req.headers['user-agent']?.slice(0, 150),
        ip: req.ip
      });

      // Update last login timestamp
      await db.updateAdminUser(admin.id, {
        lastLoginAt: now.toISOString()
      });

      // Set secure HTTP-only cookie
      res.cookie(ADMIN_COOKIE_NAME, session.id, getCookieOptions());

      await db.recordAuditLog({
        adminId: admin.id,
        username: admin.username,
        action: 'ADMIN_LOGIN',
        details: { role: admin.role },
        ip: req.ip
      });

      const responseData: AdminLoginResponse = {
        success: true,
        token: session.id,
        user: {
          id: admin.id,
          username: admin.username,
          email: admin.email || '',
          role: admin.role,
          lastLoginAt: admin.lastLoginAt
        },
        message: 'Admin authentication successful.'
      };

      return res.json(responseData);
    } catch (err: any) {
      console.error('[Admin Auth /login] Error:', err);
      return res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Failed to process login.'
      });
    }
  }
);

// ============================================================================
// Admin Logout
// ============================================================================
adminAuthRouter.post('/logout', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    if (req.adminSession) {
      await db.deleteAdminSession(req.adminSession.id);
    }

    res.clearCookie(ADMIN_COOKIE_NAME, {
      path: '/'
    });

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'ADMIN_LOGOUT',
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (err: any) {
    console.error('[Admin Auth /logout] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to logout cleanly.'
    });
  }
});

// ============================================================================
// Current Session Profile
// ============================================================================
adminAuthRouter.get('/me', authenticateAdmin, async (req: Request, res: Response) => {
  const admin = req.adminUser!;
  const response: AdminMeResponse = {
    success: true,
    user: {
      id: admin.id,
      username: admin.username,
      email: admin.email || '',
      role: admin.role,
      lastLoginAt: admin.lastLoginAt
    }
  };
  return res.json(response);
});

// ============================================================================
// Admin Account Settings (Change Email & Password)
// ============================================================================
adminAuthRouter.post(
  '/account',
  authenticateAdmin,
  async (req: Request<{}, {}, UpdateAdminAccountRequest>, res: Response) => {
    try {
      const admin = req.adminUser!;
      const { email, currentPassword, newPassword } = req.body;

      const updates: Partial<AdminUser> = {};
      let emailChanged = false;
      let passwordChanged = false;

      // 1. Email validation & update
      if (email !== undefined) {
        const cleanEmail = email.trim();
        if (cleanEmail !== '') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_EMAIL',
              message: 'Please provide a valid email address.'
            });
          }
          updates.email = cleanEmail;
          emailChanged = true;
        } else {
          updates.email = '';
          emailChanged = true;
        }
      }

      // 2. Password change validation & update
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({
            success: false,
            error: 'CURRENT_PASSWORD_REQUIRED',
            message: 'Current password is required to set a new password.'
          });
        }

        // Verify current password against database hash
        const isMatch = await verifyPassword(currentPassword, admin.passwordHash);
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            error: 'INVALID_CURRENT_PASSWORD',
            message: 'Current password is incorrect.'
          });
        }

        // Validate new password complexity
        const strength = validatePasswordStrength(newPassword);
        if (!strength.valid) {
          return res.status(400).json({
            success: false,
            error: 'WEAK_PASSWORD',
            message: strength.error || 'Password does not meet complexity requirements.'
          });
        }

        // Hash new password securely
        const newHash = await hashPassword(newPassword);
        updates.passwordHash = newHash;
        passwordChanged = true;
      }

      if (!emailChanged && !passwordChanged) {
        return res.status(400).json({
          success: false,
          error: 'NO_UPDATES',
          message: 'No changes provided.'
        });
      }

      // Persist updates to database
      const updatedAdmin = await db.updateAdminUser(admin.id, updates);
      if (!updatedAdmin) {
        return res.status(500).json({
          success: false,
          error: 'UPDATE_FAILED',
          message: 'Failed to update admin account.'
        });
      }

      // Record audit log without sensitive data
      await db.recordAuditLog({
        adminId: admin.id,
        username: admin.username,
        action: 'UPDATE_ADMIN_ACCOUNT',
        details: {
          updatedEmail: emailChanged,
          updatedPassword: passwordChanged
        },
        ip: req.ip
      });

      const response: UpdateAdminAccountResponse = {
        success: true,
        user: {
          id: updatedAdmin.id,
          username: updatedAdmin.username,
          email: updatedAdmin.email || '',
          role: updatedAdmin.role,
          lastLoginAt: updatedAdmin.lastLoginAt
        },
        message: 'Account settings updated successfully.'
      };

      return res.json(response);
    } catch (err: any) {
      console.error('[Admin Auth /account] Error:', err);
      return res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: err.message || 'Failed to update account settings.'
      });
    }
  }
);

// ============================================================================
// Admin User Management (Superadmin Only)
// ============================================================================
adminAuthRouter.post(
  '/users',
  authenticateAdmin,
  requireRole(['superadmin']),
  async (req: Request<{}, {}, CreateAdminUserRequest>, res: Response) => {
    try {
      const { username, password, role } = req.body;
      const cleanUsername = normalizeUsername(username);

      if (!cleanUsername || cleanUsername.length < 3) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_USERNAME',
          message: 'Username must be at least 3 characters.'
        });
      }

      if (role !== 'superadmin' && role !== 'operator') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ROLE',
          message: 'Role must be either "superadmin" or "operator".'
        });
      }

      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return res.status(400).json({
          success: false,
          error: 'WEAK_PASSWORD',
          message: strength.error
        });
      }

      const existing = await db.findAdminByUsername(cleanUsername);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'USERNAME_EXISTS',
          message: `Username "${cleanUsername}" is already taken.`
        });
      }

      const passwordHash = await hashPassword(password);
      const newUser = await db.createAdminUser({
        username: cleanUsername,
        passwordHash,
        role,
        isActive: true
      });

      await db.recordAuditLog({
        adminId: req.adminUser!.id,
        username: req.adminUser!.username,
        action: 'CREATE_ADMIN_USER',
        target: newUser.username,
        details: { role },
        ip: req.ip
      });

      return res.status(201).json({
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          role: newUser.role,
          isActive: newUser.isActive,
          createdAt: newUser.createdAt
        },
        message: `Admin user "${cleanUsername}" created successfully.`
      });
    } catch (err: any) {
      console.error('[Admin Auth /users] Error:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to create admin user.'
      });
    }
  }
);

// ============================================================================
// Audit Logs Inspection (Superadmin Only)
// ============================================================================
adminAuthRouter.get(
  '/audit-logs',
  authenticateAdmin,
  requireRole(['superadmin']),
  async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const logs = await db.getAuditLogs(limit);
      return res.json({
        success: true,
        logs
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to fetch audit logs.'
      });
    }
  }
);

// ============================================================================
// Development / Local Loopback Lockout Reset
// ============================================================================
adminAuthRouter.post('/auth/clear-lockout', (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  const ip = req.ip || req.socket.remoteAddress || '';
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

  // Only permit on development or strictly from local loopback
  if (isProd && !isLoopback) {
    return res.status(403).json({
      success: false,
      message: 'Rate limit reset is forbidden in production outside loopback.'
    });
  }

  resetAllLoginRateLimits();
  return res.json({
    success: true,
    message: 'Login lockout rate limits cleared successfully.'
  });
});
