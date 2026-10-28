/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameScoreState } from '../types/motion';
import { AchievementTier } from '../types/backend';

export interface PlayerAchievement {
  emoji: string;
  title: string;
  subtitle: string;
  badgeColor?: string;
}

export const DEFAULT_ACHIEVEMENT_TIERS: AchievementTier[] = [
  {
    id: 'tier_legend',
    title: 'Diwali Legend',
    subtitle: 'Grand Fireworks Legend',
    minScore: 2000,
    maxScore: null,
    emoji: '🌟',
    badgeColor: 'from-amber-400 via-amber-300 to-yellow-200',
    wishes: [
      'HAPPY DIWALI, {playerName}! 🪔✨\nYou truly lit up the celebration today with {score} points!\nMay this Diwali bring you bigger dreams, brighter opportunities and endless happiness.\nKeep shining and creating spectacular moments!\nWarm wishes,\n{brandName}',
      'A GRAND DIWALI SALUTE TO {playerName}! 🌟👑\nYou achieved legendary status with an astonishing {score} points in the arena!\nMay your future sparkle with the exact brilliance and triumph you displayed today.\nProudly presented by\n{brandName}',
      'OUTSTANDING DHAMAKA, {playerName}! 🎆🔥\nYour phenomenal reflexes scored {score} points!\nMay your year ahead be just as powerful, joyful and bursting with golden wins.\nWith love,\n{brandName}'
    ]
  },
  {
    id: 'tier_master',
    title: 'Light Master',
    subtitle: 'Stellar Energy Champion',
    minScore: 1500,
    maxScore: 1999,
    emoji: '✨',
    badgeColor: 'from-teal-400 via-cyan-300 to-emerald-200',
    wishes: [
      'DEAR {playerName}! ✨\nBrilliant play scoring {score} points! Lighting up the celebration with stellar energy.\nMay every new beginning bring triumphant milestones and happiness into your home.\nWarm wishes,\n{brandName}',
      'HAPPY DIWALI, {playerName}! 🎇\nYour vibrant spirit and festive aura brought pure magic to the stage!\nMay divine light remove all shadows and fill your journey with abundant prosperity.\nFrom your friends at\n{brandName}'
    ]
  },
  {
    id: 'tier_ace',
    title: 'Rocket Ace',
    subtitle: 'Sky Blasting Reflector',
    minScore: 1000,
    maxScore: 1499,
    emoji: '🚀',
    badgeColor: 'from-rose-400 via-amber-300 to-yellow-200',
    wishes: [
      'HAPPY DIWALI, {playerName}! 🚀💥\nFast hands and soaring spirits! You scored a stellar {score} points today.\nMay you soar to incredible heights this year just like a rocket lighting up the midnight sky!\nBest festive wishes,\n{brandName}',
      'HEY {playerName}! 🔥✨\nYou brought the ultimate firepower scoring {score} points, now let Diwali bring all the magic!\nMay your celebrations be dazzling bright and your victories unstoppable.\n— {brandName}'
    ]
  },
  {
    id: 'tier_sparkler',
    title: 'Festive Sparkler',
    subtitle: 'Joy & Energy Player',
    minScore: 0,
    maxScore: 999,
    emoji: '🪔',
    badgeColor: 'from-amber-300 via-amber-400 to-yellow-300',
    wishes: [
      'SHUBH DEEPAWALI, {playerName}! 🪔\nWishing you joy, prosperity, and endless festive moments with {score} points!\nMay thousands of sparkling lights guide you toward everlasting peace.\nWarmest wishes,\n{brandName}',
      'DEAREST {playerName}! 💛\nAs diyas illuminate every corner, may your heart be filled with delightful wonders.\nMay this sacred celebration shower your family with endless blessings and good fortune.\nShubh Deepawali from\n{brandName}'
    ]
  }
];

/**
 * Calculates a player achievement based on game performance,
 * evaluating against dynamic custom tiers or standard tiers.
 */
