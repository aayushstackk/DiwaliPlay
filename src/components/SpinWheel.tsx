/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { RewardItem } from '../types/backend';
import { gameApi } from '../services/api';
import {
  SPIN_CONSTANTS,
  calculateTargetStopAngle,
  calculateDecelTrajectory,
  getOrCreateTickBuffer,
  playPreRenderedTick,
} from '../utils/spinWheelPhysics';

export interface SpinWheelProps {
  /** Slices, in wheel order. The wheel renders nothing useful with an empty list; callers gate on that. */
  rewards: RewardItem[];
  playerName?: string;
  mobileNumber?: string;
  sessionId?: string | null;
  /** Master / trial / admin preview: unlimited spins. Otherwise a player gets exactly one spin. */
  isMaster?: boolean;
  /** Lets the whole wheel face act as the spin control, not just the hub. */
  tapWheelToSpin?: boolean;
  /** Not ready to spin yet: the hub shows a waiting state and taps do nothing. */
  isHeld?: boolean;
  onSpinStart?: () => void;
  /** The wheel has come to rest on the prize the server chose. */
  onSpinWon?: (reward: RewardItem) => void;
  /** The wheel has come to rest after the server refused the spin or could not be reached. */
  onSpinFailed?: (message: string) => void;
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

// Parse voucher name into clean, high-impact two-line prize text for wheel segments
export function parseVoucherTitle(name: string): { line1: string; line2: string } {
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

const WHEEL_CENTER = 250;
const AUDIO_RELEASE_DELAY_MS = 2500;

/** A request that never answers must not leave the wheel spinning, and the screen locked, for ever. */
const SPIN_RESPONSE_TIMEOUT_MS = 15000;

/**
 * The casino wheel: drawing, spin animation, flapper, ticks, victory chime and the spin API call.
 * It fills its parent, which must give it a square size; every part scales with that size.
 */
const SpinWheelComponent: React.FC<SpinWheelProps> = ({
  rewards,
  playerName = 'Player',
  mobileNumber = '',
  sessionId = null,
  isMaster = false,
  tapWheelToSpin = false,
  isHeld = false,
  onSpinStart,
  onSpinWon,
  onSpinFailed,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const hasSpunRef = useRef(false);

  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
  const flapperNeedleRef = useRef<HTMLDivElement | null>(null);
  const isSpinningRef = useRef(false);
  const rotationRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickBufferRef = useRef<AudioBuffer | null>(null);

  // SVG ids are document-global, so each wheel needs its own.
  const idPrefix = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rimGradientId = `${idPrefix}-gold-rim-metal`;
  const pegGradientId = `${idPrefix}-gold-peg-grad`;
  const spokeGradientId = `${idPrefix}-gold-spoke-grad`;
  const sheenGradientId = `${idPrefix}-slice-sheen`;

  // Initialize or resume the Web Audio Context with the pre-rendered tick buffer
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

  // Stop the animation and release the audio device when the wheel goes away
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      isSpinningRef.current = false;
      // Late enough that a victory chime already playing (under 2s) still rings out in full
      const ctx = audioCtxRef.current;
      if (ctx) {
        setTimeout(() => ctx.close().catch(() => {}), AUDIO_RELEASE_DELAY_MS);
      }
      audioCtxRef.current = null;
      tickBufferRef.current = null;
    };
  }, []);

  const canSpin = !isHeld && !(!isMaster && hasSpun) && !isSpinning && rewards.length > 0;

