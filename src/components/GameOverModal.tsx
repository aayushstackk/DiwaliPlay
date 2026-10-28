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
  Timer
} from 'lucide-react';
import { GameScoreState } from '../types/motion';
import { GameFeedback } from '../types/backend';
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
  targetScore = 5000
}) => {
  // Smooth animated count-up for final score
  const [displayedScore, setDisplayedScore] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);

  // Feedback state
  const [selectedFeedback, setSelectedFeedback] = useState<GameFeedback | ''>('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittedFeedbackValue, setSubmittedFeedbackValue] = useState<GameFeedback | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // One-tap envelope state: 'CLOSED' -> 'OPENING' -> 'OPENED'
  const [envelopeState, setEnvelopeState] = useState<'CLOSED' | 'OPENING' | 'OPENED'>('CLOSED');

  // Compute performance-based achievement
  const achievement = useMemo(() => {
    return calculateAchievement(scoreState);
  }, [scoreState]);

  // Compute personalized wish
  const personalizedWish = useMemo(() => {
    return getPersonalizedWish(scoreState, achievement, playerName, brandName);
  }, [scoreState, achievement, playerName, brandName]);

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
      // ease-out cubic
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

  // 15-second automatic return countdown timer
  const AUTO_RETURN_SECONDS = 15;
  const [countdown, setCountdown] = useState(AUTO_RETURN_SECONDS);
  const endTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasHandledExitRef = useRef(false);

  // Keep fresh references to exit callbacks so the countdown effect never restarts on re-renders
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

  // Start countdown timer strictly ONCE when GameOverModal mounts
  useEffect(() => {
    hasHandledExitRef.current = false;
    setCountdown(AUTO_RETURN_SECONDS);

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
  }, [triggerExit]);

  // ONE-TAP HANDLER: Tapping the envelope triggers the full sequence automatically
  const handleEnvelopeTap = () => {
    if (envelopeState !== 'CLOSED') return;
    if (onPlayChime) onPlayChime();

    setEnvelopeState('OPENING');

    // Smooth automatic unwrap & reveal sequence without any second tap
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

      // Dark luxury background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 1150);
      bgGrad.addColorStop(0, '#0E0A1A');
      bgGrad.addColorStop(0.5, '#160E2A');
      bgGrad.addColorStop(1, '#090514');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 900, 1150);

      // Gold outer border
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 6;
      ctx.strokeRect(20, 20, 860, 1110);

      const drawCardContent = (photoImg?: HTMLImageElement) => {
        // Top Header
        ctx.fillStyle = '#FCD34D';
        ctx.font = 'bold 22px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillText('DIWALI MOTION SOUVENIR', 450, 75);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px Cinzel, serif';
        ctx.fillText('CHALLENGE COMPLETE', 450, 115);

        // Player Photo in Landscape 16:9 (CLEAN - NO TAG ON PHOTO)
        const photoX = 135;
        const photoY = 150;
        const photoWidth = 630;
        const photoHeight = 354; // 16:9 ratio

        // Photo border
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

        // Well Done & Player Name
        ctx.fillStyle = '#FCD34D';
        ctx.font = 'bold 18px Cinzel, serif';
        ctx.fillText('WELL DONE!', 450, 545);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px Cinzel, serif';
        ctx.fillText(playerName.toUpperCase(), 450, 588);

        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 17px Plus Jakarta Sans, sans-serif';
        ctx.fillText('YOU PLAYED VERY WELL 🎆', 450, 620);

        // Score Card Box with Achievement Badge Above Score
        const cardY = 645;
        const cardW = 680;
        const cardH = 165;
        const cardX = (900 - cardW) / 2;

        ctx.fillStyle = '#140D26';
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX, cardY, cardW, cardH);

        // Achievement badge above score
        ctx.fillStyle = '#FCD34D';
        ctx.font = 'bold 20px Cinzel, serif';
        ctx.fillText(`${achievement.emoji} ${achievement.title} ${achievement.emoji}`, 450, cardY + 36);

        ctx.fillStyle = '#E5E7EB';
        ctx.font = '14px Plus Jakarta Sans, sans-serif';
        ctx.fillText(achievement.subtitle, 450, cardY + 60);

        // Final score
        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 44px JetBrains Mono, monospace';
        ctx.fillText(scoreState.score.toLocaleString(), 450, cardY + 115);

        ctx.fillStyle = '#F59E0B';
        ctx.font = 'bold 13px JetBrains Mono, monospace';
        ctx.fillText('TOTAL POINTS', 450, cardY + 144);

        // Statistics Row
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

        // Special Wish Box
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

        // Footer watermarks
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '12px JetBrains Mono, monospace';
        ctx.fillText(`Presented with warmth by ${brandName}`, 450, 1095);

        // Trigger Download
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

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-[100vw] overflow-hidden bg-neutral-950/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-3 md:p-4 box-border select-none">
      {/* 
        PREMIUM 65-INCH & RESPONSIVE EVENT KIOSK ROOT
        - Height constrained to strictly 100dvh, width to min(96vw, 1340px)
        - 2-Column layout on landscape screens (Zero vertical scroll)
        - NO gift box
        - ONE-TAP envelope interaction
        - Achievement inside scorecard above score
        - NO tag on player photo
      */}
      <div className="w-full max-w-[1360px] h-full max-h-[96dvh] bg-[#0E0A1A] border border-amber-500/50 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 lg:p-6 shadow-[0_0_80px_rgba(245,158,11,0.22)] flex flex-col justify-between box-border relative overflow-hidden">
        {/* Festive Golden Corner Accents */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-amber-400/80 pointer-events-none" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-amber-400/80 pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-amber-400/80 pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-amber-400/80 pointer-events-none" />

        {/* ------------------------------------------------------------- */}
        {/* TOP BAR / HEADER                                              */}
        {/* ------------------------------------------------------------- */}
        <header className="w-full flex items-center justify-between gap-2 border-b border-amber-500/20 pb-2 flex-shrink-0">
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
            {/* 15-Second Auto-Return Countdown */}
            <div
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-xs font-semibold shadow-inner"
              title="Automatically returning to code entry screen"
            >
              <Timer className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>
                Returning in <strong className="text-amber-200 font-bold">{countdown}s</strong>
              </span>
            </div>

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
        {/* MAIN BODY: 2-Column on Landscape / Large Screens              */}
        {/* Fits 100% inside viewport with zero vertical scroll           */}
        {/* ------------------------------------------------------------- */}
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 lg:gap-6 my-2 min-h-0 overflow-hidden">
          
          {/* =========================================================== */}
          {/* LEFT COLUMN (approx 5 cols): Clean Photo & Recognition       */}
          {/* =========================================================== */}
          <div className="md:col-span-5 flex flex-col justify-between items-center text-center h-full min-h-0 overflow-hidden">
            {/* Player Photo Frame (Landscape 16:9 / 16:10, NO TAG/STICKER on photo) */}
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

                  {/* Elegant Golden Corner Accents ONLY (NO TAG ON PHOTO) */}
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
          {/* RIGHT COLUMN (approx 7 cols): Score, Stats & One-Tap Wish   */}
          {/* =========================================================== */}
          <div className="md:col-span-7 flex flex-col justify-between h-full min-h-0 overflow-hidden gap-2">
            
            {/* SCORE CARD WITH PERFORMANCE-BASED ACHIEVEMENT ABOVE SCORE */}
            <div className="w-full bg-gradient-to-b from-[#18112C] to-[#120B22] border border-amber-500/50 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 lg:p-3.5 box-border flex flex-col justify-center items-center shadow-[0_0_30px_rgba(245,158,11,0.18)] relative flex-shrink-0">
              <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-amber-400/60 pointer-events-none" />
              <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-amber-400/60 pointer-events-none" />
              <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-amber-400/60 pointer-events-none" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-amber-400/60 pointer-events-none" />

              {/* Achievement Badge (Premium Diwali sticker feel above score) */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.3)] mb-1">
                <span className="text-sm">{achievement.emoji}</span>
                <span className="text-xs sm:text-sm font-black font-['Cinzel',serif] tracking-wider text-amber-200 uppercase">
                  {achievement.title}
                </span>
                <span className="text-sm">{achievement.emoji}</span>
              </div>

              <p className="text-[10px] sm:text-xs font-semibold text-amber-200/80 tracking-wide mb-1 font-['Plus_Jakarta_Sans',sans-serif]">
                {achievement.subtitle}
              </p>

              {/* Final Score from game state */}
              <div
                style={{ fontSize: 'clamp(32px, 4.2vw, 54px)' }}
                className="font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-200 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)] leading-none my-0.5"
              >
                {displayedScore.toLocaleString()}
              </div>

              <span className="text-[10px] sm:text-xs font-mono text-amber-300/80 uppercase tracking-widest font-bold mt-0.5">
                TOTAL POINTS
              </span>
            </div>

            {/* STATISTICS ROW: Genuine Game Performance Metrics */}
            <div
              className={`w-full grid ${
                isTargetEnabled ? 'grid-cols-5 gap-1.5 sm:gap-2' : 'grid-cols-4 gap-2'
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

              {/* Metric 5: Target Score (Only rendered if Target Score is enabled) */}
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

            {/* ========================================================= */}
            {/* SPECIAL WISH SECTION: STRICTLY ONE-TAP ONLY               */}
            {/* Direct Closed Diwali Envelope -> User Taps -> Opens & Shows */}
            {/* NO GIFT BOX. NO SECOND TAP.                               */}
            {/* ========================================================= */}
            <div className="flex-1 min-h-0 bg-gradient-to-r from-amber-950/40 via-amber-900/25 to-yellow-950/40 border border-amber-500/40 rounded-xl p-2 sm:p-3 text-center relative box-border shadow-[0_0_24px_rgba(245,158,11,0.12)] flex flex-col justify-center items-center overflow-hidden">
              
              {/* STATE 1: CLOSED ENVELOPE (Directly visible upon Game Over) */}
              {envelopeState === 'CLOSED' && (
                <div className="flex flex-col items-center justify-center w-full h-full">
                  <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-amber-300 uppercase tracking-wider font-['Cinzel',serif] mb-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>✨ ITS SPOTLIGHT HAS SOMETHING SPECIAL FOR YOU ✨</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  </div>

                  <p className="text-[10px] sm:text-xs text-amber-200/80 mb-2 font-['Plus_Jakarta_Sans',sans-serif]">
                    Open your personalized Diwali wish
                  </p>

                  {/* CLOSED DIWALI ENVELOPE (Single Clickable Element) */}
                  <button
                    onClick={handleEnvelopeTap}
                    className="group relative cursor-pointer flex flex-col items-center justify-center p-2.5 sm:p-3 bg-gradient-to-b from-[#25173D] via-[#1B1130] to-[#140A26] hover:from-[#321F52] hover:to-[#1B0F33] border-2 border-amber-400/70 hover:border-amber-300 rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_25px_rgba(245,158,11,0.35)] w-full max-w-[320px]"
                  >
                    {/* Glowing Envelope Icon with festive wax seal effect */}
                    <div className="relative flex items-center justify-center w-full my-0.5">
                      <div className="absolute inset-0 bg-amber-400/25 rounded-full blur-lg group-hover:bg-amber-400/40 transition" />
                      
                      <div className="relative flex items-center justify-center gap-2">
                        <Mail className="w-8 h-8 sm:w-9 sm:h-9 text-amber-300 group-hover:text-yellow-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
                        <div className="w-5 h-5 rounded-full bg-amber-500/80 border border-yellow-200 flex items-center justify-center text-[10px] shadow">
                          🪔
                        </div>
                      </div>
                    </div>

                    {/* Dedicated FOR label */}
                    <div className="mt-1 flex flex-col items-center leading-tight">
                      <span className="text-[9px] font-mono text-amber-300/80 uppercase tracking-widest">
                        SPECIALLY FOR
                      </span>
                      <span className="text-xs sm:text-sm font-bold font-['Cinzel',serif] text-amber-100 uppercase tracking-wider">
                        {playerName}
                      </span>
                    </div>

                    {/* Subtle pulse call-to-action */}
                    <div className="mt-1.5 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[10px] font-mono font-bold text-amber-200 uppercase tracking-wider">
                      TAP TO REVEAL WISH
                    </div>
                  </button>
                </div>
              )}

              {/* STATE 2: OPENING ANIMATION (Transient glow & flap open without second tap) */}
              {envelopeState === 'OPENING' && (
                <div className="flex flex-col items-center justify-center w-full h-full animate-pulse">
                  <div className="relative flex items-center justify-center w-16 h-16 mb-2">
                    <div className="absolute inset-0 bg-amber-400/50 rounded-full blur-xl animate-ping" />
                    <Mail className="w-12 h-12 text-yellow-200 drop-shadow-[0_0_20px_rgba(251,191,36,0.9)] animate-bounce" />
                  </div>
                  <span className="text-xs font-bold font-['Cinzel',serif] text-amber-200 tracking-wider">
                    UNVEILING YOUR FESTIVE BLESSING...
                  </span>
                </div>
              )}

              {/* STATE 3: OPENED PERSONALIZED DIWALI WISH CARD */}
              {envelopeState === 'OPENED' && (
                <div className="flex flex-col items-center justify-between w-full h-full text-center animate-[fadeIn_0.4s_ease-out] overflow-hidden">
                  <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-amber-300 uppercase tracking-wider font-['Cinzel',serif]">
                    <span>🪔</span>
                    <span>YOUR SPECIAL DIWALI WISH FROM {brandName.toUpperCase()}</span>
                    <span>🪔</span>
                  </div>

                  {/* Beautiful Personalized Card */}
                  <div className="w-full bg-[#140D26]/90 border border-amber-500/40 rounded-lg p-2 sm:p-2.5 my-1 shadow-inner text-center flex flex-col justify-center">
                    <h5 className="text-xs sm:text-sm font-black font-['Cinzel',serif] text-amber-200 uppercase tracking-wider leading-snug">
                      {personalizedWish.heading}
                    </h5>

                    <div className="my-1 space-y-0.5">
                      {personalizedWish.lines.map((line, idx) => (
                        <p
                          key={idx}
                          className="text-[10px] sm:text-[11px] text-amber-100/90 leading-tight font-medium max-w-xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]"
                        >
                          {line}
                        </p>
                      ))}
                    </div>

                    <div className="text-[9px] sm:text-[10px] font-['Cinzel',serif] text-amber-300/80 italic whitespace-pre-line mt-0.5">
                      {personalizedWish.signoff}
                    </div>
                  </div>

                  {/* Actions: Save Card & View Closed Envelope */}
                  <div className="w-full flex items-center justify-between gap-2 text-[10px] sm:text-[11px] text-amber-300/80 px-1">
                    <button
                      onClick={() => setEnvelopeState('CLOSED')}
                      className="text-amber-400 hover:text-amber-200 underline font-mono cursor-pointer"
                    >
                      Re-read Envelope
                    </button>

                    <button
                      onClick={handleDownloadCard}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 rounded text-amber-200 font-mono transition cursor-pointer"
                    >
                      {isDownloaded ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Saved!</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3 text-amber-300" />
                          <span>Save Souvenir Card</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* BOTTOM ACTION BAR: Prominent PLAY AGAIN button                */}
        {/* Strictly in-viewport, high contrast, touch-friendly           */}
        {/* ------------------------------------------------------------- */}
        <footer className="w-full flex-shrink-0 pt-2 border-t border-amber-500/20 space-y-2">
          {/* Game Feedback Collection (Omitted for trial games) */}
          {!isTrial && (
            <div className="p-2 sm:p-2.5 bg-neutral-900/90 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-inner">
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium font-['Cinzel',serif]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Game Feedback:</span>
              </div>

              {feedbackSubmitted ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
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
                    className="flex-1 sm:flex-initial bg-neutral-950 border border-neutral-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs text-neutral-100 outline-none cursor-pointer disabled:opacity-50"
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
                    className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed shadow-[0_0_15px_rgba(245,158,11,0.25)] shrink-0 active:scale-95"
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
          )}

          <button
            onClick={triggerExit}
            className="w-full h-12 sm:h-14 lg:h-16 py-2 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-sm sm:text-base lg:text-lg uppercase tracking-widest rounded-xl sm:rounded-2xl transition-all shadow-[0_0_30px_rgba(245,158,11,0.45)] hover:shadow-[0_0_40px_rgba(245,158,11,0.65)] flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98]"
          >
            <RotateCcw className="w-5 h-5 stroke-[2.5]" />
            <span>PLAY AGAIN</span>
          </button>
        </footer>
      </div>
    </div>
  );
};

export const GameOverModal = React.memo(GameOverModalComponent);
