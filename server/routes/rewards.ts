/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { db } from '../storage';
import { authenticateAdmin } from '../auth/middleware';
import { RewardItem, SpinWheelRequest, SpinWheelResponse } from '../../src/types/backend';

export const rewardsRouter = Router();

/**
 * Weighted random reward selection.
 * Higher chances = higher probability of winning.
 * Executed strictly on backend.
 */
function pickWeightedWinningReward(rewards: RewardItem[]): { reward: RewardItem; rewardIndex: number } {
  const activeRewards = rewards.filter((r) => r.isActive !== false && Number(r.chances) > 0);
  if (activeRewards.length === 0) {
    throw new Error('No active rewards configured with chances > 0.');
  }

  const totalWeight = activeRewards.reduce(
    (sum, r) => sum + Math.max(1, Math.round(Number(r.chances) || 1)),
    0
  );

  let randomVal = Math.random() * totalWeight;

  for (let i = 0; i < activeRewards.length; i++) {
    const weight = Math.max(1, Math.round(Number(activeRewards[i].chances) || 1));
    if (randomVal < weight) {
      return { reward: activeRewards[i], rewardIndex: i };
    }
    randomVal -= weight;
  }

  return { reward: activeRewards[activeRewards.length - 1], rewardIndex: activeRewards.length - 1 };
}

// ============================================================================
// Public Endpoints (Kiosk / Mobile / User)
// ============================================================================

/**
 * Public: Get active rewards and feature enabled status for user display
 */
rewardsRouter.get('/rewards', async (_req: Request, res: Response) => {
  try {
    const settings = await db.getRewardsSettings();
    const allRewards = await db.getRewards(false);
    // Spin wheel only displays active Chance Based rewards
    const rewards = allRewards.filter(
      (r) => r.isActive !== false && (r.mode || 'chance') === 'chance'
    );
    return res.json({
      success: true,
      enabled: settings.enabled,
      rewards
    });
  } catch (err: any) {
    console.error('[Rewards API] Error fetching public rewards:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch rewards.' });
  }
});

/**
 * Public: User spins the wheel.
 * Backend decides the winning reward based on chances and saves the result permanently.
 */
rewardsRouter.post('/rewards/spin', async (req: Request<{}, {}, SpinWheelRequest>, res: Response) => {
  try {
    const settings = await db.getRewardsSettings();
    if (!settings.enabled) {
      return res.status(403).json({
        success: false,
        message: 'Rewards & Spin Wheel is currently paused by admin.'
      });
    }

    const allRewards = await db.getRewards(false);
    // Filter strictly to active Chance Based rewards for lucky spin
    const rewards = allRewards.filter(
      (r) => r.isActive !== false && (r.mode || 'chance') === 'chance'
    );

    if (!rewards || rewards.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active chance-based rewards available on the wheel.'
      });
    }

    // Backend chooses winning reward
    const { reward: winningReward, rewardIndex } = pickWeightedWinningReward(rewards);

    const playerName = req.body.playerName?.trim() || 'Player';
    const mobileNumber = req.body.mobileNumber?.trim() || '';
    const userId = req.body.userId;
    const sessionId = req.body.sessionId;

    // Permanently record spin result
    const spinRecord = await db.recordSpinResult({
      userId,
      playerName,
      mobileNumber,
      sessionId,
      rewardId: winningReward.id,
      rewardName: winningReward.name,
      couponCode: winningReward.couponCode,
      rewardImageUrl: winningReward.imageUrl,
      termsAndConditions: winningReward.termsAndConditions
    });

    const response: SpinWheelResponse = {
      success: true,
      reward: winningReward,
      rewardIndex,
      spinRecord
    };

    return res.json(response);
  } catch (err: any) {
    console.error('[Rewards API] Error executing spin:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to spin wheel.' });
  }
});

// ============================================================================
// Protected Admin Endpoints
// ============================================================================

/**
 * Admin: Get all rewards, score ranges, settings, and recent spin history
 */
rewardsRouter.get('/admin/rewards', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const [settings, rewards, scoreRewards, spinResults] = await Promise.all([
      db.getRewardsSettings(),
      db.getRewards(true),
      db.getScoreRewards(),
      db.getSpinResults(50)
    ]);

    return res.json({
      success: true,
      enabled: settings.enabled,
      rewards,
      scoreRewards,
      spinResults
    });
  } catch (err: any) {
    console.error('[Rewards Admin API] Error loading dashboard data:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch admin rewards data.' });
  }
});

