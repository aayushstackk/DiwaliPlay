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

// Clean, festive, balanced Diwali colors for wheel segments
const SEGMENT_COLORS = [
  '#C2410C', // Warm Terracotta
  '#D97706', // Marigold Amber
  '#991B1B', // Deep Festive Red
  '#047857', // Emerald Green
  '#B45309', // Warm Ochre
  '#4338CA', // Royal Indigo
  '#854D0E', // Golden Bronze
  '#7C2D12', // Rich Rust
  '#0F766E', // Forest Teal
  '#9333EA'  // Festive Purple
];

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
  // ---------------------------------------------------------------------------
  const [wheelRewards, setWheelRewards] = useState<RewardItem[]>([]);
  const [isLoadingWheelRewards, setIsLoadingWheelRewards] = useState(true);
  const [wheelState, setWheelState] = useState<'READY' | 'SPINNING' | 'VOUCHER_ZOOM'>('READY');
  const [winningVoucher, setWinningVoucher] = useState<RewardItem | null>(null);
  const [copiedVoucherCode, setCopiedVoucherCode] = useState(false);
  const [wheelErrorMessage, setWheelErrorMessage] = useState<string | null>(null);

  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
  const isSpinningRef = useRef<boolean>(false);
  const rotationRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

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
    if (onCloseRef.current) {
      onCloseRef.current();
    } else if (onPlayAgainRef.current) {
      onPlayAgainRef.current();
    }
  }, []);

  // Safe fallback: if rewards are completely disabled in admin settings, start 20s countdown automatically
  useEffect(() => {
    if (!rewardsEnabled) {
      setIsCountdownActive(true);
      setCountdown(AUTO_RETURN_SECONDS);
    }
  }, [rewardsEnabled]);

  // Countdown timer effect: Runs ONLY when isCountdownActive is true
  useEffect(() => {
    if (!isCountdownActive) return;

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
      }
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Mechanical flapper tick sound with rate limiter
  const playRealisticTick = useCallback(() => {
    const now = performance.now();
    if (now - lastTickTimeRef.current < 28) return;
    lastTickTimeRef.current = now;

    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(850, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.018);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, t);
      filter.Q.setValueAtTime(2.2, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.02);
    } catch {}
  }, [getAudioContext]);

  // Cheerful victory chime on stop
  const playVictoryChime = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        gain.gain.setValueAtTime(0, now + idx * 0.09);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.85);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.9);
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
    if (isSpinningRef.current || wheelState === 'SPINNING' || wheelRewards.length === 0) return;
    isSpinningRef.current = true;
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
        playerName,
        mobileNumber: mobileNumber || undefined,
        sessionId: sessionId || undefined
      })
      .then((res) => {
        if (res.success && res.reward) {
          serverResult = {
            success: true,
            reward: res.reward,
            rewardIndex: res.rewardIndex
          };
        } else {
          serverResult = {
            success: false,
            errorMessage: res.message || 'Spin failed on server.'
          };
        }
      })
      .catch((err: any) => {
        serverResult = {
          success: false,
          errorMessage: err.message || 'Network error while spinning.'
        };
      });

    // Immediate 0ms start
    const cruiseSpeed = 1200; // degrees per second
    const accelDuration = 300; // ms to reach full speed
    const minCruiseTime = 1100; // ms of fast spinning before slowdown
    const animStartTime = performance.now();

    let lastSegmentIndex = Math.floor(initialAngle / sliceAngle);

    let decelInitiated = false;
    let decelStartAngle = 0;
    let decelStartTime = 0;
    let decelDuration = 3000;
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
          const currentSpeed = cruiseSpeed * p;
          currentAngle = initialAngle + 0.5 * currentSpeed * (elapsed / 1000);
        } else {
          const accelDistance = 0.5 * cruiseSpeed * (accelDuration / 1000);
          const cruiseElapsed = (elapsed - accelDuration) / 1000;
          currentAngle = initialAngle + accelDistance + cruiseSpeed * cruiseElapsed;
        }

        rotationRef.current = currentAngle;
        if (wheelSvgRef.current) {
          wheelSvgRef.current.style.transform = `rotate(${currentAngle}deg)`;
        }

        const currentSegmentIndex = Math.floor(currentAngle / sliceAngle);
        if (currentSegmentIndex > lastSegmentIndex) {
          playRealisticTick();
          lastSegmentIndex = currentSegmentIndex;
        }

        // Begin smooth deceleration when min cruise time elapsed and backend result arrived
        if (elapsed >= minCruiseTime && serverResult !== null) {
          decelInitiated = true;
          decelStartTime = time;
          decelStartAngle = currentAngle;

          if (serverResult.success && serverResult.reward) {
            winningTargetReward = serverResult.reward;
            let targetIdx = wheelRewards.findIndex((r) => r.id === serverResult!.reward!.id);
            if (targetIdx === -1) {
              targetIdx = serverResult.rewardIndex ?? 0;
            }

            // Slice geometry: pointer at 12 o'clock (0°)
            const sliceCenterAngle = (targetIdx + 0.5) * sliceAngle;
            const targetStopAngle = (360 - (sliceCenterAngle % 360)) % 360;

            const currentMod = ((decelStartAngle % 360) + 360) % 360;
            let forwardDelta = (targetStopAngle - currentMod) % 360;
            if (forwardDelta <= 0) forwardDelta += 360;

            // Compute seamless cubic ease-out deceleration matching incoming cruiseSpeed
            const idealDecelDistance = (cruiseSpeed * 2.8) / 3;
            const fullTurns = Math.max(3, Math.ceil((idealDecelDistance - forwardDelta) / 360));
            totalDecelDegrees = fullTurns * 360 + forwardDelta;
            decelDuration = ((3 * totalDecelDegrees) / cruiseSpeed) * 1000;
          } else {
            hasFailed = true;
            failureMessage = serverResult.errorMessage || 'Unable to spin. Please try again.';
            totalDecelDegrees = 360;
            decelDuration = 1200;
          }
        }

        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // --- PHASE 2: Smooth Deceleration to Target Angle ---
        const decelElapsed = time - decelStartTime;
        const progress = Math.min(1, decelElapsed / decelDuration);

        // Smooth cubic ease-out: 1 - (1 - u)^3
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentAngle = decelStartAngle + totalDecelDegrees * eased;

        rotationRef.current = currentAngle;
        if (wheelSvgRef.current) {
          wheelSvgRef.current.style.transform = `rotate(${currentAngle}deg)`;
        }

        const currentSegmentIndex = Math.floor(currentAngle / sliceAngle);
        if (currentSegmentIndex > lastSegmentIndex) {
          playRealisticTick();
          lastSegmentIndex = currentSegmentIndex;
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          // --- Complete Stop ---
          const finalAngle = decelStartAngle + totalDecelDegrees;
          rotationRef.current = finalAngle;
          if (wheelSvgRef.current) {
            wheelSvgRef.current.style.transform = `rotate(${finalAngle}deg)`;
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

            // Start 20-second countdown only after zoom animation completes (~450ms)
            setTimeout(() => {
              setIsCountdownActive(true);
              setCountdown(AUTO_RETURN_SECONDS);
            }, 450);
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
            {/* Countdown Badge: Starts ONLY after wheel stops & voucher zooms in */}
            {isCountdownActive ? (
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
                        src={earnedReward.imageUrl}
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
                          {/* Top Pointer Indicator */}
                          <div className="absolute -top-1.5 z-20 flex flex-col items-center pointer-events-none drop-shadow-md">
                            <div className="w-3 h-3 rounded-full bg-amber-400 border border-neutral-900 shadow" />
                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[11px] border-t-amber-400 -mt-0.5" />
                          </div>

                          {/* SVG Wheel */}
                          <div className="relative w-full h-full rounded-full shadow-lg overflow-hidden">
                            <svg
                              ref={wheelSvgRef}
                              viewBox="0 0 500 500"
                              className="w-full h-full select-none will-change-transform"
                            >
                              <circle
                                cx={centerCoord}
                                cy={centerCoord}
                                r="247"
                                fill="#1C140E"
                                stroke="#D97706"
                                strokeWidth="4"
                              />

                              {wheelRewards.map((reward, i) => {
                                const startAngle = i * sliceAngle;
                                const endAngle = (i + 1) * sliceAngle;
                                const midAngle = (i + 0.5) * sliceAngle;
                                const fillColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];

                                const startRad = (startAngle * Math.PI) / 180;
                                const endRad = (endAngle * Math.PI) / 180;

                                const x1 = centerCoord + wheelRadius * Math.sin(startRad);
                                const y1 = centerCoord - wheelRadius * Math.cos(startRad);
                                const x2 = centerCoord + wheelRadius * Math.sin(endRad);
                                const y2 = centerCoord - wheelRadius * Math.cos(endRad);

                                const largeArc = sliceAngle > 180 ? 1 : 0;
                                const pathData =
                                  numSlices === 1
                                    ? `M ${centerCoord} ${centerCoord} m -${wheelRadius}, 0 a ${wheelRadius},${wheelRadius} 0 1,0 ${wheelRadius * 2},0 a ${wheelRadius},${wheelRadius} 0 1,0 -${wheelRadius * 2},0`
                                    : `M ${centerCoord} ${centerCoord} L ${x1} ${y1} A ${wheelRadius} ${wheelRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                                return (
                                  <g key={reward.id || i}>
                                    <path
                                      d={pathData}
                                      fill={fillColor}
                                      stroke="#FAF5EA"
                                      strokeWidth="1.5"
                                      strokeOpacity="0.4"
                                    />
                                    <g
                                      transform={`rotate(${midAngle}, ${centerCoord}, ${centerCoord}) translate(${centerCoord}, ${centerCoord - 150})`}
                                    >
                                      <circle cx="0" cy="0" r="26" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
                                      {reward.imageUrl ? (
                                        <image
                                          href={reward.imageUrl}
                                          x="-20"
                                          y="-20"
                                          width="40"
                                          height="40"
                                          preserveAspectRatio="xMidYMid meet"
                                        />
                                      ) : (
                                        <text
                                          x="0"
                                          y="7"
                                          textAnchor="middle"
                                          fontSize="20"
                                        >
                                          🎁
                                        </text>
                                      )}
                                    </g>
                                  </g>
                                );
                              })}
                            </svg>

                            {/* Center SPIN Button */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <button
                                type="button"
                                onClick={handleSpinClick}
                                disabled={wheelState === 'SPINNING' || wheelRewards.length === 0}
                                className="pointer-events-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-500 hover:bg-amber-400 border-4 border-[#1A120B] shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform disabled:opacity-75 disabled:cursor-not-allowed"
                              >
                                <span className="text-[11px] sm:text-xs font-black font-['Cinzel',serif] tracking-wider text-neutral-950 uppercase">
                                  {wheelState === 'SPINNING' ? '...' : 'SPIN'}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Helper / Status */}
                    <div className="text-[9.5px] sm:text-[10px] text-amber-200/70 font-mono flex-shrink-0">
                      {wheelState === 'SPINNING' ? 'Spinning...' : 'Tap center SPIN button to win'}
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

                    {/* Voucher Image / Icon */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-xl bg-gradient-to-b from-amber-400 via-yellow-500 to-amber-600 p-0.5 shadow-[0_0_20px_rgba(245,158,11,0.4)] my-1 flex-shrink-0">
                      <div className="w-full h-full rounded-[10px] bg-[#1C1226] p-1 flex items-center justify-center overflow-hidden">
                        {winningVoucher.imageUrl ? (
                          <img
                            src={winningVoucher.imageUrl}
                            alt={winningVoucher.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Gift className="w-8 h-8 text-amber-400" />
                        )}
                      </div>
                    </div>

                    {/* Prize Name */}
                    <h4 className="text-xs sm:text-sm lg:text-base font-black font-['Cinzel',serif] text-amber-100 line-clamp-1 truncate w-full max-w-[260px] drop-shadow">
                      {winningVoucher.name}
                    </h4>

                    {/* Coupon Code Box with One-Tap Copy */}
                    <div className="w-full max-w-[260px] bg-[#140803] border border-amber-400/60 rounded-lg p-1.5 flex items-center justify-between gap-2 shadow-inner my-1">
                      <div className="text-left min-w-0 pl-1">
                        <span className="block text-[8px] font-mono font-bold text-amber-300/70 uppercase leading-none">
                          COUPON CODE
                        </span>
                        <span className="text-xs sm:text-sm font-mono font-black text-amber-200 tracking-wider">
                          {winningVoucher.couponCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(winningVoucher.couponCode);
                          setCopiedVoucherCode(true);
                          setTimeout(() => setCopiedVoucherCode(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition active:scale-95 flex-shrink-0"
                        title="Copy code"
                      >
                        {copiedVoucherCode ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Brief Terms or Description */}
                    <p className="text-[9.5px] sm:text-[10px] text-amber-200/75 line-clamp-2 px-1 max-w-[260px] leading-tight">
                      {winningVoucher.termsAndConditions || winningVoucher.description || 'Present this code to claim your reward.'}
                    </p>

                    {/* Status Pill & View Wheel Option */}
                    <div className="flex items-center gap-2 pt-0.5 flex-shrink-0">
                      <div className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[9px] sm:text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        <span>VOUCHER UNLOCKED</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWheelState('READY')}
                        className="text-[9px] font-mono text-amber-300/70 hover:text-amber-200 underline cursor-pointer"
                      >
                        View Wheel
                      </button>
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
                <div className="w-full flex-1 min-h-0 bg-gradient-to-r from-amber-950/40 via-amber-900/25 to-yellow-950/40 border border-amber-500/40 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 text-center relative box-border shadow-[0_0_20px_rgba(245,158,11,0.1)] flex flex-col justify-center items-center overflow-hidden">
                  
                  {/* Golden corner accents */}
                  <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-amber-400/60 pointer-events-none" />
                  <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-amber-400/60 pointer-events-none" />
                  <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-amber-400/60 pointer-events-none" />
                  <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-amber-400/60 pointer-events-none" />

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
                    <div className="flex flex-col items-center justify-between w-full h-full text-center animate-[fadeIn_0.4s_ease-out] overflow-hidden">
                      <div className="inline-flex items-center gap-1.5 text-[9.5px] sm:text-[10.5px] font-bold text-amber-300 uppercase tracking-wider font-['Cinzel',serif]">
                        <span>🪔</span>
                        <span>YOUR SPECIAL WISH FROM {brandName.toUpperCase()}</span>
                        <span>🪔</span>
                      </div>

                      <div className="w-full bg-[#140D26]/90 border border-amber-500/40 rounded-lg p-1.5 sm:p-2 my-0.5 shadow-inner text-center flex flex-col justify-center flex-1 min-h-0">
                        <h5 className="text-[11px] sm:text-xs font-black font-['Cinzel',serif] text-amber-200 uppercase tracking-wider leading-snug">
                          {personalizedWish.heading}
                        </h5>

                        <div className="my-0.5 space-y-0.5">
                          {personalizedWish.lines.map((line, idx) => (
                            <p
                              key={idx}
                              className="text-[9.5px] sm:text-[10px] text-amber-100/90 leading-tight font-medium max-w-xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]"
                            >
                              {line}
                            </p>
                          ))}
                        </div>

                        <div className="text-[8.5px] sm:text-[9.5px] font-['Cinzel',serif] text-amber-300/80 italic whitespace-pre-line mt-0.5">
                          {personalizedWish.signoff}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="w-full flex items-center justify-between gap-1 text-[9.5px] sm:text-[10px] text-amber-300/80 px-1 flex-shrink-0">
                        <button
                          onClick={() => setEnvelopeState('CLOSED')}
                          className="text-amber-400 hover:text-amber-200 underline font-mono cursor-pointer"
                        >
                          Re-read Envelope
                        </button>

                        <button
                          onClick={handleDownloadCard}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 rounded text-amber-200 font-mono transition cursor-pointer"
                        >
                          {isDownloaded ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">Saved!</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3 text-amber-300" />
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
                  onClick={triggerExit}
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