  // Immediate animation with the server resolving the prize in parallel
  const handleSpinClick = () => {
    if (isHeld || (!isMaster && hasSpunRef.current) || isSpinningRef.current || rewards.length === 0) return;
    isSpinningRef.current = true;
    if (!isMaster) {
      hasSpunRef.current = true;
      setHasSpun(true);
    }
    setIsSpinning(true);
    onSpinStart?.();

    getAudioContext();

    const numSlices = Math.max(1, rewards.length);
    const initialAngle = rotationRef.current;

    interface SpinServerResult {
      success: boolean;
      reward?: RewardItem;
      rewardIndex?: number;
      errorMessage?: string;
    }
    let serverResult: SpinServerResult | null = null;

    const responseTimeout = setTimeout(() => {
      serverResult = { success: false, errorMessage: 'Network error while spinning.' };
    }, SPIN_RESPONSE_TIMEOUT_MS);

    gameApi
      .spinWheel({
        playerName: playerName || (isMaster ? 'Master Tester' : 'Player'),
        mobileNumber: mobileNumber || undefined,
        sessionId: sessionId || undefined,
        userId: isMaster ? 'trial_user_8536' : undefined
      })
      .then((res) => {
        if (res.success && res.reward) {
          serverResult = {
            success: true,
            reward: res.reward,
            rewardIndex: res.rewardIndex
          };
        } else if (!isMaster && res.alreadySpun && res.reward) {
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
        if (!isMaster && (errorMsg.includes('already used') || errorMsg.includes('already spun'))) {
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
      })
      .finally(() => clearTimeout(responseTimeout));

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

    const applyFlapperDeflection = (currentAngle: number) => {
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
    };

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

        applyFlapperDeflection(currentAngle);

        // Begin smooth casino deceleration when min cruise time elapsed and backend result arrived
        if (elapsed >= minCruiseTime && serverResult !== null) {
          decelInitiated = true;
          decelStartTime = time;

          if (serverResult.success && serverResult.reward) {
            winningTargetReward = serverResult.reward;
            let targetIdx = rewards.findIndex((r) => r.id === serverResult!.reward!.id);
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

        applyFlapperDeflection(currentAngle);

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
          setIsSpinning(false);

          if (hasFailed) {
            onSpinFailed?.(failureMessage);
          } else if (winningTargetReward) {
            playVictoryChime();
            onSpinWon?.(winningTargetReward);
          }
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  const numSlices = Math.max(1, rewards.length);
  const sliceAngle = 360 / numSlices;
  const centerCoord = WHEEL_CENTER;

  // Sizes below are in cqw (1% of the wheel's width) so the pointer and hub keep their proportions at any size.
  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ containerType: 'inline-size' }}>
      {/* Top Pointer Indicator with physical deflecting flapper */}
      <div
        className="absolute z-30 flex flex-col items-center pointer-events-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]"
        style={{ top: '-3.75cqw' }}
      >
        {/* Pivot jewel mount */}
        <div
          className="rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 border border-amber-950 flex items-center justify-center shadow-md"
          style={{ width: '5cqw', height: '5cqw' }}
        >
          <div className="rounded-full bg-amber-100 shadow-inner" style={{ width: '1.9cqw', height: '1.9cqw' }} />
        </div>
        {/* Deflecting flapper needle */}
        <div
          ref={flapperNeedleRef}
          className="w-0 h-0 border-l-transparent border-r-transparent border-t-amber-400 origin-top filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          style={{
            borderLeftWidth: '2.2cqw',
            borderRightWidth: '2.2cqw',
            borderTopWidth: '5.3cqw',
            marginTop: '-1.25cqw',
            transformOrigin: '50% 0%',
            willChange: 'transform'
          }}
        />
      </div>

      {/* SVG Wheel with Casino Styling, Metallic Pegs & Clear Large Vouchers */}
      <div
        className={`relative w-full h-full rounded-full shadow-[0_0_30px_rgba(245,158,11,0.35)] overflow-hidden ${
          tapWheelToSpin && canSpin ? 'cursor-pointer' : ''
        }`}
        onClick={tapWheelToSpin ? handleSpinClick : undefined}
      >
        <svg
          ref={wheelSvgRef}
          viewBox="0 0 500 500"
          className="w-full h-full select-none will-change-transform"
          style={{ transform: `rotate(${rotationRef.current}deg)` }}
        >
          <defs>
            {/* Multi-stop luxury metallic gold rim gradient */}
            <linearGradient id={rimGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="25%" stopColor="#B45309" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="75%" stopColor="#78350F" />
              <stop offset="100%" stopColor="#FCD34D" />
            </linearGradient>

            {/* 3D metallic peg rivet gradient */}
            <radialGradient id={pegGradientId} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="25%" stopColor="#FDE68A" />
              <stop offset="60%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#78350F" />
            </radialGradient>

            {/* Radial spoke divider golden shimmer */}
            <linearGradient id={spokeGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>

            {/* Radial slice sheen highlight */}
            <radialGradient id={sheenGradientId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
              <stop offset="65%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
            </radialGradient>
          </defs>

          {/* Multi-layered Outer Casino Rim */}
          <circle
            cx={centerCoord}
            cy={centerCoord}
            r="247"
            fill="#0C0704"
            stroke={`url(#${rimGradientId})`}
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
                {rewards.map((reward, i) => {
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
                        fill={`url(#${sheenGradientId})`}
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
                        stroke={`url(#${spokeGradientId})`}
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
                      fill={`url(#${pegGradientId})`}
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
            stroke={`url(#${rimGradientId})`}
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
            disabled={!canSpin}
            className="pointer-events-auto rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 hover:from-amber-200 hover:via-amber-400 hover:to-amber-600 border-[#140D07] shadow-[0_0_18px_rgba(245,158,11,0.55),inset_0_2px_4px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.5)] hover:shadow-[0_0_25px_rgba(245,158,11,0.85),inset_0_2px_4px_rgba(255,255,255,0.9)] flex items-center justify-center cursor-pointer active:scale-95 transition-all disabled:opacity-75 disabled:cursor-not-allowed"
            style={{ width: '25cqw', height: '25cqw', borderWidth: '1.25cqw', borderStyle: 'solid' }}
          >
            <span
              className={`font-black font-['Cinzel',serif] tracking-wider text-neutral-950 uppercase drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)] ${isHeld ? 'animate-pulse' : ''}`}
              style={{ fontSize: '4.4cqw' }}
            >
              {isHeld ? 'WAIT' : isSpinning ? '...' : (!isMaster && hasSpun) ? 'DONE' : 'SPIN'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const SpinWheel = React.memo(SpinWheelComponent);
