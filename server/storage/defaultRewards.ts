/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RewardItem, ScoreRewardRange, RewardsSettings } from '../../src/types/backend';

// Clean, attractive festive SVG Data URIs for default reward icons
const VOUCHER_500_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="g500" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="50%" stop-color="#FCD34D"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect x="14" y="24" width="132" height="112" rx="18" fill="url(#g500)" stroke="#FEF3C7" stroke-width="3" filter="url(#shadow)"/>
  <rect x="22" y="32" width="116" height="96" rx="12" fill="#1C1309" fill-opacity="0.25" stroke="#FDE68A" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="80" cy="80" r="32" fill="#FEF3C7" fill-opacity="0.95"/>
  <text x="80" y="74" text-anchor="middle" font-family="'Cinzel', Georgia, serif" font-weight="900" font-size="16" fill="#78350F">VOUCHER</text>
  <text x="80" y="94" text-anchor="middle" font-family="monospace, sans-serif" font-weight="900" font-size="22" fill="#B45309">₹500</text>
  <circle cx="30" cy="80" r="7" fill="#FBF5EA"/>
  <circle cx="130" cy="80" r="7" fill="#FBF5EA"/>
</svg>
`)}`;

const VOUCHER_200_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="g200" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA580C"/>
      <stop offset="50%" stop-color="#FB923C"/>
      <stop offset="100%" stop-color="#C2410C"/>
    </linearGradient>
    <filter id="shadow2" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect x="14" y="24" width="132" height="112" rx="18" fill="url(#g200)" stroke="#FFEDD5" stroke-width="3" filter="url(#shadow2)"/>
  <rect x="22" y="32" width="116" height="96" rx="12" fill="#180C05" fill-opacity="0.25" stroke="#FED7AA" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="80" cy="80" r="32" fill="#FFF7ED" fill-opacity="0.95"/>
  <text x="80" y="74" text-anchor="middle" font-family="'Cinzel', Georgia, serif" font-weight="900" font-size="16" fill="#7C2D12">VOUCHER</text>
  <text x="80" y="94" text-anchor="middle" font-family="monospace, sans-serif" font-weight="900" font-size="22" fill="#C2410C">₹200</text>
  <circle cx="30" cy="80" r="7" fill="#FBF5EA"/>
  <circle cx="130" cy="80" r="7" fill="#FBF5EA"/>
</svg>
`)}`;

