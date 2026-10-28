/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameScoreState } from '../types/motion';

export interface PlayerAchievement {
  emoji: string;
  title: string;
  subtitle: string;
  badgeColor?: string;
}

/**
 * Calculates a personalized player achievement based on game performance.
 *
 * Rules:
 * - finalScore >= 9000 -> 🌟 DIWALI DHAMAKA MASTER (Grand Fireworks Legend)
 * - maxSpeed >= 2200 -> 🚀 ROCKET RULER (Sky Blasting Champion)
 * - comboCount >= 6 -> 💥 BLAST BOSS (Master of the Big Bang)
 * - punchCount >= 10 -> 🔥 DHAMAKA KING (Ultimate Firepower Legend)
 * - crackersBurst >= 45 -> 🎆 FIREWORKS LEGEND (Diwali Motion Champion)
 * - finalScore >= 5500 -> 🎇 PATASHA PRO (Festival Firepower Expert)
 * - punchCount >= 5 -> ✨ SPARK SUPREME (Master of Celebration)
 * - fallback / normal -> 🪔 DIWALI SPARK MASTER (Light & Energy Legend)
 */
export function calculateAchievement(stats: GameScoreState): PlayerAchievement {
  const { score, maxSpeed, comboCount, punchCount, crackersBurst } = stats;

  if (score >= 9000) {
    return {
      emoji: '🌟',
      title: 'DIWALI DHAMAKA MASTER',
      subtitle: 'Grand Fireworks Legend',
      badgeColor: 'from-amber-400 via-amber-300 to-yellow-200'
    };
  }

  if (maxSpeed >= 2200) {
    return {
      emoji: '🚀',
      title: 'ROCKET RULER',
      subtitle: 'Sky Blasting Champion',
      badgeColor: 'from-rose-400 via-amber-300 to-yellow-200'
    };
  }

  if (comboCount >= 6) {
    return {
      emoji: '💥',
      title: 'BLAST BOSS',
      subtitle: 'Master of the Big Bang',
      badgeColor: 'from-purple-400 via-amber-300 to-yellow-300'
    };
  }

  if (punchCount >= 10) {
    return {
      emoji: '🔥',
      title: 'DHAMAKA KING',
      subtitle: 'Ultimate Firepower Legend',
      badgeColor: 'from-orange-400 via-amber-300 to-yellow-200'
    };
  }

  if (crackersBurst >= 45) {
    return {
      emoji: '🎆',
      title: 'FIREWORKS LEGEND',
      subtitle: 'Diwali Motion Champion',
      badgeColor: 'from-amber-300 via-yellow-200 to-emerald-300'
    };
  }

  if (score >= 5500) {
    return {
      emoji: '🎇',
      title: 'PATASHA PRO',
      subtitle: 'Festival Firepower Expert',
      badgeColor: 'from-yellow-300 via-amber-300 to-orange-300'
    };
  }

  if (punchCount >= 5 || comboCount >= 3) {
    return {
      emoji: '✨',
      title: 'SPARK SUPREME',
      subtitle: 'Master of Celebration',
      badgeColor: 'from-amber-200 via-yellow-200 to-amber-300'
    };
  }

  return {
    emoji: '🪔',
    title: 'DIWALI SPARK MASTER',
    subtitle: 'Light & Energy Legend',
    badgeColor: 'from-amber-300 via-amber-400 to-yellow-300'
  };
}

export interface PersonalizedWishTemplate {
  category: 'high_score' | 'speed' | 'combo' | 'punch' | 'cracker' | 'festive';
  heading: string;
  lines: string[];
  signoff: string;
}

