/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../storage';
import { hashPassword, validatePasswordStrength, normalizeUsername } from './password';

/**
 * Checks for existing admin accounts at server startup.
 * If no admin accounts exist:
 * - If INITIAL_ADMIN_PASSWORD env var is supplied and meets security requirements,
 *   bootstraps the initial superadmin account.
 * - If INITIAL_ADMIN_PASSWORD is NOT supplied, logs a secure setup notice and
 *   leaves the initial setup open via /api/admin/auth/setup.
 * - NEVER creates default accounts with hardcoded production passwords.
 */
export async function bootstrapAdmin(): Promise<void> {
  try {
    const existingAdmins = await db.getAllAdminUsers();
    if (existingAdmins.length > 0) {
      return;
    }

    const envPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();
    const envUsername = normalizeUsername(process.env.INITIAL_ADMIN_USERNAME || 'admin');

    if (envPassword) {
      const strength = validatePasswordStrength(envPassword);
      if (!strength.valid) {
        console.warn(
          `[Admin Bootstrap] Warning: INITIAL_ADMIN_PASSWORD does not meet security requirements: ${strength.error}. Initial superadmin was NOT created.`
        );
        return;
      }

      const passwordHash = await hashPassword(envPassword);
      const newAdmin = await db.createAdminUser({
        username: envUsername,
        passwordHash,
        role: 'superadmin',
        isActive: true
      });

      await db.recordAuditLog({
        adminId: newAdmin.id,
        username: newAdmin.username,
        action: 'BOOTSTRAP_SUPERADMIN',
        details: { method: 'ENVIRONMENT_VARIABLE' }
      });

      console.log(`[Admin Bootstrap] Successfully initialized superadmin user: "${envUsername}".`);
    } else {
      console.log(
        '[Admin Bootstrap] Notice: No admin accounts configured. Create initial superadmin using INITIAL_ADMIN_PASSWORD environment variable or the one-time POST /api/admin/auth/setup endpoint.'
      );
    }
  } catch (err: any) {
    console.error('[Admin Bootstrap] Initialization note:', err?.message || err);
  }
}
