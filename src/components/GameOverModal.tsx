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
  Mail,
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
import {
  SPIN_CONSTANTS,
  calculateTargetStopAngle,
  calculateDecelTrajectory,
  getOrCreateTickBuffer,
  playPreRenderedTick,
} from '../utils/spinWheelPhysics';

interface GameOverModalProps {
  scoreState: GameScoreState;
  playerName?: string;
  brandName?: string;
  capturedPhoto?: string | null;
  onPlayAgain: () => void;
  onClose?: () => void;
  onUpdatePlayerName?: (name: string) => void;
  onPlayChime?: () => void;
  sessionId?: string | null;
  isTrial?: boolean;
  onSubmitFeedback?: (feedback: GameFeedback) => Promise<void>;
  targetScoreEnabled?: boolean;
  targetScore?: number;
  achievementTiers?: AchievementTier[];
  earnedReward?: GameSession['earnedReward'] | null;
  rewardsEnabled?: boolean;
  onOpenSpinWheel?: () => void;
  mobileNumber?: string;
}

// Premium Black, Orange and Gold Casino Segment Theme Palette
const CASINO_SEGMENT_PALETTE = [
  { bg: '#1E140A', stroke: '#F59E0B', textPrimary: '#FFFBEB', textSecondary: '#FDE68A' }, // Deep Obsidian Black-Gold
  { bg: '#C2410C', stroke: '#FDE68A', textPrimary: '#FFFFFF', textSecondary: '#FEF3C7' }, // Radiant Festive Orange
  { bg: '#2D1A0E', stroke: '#F59E0B', textPrimary: '#FFFBEB', textSecondary: '#FDE68A' }, // Burnished Bronze Dark
  { bg: '#D97706', stroke: '#FEF3C7', textPrimary: '#FFFFFF', textSecondary: '#FEF3C7' }, // Marigold Gold
  { bg: '#140E08', stroke: '#F59E0B', textPrimary: '#FFFBEB', textSecondary: '#FDE68A' }, // Jet Onyx Gold
  { bg: '#B45309', stroke: '#FEF3C7', textPrimary: '#FFFFFF', textSecondary: '#FEF3C7' }, // Rich Warm Amber
  { bg: '#781D42', stroke: '#FDE68A', textPrimary: '#FFFBEB', textSecondary: '#FDE68A' }, // Deep Royal Wine
  { bg: '#EA580C', stroke: '#FEF3C7', textPrimary: '#FFFFFF', textSecondary: '#FEF3C7' }, // Vibrant Flame Orange
];

// Clean, festive, balanced Diwali colors fallback
const SEGMENT_COLORS = [
  '#C2410C',
  '#D97706',
  '#991B1B',
  '#047857',
  '#B45309',
  '#4338CA',
  '#854D0E',
  '#7C2D12',
  '#0F766E',
  '#9333EA'
];

// Parse voucher name into clean, high-impact two-line prize text for wheel segments
function parseVoucherTitle(name: string): { line1: string; line2: string } {
  const clean = (name || '').trim();
  if (!clean) return { line1: 'DIWALI', line2: 'GIFT' };

  // Strip emojis for clean text rendering in SVG
  const text = clean
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '')
    .trim();

  // Pattern 1: e.g. "₹1000/- OFF", "₹500/- OFF", "20% OFF", "₹200/- OFF"
  const amountMatch = text.match(/^([₹$€£]?\s*\d+(?:\/\-|\/)?%?)\s*(.*)$/i);
  if (amountMatch && amountMatch[1]) {
    let amt = amountMatch[1].trim();
    if (/^[₹$€£]\d+$/.test(amt)) {
      amt = `${amt}/-`;
    }
    const rest = amountMatch[2]?.trim();
    return {
      line1: amt.toUpperCase(),
      line2: rest ? rest.toUpperCase() : 'OFF'
    };
  }

  // Pattern 2: e.g. "Flat ₹500 OFF" or "Flat 1000"
  const flatMatch = text.match(/^(flat|get|win|save|upto)\s+([₹$€£]?\s*\d+(?:\/\-|\/)?%?)\s*(.*)$/i);
  if (flatMatch) {
    let amt = flatMatch[2].trim();
    if (/^[₹$€£]\d+$/.test(amt)) {
      amt = `${amt}/-`;
    }
    const rest = [flatMatch[1], flatMatch[3]].filter(Boolean).join(' ').trim();
    return {
      line1: amt.toUpperCase(),
      line2: rest ? rest.toUpperCase() : 'OFF'
    };
  }

  // Fallback: split words roughly in half
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { line1: 'DIWALI', line2: 'GIFT' };
  if (words.length === 1) return { line1: words[0].toUpperCase(), line2: '' };
  if (words.length === 2) return { line1: words[0].toUpperCase(), line2: words[1].toUpperCase() };

  const mid = Math.ceil(words.length / 2);
  return {
    line1: words.slice(0, mid).join(' ').toUpperCase(),
    line2: words.slice(mid).join(' ').toUpperCase()
  };
}

