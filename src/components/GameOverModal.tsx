/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  RotateCcw,
  Sparkles,
  Camera,
  Download,
  Check,
  X,
  Timer,
  Gift,
  Trophy,
  Copy,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import { GameScoreState } from '../types/motion';
import { GameFeedback, AchievementTier, RewardItem, GameSession } from '../types/backend';
import { gameApi } from '../services/api';
import {
  calculateAchievement,
  getPersonalizedWish
} from '../utils/achievements';
import { resolveAssetUrl } from '../utils/assetUrl';
import { SpinWheel, parseVoucherTitle } from './SpinWheel';

interface GameOverModalProps {
  scoreState: GameScoreState;
  playerName?: string;
  brandName?: string;
  capturedPhoto?: string | null;
  onPlayAgain: () => void;
  onClose?: () => void;
  onUpdatePlayerName?: (name: string) => void;
  sessionId?: string | null;
  /** Settles when the request saving this round's score has answered, either way. */
  sessionCompletion?: Promise<void> | null;
  isTrial?: boolean;
  onSubmitFeedback?: (feedback: GameFeedback) => Promise<void>;
  targetScoreEnabled?: boolean;
  targetScore?: number;
  achievementTiers?: AchievementTier[];
  earnedReward?: GameSession['earnedReward'] | null;
  rewardsEnabled?: boolean;
  mobileNumber?: string;
}

const FEEDBACK_OPTIONS: GameFeedback[] = ['Good', 'Excellent', 'Needs Improvement'];

const AUTO_RETURN_SECONDS = 20;

/** Lets the voucher zoom finish before the auto-return countdown starts. */
const VOUCHER_ZOOM_MS = 450;

/** The longest a player waits for their score to be saved before the wheel opens anyway. */
const SPIN_HOLD_MAX_MS = 5000;

interface StatTile {
  label: string;
  value: string;
  valueClass: string;
  labelClass?: string;
  boxClass?: string;
}