const VOUCHER_100_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="g100" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="50%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <filter id="shadow3" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect x="14" y="24" width="132" height="112" rx="18" fill="url(#g100)" stroke="#D1FAE5" stroke-width="3" filter="url(#shadow3)"/>
  <rect x="22" y="32" width="116" height="96" rx="12" fill="#042F2E" fill-opacity="0.25" stroke="#A7F3D0" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="80" cy="80" r="32" fill="#ECFDF5" fill-opacity="0.95"/>
  <text x="80" y="74" text-anchor="middle" font-family="'Cinzel', Georgia, serif" font-weight="900" font-size="16" fill="#065F46">VOUCHER</text>
  <text x="80" y="94" text-anchor="middle" font-family="monospace, sans-serif" font-weight="900" font-size="22" fill="#047857">₹100</text>
  <circle cx="30" cy="80" r="7" fill="#FBF5EA"/>
  <circle cx="130" cy="80" r="7" fill="#FBF5EA"/>
</svg>
`)}`;

const GIFT_BOX_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="gGift" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EC4899"/>
      <stop offset="50%" stop-color="#F472B6"/>
      <stop offset="100%" stop-color="#DB2777"/>
    </linearGradient>
    <linearGradient id="gRibbon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE047"/>
      <stop offset="100%" stop-color="#EAB308"/>
    </linearGradient>
    <filter id="shadow4" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <!-- Box Base -->
  <rect x="28" y="60" width="104" height="74" rx="10" fill="url(#gGift)" stroke="#FDF2F8" stroke-width="3" filter="url(#shadow4)"/>
  <!-- Box Lid -->
  <rect x="22" y="44" width="116" height="22" rx="6" fill="#F43F5E" stroke="#FFE4E6" stroke-width="2.5"/>
  <!-- Vertical Ribbon -->
  <rect x="70" y="44" width="20" height="90" fill="url(#gRibbon)"/>
  <!-- Horizontal Ribbon on Lid -->
  <rect x="22" y="51" width="116" height="8" fill="url(#gRibbon)" fill-opacity="0.85"/>
  <!-- Bow Knots -->
  <ellipse cx="64" cy="36" rx="14" ry="10" fill="url(#gRibbon)" transform="rotate(-20 64 36)"/>
  <ellipse cx="96" cy="36" rx="14" ry="10" fill="url(#gRibbon)" transform="rotate(20 96 36)"/>
  <circle cx="80" cy="38" r="7" fill="#CA8A04"/>
  <text x="80" y="112" text-anchor="middle" font-family="'Cinzel', sans-serif" font-weight="900" font-size="14" fill="#FFFFFF">FREE GIFT</text>
</svg>
`)}`;

const VOUCHER_50_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="g50" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="50%" stop-color="#818CF8"/>
      <stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
    <filter id="shadow5" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect x="14" y="24" width="132" height="112" rx="18" fill="url(#g50)" stroke="#EEF2FF" stroke-width="3" filter="url(#shadow5)"/>
  <rect x="22" y="32" width="116" height="96" rx="12" fill="#1E1B4B" fill-opacity="0.25" stroke="#C7D2FE" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="80" cy="80" r="32" fill="#EEF2FF" fill-opacity="0.95"/>
  <text x="80" y="74" text-anchor="middle" font-family="'Cinzel', Georgia, serif" font-weight="900" font-size="16" fill="#3730A3">VOUCHER</text>
  <text x="80" y="94" text-anchor="middle" font-family="monospace, sans-serif" font-weight="900" font-size="22" fill="#4338CA">₹50</text>
  <circle cx="30" cy="80" r="7" fill="#FBF5EA"/>
  <circle cx="130" cy="80" r="7" fill="#FBF5EA"/>
</svg>
`)}`;

const DISCOUNT_20_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="gDisc" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="50%" stop-color="#A78BFA"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
    <filter id="shadow6" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect x="14" y="24" width="132" height="112" rx="18" fill="url(#gDisc)" stroke="#F5F3FF" stroke-width="3" filter="url(#shadow6)"/>
  <rect x="22" y="32" width="116" height="96" rx="12" fill="#2E1065" fill-opacity="0.25" stroke="#DDD6FE" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="80" cy="80" r="32" fill="#F5F3FF" fill-opacity="0.95"/>
  <text x="80" y="74" text-anchor="middle" font-family="'Cinzel', Georgia, serif" font-weight="900" font-size="15" fill="#5B21B6">DISCOUNT</text>
  <text x="80" y="94" text-anchor="middle" font-family="monospace, sans-serif" font-weight="900" font-size="21" fill="#6D28D9">20% OFF</text>
  <circle cx="30" cy="80" r="7" fill="#FBF5EA"/>
  <circle cx="130" cy="80" r="7" fill="#FBF5EA"/>
</svg>
`)}`;

export const DEFAULT_REWARDS: RewardItem[] = [
  {
    id: 'reward_festive_500',
    name: '₹500 Festive Voucher',
    description: 'Flat ₹500 discount on your complete Diwali shopping basket.',
    imageUrl: VOUCHER_500_SVG,
    couponCode: 'DIWALI500',
    termsAndConditions: 'Valid on purchases above ₹1,999. One-time use per customer. Valid until Nov 30, 2026.',
    mode: 'score',
    minScore: 3000,
    maxScore: 99999,
    chances: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'reward_festive_200',
    name: '₹200 Celebration Voucher',
    description: 'Special ₹200 gift coupon for festive shopping & sweets.',
    imageUrl: VOUCHER_200_SVG,
    couponCode: 'DIWALI200',
    termsAndConditions: 'Valid on minimum billing of ₹999. Cannot be combined with other ongoing promotions.',
    mode: 'score',
    minScore: 2000,
    maxScore: 2999,
    chances: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'reward_festive_100',
    name: '₹100 Sweets Gift Card',
    description: 'Enjoy ₹100 off on premium traditional Diwali mithai packs.',
    imageUrl: VOUCHER_100_SVG,
    couponCode: 'SWEETS100',
    termsAndConditions: 'Valid on all festive confectionery items above ₹499. Valid till Nov 30, 2026.',
    mode: 'score',
    minScore: 1000,
    maxScore: 1999,
    chances: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'reward_free_gift',
    name: 'Free Diwali Gift Box',
    description: 'Complimentary festive gift hamper with handcrafted diyas.',
    imageUrl: GIFT_BOX_SVG,
    couponCode: 'FREEGIFT',
    termsAndConditions: 'Collect your gift hamper from the festival event desk by presenting your game pass.',
    mode: 'chance',
    chances: 25,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'reward_festive_50',
    name: '₹50 Sparkle Voucher',
    description: 'Instant ₹50 coupon code for any in-store purchase.',
    imageUrl: VOUCHER_50_SVG,
    couponCode: 'SPARKLE50',
    termsAndConditions: 'No minimum cart value required. Applicable on all products.',
    mode: 'score',
    minScore: 0,
    maxScore: 999,
    chances: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'reward_discount_20',
    name: 'Exclusive 20% Off Pass',
    description: '20% festive discount pass for entire store collections.',
    imageUrl: DISCOUNT_20_SVG,
    couponCode: 'FESTIVE20',
    termsAndConditions: 'Maximum discount ₹300. Valid for 14 days from redemption date.',
    mode: 'chance',
    chances: 35,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_SCORE_REWARDS: ScoreRewardRange[] = [
  {
    id: 'score_range_0_999',
    minScore: 0,
    maxScore: 999,
    rewardId: 'reward_festive_50',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'score_range_1000_1999',
    minScore: 1000,
    maxScore: 1999,
    rewardId: 'reward_festive_100',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'score_range_2000_2999',
    minScore: 2000,
    maxScore: 2999,
    rewardId: 'reward_festive_200',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'score_range_3000_plus',
    minScore: 3000,
    maxScore: 50000,
    rewardId: 'reward_festive_500',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_REWARDS_SETTINGS: RewardsSettings = {
  enabled: true
};