export const DIWALI_WISH_TEMPLATES: PersonalizedWishTemplate[] = [
  // 1 - High Achievement
  {
    category: 'high_score',
    heading: 'HAPPY DIWALI, {playerName}! 🪔✨',
    lines: [
      'You truly lit up the celebration today!',
      'May this Diwali bring you bigger dreams, brighter opportunities and endless happiness.',
      'Keep shining and keep creating spectacular moments!'
    ],
    signoff: 'Warm wishes,\n{brandName}'
  },
  // 2 - High Energy / Blast
  {
    category: 'combo',
    heading: 'HAPPY DIWALI, {playerName}! 🎆🔥',
    lines: [
      'What an electrifying dhamaka!',
      'Your combo speed and rhythm made the entire arena come alive.',
      'May your year ahead be just as powerful, joyful and bursting with golden wins.'
    ],
    signoff: 'With love,\n{brandName}'
  },
  // 3 - Elegant & Prosperous
  {
    category: 'festive',
    heading: 'DEAR {playerName},',
    lines: [
      'May the radiant lights of Diwali illuminate your path with boundless joy, peace, and prosperity.',
      'May every new beginning bring triumphant milestones and happiness into your home.',
      'Wishing you and your loved ones a beautiful, golden festive season.'
    ],
    signoff: 'Warm wishes,\n{brandName}'
  },
  // 4 - Playful Dhamaka
  {
    category: 'punch',
    heading: 'HEY {playerName}! ✨',
    lines: [
      'You brought the ultimate firepower, now let Diwali bring all the magic!',
      'May your celebrations be dazzling bright, your smiles endless, and your victories unstoppable.',
      'Keep that extraordinary spark glowing strong!'
    ],
    signoff: '— {brandName}'
  },
  // 5 - High Speed / Rocket
  {
    category: 'speed',
    heading: 'HAPPY DIWALI, {playerName}! 🚀💥',
    lines: [
      'Lightning speed and phenomenal reflexes!',
      'May you soar to incredible heights this year just like a rocket lighting up the midnight sky.',
      'Wishing you soaring success and radiant happiness!'
    ],
    signoff: 'Best festive wishes,\n{brandName}'
  },
  // 6 - Cracker Champion
  {
    category: 'cracker',
    heading: 'SHUBH DEEPAWALI, {playerName}! 🎇✨',
    lines: [
      'You set off an absolute symphony of fireworks today!',
      'May your life be showered with shimmering blessings, good health, and glorious achievements.',
      'Have an unforgettable Festival of Lights!'
    ],
    signoff: 'Warm Diwali regards,\n{brandName}'
  },
  // 7 - Master of Celebration
  {
    category: 'festive',
    heading: 'HAPPY DIWALI, {playerName}! 🪔🌟',
    lines: [
      'Your vibrant spirit and festive aura brought pure magic to the stage.',
      'May divine light remove all shadows and fill your journey with abundant prosperity.',
      'Wishing you laughter, sweetness, and cherished memories.'
    ],
    signoff: 'From your friends at\n{brandName}'
  },
  // 8 - Inspirational Power
  {
    category: 'punch',
    heading: 'SHINE ON, {playerName}! 🔥✨',
    lines: [
      'You played with unmatched courage and explosive firepower today!',
      'Carry that exact fearless spark into every goal you chase in the coming year.',
      'May fortune and success celebrate you at every turn.'
    ],
    signoff: 'With festive cheer,\n{brandName}'
  },
  // 9 - Joyful Festive Wishes
  {
    category: 'festive',
    heading: 'DEAREST {playerName}, 🪔💛',
    lines: [
      'As diyas illuminate every corner, may your heart be filled with serenity and delightful wonders.',
      'May this sacred celebration shower your family with endless blessings and good fortune.',
      'Shubh Deepawali to you and your loved ones!'
    ],
    signoff: 'Warm regards,\n{brandName}'
  },
  // 10 - High Score Glory
  {
    category: 'high_score',
    heading: 'A GRAND DIWALI SALUTE TO {playerName}! 🌟👑',
    lines: [
      'You achieved legendary status in the 35-second motion arena today!',
      'May your future sparkle with the exact brilliance, confidence, and triumph you displayed today.',
      'Keep inspiring everyone with your radiant energy!'
    ],
    signoff: 'Proudly presented by\n{brandName}'
  },
  // 11 - Fun & Sparkle
  {
    category: 'speed',
    heading: 'HAPPY DIWALI, {playerName}! ⚡🎇',
    lines: [
      'Pure swiftness and boundless enthusiasm!',
      'May your coming days move with effortless speed towards all your brightest ambitions.',
      'Wishing you a season filled with sweet moments and dazzling triumphs.'
    ],
    signoff: 'Cheering for you,\n{brandName}'
  },
  // 12 - Warm Blessing
  {
    category: 'cracker',
    heading: 'HAPPY DIWALI, {playerName}! 🪔🌺',
    lines: [
      'May thousands of sparkling lights guide you toward everlasting peace and fulfillment.',
      'May your days ahead be as sweet as festive mithai and as bright as midnight fireworks.',
      'Have a blessed and joyful Diwali celebration!'
    ],
    signoff: 'Warmest wishes,\n{brandName}'
  }
];

export interface FormattedPersonalizedWish {
  heading: string;
  lines: string[];
  signoff: string;
}

/**
 * Returns a personalized Diwali wish tailored to player stats and achievement,
 * with controlled randomization so consecutive runs remain fresh and personal.
 */
export function getPersonalizedWish(
  stats: GameScoreState,
  achievement: PlayerAchievement,
  playerName = 'Ayush',
  brandName = 'ItsSpotlight'
): FormattedPersonalizedWish {
  let targetCategory: PersonalizedWishTemplate['category'] = 'festive';

  if (achievement.title.includes('DHAMAKA MASTER') || stats.score >= 8000) {
    targetCategory = 'high_score';
  } else if (achievement.title.includes('ROCKET') || stats.maxSpeed >= 2000) {
    targetCategory = 'speed';
  } else if (achievement.title.includes('BLAST') || stats.comboCount >= 5) {
    targetCategory = 'combo';
  } else if (achievement.title.includes('DHAMAKA KING') || stats.punchCount >= 8) {
    targetCategory = 'punch';
  } else if (achievement.title.includes('FIREWORKS') || stats.crackersBurst >= 40) {
    targetCategory = 'cracker';
  }

  // Filter matching templates or fallback to all
  const matching = DIWALI_WISH_TEMPLATES.filter((w) => w.category === targetCategory);
  const candidates = matching.length > 0 ? matching : DIWALI_WISH_TEMPLATES;

  // Controlled deterministic selection seeded by score + crackers + name length + timestamp
  const seed = (stats.score + stats.crackersBurst * 7 + playerName.length * 13) % candidates.length;
  const chosen = candidates[seed];

  return {
    heading: chosen.heading.replace('{playerName}', playerName),
    lines: chosen.lines.map((l) => l.replace('{playerName}', playerName).replace('{brandName}', brandName)),
    signoff: chosen.signoff.replace('{playerName}', playerName).replace('{brandName}', brandName)
  };
}