const GameOverModalComponent: React.FC<GameOverModalProps> = ({
  scoreState,
  playerName = 'Player',
  brandName = 'ItsSpotlight',
  capturedPhoto,
  onPlayAgain,
  onClose,
  sessionId,
  sessionCompletion,
  isTrial = false,
  onSubmitFeedback,
  targetScoreEnabled = false,
  targetScore = 5000,
  achievementTiers,
  earnedReward,
  rewardsEnabled = true,
  mobileNumber = ''
}) => {
  // Smooth animated count-up for final score
  const [displayedScore, setDisplayedScore] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [copiedEarnedCode, setCopiedEarnedCode] = useState(false);

  // Feedback state: one tap selects and sends; a failed send can be tapped again
  const [selectedFeedback, setSelectedFeedback] = useState<GameFeedback | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const isFeedbackLockedRef = useRef(false);

  // Wheel state: the wheel is on screen from the start; the voucher replaces it after a win
  const [wheelRewards, setWheelRewards] = useState<RewardItem[]>([]);
  const [isLoadingWheelRewards, setIsLoadingWheelRewards] = useState(rewardsEnabled);
  const [wheelState, setWheelState] = useState<'READY' | 'SPINNING' | 'VOUCHER_ZOOM'>('READY');
  const [winningVoucher, setWinningVoucher] = useState<RewardItem | null>(null);
  const [wheelErrorMessage, setWheelErrorMessage] = useState<string | null>(null);
  const [hasSettledSpin, setHasSettledSpin] = useState(false);

  // Master OTP Testing Session detection (unlimited spins, session never expires)
  const isMasterSession = Boolean(
    isTrial ||
    (typeof window !== 'undefined' && sessionStorage.getItem('diwali_master_otp') === 'true') ||
    (sessionId?.startsWith('trial_'))
  );

  // A spin must not beat the score being saved: the server could skip a score prize or mislabel the
  // spin prize. Master/trial rounds don't wait.
  const [isWaitingForScoreSave, setIsWaitingForScoreSave] = useState(!isMasterSession && Boolean(sessionCompletion));
  useEffect(() => {
    if (isMasterSession || !sessionCompletion) {
      setIsWaitingForScoreSave(false);
      return;
    }
    let isCurrent = true;
    const release = () => {
      if (isCurrent) setIsWaitingForScoreSave(false);
    };
    const holdTimeout = setTimeout(release, SPIN_HOLD_MAX_MS);
    sessionCompletion.then(release, release);
    return () => {
      isCurrent = false;
      clearTimeout(holdTimeout);
    };
  }, [isMasterSession, sessionCompletion]);

  // Compute performance-based achievement
  const achievement = useMemo(() => {
    return calculateAchievement(scoreState, achievementTiers);
  }, [scoreState, achievementTiers]);

  // The wish picks a random template and is always on screen, so it must only be re-picked when its
  // content really changes, not when a settings refresh hands us an equal tiers array.
  const achievementTiersKey = JSON.stringify(achievementTiers ?? null);
  const personalizedWish = useMemo(() => {
    return getPersonalizedWish(scoreState, achievement, playerName, brandName, achievementTiers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreState.score, achievement.title, playerName, brandName, achievementTiersKey]);

  // Computed game statistics
  const bombsBurst = scoreState.bombsBurst ?? scoreState.crackersBurst ?? 0;
  const combosAwarded = scoreState.combosAwarded ?? scoreState.comboCount ?? 0;
  const penaltyDeductions = scoreState.penaltyDeductions ?? 0;
  const comboBonusPoints = scoreState.comboBonusPoints ?? 0;
  const isTargetEnabled = Boolean(targetScoreEnabled && targetScore && targetScore > 0);
  const targetVal = targetScore || 0;
  const isTargetAchieved = scoreState.score >= targetVal;

  useEffect(() => {
    const target = scoreState.score;
    const duration = 1200; // ms
    const startTime = performance.now();

    let rafId: number;
    const animateScore = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedScore(Math.floor(target * eased));

      if (progress < 1) {
        rafId = requestAnimationFrame(animateScore);
      } else {
        setDisplayedScore(target);
      }
    };

    rafId = requestAnimationFrame(animateScore);
    return () => cancelAnimationFrame(rafId);
  }, [scoreState.score]);

  // ---------------------------------------------------------------------------
  // 20-Second Automatic Return Countdown Timer
  // Starts after the spin settles, or straight away when there is no wheel to spin
  // ---------------------------------------------------------------------------
  const [countdown, setCountdown] = useState(AUTO_RETURN_SECONDS);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasHandledExitRef = useRef(false);

  // Keep fresh references to exit callbacks
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPlayAgainRef = useRef(onPlayAgain);
  onPlayAgainRef.current = onPlayAgain;

  const stopCountdownTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Unified exit handler that ensures single execution and cancels auto-return timer
  const triggerExit = useCallback(() => {
    if (hasHandledExitRef.current) return;
    hasHandledExitRef.current = true;
    stopCountdownTimer();
    if (onCloseRef.current) {
      onCloseRef.current();
    } else if (onPlayAgainRef.current) {
      onPlayAgainRef.current();
    }
  }, [stopCountdownTimer]);

  // Dedicated Play Again handler that restarts the game session cleanly
  const handlePlayAgainClick = useCallback(() => {
    if (hasHandledExitRef.current) return;
    hasHandledExitRef.current = true;
    stopCountdownTimer();
    if (onPlayAgainRef.current) {
      onPlayAgainRef.current();
    } else if (onCloseRef.current) {
      onCloseRef.current();
    }
  }, [stopCountdownTimer]);

  // Rewards off, or nothing to put on the wheel: the score panel takes the wheel's place
  // (a spin already under way or finished keeps its panel, so a recorded prize can't vanish)
  const isWheelAvailable =
    wheelState !== 'READY' ||
    hasSettledSpin ||
    (rewardsEnabled && (isLoadingWheelRewards || wheelRewards.length > 0));

  // A recorded prize must be seen: no leaving between the spin request and the prize showing.
  // The failure path puts the state back to READY, which unlocks these.
  const isExitLocked = wheelState === 'SPINNING';

  // Master OTP testing sessions never expire or kick the user out
  const shouldAutoReturn = !isMasterSession && (hasSettledSpin || !isWheelAvailable);

  useEffect(() => {
    if (shouldAutoReturn) {
      setIsCountdownActive(true);
    }
  }, [shouldAutoReturn]);

  // Countdown timer effect: runs once, after it is activated
  useEffect(() => {
    if (!isCountdownActive) return;

    setCountdown(AUTO_RETURN_SECONDS);
    const deadline = Date.now() + AUTO_RETURN_SECONDS * 1000;

    let lastReportedSec = AUTO_RETURN_SECONDS;
    const interval = setInterval(() => {
      if (hasHandledExitRef.current) {
        clearInterval(interval);
        return;
      }

      const now = Date.now();
      const remainingMs = Math.max(0, deadline - now);
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (remainingSec !== lastReportedSec) {
        lastReportedSec = remainingSec;
        setCountdown(remainingSec);
      }

      if (remainingMs <= 0) {
        clearInterval(interval);
        timerRef.current = null;
        triggerExit();
      }
    }, 200);

    timerRef.current = interval;

    return () => {
      clearInterval(interval);
      timerRef.current = null;
    };
  }, [isCountdownActive, triggerExit]);

  // Load active rewards on mount
  useEffect(() => {
    if (!rewardsEnabled) {
      setIsLoadingWheelRewards(false);
      return;
    }

    setIsLoadingWheelRewards(true);
    gameApi
      .getRewards()
      .then((res) => {
        if (res.success && res.rewards && res.rewards.length > 0) {
          const chanceRewards = res.rewards.filter(
            (r) => r.isActive !== false && (r.mode || 'chance') === 'chance'
          );
          setWheelRewards(chanceRewards.length > 0 ? chanceRewards : res.rewards);
        }
      })
      .catch((err) => {
        console.warn('Failed to load wheel rewards in GameOverModal:', err);
      })
      .finally(() => {
        setIsLoadingWheelRewards(false);
      });
  }, [rewardsEnabled]);

  const settleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
  }, []);

  const handleSpinStart = useCallback(() => {
    setWheelState('SPINNING');
    setWinningVoucher(null);
    setWheelErrorMessage(null);
  }, []);

  const handleSpinWon = useCallback((reward: RewardItem) => {
    setWinningVoucher(reward);
    setWheelState('VOUCHER_ZOOM');
    settleTimeoutRef.current = setTimeout(() => setHasSettledSpin(true), VOUCHER_ZOOM_MS);
  }, []);

  const handleSpinFailed = useCallback((message: string) => {
    setWheelState('READY');
    setWheelErrorMessage(message);
    setHasSettledSpin(true);
  }, []);

  // One tap selects and sends. Leaving the screen does not cancel a send already under way.
  const handleFeedbackTap = async (feedback: GameFeedback) => {
    if (isTrial || isFeedbackLockedRef.current) return;
    isFeedbackLockedRef.current = true;
    setSelectedFeedback(feedback);
    setFeedbackError(null);
    try {
      if (onSubmitFeedback) {
        await onSubmitFeedback(feedback);
      } else if (sessionId) {
        await gameApi.submitFeedback(sessionId, feedback);
      }
      setFeedbackSubmitted(true);
    } catch (err: any) {
      console.warn('Feedback submit error:', err);
      setFeedbackError(err.message || 'Failed to submit feedback.');
      setSelectedFeedback(null);
      isFeedbackLockedRef.current = false;
    }
  };

  // Generate downloadable souvenir card using HTML Canvas
  const handleDownloadCard = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1150;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bgGrad = ctx.createLinearGradient(0, 0, 0, 1150);
      bgGrad.addColorStop(0, '#0E0A1A');
      bgGrad.addColorStop(0.5, '#160E2A');
      bgGrad.addColorStop(1, '#090514');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 900, 1150);

      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 6;
      ctx.strokeRect(20, 20, 860, 1110);

      const drawCardContent = (photoImg?: HTMLImageElement) => {
        ctx.fillStyle = '#FCD34D';
        ctx.font = 'bold 22px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillText('DIWALI MOTION SOUVENIR', 450, 75);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px Cinzel, serif';
        ctx.fillText('CHALLENGE COMPLETE', 450, 115);

        const photoX = 135;
        const photoY = 150;
        const photoWidth = 630;
        const photoHeight = 354;

        ctx.fillStyle = '#1A132B';
        ctx.fillRect(photoX - 4, photoY - 4, photoWidth + 8, photoHeight + 8);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.strokeRect(photoX - 4, photoY - 4, photoWidth + 8, photoHeight + 8);

        if (photoImg) {
          ctx.drawImage(photoImg, photoX, photoY, photoWidth, photoHeight);
        } else {
          ctx.fillStyle = '#261C3D';
          ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
          ctx.fillStyle = '#FCD34D';
          ctx.font = 'bold 28px Cinzel, serif';
          ctx.fillText('HAPPY DIWALI', 450, photoY + photoHeight / 2);
        }

        ctx.fillStyle = '#FCD34D';
        ctx.font = 'bold 18px Cinzel, serif';
        ctx.fillText('WELL DONE!', 450, 545);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px Cinzel, serif';
        ctx.fillText(playerName.toUpperCase(), 450, 588);

        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 17px Plus Jakarta Sans, sans-serif';
        ctx.fillText('YOU PLAYED VERY WELL 🎆', 450, 620);

        const cardY = 645;
        const cardW = 680;
        const cardH = 165;
        const cardX = (900 - cardW) / 2;

        ctx.fillStyle = '#140D26';
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX, cardY, cardW, cardH);

        ctx.fillStyle = '#FCD34D';
        ctx.font = 'bold 20px Cinzel, serif';
        ctx.fillText(`${achievement.emoji} ${achievement.title} ${achievement.emoji}`, 450, cardY + 36);

        ctx.fillStyle = '#E5E7EB';
        ctx.font = '14px Plus Jakarta Sans, sans-serif';
        ctx.fillText(achievement.subtitle, 450, cardY + 60);

        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 44px JetBrains Mono, monospace';
        ctx.fillText(scoreState.score.toLocaleString(), 450, cardY + 115);

        ctx.fillStyle = '#F59E0B';
        ctx.font = 'bold 13px JetBrains Mono, monospace';
        ctx.fillText('TOTAL POINTS', 450, cardY + 144);

        const bombsBurstVal = scoreState.bombsBurst ?? scoreState.crackersBurst ?? 0;
        const combosVal = scoreState.combosAwarded ?? scoreState.comboCount ?? 0;
        const penaltyVal = scoreState.penaltyDeductions ?? 0;
        const comboBonusVal = scoreState.comboBonusPoints ?? 0;
        const hasTarget = Boolean(targetScoreEnabled && targetScore && targetScore > 0);
        const targetValNum = targetScore || 0;
        const targetAchievedBool = scoreState.score >= targetValNum;

        const statBoxes = hasTarget
          ? [
              { label: 'BOMBS BURST', val: `${bombsBurstVal}`, color: '#FDE68A' },
              { label: 'COMBOS', val: `${combosVal}`, color: '#FDE68A' },
              { label: 'PENALTIES', val: penaltyVal > 0 ? `-${penaltyVal}` : '0', color: penaltyVal > 0 ? '#F87171' : '#FDE68A' },
              { label: 'COMBO BONUS', val: `+${comboBonusVal}`, color: '#34D399' },
              { label: targetAchievedBool ? 'TARGET ✓' : 'TARGET', val: `${targetValNum}`, color: targetAchievedBool ? '#FCD34D' : '#9CA3AF' }
            ]
          : [
              { label: 'BOMBS BURST', val: `${bombsBurstVal}`, color: '#FDE68A' },
              { label: 'COMBOS', val: `${combosVal}`, color: '#FDE68A' },
              { label: 'PENALTIES', val: penaltyVal > 0 ? `-${penaltyVal}` : '0', color: penaltyVal > 0 ? '#F87171' : '#FDE68A' },
              { label: 'COMBO BONUS', val: `+${comboBonusVal}`, color: '#34D399' }
            ];

        const boxWidth = hasTarget ? 128 : 155;
        const boxGap = hasTarget ? 10 : 20;
        const totalW = statBoxes.length * boxWidth + (statBoxes.length - 1) * boxGap;
        const startX = (900 - totalW) / 2;

        statBoxes.forEach((s, idx) => {
          const bx = startX + idx * (boxWidth + boxGap);
          ctx.fillStyle = '#140D26';
          ctx.fillRect(bx, 830, boxWidth, 75);
          ctx.strokeStyle = '#372B54';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, 830, boxWidth, 75);

          ctx.fillStyle = s.color || '#FDE68A';
          ctx.font = 'bold 20px JetBrains Mono, monospace';
          ctx.fillText(s.val, bx + boxWidth / 2, 864);

          ctx.fillStyle = '#9CA3AF';
          ctx.font = 'bold 11px JetBrains Mono, monospace';
          ctx.fillText(s.label, bx + boxWidth / 2, 888);
        });

        ctx.fillStyle = '#F59E0B';
        ctx.font = 'bold 16px Cinzel, serif';
        ctx.fillText(`🪔 SPECIAL DIWALI BLESSING FOR ${playerName.toUpperCase()} 🪔`, 450, 940);

        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 15px Plus Jakarta Sans, sans-serif';
        ctx.fillText(personalizedWish.heading, 450, 970);

        ctx.fillStyle = '#E5E7EB';
        ctx.font = 'italic 14px Plus Jakarta Sans, sans-serif';
        let lineY = 1000;
        personalizedWish.lines.forEach((line) => {
          ctx.fillText(line, 450, lineY);
          lineY += 24;
        });

        ctx.fillStyle = '#9CA3AF';
        ctx.font = '12px JetBrains Mono, monospace';
        ctx.fillText(`Presented with warmth by ${brandName}`, 450, 1095);

        const link = document.createElement('a');
        link.download = `Diwali_Fun_Play_${playerName}_${scoreState.score}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
        setIsDownloaded(true);
        setTimeout(() => setIsDownloaded(false), 3000);
      };

      if (capturedPhoto) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => drawCardContent(img);
        img.onerror = () => drawCardContent();
        img.src = capturedPhoto;
      } else {
        drawCardContent();
      }
    } catch (e) {
      console.error('Download card error:', e);
    }
  };

  const statTiles: StatTile[] = [
    { label: 'BOMBS BURST', value: `${bombsBurst}`, valueClass: 'text-amber-100' },
    { label: 'COMBOS', value: `${combosAwarded}`, valueClass: 'text-amber-300' },
    {
      label: 'PENALTY DED.',
      value: penaltyDeductions > 0 ? `-${penaltyDeductions}` : '0',
      valueClass: penaltyDeductions > 0 ? 'text-rose-400' : 'text-neutral-300'
    },
    { label: 'COMBO BONUS', value: `+${comboBonusPoints}`, valueClass: 'text-emerald-400' },
    ...(isTargetEnabled
      ? [
          {
            label: isTargetAchieved ? 'ACHIEVED 🎯' : 'TARGET GOAL',
            value: targetVal.toLocaleString(),
            valueClass: isTargetAchieved ? 'text-emerald-300' : 'text-amber-200',
            labelClass: isTargetAchieved ? 'text-emerald-400 font-bold' : undefined,
            boxClass: isTargetAchieved
              ? 'bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : undefined
          }
        ]
      : [])
  ];

  // Long admin-written wishes step down a size before they would need scrolling
  const wishLength =
    personalizedWish.heading.length + personalizedWish.lines.reduce((sum, line) => sum + line.length, 0);
  const wishLineClass =
    wishLength > 700
      ? 'text-[10px] lg:text-[11px] kiosk:text-[13px]'
      : wishLength > 420
      ? 'text-[11px] lg:text-xs kiosk:text-sm'
      : wishLength > 240
      ? 'text-xs lg:text-[13px] kiosk:text-base'
      : 'text-[13px] lg:text-sm kiosk:text-xl';
  const wishHeadingClass =
    wishLength > 420
      ? 'text-xs lg:text-sm kiosk:text-lg'
      : 'text-xs sm:text-sm lg:text-[15px] kiosk:text-2xl';

  const signoffParts = personalizedWish.signoff.split('\n');
  const closingLine =
    signoffParts.length > 1
      ? signoffParts.slice(0, -1).join(' ')
      : personalizedWish.signoff.startsWith('—')
      ? null
      : personalizedWish.signoff;
  const signatureName =
    signoffParts.length > 1
      ? signoffParts[signoffParts.length - 1]
      : personalizedWish.signoff.startsWith('—')
      ? personalizedWish.signoff.replace(/^—\s*/, '')
      : brandName;
  // A template whose last line is the brand itself would otherwise sign twice
  const isClosingLineSignature = closingLine?.trim().toLowerCase() === signatureName.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-[100vw] overflow-y-auto md:overflow-hidden bg-neutral-950/95 backdrop-blur-md flex items-start md:items-center justify-center p-2 sm:p-3 box-border select-none">
      <div className="w-full max-w-[1860px] md:h-full bg-[#0E0A1A] border border-amber-500/50 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 lg:p-4 kiosk:p-5 shadow-[0_0_80px_rgba(245,158,11,0.22)] flex flex-col box-border relative md:overflow-hidden">
        {/* ------------------------------------------------------------- */}
        {/* SLIM TOP BAR                                                  */}
        {/* ------------------------------------------------------------- */}
        <header className="w-full flex items-center justify-between gap-2 border-b border-amber-500/20 pb-1.5 kiosk:pb-2.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 kiosk:w-6 kiosk:h-6 text-amber-400 flex-shrink-0" />
            <h1 className="text-xl sm:text-2xl kiosk:text-3xl font-black text-amber-100 font-['Cinzel',serif] tracking-wider drop-shadow-[0_2px_10px_rgba(245,158,11,0.4)]">
              GAME OVER
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Countdown / Master Badge: Master OTP testing session never auto-exits */}
            {isMasterSession ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 kiosk:py-1.5 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-200 font-mono text-xs kiosk:text-sm font-semibold shadow-inner"
                title="Master OTP Testing Session (Unlimited Spins Enabled)"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Master Testing Session</span>
              </div>
            ) : isCountdownActive ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 kiosk:py-1.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 font-mono text-xs kiosk:text-sm font-semibold shadow-inner animate-[fadeIn_0.3s_ease-out]"
                title="Automatically returning to code entry screen"
              >
                <Timer className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>
                  Returning in <strong className="text-amber-100 font-bold">{countdown}s</strong>
                </span>
              </div>
            ) : null}

            {/* Clearly Visible × Close Button */}
            <button
              type="button"
              onClick={triggerExit}
              disabled={isExitLocked}
              aria-label="Close and return to home screen"
              title="Close and return to code entry"
              className="w-8 h-8 sm:w-9 sm:h-9 kiosk:w-11 kiosk:h-11 rounded-full bg-neutral-900/90 hover:bg-neutral-800 border border-amber-500/50 hover:border-amber-300 text-amber-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            </button>
          </div>
        </header>

        {/* ------------------------------------------------------------- */}
        {/* TWO COLUMNS                                                   */}
        {/* ------------------------------------------------------------- */}
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-4 kiosk:gap-6 mt-2 kiosk:mt-3 md:min-h-0">
          {/* =========================================================== */}
          {/* LEFT: Photo → Name + Achievement → Wish → Save Card         */}
          {/* =========================================================== */}
          <div className="flex flex-col gap-1.5 lg:gap-2 kiosk:gap-3 md:min-h-0 md:overflow-hidden">
            {/* Player Photo */}
            <div className="w-full aspect-video max-h-[38dvh] kiosk:max-h-[42dvh] flex-shrink-0 rounded-2xl p-1 bg-gradient-to-b from-amber-400 via-amber-500/60 to-yellow-600 shadow-[0_0_35px_rgba(245,158,11,0.3)]">
              <div className="w-full h-full rounded-[14px] overflow-hidden bg-neutral-900 relative flex items-center justify-center">
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt={`Player ${playerName}`}
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center mb-2">
                      <Camera className="w-6 h-6 text-amber-400" />
                    </div>
                    <span className="text-xs font-mono text-amber-300 font-bold uppercase tracking-wider">
                      {playerName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Name + Achievement */}
            <div className="w-full flex-shrink-0 flex flex-col items-center text-center">
              <div className="flex items-baseline justify-center gap-2 kiosk:gap-3 max-w-full">
                <span className="flex-shrink-0 text-[10px] sm:text-xs kiosk:text-base font-bold tracking-widest text-amber-300/90 font-['Cinzel',serif] uppercase">
                  WELL DONE!
                </span>
                <h2 className="min-w-0 text-xl sm:text-2xl lg:text-3xl kiosk:text-4xl font-black font-['Cinzel',serif] tracking-wider text-amber-200 drop-shadow-[0_0_16px_rgba(251,191,36,0.5)] uppercase truncate">
                  {playerName}
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 mt-0.5 kiosk:mt-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                  <span className="text-xs kiosk:text-base">{achievement.emoji}</span>
                  <span className="text-[11px] sm:text-xs kiosk:text-base font-black font-['Cinzel',serif] tracking-wider text-amber-200 uppercase">
                    {achievement.title}
                  </span>
                  <span className="text-xs kiosk:text-base">{achievement.emoji}</span>
                </div>
                <p className="text-[10px] sm:text-[11px] kiosk:text-sm font-semibold text-amber-200/80 tracking-wide font-['Plus_Jakarta_Sans',sans-serif]">
                  {achievement.subtitle}
                </p>
              </div>
            </div>

            {/* Wish: always shown; an over-long admin wish scrolls inside its own box */}
            <div className="w-full md:flex-1 md:min-h-0 flex overflow-y-auto bg-gradient-to-b from-[#180E2B]/95 via-[#130A24]/95 to-[#0E061D]/95 border border-amber-500/40 rounded-xl sm:rounded-2xl px-3 py-2 kiosk:px-5 kiosk:py-3 shadow-[inset_0_0_25px_rgba(0,0,0,0.6)]">
              <div className="m-auto w-full flex flex-col items-center text-center gap-1 kiosk:gap-2">
                <div className="inline-flex items-center justify-center gap-1.5 text-[9.5px] sm:text-[10.5px] kiosk:text-xs font-bold text-amber-300/90 uppercase tracking-widest font-['Cinzel',serif]">
                  <span>🪔</span>
                  <span>YOUR SPECIAL WISH FROM {brandName.toUpperCase()}</span>
                  <span>🪔</span>
                </div>
                <h4 className={`${wishHeadingClass} font-black font-['Cinzel',serif] text-amber-200 uppercase tracking-wider leading-snug`}>
                  {personalizedWish.heading}
                </h4>
                {personalizedWish.lines.map((line, idx) => (
                  <p
                    key={idx}
                    className={`${wishLineClass} text-amber-100/95 ${wishLength > 420 ? 'leading-snug' : 'leading-relaxed'} font-medium font-['Plus_Jakarta_Sans',sans-serif]`}
                  >
                    {line}
                  </p>
                ))}
                <div className="flex flex-wrap items-baseline justify-center gap-x-2 mt-0.5">
                  {closingLine && !isClosingLineSignature && (
                    <span className="text-[10px] sm:text-[11px] lg:text-xs kiosk:text-base font-medium font-['Cinzel',serif] text-amber-300/85 italic leading-tight">
                      {closingLine}
                    </span>
                  )}
                  <span className="text-xs sm:text-[13px] lg:text-sm kiosk:text-lg font-bold font-['Cinzel',serif] text-amber-200 tracking-widest uppercase">
                    {signatureName}
                  </span>
                </div>
              </div>
            </div>

            {/* Save Card */}
            <button
              type="button"
              onClick={handleDownloadCard}
              className="w-full h-9 lg:h-10 kiosk:h-14 flex-shrink-0 inline-flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 rounded-xl text-amber-200 text-xs lg:text-sm kiosk:text-lg font-bold uppercase tracking-wider transition cursor-pointer active:scale-[0.99]"
            >
              {isDownloaded ? (
                <>
                  <Check className="w-4 h-4 kiosk:w-5 kiosk:h-5 text-emerald-400" />
                  <span className="text-emerald-400">Saved!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 kiosk:w-5 kiosk:h-5 text-amber-300" />
                  <span>Save Card</span>
                </>
              )}
            </button>
          </div>

          {/* =========================================================== */}
          {/* RIGHT: Score + Stats → Wheel / Voucher → Feedback → Play Again */}
          {/* =========================================================== */}
          <div className="flex flex-col gap-1.5 lg:gap-2 kiosk:gap-3 md:min-h-0 md:overflow-hidden">
            {isWheelAvailable ? (
              /* Compact score + stats strip */
              <div className="w-full flex-shrink-0 flex items-stretch gap-1.5 kiosk:gap-2">
                <div className="flex-shrink-0 min-w-[5.5rem] kiosk:min-w-[11rem] px-2 kiosk:px-4 py-1 kiosk:py-2 bg-gradient-to-b from-[#18112C] to-[#120B22] border border-amber-500/50 rounded-lg kiosk:rounded-xl flex flex-col items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.18)]">
                  <span className="text-xl lg:text-2xl kiosk:text-4xl font-black font-mono tracking-tight text-amber-200 drop-shadow-[0_0_18px_rgba(251,191,36,0.6)] leading-none">
                    {displayedScore.toLocaleString()}
                  </span>
                  <span className="text-[8.5px] kiosk:text-[11px] font-mono text-amber-300/80 uppercase tracking-widest font-bold mt-0.5">
                    TOTAL POINTS
                  </span>
                </div>
                <div className={`flex-1 min-w-0 grid gap-1 kiosk:gap-2 ${isTargetEnabled ? 'grid-cols-5' : 'grid-cols-4'}`}>
                  {statTiles.map((tile) => (
                    <div
                      key={tile.label}
                      className={`min-w-0 border rounded-lg kiosk:rounded-xl p-1 kiosk:p-2 flex flex-col items-center justify-center ${tile.boxClass ?? 'bg-[#140D26] border-amber-500/30'}`}
                    >
                      <span className={`text-sm lg:text-base kiosk:text-2xl font-mono font-bold leading-tight ${tile.valueClass}`}>
                        {tile.value}
                      </span>
                      <span className={`text-[8px] lg:text-[8.5px] kiosk:text-[11px] font-mono font-semibold uppercase tracking-wider text-center leading-tight ${tile.labelClass ?? 'text-amber-300/70'}`}>
                        {tile.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* No wheel: its space shows a larger score + stats panel */
              <div className="w-full md:flex-1 md:min-h-0 py-6 md:py-2 bg-gradient-to-b from-[#18112C] to-[#120B22] border border-amber-500/50 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-3 kiosk:gap-8 px-3 kiosk:px-8 shadow-[0_0_25px_rgba(245,158,11,0.18)]">
                <div className="flex flex-col items-center">
                  <span
                    style={{ fontSize: 'clamp(48px, 7vw, 132px)' }}
                    className="font-black font-mono tracking-tight text-amber-200 drop-shadow-[0_0_24px_rgba(251,191,36,0.6)] leading-none"
                  >
                    {displayedScore.toLocaleString()}
                  </span>
                  <span className="text-xs lg:text-sm kiosk:text-xl font-mono text-amber-300/80 uppercase tracking-widest font-bold mt-1 kiosk:mt-3">
                    TOTAL POINTS
                  </span>
                </div>
                <div className={`w-full grid gap-2 kiosk:gap-4 ${isTargetEnabled ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
                  {statTiles.map((tile) => (
                    <div
                      key={tile.label}
                      className={`min-w-0 border rounded-xl p-2 kiosk:p-5 flex flex-col items-center justify-center ${tile.boxClass ?? 'bg-[#140D26] border-amber-500/30'}`}
                    >
                      <span className={`text-lg lg:text-2xl kiosk:text-4xl font-mono font-bold leading-tight ${tile.valueClass}`}>
                        {tile.value}
                      </span>
                      <span className={`text-[9px] lg:text-[10px] kiosk:text-sm font-mono font-semibold uppercase tracking-wider text-center leading-tight mt-0.5 ${tile.labelClass ?? 'text-amber-300/70'}`}>
                        {tile.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score-based prize stays visible whatever the wheel is doing */}
            {earnedReward && (
              <div className="w-full flex-shrink-0 bg-gradient-to-r from-amber-950/80 via-[#221308] to-yellow-950/80 border border-amber-400/80 rounded-xl p-1.5 kiosk:p-2.5 flex items-center justify-between gap-2 shadow-lg animate-[fadeIn_0.3s_ease-out]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 kiosk:w-11 kiosk:h-11 rounded-lg bg-white/95 p-1 border border-amber-400/60 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                    {earnedReward.imageUrl ? (
                      <img
                        src={resolveAssetUrl(earnedReward.imageUrl)}
                        alt={earnedReward.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Gift className="w-4 h-4 kiosk:w-6 kiosk:h-6 text-amber-600" />
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="inline-flex items-center gap-1 text-[8.5px] kiosk:text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                      <Trophy className="w-2.5 h-2.5 kiosk:w-3.5 kiosk:h-3.5 text-amber-400" />
                      <span>SCORE PRIZE UNLOCKED!</span>
                    </div>
                    <h4 className="text-xs kiosk:text-lg font-bold text-amber-100 truncate">
                      {earnedReward.name}
                    </h4>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="bg-[#140803] border border-amber-400/50 rounded-lg px-2 py-0.5 text-right">
                    <span className="block text-[7.5px] kiosk:text-[10px] font-mono text-amber-300/70 uppercase">CODE</span>
                    <span className="text-[11px] kiosk:text-lg font-mono font-black text-amber-200 tracking-wider">
                      {earnedReward.couponCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(earnedReward.couponCode);
                      setCopiedEarnedCode(true);
                      setTimeout(() => setCopiedEarnedCode(false), 2000);
                    }}
                    className="p-1 kiosk:p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs cursor-pointer transition"
                    title="Copy Coupon Code"
                  >
                    {copiedEarnedCode ? (
                      <Check className="w-3.5 h-3.5 kiosk:w-5 kiosk:h-5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 kiosk:w-5 kiosk:h-5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Wheel, replaced by the voucher once won */}
            {isWheelAvailable && (
              <div className="w-full md:flex-1 md:min-h-0 bg-gradient-to-b from-[#1A1226]/95 via-[#140D22]/95 to-[#0E081A]/95 border border-amber-500/40 rounded-xl sm:rounded-2xl p-2 kiosk:p-3 flex flex-col items-center relative overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                {/* The wheel stays mounted under the voucher so the victory chime can finish */}
                <div className={`w-full h-full flex-col items-center text-center ${wheelState === 'VOUCHER_ZOOM' ? 'hidden' : 'flex'}`}>
                  <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs kiosk:text-lg font-bold font-['Cinzel',serif] text-amber-200 uppercase tracking-wider flex-shrink-0">
                    <Gift className="w-3.5 h-3.5 kiosk:w-5 kiosk:h-5 text-amber-400" />
                    <span>SPIN & WIN</span>
                    <Sparkles className="w-3 h-3 kiosk:w-4 kiosk:h-4 text-amber-400" />
                  </div>

                  {wheelErrorMessage && (
                    <div className="w-full p-1 kiosk:p-2 mt-1 bg-rose-950/80 border border-rose-500/40 rounded-lg text-[10px] lg:text-xs kiosk:text-base text-rose-200 flex items-center justify-center gap-1.5 flex-shrink-0">
                      <AlertCircle className="w-3 h-3 kiosk:w-4 kiosk:h-4 text-rose-400 flex-shrink-0" />
                      <span>{wheelErrorMessage}</span>
                    </div>
                  )}

                  {/* Sized from this box, so the wheel is the largest circle that fits; the top gap is for the pointer */}
                  <div
                    className="flex-none h-[min(86vw,420px)] md:flex-1 md:h-auto md:min-h-0 w-full flex items-center justify-center pt-3 kiosk:pt-5 overflow-hidden"
                    style={{ containerType: 'size' }}
                  >
                    {isLoadingWheelRewards ? (
                      <div className="flex flex-col items-center justify-center gap-1 text-amber-300">
                        <RotateCw className="w-6 h-6 animate-spin text-amber-400" />
                        <span className="text-[10px] kiosk:text-sm font-mono">Loading wheel...</span>
                      </div>
                    ) : (
                      <div
                        className="flex-shrink-0"
                        style={{ width: 'min(100cqw, 100cqh)', height: 'min(100cqw, 100cqh)' }}
                      >
                        <SpinWheel
                          rewards={wheelRewards}
                          playerName={playerName}
                          mobileNumber={mobileNumber}
                          sessionId={sessionId}
                          isMaster={isMasterSession}
                          tapWheelToSpin
                          isHeld={isWaitingForScoreSave}
                          onSpinStart={handleSpinStart}
                          onSpinWon={handleSpinWon}
                          onSpinFailed={handleSpinFailed}
                        />
                      </div>
                    )}
                  </div>

                  <div className="text-[9.5px] sm:text-[10px] kiosk:text-sm text-amber-200/70 font-mono flex-shrink-0 pt-1">
                    {isWaitingForScoreSave
                      ? 'Saving your score...'
                      : wheelState === 'SPINNING'
                      ? 'Spinning...'
                      : isMasterSession
                      ? 'Master OTP Active: Unlimited spins enabled'
                      : hasSettledSpin
                      ? 'Spin chance used for this game'
                      : 'Tap the wheel to spin'}
                  </div>
                </div>

                {wheelState === 'VOUCHER_ZOOM' && winningVoucher && (
                  <div className="w-full h-full min-h-[280px] md:min-h-0 flex flex-col justify-center items-center gap-1.5 lg:gap-2 kiosk:gap-5 text-center p-1 kiosk:p-4 animate-voucher-zoom overflow-hidden">
                    <div className="text-sm lg:text-base kiosk:text-3xl font-black font-['Cinzel',serif] text-amber-200 uppercase tracking-wider drop-shadow">
                      🎉 YOU WON A FESTIVE PRIZE! 🎉
                    </div>

                    <div className="w-20 h-20 lg:w-28 lg:h-28 kiosk:w-52 kiosk:h-52 rounded-2xl bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 p-1 shadow-[0_0_25px_rgba(245,158,11,0.5)] flex-shrink-0">
                      <div className="w-full h-full rounded-[12px] bg-[#1C1226] p-1.5 flex items-center justify-center overflow-hidden">
                        {winningVoucher.imageUrl ? (
                          <img
                            src={resolveAssetUrl(winningVoucher.imageUrl)}
                            alt={winningVoucher.name}
                            className="w-full h-full object-contain drop-shadow"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-1">
                            <Gift className="w-8 h-8 lg:w-10 lg:h-10 kiosk:w-20 kiosk:h-20 text-amber-400 drop-shadow mb-0.5 animate-pulse" />
                            <span className="text-[11px] lg:text-xs kiosk:text-2xl font-black font-['Cinzel',serif] text-amber-200">
                              {parseVoucherTitle(winningVoucher.name).line1}
                            </span>
                            {parseVoucherTitle(winningVoucher.name).line2 && (
                              <span className="text-[9px] lg:text-[10px] kiosk:text-lg font-bold text-amber-300/80 tracking-wider">
                                {parseVoucherTitle(winningVoucher.name).line2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <h4 className="w-full text-sm lg:text-lg kiosk:text-3xl font-black font-['Cinzel',serif] text-amber-100 truncate drop-shadow">
                      {winningVoucher.name}
                    </h4>

                    <div className="w-full max-w-[420px] kiosk:max-w-[640px] bg-[#140803] border border-amber-400/60 rounded-lg kiosk:rounded-xl py-2 kiosk:py-4 px-3 flex flex-col items-center justify-center shadow-inner flex-shrink-0">
                      <span className="block text-[8.5px] lg:text-[10px] kiosk:text-sm font-mono font-bold text-amber-300/70 uppercase tracking-widest leading-none mb-1 kiosk:mb-2">
                        COUPON CODE
                      </span>
                      <span className="text-base lg:text-xl kiosk:text-4xl font-mono font-black text-amber-200 tracking-widest select-all break-all">
                        {winningVoucher.couponCode}
                      </span>
                    </div>

                    <p className="text-[10px] lg:text-xs kiosk:text-base text-amber-200/75 line-clamp-2 max-w-[520px] kiosk:max-w-[720px] leading-tight">
                      {winningVoucher.termsAndConditions || winningVoucher.description || 'Present this code to claim your reward.'}
                    </p>

                    <div className="flex items-center justify-center gap-2 flex-shrink-0">
                      <div className="px-2.5 py-0.5 kiosk:py-1.5 kiosk:px-4 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[9px] lg:text-[10px] kiosk:text-sm font-mono font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-2.5 h-2.5 kiosk:w-4 kiosk:h-4" />
                        <span>VOUCHER UNLOCKED</span>
                      </div>
                      {isMasterSession && (
                        <button
                          type="button"
                          onClick={() => {
                            setWheelState('READY');
                            setWinningVoucher(null);
                            setWheelErrorMessage(null);
                          }}
                          className="px-2.5 py-0.5 kiosk:py-1.5 kiosk:px-4 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 text-[9px] lg:text-[10px] kiosk:text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-1 shadow cursor-pointer active:scale-95 transition-transform"
                          title="Spin again with fresh reward selection (Master OTP)"
                        >
                          <RotateCw className="w-2.5 h-2.5 kiosk:w-4 kiosk:h-4" />
                          <span>Spin Again</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Feedback: one tap selects and sends. Trial/master games are not recorded. */}
            {!isTrial && (
              <div className="w-full flex-shrink-0 flex flex-col gap-0.5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-2">
                  <span className="flex-shrink-0 text-[10px] sm:text-xs kiosk:text-base text-amber-300 font-medium font-['Cinzel',serif]">
                    {feedbackSubmitted ? 'Thank you!' : 'How was the game?'}
                  </span>
                  <div className="lg:flex-1 min-w-0 grid grid-cols-3 gap-1.5">
                    {FEEDBACK_OPTIONS.map((option) => {
                      const isSelected = selectedFeedback === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => handleFeedbackTap(option)}
                          disabled={selectedFeedback !== null && !isSelected}
                          className={`min-w-0 min-h-8 kiosk:min-h-11 px-1 rounded-lg leading-tight border text-[10px] sm:text-[11px] kiosk:text-base font-semibold inline-flex items-center justify-center gap-1 transition active:scale-95 ${
                            isSelected
                              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                              : selectedFeedback
                              ? 'bg-neutral-900/60 border-neutral-700/60 text-neutral-500 cursor-not-allowed'
                              : 'bg-neutral-900/90 border-amber-500/40 text-amber-100 hover:bg-amber-500/15 cursor-pointer'
                          }`}
                        >
                          {isSelected && feedbackSubmitted && <Check className="w-3 h-3 kiosk:w-4 kiosk:h-4 flex-shrink-0" />}
                          <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {feedbackError && (
                  <div className="w-full text-center text-[10px] kiosk:text-sm text-rose-400">
                    {feedbackError}
                  </div>
                )}
              </div>
            )}

            {/* Play Again: available spun or not, except while a spin is resolving */}
            <button
              type="button"
              onClick={handlePlayAgainClick}
              disabled={isExitLocked}
              className="w-full h-11 lg:h-12 kiosk:h-20 px-4 flex-shrink-0 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-sm lg:text-base kiosk:text-2xl uppercase tracking-widest rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:shadow-[0_0_35px_rgba(245,158,11,0.6)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] border border-amber-300/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 kiosk:w-7 kiosk:h-7 stroke-[2.5]" />
              <span>PLAY AGAIN</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GameOverModal = React.memo(GameOverModalComponent);
