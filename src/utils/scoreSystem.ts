/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameScoreState, ScoreTierInfo, HandGesture } from '../types/motion';

export const GAME_DURATION_SECONDS = 35;

export const INITIAL_SCORE_STATE: GameScoreState = {
  score: 0,
  multiplier: 1,
  crackersBurst: 0,
  maxSpeed: 0,
  comboCount: 0,
  punchCount: 0,
  comboDurationSec: 0,
  bombsBurst: 0,
  combosAwarded: 0,
  penaltyDeductions: 0,
  comboBonusPoints: 0,
  targetScore: undefined,
  targetAchieved: false,
};

/**
 * Formats seconds remaining into 00:SS format with leading zeros.
 * e.g. 35 -> "00:35", 9 -> "00:09", 0 -> "00:00"
 */
export function formatGameTimer(secondsRemaining: number): string {
  const rounded = Math.max(0, Math.ceil(secondsRemaining));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Computes points awarded for a cracker burst event.
 */
export function calculateBurstPoints(
  speed: number,
  gesture: HandGesture,
  isCombo: boolean
): { points: number; label: string } {
  let basePoints = 15;
  let label = '+15';

  if (speed < 150) {
    basePoints = 10;
    label = '+10 SPARK';
  } else if (speed < 300) {
    basePoints = 25;
    label = '+25 BURST';
  } else {
    basePoints = 50;
    label = '+50 FAST BLAST';
  }

  // Punch / Fist bonus points
  if (gesture === 'FIST' && speed >= 280) {
    basePoints += 60;
    label = '+110 PUNCH BLAST!';
  }

  // Open palm spark shower
  if (gesture === 'OPEN_PALM' && speed >= 200) {
    basePoints += 20;
    label = '+45 PALM SHOWER';
  }

  const multiplier = isCombo ? 2 : 1;
  const finalPoints = basePoints * multiplier;

  if (isCombo) {
    label = `+${finalPoints} 2X COMBO!`;
  }

  return { points: finalPoints, label };
}

/**
 * Determines Diwali performance rank based on final score.
 */
export function getScoreTier(score: number): ScoreTierInfo {
  if (score >= 5000) {
    return {
      tier: 'DHAMAKA_MASTER',
      badgeTitle: 'DIWALI DHAMAKA MASTER',
      badgeSubtitle: 'Grand Fireworks Legend',
      emoji: '🌟',
      color: 'from-amber-400 via-yellow-300 to-amber-500',
    };
  }
  if (score >= 3000) {
    return {
      tier: 'ROCKET',
      badgeTitle: 'ROCKET CHAMPION',
      badgeSubtitle: 'Sky-Blazing Firework Maestro',
      emoji: '🚀',
      color: 'from-orange-400 via-rose-400 to-amber-400',
    };
  }
  if (score >= 1800) {
    return {
      tier: 'CHAKRI',
      badgeTitle: 'CHAKRI VIRTUOSO',
      badgeSubtitle: 'High-Velocity Spark Spinner',
      emoji: '🌀',
      color: 'from-emerald-400 via-teal-300 to-cyan-400',
    };
  }
  if (score >= 800) {
    return {
      tier: 'SPARKLER',
      badgeTitle: 'SPARKLER ACE',
      badgeSubtitle: 'Festive Energy Dynamo',
      emoji: '✨',
      color: 'from-amber-300 via-amber-400 to-yellow-500',
    };
  }
  return {
    tier: 'NOVICE',
    badgeTitle: 'DIYA INITIATE',
    badgeSubtitle: 'Warm-up Performer',
    emoji: '🪔',
    color: 'from-neutral-300 via-amber-200 to-amber-400',
  };
}