const GameOverModalComponent: React.FC<GameOverModalProps> = ({
  scoreState,
  playerName = 'Player',
  brandName = 'ItsSpotlight',
  capturedPhoto,
  onPlayAgain,
  onClose,
  onPlayChime,
  sessionId,
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

  // Feedback state
  const [selectedFeedback, setSelectedFeedback] = useState<GameFeedback | ''>('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittedFeedbackValue, setSubmittedFeedbackValue] = useState<GameFeedback | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // One-tap envelope state: 'CLOSED' -> 'OPENING' -> 'OPENED'
  const [envelopeState, setEnvelopeState] = useState<'CLOSED' | 'OPENING' | 'OPENED'>('CLOSED');

  // ---------------------------------------------------------------------------
  // Embedded Spin & Win State (Left Side of Divided Section)
  // Initially ALWAYS 'READY' with wheel visible and voucher hidden
  // ---------------------------------------------------------------------------
  const [wheelRewards, setWheelRewards] = useState<RewardItem[]>([]);
  const [isLoadingWheelRewards, setIsLoadingWheelRewards] = useState(true);
  const [wheelState, setWheelState] = useState<'READY' | 'SPINNING' | 'VOUCHER_ZOOM'>('READY');
  const [winningVoucher, setWinningVoucher] = useState<RewardItem | null>(null);
  const [wheelErrorMessage, setWheelErrorMessage] = useState<string | null>(null);
  const [hasSpun, setHasSpun] = useState<boolean>(false);
  const hasSpunRef = useRef<boolean>(false);

  // Master OTP Testing Session detection (unlimited spins, session never expires)
  const isMasterSession = Boolean(
    isTrial ||
    (typeof window !== 'undefined' && sessionStorage.getItem('diwali_master_otp') === 'true') ||
    (sessionId?.startsWith('trial_'))
  );

  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
  const flapperNeedleRef = useRef<HTMLDivElement | null>(null);
  const isSpinningRef = useRef<boolean>(false);
  const rotationRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickBufferRef = useRef<AudioBuffer | null>(null);

  // Compute performance-based achievement
  const achievement = useMemo(() => {
    return calculateAchievement(scoreState, achievementTiers);
  }, [scoreState, achievementTiers]);

  // Compute personalized wish
  const personalizedWish = useMemo(() => {
    return getPersonalizedWish(scoreState, achievement, playerName, brandName, achievementTiers);
  }, [scoreState, achievement, playerName, brandName, achievementTiers]);

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
  // Starts ONLY after the Spin & Win wheel stops and winning voucher zoom completes
  // ---------------------------------------------------------------------------
  const AUTO_RETURN_SECONDS = 20;
  const [countdown, setCountdown] = useState(AUTO_RETURN_SECONDS);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const endTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasHandledExitRef = useRef(false);

  // Keep fresh references to exit callbacks
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPlayAgainRef = useRef(onPlayAgain);
  onPlayAgainRef.current = onPlayAgain;

  // Unified exit handler that ensures single execution and cancels auto-return timer
  const triggerExit = useCallback(() => {
    if (hasHandledExitRef.current) return;
    hasHandledExitRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    isSpinningRef.current = false;
    if (onCloseRef.current) {
      onCloseRef.current();
    } else if (onPlayAgainRef.current) {
      onPlayAgainRef.current();
    }
  }, []);

  // Dedicated Play Again handler that restarts the game session cleanly
  const handlePlayAgainClick = useCallback(() => {
    if (hasHandledExitRef.current) return;
    hasHandledExitRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    isSpinningRef.current = false;
    if (onPlayAgainRef.current) {
      onPlayAgainRef.current();
    } else if (onCloseRef.current) {
      onCloseRef.current();
    }
  }, []);

  // Safe fallback: if rewards are completely disabled in admin settings, start 20s countdown automatically
  useEffect(() => {
    if (!rewardsEnabled && !isMasterSession) {
      setIsCountdownActive(true);
      setCountdown(AUTO_RETURN_SECONDS);
    }
  }, [rewardsEnabled, isMasterSession]);

  // Countdown timer effect: Runs ONLY when isCountdownActive is true and NOT in master testing session
  useEffect(() => {
    if (!isCountdownActive || isMasterSession) return;

    hasHandledExitRef.current = false;
    const deadline = Date.now() + AUTO_RETURN_SECONDS * 1000;
    endTimeRef.current = deadline;

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

  // ---------------------------------------------------------------------------
  // Web Audio Context & Sounds for Embedded Wheel
  // ---------------------------------------------------------------------------
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
        tickBufferRef.current = getOrCreateTickBuffer(audioCtxRef.current);
      }
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Ultra-fast zero-allocation tick sound playback (0.01ms execution)
  const playRealisticTick = useCallback((speedRatio = 1.0) => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (!tickBufferRef.current) {
      tickBufferRef.current = getOrCreateTickBuffer(ctx);
    }
    playPreRenderedTick(ctx, tickBufferRef.current, speedRatio, lastTickTimeRef);
  }, [getAudioContext]);

  // Triumphant Casino Victory Fanfare Chime on Stop
  const playVictoryChime = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Stage 1: Ascending Golden Arpeggio (C5 -> E5 -> G5 -> B5 -> C6 -> E6)
      const arpeggio = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51];
      arpeggio.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.075);

        gain.gain.setValueAtTime(0, now + idx * 0.075);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.075 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.075 + 0.65);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.075);
        osc.stop(now + idx * 0.075 + 0.7);
      });

      // Stage 2: Grand Finale Celebratory Chord (C5 + G5 + C6 + E6) with Shimmer Harmonic
      const chordTime = now + 0.48;
      const chordFreqs = [523.25, 783.99, 1046.5, 1318.51];
      chordFreqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const oscHarmonic = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, chordTime);

        // Bell shimmer harmonic
        oscHarmonic.type = 'sine';
        oscHarmonic.frequency.setValueAtTime(freq * 2.01, chordTime);

        gain.gain.setValueAtTime(0, chordTime);
        gain.gain.linearRampToValueAtTime(0.18, chordTime + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, chordTime + 1.45);

        osc.connect(gain);
        oscHarmonic.connect(gain);
        gain.connect(ctx.destination);

        osc.start(chordTime);
        oscHarmonic.start(chordTime);
        osc.stop(chordTime + 1.5);
        oscHarmonic.stop(chordTime + 1.5);
      });
    } catch {}
  }, [getAudioContext]);

  // Load active rewards on mount
  useEffect(() => {
    if (!rewardsEnabled) {
      setIsLoadingWheelRewards(false);
      return;
    }

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

  // Animation frame cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      isSpinningRef.current = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Immediate Spin & Win Execution with Parallel Server Resolution
  // ---------------------------------------------------------------------------
  const handleSpinClick = () => {
    if ((!isMasterSession && (hasSpunRef.current || hasSpun)) || isSpinningRef.current || wheelState === 'SPINNING' || wheelRewards.length === 0) return;
    isSpinningRef.current = true;
    if (!isMasterSession) {
      hasSpunRef.current = true;
      setHasSpun(true);
    }
    setWheelState('SPINNING');
    setWinningVoucher(null);
    setWheelErrorMessage(null);

    getAudioContext();

    const numSlices = Math.max(1, wheelRewards.length);
    const sliceAngle = 360 / numSlices;
    const initialAngle = rotationRef.current;

    interface SpinServerResult {
      success: boolean;
      reward?: RewardItem;
      rewardIndex?: number;
      errorMessage?: string;
    }
    let serverResult: SpinServerResult | null = null;

    gameApi
      .spinWheel({
        playerName: playerName || (isMasterSession ? 'Master Tester' : 'Player'),
        mobileNumber: mobileNumber || undefined,
        sessionId: sessionId || undefined,
        userId: isMasterSession ? 'trial_user_8536' : undefined
      })
      .then((res) => {
        if (res.success && res.reward) {
          serverResult = {
            success: true,
            reward: res.reward,
            rewardIndex: res.rewardIndex
          };
        } else if (!isMasterSession && res.alreadySpun && res.reward) {
          serverResult = {
            success: true,
            reward: res.reward,
            rewardIndex: res.rewardIndex ?? 0
          };
        } else {
          serverResult = {
            success: false,
            errorMessage: res.message || 'Spin failed on server.'
          };
        }
      })
      .catch((err: any) => {
        const errorMsg = err?.message || '';
        if (!isMasterSession && (errorMsg.includes('already used') || errorMsg.includes('already spun'))) {
          serverResult = {
            success: false,
            errorMessage: 'This game session has already used its Spin & Win chance.'
          };
        } else {
          serverResult = {
            success: false,
            errorMessage: err.message || 'Network error while spinning.'
          };
        }
      });

    // Immediate 0ms start with shared casino physics (2.2s–2.6s duration)
    const cruiseSpeed = SPIN_CONSTANTS.CRUISE_SPEED;
    const accelDuration = SPIN_CONSTANTS.ACCEL_DURATION_MS;
    const minCruiseTime = SPIN_CONSTANTS.ACCEL_DURATION_MS + SPIN_CONSTANTS.MIN_CRUISE_DURATION_MS;
    const animStartTime = performance.now();

    const pegsPerSlice = numSlices <= 4 ? 4 : (numSlices <= 6 ? 3 : (numSlices <= 10 ? 2 : 1));
    const totalPegs = Math.max(16, numSlices * pegsPerSlice);
    const pegAngleStep = 360 / totalPegs;

    let lastPegIndex = Math.floor(initialAngle / pegAngleStep);

    let decelInitiated = false;
    let decelStartAngle = 0;
    let decelStartTime = 0;
    let decelDuration = 1600;
    let totalDecelDegrees = 0;
    let winningTargetReward: RewardItem | null = null;
    let hasFailed = false;
    let failureMessage = '';

    const animate = (time: number) => {
      const elapsed = time - animStartTime;

      if (!decelInitiated) {
        // --- PHASE 1: Immediate Acceleration & Constant Cruising ---
        let currentAngle: number;
        if (elapsed < accelDuration) {
          const p = elapsed / accelDuration;
          currentAngle = initialAngle + 0.5 * cruiseSpeed * (accelDuration / 1000) * (p * p);
        } else {
          const accelDistance = 0.5 * cruiseSpeed * (accelDuration / 1000);
          const cruiseElapsed = (elapsed - accelDuration) / 1000;
          currentAngle = initialAngle + accelDistance + cruiseSpeed * cruiseElapsed;
        }

        rotationRef.current = currentAngle;
        if (wheelSvgRef.current) {
          wheelSvgRef.current.style.transform = `rotate(${currentAngle}deg)`;
        }

        // Ticks precisely synchronized with perimeter pegs passing the top pointer
        const currentPegIndex = Math.floor(currentAngle / pegAngleStep);
        if (currentPegIndex > lastPegIndex) {
          playRealisticTick(1.0);
          lastPegIndex = currentPegIndex;
        }

        // Mechanical flapper needle deflection locked to passing pegs
        const pegPhase = (((currentAngle % pegAngleStep) + pegAngleStep) % pegAngleStep) / pegAngleStep;
        let flapperDeflection = 0;
        if (pegPhase > 0.75) {
          flapperDeflection = -13 * ((pegPhase - 0.75) / 0.25);
        } else if (pegPhase < 0.25) {
          flapperDeflection = -13 * (1 - (pegPhase / 0.25));
        }
        if (flapperNeedleRef.current) {
          flapperNeedleRef.current.style.transform = `rotate(${flapperDeflection}deg)`;
        }

        // Begin smooth casino deceleration when min cruise time elapsed and backend result arrived
        if (elapsed >= minCruiseTime && serverResult !== null) {
          decelInitiated = true;
          decelStartTime = time;

          if (serverResult.success && serverResult.reward) {
            winningTargetReward = serverResult.reward;
            let targetIdx = wheelRewards.findIndex((r) => r.id === serverResult!.reward!.id);
            if (targetIdx === -1) {
              targetIdx = serverResult.rewardIndex ?? 0;
            }

            const targetStopAngle = calculateTargetStopAngle(targetIdx, numSlices);
            const trajectory = calculateDecelTrajectory(currentAngle, targetStopAngle);
            decelStartAngle = trajectory.decelStartAngle;
            totalDecelDegrees = trajectory.totalDecelDegrees;
            decelDuration = trajectory.decelDurationMs;
          } else {
            hasFailed = true;
            failureMessage = serverResult.errorMessage || 'Unable to spin. Please try again.';
            decelStartAngle = currentAngle;
            totalDecelDegrees = 720;
            decelDuration = 1200;
          }
        }

        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // --- PHASE 2: Ultra-Smooth Quartic Deceleration to Winning Voucher ---
        const decelElapsed = time - decelStartTime;
        const progress = Math.min(1, decelElapsed / decelDuration);

        // Continuous quartic-style deceleration curve: strictly clockwise
        const eased = 1 - Math.pow(1 - progress, SPIN_CONSTANTS.DECEL_EASING_POWER);
        const currentAngle = decelStartAngle + totalDecelDegrees * eased;

        rotationRef.current = currentAngle;
        if (wheelSvgRef.current) {
          wheelSvgRef.current.style.transform = `rotate(${currentAngle}deg)`;
        }

        // Calculate momentary speed ratio for dynamic audio pitch and volume
        const currentSpeed = cruiseSpeed * Math.pow(1 - progress, SPIN_CONSTANTS.DECEL_EASING_POWER - 1);
        const speedRatio = Math.max(0.3, currentSpeed / cruiseSpeed);

        const currentPegIndex = Math.floor(currentAngle / pegAngleStep);
        if (currentPegIndex > lastPegIndex) {
          playRealisticTick(speedRatio);
          lastPegIndex = currentPegIndex;
        }

        // Flapper needle deflection tracking slowing pegs
        const pegPhase = (((currentAngle % pegAngleStep) + pegAngleStep) % pegAngleStep) / pegAngleStep;
        let flapperDeflection = 0;
        if (pegPhase > 0.75) {
          flapperDeflection = -13 * ((pegPhase - 0.75) / 0.25);
        } else if (pegPhase < 0.25) {
          flapperDeflection = -13 * (1 - (pegPhase / 0.25));
        }
        if (flapperNeedleRef.current) {
          flapperNeedleRef.current.style.transform = `rotate(${flapperDeflection}deg)`;
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          // --- Complete Gentle Rest on Winner ---
          const finalAngle = decelStartAngle + totalDecelDegrees;
          rotationRef.current = finalAngle;
          if (wheelSvgRef.current) {
            wheelSvgRef.current.style.transform = `rotate(${finalAngle}deg)`;
          }
          if (flapperNeedleRef.current) {
            flapperNeedleRef.current.style.transform = 'rotate(0deg)';
          }
          isSpinningRef.current = false;

          if (hasFailed) {
            setWheelState('READY');
            setWheelErrorMessage(failureMessage);
          } else if (winningTargetReward) {
            setWinningVoucher(winningTargetReward);
            playVictoryChime();

            // Zoom in on winning voucher inside the same left-side area
            setWheelState('VOUCHER_ZOOM');

            // For normal users, start 20-second countdown only after zoom animation completes (~450ms)
            // Master OTP testing sessions never expire or kick the user out
            if (!isMasterSession) {
              setTimeout(() => {
                setIsCountdownActive(true);
                setCountdown(AUTO_RETURN_SECONDS);
              }, 450);
            }
          }
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  // ONE-TAP HANDLER: Tapping the envelope reveals the wish
  const handleEnvelopeTap = () => {
    if (envelopeState !== 'CLOSED') return;
    if (onPlayChime) onPlayChime();

    setEnvelopeState('OPENING');
    setTimeout(() => {
      setEnvelopeState('OPENED');
    }, 750);
  };

  // Feedback submission handler
  const handleSubmitFeedback = async () => {
    if (!selectedFeedback) return;
    if (isTrial) return;
    setIsSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      if (onSubmitFeedback) {
        await onSubmitFeedback(selectedFeedback as GameFeedback);
      } else if (sessionId) {
        await gameApi.submitFeedback(sessionId, selectedFeedback as GameFeedback);
      }
      setFeedbackSubmitted(true);
      setSubmittedFeedbackValue(selectedFeedback as GameFeedback);
    } catch (err: any) {
      console.warn('Feedback submit error:', err);
      setFeedbackError(err.message || 'Failed to submit feedback.');
    } finally {
      setIsSubmittingFeedback(false);
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

  const numSlices = Math.max(1, wheelRewards.length);
  const sliceAngle = 360 / numSlices;
  const wheelRadius = 240;
  const centerCoord = 250;

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-[100vw] overflow-hidden bg-neutral-950/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-3 md:p-4 box-border select-none">
      <div className="w-full max-w-[1360px] h-full max-h-[96dvh] bg-[#0E0A1A] border border-amber-500/50 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 md:p-4 lg:p-5 shadow-[0_0_80px_rgba(245,158,11,0.22)] flex flex-col justify-between box-border relative overflow-hidden">
        {/* Festive Golden Corner Accents */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-amber-400/80 pointer-events-none" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-amber-400/80 pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-amber-400/80 pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-amber-400/80 pointer-events-none" />

        {/* ------------------------------------------------------------- */}
        {/* TOP BAR / HEADER                                              */}
        {/* ------------------------------------------------------------- */}
        <header className="w-full flex items-center justify-between gap-2 border-b border-amber-500/20 pb-1.5 sm:pb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 flex-shrink-0" />
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-amber-100 font-['Cinzel',serif] tracking-wider drop-shadow-[0_2px_10px_rgba(245,158,11,0.4)]">
              GAME OVER
            </h1>
            <span className="hidden sm:inline-block text-xs text-amber-200/60 font-mono">
              • Diwali Motion Spectacular
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Countdown / Master Badge: Master OTP testing session never auto-exits */}
            {isMasterSession ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-200 font-mono text-xs font-semibold shadow-inner"
                title="Master OTP Testing Session (Unlimited Spins Enabled)"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Master Testing Session</span>
              </div>
            ) : isCountdownActive ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 font-mono text-xs font-semibold shadow-inner animate-[fadeIn_0.3s_ease-out]"
                title="Automatically returning to code entry screen"
              >
                <Timer className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>
                  Returning in <strong className="text-amber-100 font-bold">{countdown}s</strong>
                </span>
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300/80 font-mono text-xs font-medium shadow-inner"
                title="Spin the wheel on the left to claim your prize"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Spin & Win</span>
              </div>
            )}

            {/* Clearly Visible × Close Button */}
            <button
              type="button"
              onClick={triggerExit}
              aria-label="Close and return to home screen"
              title="Close and return to code entry"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-900/90 hover:bg-neutral-800 border border-amber-500/50 hover:border-amber-300 text-amber-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            </button>
          </div>
        </header>

        {/* ------------------------------------------------------------- */}
        {/* MAIN BODY: 2-Column Responsive Viewport                       */}
        {/* ------------------------------------------------------------- */}
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 lg:gap-5 my-1.5 sm:my-2 min-h-0 overflow-hidden">
          
          {/* =========================================================== */}
          {/* LEFT COLUMN: Clean Player Photo & Recognition Banner        */}
          {/* =========================================================== */}
          <div className="md:col-span-5 flex flex-col justify-between items-center text-center h-full min-h-0 overflow-hidden">
            {/* Player Photo Frame */}
            <div className="w-full flex-1 min-h-0 flex items-center justify-center p-1">
              <div className="w-full max-w-[480px] h-full max-h-[46dvh] rounded-2xl p-1 bg-gradient-to-b from-amber-400 via-amber-500/60 to-yellow-600 shadow-[0_0_35px_rgba(245,158,11,0.3)] flex flex-col">
                <div className="w-full h-full aspect-[16/10] sm:aspect-[16/9] rounded-[14px] overflow-hidden bg-neutral-900 border border-amber-400/50 relative flex items-center justify-center">
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
                      <span className="text-[10px] text-neutral-400 mt-0.5">Live Camera Feed</span>
                    </div>
                  )}

                  {/* Elegant Golden Corner Accents ONLY */}
                  <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-amber-300/80 pointer-events-none" />
                  <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-amber-300/80 pointer-events-none" />
                  <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-amber-300/80 pointer-events-none" />
                  <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-amber-300/80 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Recognition Banner: WELL DONE! + PLAYER NAME + YOU PLAYED VERY WELL */}
            <div className="w-full flex-shrink-0 pt-1 pb-0 flex flex-col items-center justify-center">
              <span className="text-xs sm:text-sm font-bold tracking-widest text-amber-300/90 font-['Cinzel',serif] uppercase">
                WELL DONE!
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-['Cinzel',serif] tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-200 drop-shadow-[0_0_16px_rgba(251,191,36,0.5)] uppercase my-0.5 truncate max-w-full">
                {playerName}
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-amber-200/90 tracking-wide font-['Plus_Jakarta_Sans',sans-serif]">
                YOU PLAYED VERY WELL 🎆
              </p>
            </div>
          </div>

          {/* =========================================================== */}
          {/* RIGHT COLUMN: Thinner Score Card, Stats, & Divided Section  */}
          {/* =========================================================== */}
          <div className="md:col-span-7 flex flex-col justify-between h-full min-h-0 overflow-hidden gap-1.5 sm:gap-2">
            
            {/* --------------------------------------------------------- */}
            {/* 1. TOTAL POINTS SECTION: Slightly thinner height          */}
            {/* Preserves achievement badge, subtitle, score, label       */}
            {/* --------------------------------------------------------- */}
            <div className="w-full bg-gradient-to-b from-[#18112C] to-[#120B22] border border-amber-500/50 rounded-xl sm:rounded-2xl py-1.5 px-3 sm:py-2 sm:px-4 box-border flex flex-col justify-center items-center shadow-[0_0_25px_rgba(245,158,11,0.18)] relative flex-shrink-0">
              <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-amber-400/60 pointer-events-none" />
              <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-amber-400/60 pointer-events-none" />
              <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-amber-400/60 pointer-events-none" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-amber-400/60 pointer-events-none" />

              {/* Achievement Badge (Above Score) */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)] mb-0.5">
                <span className="text-xs">{achievement.emoji}</span>
                <span className="text-[11px] sm:text-xs font-black font-['Cinzel',serif] tracking-wider text-amber-200 uppercase">
                  {achievement.title}
                </span>
                <span className="text-xs">{achievement.emoji}</span>
              </div>

              <p className="text-[9.5px] sm:text-[10.5px] font-semibold text-amber-200/80 tracking-wide mb-0.5 font-['Plus_Jakarta_Sans',sans-serif]">
                {achievement.subtitle}
              </p>

              {/* Animated Score */}
              <div
                style={{ fontSize: 'clamp(28px, 3.2vw, 42px)' }}
                className="font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-200 drop-shadow-[0_0_18px_rgba(251,191,36,0.6)] leading-none my-0.5"
              >
                {displayedScore.toLocaleString()}
              </div>

              <span className="text-[9px] sm:text-[10px] font-mono text-amber-300/80 uppercase tracking-widest font-bold mt-0.5">
                TOTAL POINTS
              </span>
            </div>

            {/* STATISTICS ROW: Game Performance Metrics */}
            <div
              className={`w-full grid ${
                isTargetEnabled ? 'grid-cols-5 gap-1.5 sm:gap-2' : 'grid-cols-4 gap-1.5 sm:gap-2'
              } flex-shrink-0`}
            >
              {/* Metric 1: Bombs Burst */}
              <div className="bg-[#140D26] border border-amber-500/30 rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center">
                <span className="text-sm sm:text-base lg:text-lg font-mono font-bold text-amber-100 leading-tight">
                  {bombsBurst}
                </span>
                <span className="text-[8.5px] sm:text-[9.5px] font-mono font-semibold text-amber-300/70 uppercase tracking-wider text-center">
                  BOMBS BURST
                </span>
              </div>

              {/* Metric 2: Combos Awarded */}
              <div className="bg-[#140D26] border border-amber-500/30 rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center">
                <span className="text-sm sm:text-base lg:text-lg font-mono font-bold text-amber-300 leading-tight">
                  {combosAwarded}
                </span>
                <span className="text-[8.5px] sm:text-[9.5px] font-mono font-semibold text-amber-300/70 uppercase tracking-wider text-center">
                  COMBOS
                </span>
              </div>

              {/* Metric 3: Penalty Deductions */}
              <div className="bg-[#140D26] border border-amber-500/30 rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center">
                <span
                  className={`text-sm sm:text-base lg:text-lg font-mono font-bold leading-tight ${
                    penaltyDeductions > 0 ? 'text-rose-400' : 'text-neutral-300'
                  }`}
                >
                  {penaltyDeductions > 0 ? `-${penaltyDeductions}` : '0'}
                </span>
                <span className="text-[8.5px] sm:text-[9.5px] font-mono font-semibold text-amber-300/70 uppercase tracking-wider text-center">
                  PENALTY DED.
                </span>
              </div>

              {/* Metric 4: Combo Bonus Points */}
              <div className="bg-[#140D26] border border-amber-500/30 rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center">
                <span className="text-sm sm:text-base lg:text-lg font-mono font-bold text-emerald-400 leading-tight">
                  +{comboBonusPoints}
                </span>
                <span className="text-[8.5px] sm:text-[9.5px] font-mono font-semibold text-amber-300/70 uppercase tracking-wider text-center">
                  COMBO BONUS
                </span>
              </div>

              {/* Metric 5: Target Score */}
              {isTargetEnabled && (
                <div
                  className={`border rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center ${
                    isTargetAchieved
                      ? 'bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                      : 'bg-[#140D26] border-amber-500/30'
                  }`}
                >
                  <span
                    className={`text-sm sm:text-base lg:text-lg font-mono font-bold leading-tight ${
                      isTargetAchieved ? 'text-emerald-300' : 'text-amber-200'
                    }`}
                  >
                    {targetVal.toLocaleString()}
                  </span>
                  <span
                    className={`text-[8.5px] sm:text-[9.5px] font-mono font-semibold uppercase tracking-wider text-center ${
                      isTargetAchieved ? 'text-emerald-400 font-bold' : 'text-amber-300/70'
                    }`}
                  >
                    {isTargetAchieved ? 'ACHIEVED 🎯' : 'TARGET GOAL'}
                  </span>
                </div>
              )}
            </div>

            {/* SCORE REWARD VOUCHER (If won by score) */}
            {earnedReward && (
              <div className="w-full bg-gradient-to-r from-amber-950/80 via-[#221308] to-yellow-950/80 border border-amber-400/80 rounded-xl p-1.5 sm:p-2 flex items-center justify-between gap-2 shadow-lg flex-shrink-0 animate-[fadeIn_0.3s_ease-out]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/95 p-1 border border-amber-400/60 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                    {earnedReward.imageUrl ? (
                      <img
                        src={resolveAssetUrl(earnedReward.imageUrl)}
                        alt={earnedReward.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Gift className="w-4 h-4 text-amber-600" />
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="inline-flex items-center gap-1 text-[8.5px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                      <Trophy className="w-2.5 h-2.5 text-amber-400" />
                      <span>SCORE PRIZE UNLOCKED!</span>
                    </div>
                    <h4 className="text-xs font-bold text-amber-100 truncate">
                      {earnedReward.name}
                    </h4>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="bg-[#140803] border border-amber-400/50 rounded-lg px-2 py-0.5 text-right">
                    <span className="block text-[7.5px] font-mono text-amber-300/70 uppercase">CODE</span>
                    <span className="text-[11px] font-mono font-black text-amber-200 tracking-wider">
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
                    className="p-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs cursor-pointer transition"
                    title="Copy Coupon Code"
                  >
                    {copiedEarnedCode ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/* 2. DIVIDED WISH SECTION: TWO BALANCED COLUMNS             */}
            {/* LEFT: Spin & Win (Wheel + Zoomed Voucher)                 */}
            {/* RIGHT: Wish Card + Play Again Button directly below       */}
            {/* --------------------------------------------------------- */}
            <div className="w-full flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5 overflow-hidden">
              
              {/* ======================================================= */}
              {/* LEFT SIDE – Spin & Win Wheel / Zoomed Winning Voucher   */}
              {/* ======================================================= */}
              <div className="h-full min-h-0 bg-gradient-to-b from-[#1A1226]/95 via-[#140D22]/95 to-[#0E081A]/95 border border-amber-500/40 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 flex flex-col justify-between items-center relative overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                {/* Golden corner accents */}
                <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-amber-400/60 pointer-events-none" />
                <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-amber-400/60 pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-amber-400/60 pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-amber-400/60 pointer-events-none" />

                {/* Left Side Sub-State 1: WHEEL DISPLAY */}
                {wheelState !== 'VOUCHER_ZOOM' && (
                  <div className="w-full h-full flex flex-col justify-between items-center text-center overflow-hidden">
                    {/* Header */}
                    <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold font-['Cinzel',serif] text-amber-200 uppercase tracking-wider flex-shrink-0">
                      <Gift className="w-3.5 h-3.5 text-amber-400" />
                      <span>SPIN & WIN</span>
                      <Sparkles className="w-3 h-3 text-amber-400" />
                    </div>

                    {wheelErrorMessage && (
                      <div className="w-full p-1 bg-rose-950/80 border border-rose-500/40 rounded text-[9.5px] text-rose-200 flex items-center justify-center gap-1 my-0.5">
                        <AlertCircle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                        <span className="truncate">{wheelErrorMessage}</span>
                      </div>
                    )}

                    {/* Wheel Interactive Container */}
                    <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden my-0.5">
                      {isLoadingWheelRewards ? (
                        <div className="flex flex-col items-center justify-center gap-1 text-amber-300">
                          <RotateCw className="w-6 h-6 animate-spin text-amber-400" />
                          <span className="text-[10px] font-mono">Loading wheel...</span>
                        </div>
                      ) : wheelRewards.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-2 text-center">
                          <Gift className="w-8 h-8 text-amber-400/60 mb-1" />
                          <span className="text-xs font-bold text-amber-200">Diwali Gift Pass</span>
                          <span className="text-[10px] text-amber-300/70">Complimentary festive blessing</span>
                        </div>
                      ) : (
                        <div className="relative flex items-center justify-center w-full h-full max-w-[210px] max-h-[210px] sm:max-w-[230px] sm:max-h-[230px] lg:max-w-[250px] lg:max-h-[250px] aspect-square">
                          {/* Top Pointer Indicator with physical deflecting flapper */}
                          <div className="absolute -top-3 z-30 flex flex-col items-center pointer-events-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]">
                            {/* Pivot jewel mount */}
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 border border-amber-950 flex items-center justify-center shadow-md">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-100 shadow-inner" />
                            </div>
                            {/* Deflecting flapper needle */}
                            <div
                              ref={flapperNeedleRef}
                              className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[17px] border-t-amber-400 -mt-1 origin-top filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                              style={{ transformOrigin: '50% 0%', willChange: 'transform' }}
                            />
                          </div>

                          {/* SVG Wheel with Casino Styling, Metallic Pegs & Clear Large Vouchers */}
                          <div className="relative w-full h-full rounded-full shadow-[0_0_25px_rgba(245,158,11,0.3)] overflow-hidden">
                            <svg
                              ref={wheelSvgRef}
                              viewBox="0 0 500 500"
                              className="w-full h-full select-none will-change-transform"
                            >
                              <defs>
                                {/* Multi-stop luxury metallic gold rim gradient */}
                                <linearGradient id="gold-rim-metal" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#FDE68A" />
                                  <stop offset="25%" stopColor="#B45309" />
                                  <stop offset="50%" stopColor="#F59E0B" />
                                  <stop offset="75%" stopColor="#78350F" />
                                  <stop offset="100%" stopColor="#FCD34D" />
                                </linearGradient>

                                {/* 3D metallic peg rivet gradient */}
                                <radialGradient id="gold-peg-grad" cx="35%" cy="35%" r="65%">
                                  <stop offset="0%" stopColor="#FFFFFF" />
                                  <stop offset="25%" stopColor="#FDE68A" />
                                  <stop offset="60%" stopColor="#D97706" />
                                  <stop offset="100%" stopColor="#78350F" />
                                </radialGradient>

                                {/* Radial spoke divider golden shimmer */}
                                <linearGradient id="gold-spoke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#FDE68A" />
                                  <stop offset="50%" stopColor="#F59E0B" />
                                  <stop offset="100%" stopColor="#92400E" />
                                </linearGradient>

                                {/* Radial slice sheen highlight */}
                                <radialGradient id="slice-sheen" cx="50%" cy="50%" r="50%">
                                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
                                  <stop offset="65%" stopColor="#000000" stopOpacity="0" />
                                  <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
                                </radialGradient>

                                {/* Voucher badge drop shadow */}
                                <filter id="badge-shadow" x="-30%" y="-30%" width="160%" height="160%">
                                  <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.65" />
                                </filter>
                              </defs>

                              {/* Multi-layered Outer Casino Rim */}
                              <circle
                                cx={centerCoord}
                                cy={centerCoord}
                                r="247"
                                fill="#0C0704"
                                stroke="url(#gold-rim-metal)"
                                strokeWidth="6"
                              />
                              <circle
                                cx={centerCoord}
                                cy={centerCoord}
                                r="238"
                                fill="none"
                                stroke="#78350F"
                                strokeWidth="12"
                                strokeOpacity="0.4"
                              />
                              <circle
                                cx={centerCoord}
                                cy={centerCoord}
                                r="232"
                                fill="none"
                                stroke="#F59E0B"
                                strokeWidth="1.5"
                              />

                              {/* Wheel Slices with TEXT-ONLY Prize Labels */}
                              {(() => {
                                const activeRadius = 232;
                                const pegsPerSlice = numSlices <= 4 ? 4 : (numSlices <= 6 ? 3 : (numSlices <= 10 ? 2 : 1));
                                const totalPegs = Math.max(16, numSlices * pegsPerSlice);
                                const pegAngleStep = 360 / totalPegs;

                                const baseTitleFontSize = numSlices <= 4 ? 22 : (numSlices <= 6 ? 19 : (numSlices <= 8 ? 16.5 : (numSlices <= 10 ? 14.5 : 13)));
                                const baseSubFontSize = numSlices <= 4 ? 14 : (numSlices <= 6 ? 12.5 : (numSlices <= 8 ? 11 : (numSlices <= 10 ? 9.5 : 8.5)));
                                const titleStrokeWidth = numSlices <= 6 ? 3.5 : 2.8;
                                const subStrokeWidth = numSlices <= 6 ? 2.6 : 2.0;

                                // Radial positioning: Line 1 in upper wide portion, Line 2 below it
                                const line1Dist = 152;
                                const line2Dist = 122;
                                const starDist = 184;

                                const maxTextWidthLine1 = Math.max(36, 2 * line1Dist * Math.sin((sliceAngle * Math.PI) / 360) * 0.84);
                                const maxTextWidthLine2 = Math.max(30, 2 * line2Dist * Math.sin((sliceAngle * Math.PI) / 360) * 0.82);

                                return (
                                  <>
                                    {/* Slices Group */}
                                    {wheelRewards.map((reward, i) => {
                                      const startAngle = i * sliceAngle;
                                      const endAngle = (i + 1) * sliceAngle;
                                      const midAngle = (i + 0.5) * sliceAngle;
                                      const paletteItem = CASINO_SEGMENT_PALETTE[i % CASINO_SEGMENT_PALETTE.length];
                                      const { line1, line2 } = parseVoucherTitle(reward.name);

                                      const startRad = (startAngle * Math.PI) / 180;
                                      const endRad = (endAngle * Math.PI) / 180;

                                      const x1 = centerCoord + activeRadius * Math.sin(startRad);
                                      const y1 = centerCoord - activeRadius * Math.cos(startRad);
                                      const x2 = centerCoord + activeRadius * Math.sin(endRad);
                                      const y2 = centerCoord - activeRadius * Math.cos(endRad);

                                      const largeArc = sliceAngle > 180 ? 1 : 0;
                                      const pathData =
                                        numSlices === 1
                                          ? `M ${centerCoord} ${centerCoord} m -${activeRadius}, 0 a ${activeRadius},${activeRadius} 0 1,0 ${activeRadius * 2},0 a ${activeRadius},${activeRadius} 0 1,0 -${activeRadius * 2},0`
                                          : `M ${centerCoord} ${centerCoord} L ${x1} ${y1} A ${activeRadius} ${activeRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                                      // Dynamic font size scaling if text is longer
                                      const line1Scale = line1.length > 7 ? Math.max(0.72, 7 / line1.length) : 1;
                                      const titleFontSize = Math.round(baseTitleFontSize * line1Scale * 10) / 10;

                                      const line2Scale = line2.length > 7 ? Math.max(0.72, 7 / line2.length) : 1;
                                      const subFontSize = Math.round(baseSubFontSize * line2Scale * 10) / 10;

                                      // If no line2, center line1 vertically in the slice
                                      const yPosLine1 = line2 ? line1Dist : 138;

                                      return (
                                        <g key={reward.id || i}>
                                          {/* Segment Wedge Base Fill */}
                                          <path
                                            d={pathData}
                                            fill={paletteItem.bg}
                                            stroke="#D97706"
                                            strokeWidth="1.2"
                                            strokeOpacity="0.4"
                                          />

                                          {/* Subtle Radial Sheen Overlay for 3D Laminated Finish */}
                                          <path
                                            d={pathData}
                                            fill="url(#slice-sheen)"
                                            opacity="0.22"
                                            pointerEvents="none"
                                          />

                                          {/* Prize Label Group following the angle of the segment */}
                                          <g transform={`rotate(${midAngle}, ${centerCoord}, ${centerCoord})`}>
                                            {/* Decorative Golden Star Accent near Rim */}
                                            <text
                                              x={centerCoord}
                                              y={centerCoord - starDist}
                                              textAnchor="middle"
                                              fill="#F59E0B"
                                              fontSize={numSlices <= 6 ? 12 : 10}
                                              opacity="0.9"
                                              pointerEvents="none"
                                            >
                                              ★
                                            </text>

                                            {/* Headline Prize Amount (e.g. ₹1000/-, 20%, ₹500/-) */}
                                            <text
                                              x={centerCoord}
                                              y={centerCoord - yPosLine1}
                                              textAnchor="middle"
                                              fill={paletteItem.textPrimary}
                                              stroke="#0C0704"
                                              strokeWidth={titleStrokeWidth}
                                              paintOrder="stroke fill"
                                              strokeLinejoin="round"
                                              fontSize={titleFontSize}
                                              fontWeight="900"
                                              fontFamily="'Cinzel', 'Arial Black', sans-serif"
                                              letterSpacing="0.6"
                                              textLength={line1.length > 6 ? maxTextWidthLine1 : undefined}
                                              lengthAdjust={line1.length > 6 ? "spacingAndGlyphs" : undefined}
                                              pointerEvents="none"
                                            >
                                              {line1}
                                            </text>

                                            {/* Suffix / Action (e.g. OFF, DISCOUNT) */}
                                            {line2 && (
                                              <text
                                                x={centerCoord}
                                                y={centerCoord - line2Dist}
                                                textAnchor="middle"
                                                fill={paletteItem.textSecondary}
                                                stroke="#0C0704"
                                                strokeWidth={subStrokeWidth}
                                                paintOrder="stroke fill"
                                                strokeLinejoin="round"
                                                fontSize={subFontSize}
                                                fontWeight="800"
                                                fontFamily="'Cinzel', sans-serif"
                                                letterSpacing="1.5"
                                                textLength={line2.length > 5 ? maxTextWidthLine2 : undefined}
                                                lengthAdjust={line2.length > 5 ? "spacingAndGlyphs" : undefined}
                                                pointerEvents="none"
                                              >
                                                {line2}
                                              </text>
                                            )}
                                          </g>

                                          {/* Golden Brass Spoke Divider Line */}
                                          <line
                                            x1={centerCoord + 58 * Math.sin(startRad)}
                                            y1={centerCoord - 58 * Math.cos(startRad)}
                                            x2={centerCoord + activeRadius * Math.sin(startRad)}
                                            y2={centerCoord - activeRadius * Math.cos(startRad)}
                                            stroke="url(#gold-spoke-grad)"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                          />
                                        </g>
                                      );
                                    })}

                                    {/* Perimeter 3D Metallic Golden Pegs / Rivets */}
                                    {Array.from({ length: totalPegs }).map((_, p) => (
                                      <g key={`peg-${p}`} transform={`rotate(${p * pegAngleStep}, ${centerCoord}, ${centerCoord})`}>
                                        <circle
                                          cx={centerCoord}
                                          cy={centerCoord - 238}
                                          r="3.8"
                                          fill="url(#gold-peg-grad)"
                                          stroke="#451A03"
                                          strokeWidth="0.8"
                                        />
                                        <circle
                                          cx={centerCoord - 1}
                                          cy={centerCoord - 239.1}
                                          r="1.2"
                                          fill="#FFFFFF"
                                          opacity="0.9"
                                        />
                                      </g>
                                    ))}
                                  </>
                                );
                              })()}

                              {/* Center 3D Gold Bevel Hub */}
                              <circle
                                cx={centerCoord}
                                cy={centerCoord}
                                r="58"
                                fill="#140D07"
                                stroke="url(#gold-rim-metal)"
                                strokeWidth="4"
                              />
                              <circle
                                cx={centerCoord}
                                cy={centerCoord}
                                r="50"
                                fill="#20140A"
                                stroke="#F59E0B"
                                strokeWidth="1.5"
                              />
                            </svg>

                            {/* Center Interactive 3D Gold SPIN Button */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <button
                                type="button"
                                onClick={handleSpinClick}
                                disabled={(!isMasterSession && hasSpun) || wheelState === 'SPINNING' || wheelRewards.length === 0}
                                className="pointer-events-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 hover:from-amber-200 hover:via-amber-400 hover:to-amber-600 border-[3.5px] border-[#140D07] shadow-[0_0_15px_rgba(245,158,11,0.5),inset_0_2px_4px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.5)] hover:shadow-[0_0_22px_rgba(245,158,11,0.8),inset_0_2px_4px_rgba(255,255,255,0.9)] flex items-center justify-center cursor-pointer active:scale-95 transition-all disabled:opacity-75 disabled:cursor-not-allowed group"
                              >
                                <span className="text-[11px] sm:text-xs font-black font-['Cinzel',serif] tracking-wider text-neutral-950 uppercase drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
                                  {wheelState === 'SPINNING' ? '...' : (!isMasterSession && hasSpun) ? 'DONE' : 'SPIN'}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Helper / Status */}
                    <div className="text-[9.5px] sm:text-[10px] text-amber-200/70 font-mono flex-shrink-0">
                      {wheelState === 'SPINNING'
                        ? 'Spinning...'
                        : isMasterSession
                        ? 'Master OTP Active: Unlimited spins enabled'
                        : hasSpun
                        ? 'Spin chance used for this game'
                        : 'Tap center SPIN button to win'}
                    </div>
                  </div>
                )}

                {/* Left Side Sub-State 2: ZOOMED IN WINNING VOUCHER */}
                {wheelState === 'VOUCHER_ZOOM' && winningVoucher && (
                  <div className="w-full h-full flex flex-col justify-between items-center text-center p-1 sm:p-2 animate-voucher-zoom overflow-hidden">
                    {/* Header */}
                    <div className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-black font-['Cinzel',serif] text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-100 uppercase tracking-wider drop-shadow">
                      <span>🎉</span>
                      <span>YOU WON A FESTIVE PRIZE!</span>
                      <span>🎉</span>
                    </div>

                    {/* Prominent Voucher Image on Winning Result */}
                    <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-2xl bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 p-1 shadow-[0_0_25px_rgba(245,158,11,0.5)] my-1 flex-shrink-0 transition-transform duration-500 scale-100 hover:scale-105">
                      <div className="w-full h-full rounded-[12px] bg-[#1C1226] p-1.5 flex items-center justify-center overflow-hidden">
                        {winningVoucher.imageUrl ? (
                          <img
                            src={resolveAssetUrl(winningVoucher.imageUrl)}
                            alt={winningVoucher.name}
                            className="w-full h-full object-contain drop-shadow"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-1">
                            <Gift className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 drop-shadow mb-0.5 animate-pulse" />
                            <span className="text-[11px] sm:text-xs font-black font-['Cinzel',serif] text-amber-200">
                              {parseVoucherTitle(winningVoucher.name).line1}
                            </span>
                            {parseVoucherTitle(winningVoucher.name).line2 && (
                              <span className="text-[9px] sm:text-[10px] font-bold text-amber-300/80 tracking-wider">
                                {parseVoucherTitle(winningVoucher.name).line2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Prize Name */}
                    <h4 className="text-xs sm:text-sm lg:text-base font-black font-['Cinzel',serif] text-amber-100 line-clamp-1 truncate w-full max-w-[260px] drop-shadow">
                      {winningVoucher.name}
                    </h4>

                    {/* Coupon Code Box */}
                    <div className="w-full max-w-[260px] bg-[#140803] border border-amber-400/60 rounded-lg py-2 px-3 flex flex-col items-center justify-center shadow-inner my-1">
                      <span className="block text-[8.5px] font-mono font-bold text-amber-300/70 uppercase tracking-widest leading-none mb-1">
                        COUPON CODE
                      </span>
                      <span className="text-sm sm:text-base font-mono font-black text-amber-200 tracking-widest select-all">
                        {winningVoucher.couponCode}
                      </span>
                    </div>

                    {/* Brief Terms or Description */}
                    <p className="text-[9.5px] sm:text-[10px] text-amber-200/75 line-clamp-2 px-1 max-w-[260px] leading-tight">
                      {winningVoucher.termsAndConditions || winningVoucher.description || 'Present this code to claim your reward.'}
                    </p>

                    {/* Voucher Unlocked Status & Spin Again (Master OTP) */}
                    <div className="flex items-center justify-center gap-2 pt-0.5 flex-shrink-0">
                      <div className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[9px] sm:text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
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
                          className="px-2.5 py-0.5 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 shadow cursor-pointer active:scale-95 transition-transform"
                          title="Spin again with fresh reward selection (Master OTP)"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                          <span>Spin Again</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ======================================================= */}
              {/* RIGHT SIDE – Wish Card + Play Again Button Directly Below */}
              {/* ======================================================= */}
              <div className="h-full min-h-0 flex flex-col justify-between gap-1.5 sm:gap-2 overflow-hidden">
                
                {/* ----------------------------------------------------- */}
                {/* TOP: Tap for Wish Card / Envelope                     */}
                {/* ----------------------------------------------------- */}
                <div className="w-full flex-1 min-h-0 bg-gradient-to-r from-amber-950/40 via-amber-900/25 to-yellow-950/40 border border-amber-500/40 rounded-xl sm:rounded-2xl p-1.5 sm:p-2 lg:p-2.5 text-center relative box-border shadow-[0_0_20px_rgba(245,158,11,0.1)] flex flex-col justify-center items-center overflow-hidden">
                  
                  {/* Golden corner accents */}
                  <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 sm:top-2 sm:left-2 sm:w-3 sm:h-3 border-t border-l border-amber-400/60 pointer-events-none" />
                  <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 sm:top-2 sm:right-2 sm:w-3 sm:h-3 border-t border-r border-amber-400/60 pointer-events-none" />
                  <div className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 sm:bottom-2 sm:left-2 sm:w-3 sm:h-3 border-b border-l border-amber-400/60 pointer-events-none" />
                  <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 sm:bottom-2 sm:right-2 sm:w-3 sm:h-3 border-b border-r border-amber-400/60 pointer-events-none" />

                  {/* Envelope State 1: CLOSED */}
                  {envelopeState === 'CLOSED' && (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                      <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-amber-300 uppercase tracking-wider font-['Cinzel',serif] mb-0.5">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>FESTIVE DIWALI BLESSING</span>
                        <Sparkles className="w-3 h-3 text-amber-400" />
                      </div>

                      <p className="text-[9.5px] sm:text-[10.5px] text-amber-200/80 mb-1.5 font-['Plus_Jakarta_Sans',sans-serif]">
                        Open your personalized Diwali wish
                      </p>

                      <button
                        onClick={handleEnvelopeTap}
                        className="group relative cursor-pointer flex flex-col items-center justify-center p-2 sm:p-2.5 bg-gradient-to-b from-[#25173D] via-[#1B1130] to-[#140A26] hover:from-[#321F52] hover:to-[#1B0F33] border-2 border-amber-400/70 hover:border-amber-300 rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.35)] w-full max-w-[280px]"
                      >
                        <div className="relative flex items-center justify-center w-full my-0.5">
                          <div className="absolute inset-0 bg-amber-400/25 rounded-full blur-lg group-hover:bg-amber-400/40 transition" />
                          <div className="relative flex items-center justify-center gap-1.5">
                            <Mail className="w-7 h-7 sm:w-8 sm:h-8 text-amber-300 group-hover:text-yellow-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
                            <div className="w-4 h-4 rounded-full bg-amber-500/80 border border-yellow-200 flex items-center justify-center text-[9px] shadow">
                              🪔
                            </div>
                          </div>
                        </div>

                        <div className="mt-0.5 flex flex-col items-center leading-tight">
                          <span className="text-[8.5px] font-mono text-amber-300/80 uppercase tracking-widest">
                            SPECIALLY FOR
                          </span>
                          <span className="text-xs sm:text-sm font-bold font-['Cinzel',serif] text-amber-100 uppercase tracking-wider">
                            {playerName}
                          </span>
                        </div>

                        <div className="mt-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[9.5px] font-mono font-bold text-amber-200 uppercase tracking-wider">
                          TAP TO REVEAL WISH
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Envelope State 2: OPENING ANIMATION */}
                  {envelopeState === 'OPENING' && (
                    <div className="flex flex-col items-center justify-center w-full h-full animate-pulse">
                      <div className="relative flex items-center justify-center w-14 h-14 mb-1.5">
                        <div className="absolute inset-0 bg-amber-400/50 rounded-full blur-xl animate-ping" />
                        <Mail className="w-10 h-10 text-yellow-200 drop-shadow-[0_0_20px_rgba(251,191,36,0.9)] animate-bounce" />
                      </div>
                      <span className="text-xs font-bold font-['Cinzel',serif] text-amber-200 tracking-wider">
                        UNVEILING YOUR BLESSING...
                      </span>
                    </div>
                  )}

                  {/* Envelope State 3: OPENED DIWALI WISH CARD */}
                  {envelopeState === 'OPENED' && (
                    <div className="flex flex-col justify-between w-full h-full text-center animate-[fadeIn_0.4s_ease-out] overflow-hidden">
                      {/* Top Header */}
                      <div className="inline-flex items-center justify-center gap-1.5 text-[9.5px] sm:text-[10.5px] font-bold text-amber-300 uppercase tracking-widest font-['Cinzel',serif] shrink-0 pt-0.5">
                        <span className="text-[10px] sm:text-xs">🪔</span>
                        <span>YOUR SPECIAL WISH FROM {brandName.toUpperCase()}</span>
                        <span className="text-[10px] sm:text-xs">🪔</span>
                      </div>

                      {/* Main Wish Content Container */}
                      <div className="w-full flex-1 min-h-0 my-1 sm:my-1.5 p-2.5 sm:p-3.5 bg-gradient-to-b from-[#180E2B]/95 via-[#130A24]/95 to-[#0E061D]/95 border border-amber-500/40 rounded-xl shadow-[inset_0_0_25px_rgba(0,0,0,0.6)] flex flex-col justify-between items-center text-center overflow-y-auto">
                        
                        {/* 1. Heading Block */}
                        <div className="w-full flex flex-col items-center shrink-0">
                          <h4 className="text-xs sm:text-sm lg:text-[15px] font-black font-['Cinzel',serif] text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-200 to-yellow-300 uppercase tracking-wider leading-snug drop-shadow-sm">
                            {personalizedWish.heading}
                          </h4>
                          <div className="w-16 sm:w-24 h-[1px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent mt-1" />
                        </div>

                        {/* 2. Message Paragraphs (spacious, centered in middle) */}
                        <div className="w-full flex-1 min-h-0 flex flex-col justify-center items-center py-1.5 sm:py-2.5 space-y-1.5 sm:space-y-2 max-w-xl mx-auto">
                          {personalizedWish.lines.map((line, idx) => (
                            <p
                              key={idx}
                              className="text-[11px] sm:text-xs lg:text-[13px] text-amber-100/95 leading-relaxed font-medium font-['Plus_Jakarta_Sans',sans-serif] text-center"
                            >
                              {line}
                            </p>
                          ))}
                        </div>

                        {/* 3. Closing Wishes & Brand Signature */}
                        <div className="w-full flex flex-col items-center shrink-0 pt-1.5 border-t border-amber-500/25">
                          {(() => {
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

                            return (
                              <>
                                {closingLine && (
                                  <span className="text-[10px] sm:text-[11px] lg:text-xs font-medium font-['Cinzel',serif] text-amber-300/85 italic leading-tight">
                                    {closingLine}
                                  </span>
                                )}
                                <span className="text-xs sm:text-[13px] lg:text-sm font-bold font-['Cinzel',serif] text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-200 to-amber-300 tracking-widest uppercase mt-0.5 drop-shadow-sm">
                                  {signatureName}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Controls at the Bottom */}
                      <div className="w-full flex items-center justify-between gap-1 text-[9.5px] sm:text-[10.5px] text-amber-300/80 px-1 pt-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEnvelopeState('CLOSED')}
                          className="text-amber-400 hover:text-amber-200 underline font-mono cursor-pointer transition-colors"
                        >
                          Re-read Envelope
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadCard}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 rounded-lg text-amber-200 font-mono transition cursor-pointer"
                        >
                          {isDownloaded ? (
                            <>
                              <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">Saved!</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-300" />
                              <span>Save Card</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ----------------------------------------------------- */}
                {/* BOTTOM: Play Again Button directly below Tap for Wish */}
                {/* ----------------------------------------------------- */}
                <button
                  type="button"
                  onClick={handlePlayAgainClick}
                  className="w-full h-10 sm:h-11 lg:h-12 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-xs sm:text-sm lg:text-base uppercase tracking-widest rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:shadow-[0_0_35px_rgba(245,158,11,0.6)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] border border-amber-300/40 flex-shrink-0"
                >
                  <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                  <span>PLAY AGAIN</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* COMPACT FOOTER: Feedback Bar (if not trial)                   */}
        {/* ------------------------------------------------------------- */}
        {!isTrial && (
          <footer className="w-full flex-shrink-0 pt-1.5 border-t border-amber-500/20">
            <div className="p-1.5 sm:p-2 bg-neutral-900/90 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 shadow-inner">
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium font-['Cinzel',serif]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Game Feedback:</span>
              </div>

              {feedbackSubmitted ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Feedback recorded: <strong>{submittedFeedbackValue}</strong> — Thank you!</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 sm:justify-end">
                  <select
                    value={selectedFeedback}
                    onChange={(e) => setSelectedFeedback(e.target.value as GameFeedback)}
                    disabled={isSubmittingFeedback}
                    aria-label="Select Game Feedback"
                    className="flex-1 sm:flex-initial bg-neutral-950 border border-neutral-700 focus:border-amber-400 rounded-lg px-2.5 py-1 text-xs text-neutral-100 outline-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="" disabled>Select feedback...</option>
                    <option value="Good">Good</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Needs Improvement">Needs Improvement</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleSubmitFeedback}
                    disabled={!selectedFeedback || isSubmittingFeedback}
                    className="px-3 py-1 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(245,158,11,0.25)] shrink-0 active:scale-95"
                  >
                    {isSubmittingFeedback ? 'Saving...' : 'Submit'}
                  </button>
                </div>
              )}
              {feedbackError && (
                <div className="w-full text-center text-[10px] text-rose-400">
                  {feedbackError}
                </div>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export const GameOverModal = React.memo(GameOverModalComponent);