/**
 * Admin: Add new reward
 */
rewardsRouter.post('/admin/rewards', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, imageUrl, couponCode, termsAndConditions, chances, isActive, minScore, maxScore, mode } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Reward name is required.' });
    }
    if (!couponCode || !couponCode.trim()) {
      return res.status(400).json({ success: false, message: 'Coupon code is required.' });
    }

    const selectedMode = mode === 'score' ? 'score' : 'chance';

    const created = await db.createReward({
      name: name.trim(),
      description: (description || '').trim(),
      imageUrl: (imageUrl || '').trim(),
      couponCode: couponCode.trim().toUpperCase(),
      termsAndConditions: (termsAndConditions || '').trim(),
      mode: selectedMode,
      chances: selectedMode === 'chance' ? Math.max(1, Number(chances) || 1) : 0,
      isActive: isActive !== false,
      minScore: selectedMode === 'score' && minScore !== undefined && minScore !== null && minScore !== '' ? Number(minScore) : undefined,
      maxScore: selectedMode === 'score' && maxScore !== undefined && maxScore !== null && maxScore !== '' ? Number(maxScore) : undefined
    });

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'CREATE_REWARD',
        target: created.id,
        details: { name: created.name, chances: created.chances, couponCode: created.couponCode },
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      reward: created,
      message: 'Reward added successfully.'
    });
  } catch (err: any) {
    console.error('[Rewards Admin API] Error creating reward:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create reward.' });
  }
});

/**
 * Admin: Update feature ON/OFF settings
 * NOTE: Placed BEFORE /admin/rewards/:id to avoid Express route parameter collision with :id
 */
rewardsRouter.get('/admin/rewards/settings', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const settings = await db.getRewardsSettings();
    return res.json({ success: true, settings });
  } catch (err: any) {
    console.error('[Rewards Admin API] Error getting settings:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch settings.' });
  }
});

rewardsRouter.put('/admin/rewards/settings', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const updated = await db.updateRewardsSettings({ enabled: Boolean(enabled) });

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'UPDATE_REWARDS_SETTINGS',
        details: { enabled: updated.enabled },
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      settings: updated,
      message: updated.enabled
        ? 'Rewards & Spin Wheel feature enabled.'
        : 'Rewards & Spin Wheel feature paused.'
    });
  } catch (err: any) {
    console.error('[Rewards Admin API] Error updating settings:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update settings.' });
  }
});

/**
 * Admin: Update reward
 */
rewardsRouter.put('/admin/rewards/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id === 'settings') {
      return res.status(400).json({ success: false, message: 'Invalid reward ID.' });
    }
    const { name, description, imageUrl, couponCode, termsAndConditions, chances, isActive, minScore, maxScore, mode } = req.body;

    const existing = await db.getRewardById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Reward not found.' });
    }

    const updates: Partial<RewardItem> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (imageUrl !== undefined) updates.imageUrl = imageUrl.trim();
    if (couponCode !== undefined) updates.couponCode = couponCode.trim().toUpperCase();
    if (termsAndConditions !== undefined) updates.termsAndConditions = termsAndConditions.trim();
    if (mode !== undefined) updates.mode = mode === 'score' ? 'score' : 'chance';
    if (chances !== undefined) updates.chances = Math.max(0, Number(chances) || 0);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (minScore !== undefined) {
      updates.minScore = (minScore !== null && minScore !== '') ? Number(minScore) : undefined;
    }
    if (maxScore !== undefined) {
      updates.maxScore = (maxScore !== null && maxScore !== '') ? Number(maxScore) : undefined;
    }

    const updated = await db.updateReward(id, updates);

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'UPDATE_REWARD',
        target: id,
        details: { changes: Object.keys(updates) },
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      reward: updated,
      message: 'Reward updated successfully.'
    });
  } catch (err: any) {
    console.error('[Rewards Admin API] Error updating reward:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update reward.' });
  }
});

/**
 * Admin: Delete reward
 */