export function calculateAchievement(
  stats: GameScoreState,
  customTiers?: AchievementTier[]
): PlayerAchievement {
  const activeTiers = customTiers && customTiers.length > 0 ? customTiers : DEFAULT_ACHIEVEMENT_TIERS;
  const score = stats.score || 0;

  // Find tier matching score range
  const matched = activeTiers.find((t) => {
    const min = typeof t.minScore === 'number' ? t.minScore : 0;
    const max = typeof t.maxScore === 'number' && t.maxScore !== null ? t.maxScore : Infinity;
    return score >= min && score <= max;
  });

  if (matched) {
    return {
      emoji: matched.emoji || '🪔',
      title: matched.title,
      subtitle: matched.subtitle || 'Festival Motion Challenger',
      badgeColor: matched.badgeColor || 'from-amber-300 via-amber-400 to-yellow-300'
    };
  }

  // Fallback defaults based on performance (no Max Speed dependencies)
  if (score >= 2000) {
    return {
      emoji: '🌟',
      title: 'DIWALI DHAMAKA MASTER',
      subtitle: 'Grand Fireworks Legend',
      badgeColor: 'from-amber-400 via-amber-300 to-yellow-200'
    };
  }

  if ((stats.combosAwarded ?? stats.comboCount ?? 0) >= 5) {
    return {
      emoji: '💥',
      title: 'BLAST BOSS',
      subtitle: 'Master of the Big Bang',
      badgeColor: 'from-purple-400 via-amber-300 to-yellow-300'
    };
  }

  if ((stats.crackersBurst ?? 0) >= 35) {
    return {
      emoji: '🎆',
      title: 'FIREWORKS LEGEND',
      subtitle: 'Diwali Motion Champion',
      badgeColor: 'from-amber-300 via-yellow-200 to-emerald-300'
    };
  }

  return {
    emoji: '🪔',
    title: 'DIWALI SPARK MASTER',
    subtitle: 'Light & Energy Legend',
    badgeColor: 'from-amber-300 via-amber-400 to-yellow-300'
  };
}

export interface FormattedPersonalizedWish {
  heading: string;
  lines: string[];
  signoff: string;
}

/**
 * Returns a personalized Diwali wish tailored to player stats and achievement,
 * dynamically selecting and rotating from configured achievement tiers.
 */
export function getPersonalizedWish(
  stats: GameScoreState,
  achievement: PlayerAchievement,
  playerName = 'Player',
  brandName = 'ItsSpotlight',
  customTiers?: AchievementTier[],
  rank?: number | string
): FormattedPersonalizedWish {
  const activeTiers = customTiers && customTiers.length > 0 ? customTiers : DEFAULT_ACHIEVEMENT_TIERS;
  const score = stats.score || 0;

  // Find matching tier
  let matchedTier = activeTiers.find((t) => {
    const min = typeof t.minScore === 'number' ? t.minScore : 0;
    const max = typeof t.maxScore === 'number' && t.maxScore !== null ? t.maxScore : Infinity;
    return score >= min && score <= max;
  });

  if (!matchedTier || !matchedTier.wishes || matchedTier.wishes.length === 0) {
    matchedTier = activeTiers[0] || DEFAULT_ACHIEVEMENT_TIERS[0];
  }

  const wishes = matchedTier.wishes && matchedTier.wishes.length > 0
    ? matchedTier.wishes
    : DEFAULT_ACHIEVEMENT_TIERS[0].wishes;

  // Rotate wishes across plays so players receive variety
  const rotationIndex = Math.floor(Math.random() * wishes.length);
  const rawTemplate = wishes[rotationIndex] || wishes[0];

  // Interpolate dynamic variables
  const cleanName = playerName || 'Player';
  const cleanScore = String(score.toLocaleString());
  const cleanRank = rank ? `#${rank}` : 'Top Rank';
  const cleanBrand = brandName || 'ItsSpotlight';

  const processed = rawTemplate
    .replace(/\{playerName\}/g, cleanName)
    .replace(/\{score\}/g, cleanScore)
    .replace(/\{rank\}/g, cleanRank)
    .replace(/\{brandName\}/g, cleanBrand);

  const lines = processed.split('\n').map((l) => l.trim()).filter(Boolean);

  let heading = `HAPPY DIWALI, ${cleanName}! 🪔✨`;
  let signoff = `Warm wishes,\n${cleanBrand}`;
  let bodyLines: string[] = [];

  if (lines.length >= 3) {
    heading = lines[0];
    signoff = lines[lines.length - 1];
    bodyLines = lines.slice(1, lines.length - 1);
  } else if (lines.length === 2) {
    heading = lines[0];
    bodyLines = [lines[1]];
  } else if (lines.length === 1) {
    bodyLines = [lines[0]];
  }

  return {
    heading,
    lines: bodyLines,
    signoff
  };
}