rewardsRouter.delete('/admin/rewards/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id === 'settings') {
      return res.status(400).json({ success: false, message: 'Invalid reward ID.' });
    }
    const existing = await db.getRewardById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Reward not found.' });
    }

    const deleted = await db.deleteReward(id);

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'DELETE_REWARD',
        target: id,
        details: { name: existing.name },
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      deleted,
      message: 'Reward deleted successfully.'
    });
  } catch (err: any) {
    console.error('[Rewards Admin API] Error deleting reward:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete reward.' });
  }
});

// ============================================================================
// Score-Based Rewards Endpoints
// ============================================================================

/**
 * Admin: Get all score reward ranges
 */
rewardsRouter.get('/admin/score-rewards', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const ranges = await db.getScoreRewards();
    return res.json({ success: true, scoreRewards: ranges });
  } catch (err: any) {
    console.error('[Score Rewards API] Error listing ranges:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch score ranges.' });
  }
});

/**
 * Admin: Add score reward range
 */
rewardsRouter.post('/admin/score-rewards', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { minScore, maxScore, rewardId } = req.body;

    if (minScore === undefined || maxScore === undefined || !rewardId) {
      return res.status(400).json({
        success: false,
        message: 'Minimum score, maximum score, and reward selection are required.'
      });
    }

    const min = Number(minScore);
    const max = Number(maxScore);
    if (isNaN(min) || isNaN(max) || min < 0 || max < min) {
      return res.status(400).json({
        success: false,
        message: 'Invalid score range. Minimum score must be >= 0 and less than or equal to maximum score.'
      });
    }

    const targetReward = await db.getRewardById(rewardId);
    if (!targetReward) {
      return res.status(400).json({
        success: false,
        message: 'Selected reward does not exist. Please select an existing reward.'
      });
    }

    const created = await db.createScoreReward({
      minScore: min,
      maxScore: max,
      rewardId
    });

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'CREATE_SCORE_REWARD',
        target: created.id,
        details: { minScore: min, maxScore: max, rewardId, rewardName: targetReward.name },
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      scoreReward: created,
      message: 'Score reward range added successfully.'
    });
  } catch (err: any) {
    console.error('[Score Rewards API] Error creating score range:', err);
    return res.status(400).json({ success: false, message: err.message || 'Failed to add score range.' });
  }
});

/**
 * Admin: Update score reward range
 */
rewardsRouter.put('/admin/score-rewards/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { minScore, maxScore, rewardId } = req.body;

    const existing = await db.getScoreRewardById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Score reward range not found.' });
    }

    if (rewardId) {
      const targetReward = await db.getRewardById(rewardId);
      if (!targetReward) {
        return res.status(400).json({ success: false, message: 'Selected reward does not exist.' });
      }
    }

    const updated = await db.updateScoreReward(id, {
      minScore: minScore !== undefined ? Number(minScore) : undefined,
      maxScore: maxScore !== undefined ? Number(maxScore) : undefined,
      rewardId
    });

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'UPDATE_SCORE_REWARD',
        target: id,
        details: { minScore, maxScore, rewardId },
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      scoreReward: updated,
      message: 'Score reward range updated successfully.'
    });
  } catch (err: any) {
    console.error('[Score Rewards API] Error updating score range:', err);
    return res.status(400).json({ success: false, message: err.message || 'Failed to update score range.' });
  }
});

/**
 * Admin: Delete score reward range
 */
rewardsRouter.delete('/admin/score-rewards/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await db.getScoreRewardById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Score reward range not found.' });
    }

    await db.deleteScoreReward(id);

    if (req.adminUser) {
      await db.recordAuditLog({
        adminId: req.adminUser.id,
        username: req.adminUser.username,
        action: 'DELETE_SCORE_REWARD',
        target: id,
        ip: req.ip
      });
    }

    return res.json({
      success: true,
      message: 'Score reward range deleted successfully.'
    });
  } catch (err: any) {
    console.error('[Score Rewards API] Error deleting score range:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete score range.' });
  }
});

/**
 * Admin: Get spin results history
 */
rewardsRouter.get('/admin/spin-results', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const results = await db.getSpinResults(100);
    return res.json({ success: true, spinResults: results });
  } catch (err: any) {
    console.error('[Spin Results API] Error listing spin history:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch spin history.' });
  }
});

