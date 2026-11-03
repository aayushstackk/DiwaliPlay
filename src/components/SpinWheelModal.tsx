/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RewardItem, SpinWheelResponse } from '../types/backend';
import { gameApi } from '../services/api';
import {
  X,
  Gift,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import { resolveAssetUrl } from '../utils/assetUrl';

interface SpinWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName?: string;
  mobileNumber?: string;
  sessionId?: string | null;
  isTestMode?: boolean;
  onRewardWon?: (reward: RewardItem) => void;
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

export const SpinWheelModal: React.FC<SpinWheelModalProps> = ({
  isOpen,
  onClose,
  playerName = 'Player',
  mobileNumber = '',
  sessionId = null,
  isTestMode = false,
  onRewardWon
}) => {
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [isLoadingRewards, setIsLoadingRewards] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Wheel State
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winningReward, setWinningReward] = useState<RewardItem | null>(null);
  const [showPrizeModal, setShowPrizeModal] = useState(false);

  // Master OTP Testing Session detection (unlimited spins)
  const isMasterSession = Boolean(
    isTestMode ||
    (typeof window !== 'undefined' && sessionStorage.getItem('diwali_master_otp') === 'true') ||
    (sessionId?.startsWith('trial_'))
  );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpinningRef = useRef<boolean>(false);
  const rotationRef = useRef<number>(0);
  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
  const flapperNeedleRef = useRef<HTMLDivElement | null>(null);
  const lastTickTimeRef = useRef<number>(0);

  // Sync rotationRef when rotation state changes or on initial mount
  useEffect(() => {
    rotationRef.current = rotation;
    if (wheelSvgRef.current) {
      wheelSvgRef.current.style.transform = `rotate(${rotation}deg)`;
    }
  }, [rotation]);

  // Initialize or resume shared Web Audio Context
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

  // Premium Casino Mechanical "Kat-Kat-Kat" Flapper Tick Sound
  const playRealisticTick = useCallback((speedRatio = 1.0) => {
    const now = performance.now();
    if (now - lastTickTimeRef.current < 18) return; // Rate limiter prevents audio distortion
    lastTickTimeRef.current = now;

    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      // 1. Transient click noise burst (flapper snapping off brass peg)
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.005)); // 5ms
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const decay = Math.exp(-i / (bufferSize * 0.28));
        output[i] = (Math.random() * 2 - 1) * decay;
      }
      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(3600 + (Math.random() - 0.5) * 400, t);
      noiseFilter.Q.setValueAtTime(2.6, t);

      const noiseGain = ctx.createGain();
      const peakNoise = 0.32 * Math.min(1.2, Math.max(0.65, speedRatio));
      noiseGain.gain.setValueAtTime(peakNoise, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.005);

      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseNode.start(t);

      // 2. Resonant body snap (pitch-decaying oscillator for authentic mechanical click)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const oscFilter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      const baseFreq = 1350 + (Math.random() - 0.5) * 120;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(170, t + 0.015);

      oscFilter.type = 'bandpass';
      oscFilter.frequency.setValueAtTime(1050, t);
      oscFilter.Q.setValueAtTime(2.4, t);

      const peakOsc = 0.38 * Math.min(1.2, Math.max(0.7, speedRatio));
      oscGain.gain.setValueAtTime(peakOsc, t);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);

      osc.connect(oscFilter);
      oscFilter.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.017);

      // 3. Low physical body thud (gives the click weight and punch)
      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(150, t);
      thump.frequency.exponentialRampToValueAtTime(45, t + 0.013);

      thumpGain.gain.setValueAtTime(0.24, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.013);

      thump.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thump.start(t);
      thump.stop(t + 0.014);
    } catch {}
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

  // Fetch available rewards when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingRewards(true);
    setErrorMessage(null);
    setShowPrizeModal(false);
    setWinningReward(null);

    gameApi
      .getRewards()
      .then((res) => {
        if (res.success && res.rewards && res.rewards.length > 0) {
          setRewards(res.rewards);
        } else {
          setErrorMessage('No rewards currently configured.');
        }
      })
      .catch((err) => {
        setErrorMessage(err.message || 'Failed to load wheel rewards.');
      })
      .finally(() => {
        setIsLoadingRewards(false);
      });
  }, [isOpen]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      isSpinningRef.current = false;
    };
  }, []);

  // Spin Wheel Execution (Immediate animation + Parallel Backend Processing)
  const handleSpinClick = () => {
    // 1. Guard against duplicate spin triggers
    if ((!isMasterSession && hasSpun) || isSpinningRef.current || isSpinning || rewards.length === 0) return;
    isSpinningRef.current = true;
    if (!isMasterSession) {
      setHasSpun(true);
    }
    setIsSpinning(true);
    setWinningReward(null);
    setShowPrizeModal(false);
    setErrorMessage(null);

    // Warm up Web Audio Context immediately
    getAudioContext();

    const numSlices = Math.max(1, rewards.length);
    const sliceAngle = 360 / numSlices;
    const initialAngle = rotationRef.current;

    // 2. Launch backend API request in parallel
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
        mobileNumber,
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

    // 3. Start wheel animation IMMEDIATELY on this exact frame with premium casino physics
    const cruiseSpeed = 1440; // 1440 deg/sec = 4 full rotations/sec
    const accelDuration = 350; // ms to reach full cruising speed
    const minCruiseTime = 1200; // ms of thrilling fast spinning before gradual slowdown
    const animStartTime = performance.now();

    const pegsPerSlice = numSlices <= 4 ? 4 : (numSlices <= 6 ? 3 : (numSlices <= 10 ? 2 : 1));
    const totalPegs = Math.max(16, numSlices * pegsPerSlice);
    const pegAngleStep = 360 / totalPegs;

    let lastPegIndex = Math.floor(initialAngle / pegAngleStep);

    // Deceleration trajectory state
    let decelInitiated = false;
    let decelStartAngle = 0;
    let decelStartTime = 0;
    let decelDuration = 6000;
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

        // Apply rotation directly to DOM for zero-latency 60+ FPS
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

        // Check if we can begin smooth deceleration:
        // Requires minimum excitement duration AND received server response
        if (elapsed >= minCruiseTime && serverResult !== null) {
          decelInitiated = true;
          decelStartTime = time;
          decelStartAngle = currentAngle;

          if (serverResult.success && serverResult.reward) {
            winningTargetReward = serverResult.reward;
            let targetIdx = rewards.findIndex((r) => r.id === serverResult!.reward!.id);
            if (targetIdx === -1) {
              targetIdx = serverResult.rewardIndex ?? 0;
            }

            // Target alignment math:
            // Slice center: (targetIdx + 0.5) * sliceAngle
            // Marker is at 12 o'clock (0 degrees)
            const sliceCenterAngle = (targetIdx + 0.5) * sliceAngle;
            const targetStopAngle = (360 - (sliceCenterAngle % 360)) % 360;

            const currentMod = ((decelStartAngle % 360) + 360) % 360;
            let forwardDelta = (targetStopAngle - currentMod) % 360;
            if (forwardDelta <= 0) forwardDelta += 360;

            // 7 full turns during slowdown for suspenseful, natural deceleration
            const fullTurns = 7;
            totalDecelDegrees = fullTurns * 360 + forwardDelta;

            // Deceleration duration matching incoming cruise speed exactly for zero jerk:
            // For easing f(u) = 1 - (1 - u)^3.5, derivative at u=0 is 3.5 * totalDecelDegrees / decelDuration = cruiseSpeed
            decelDuration = ((3.5 * totalDecelDegrees) / cruiseSpeed) * 1000;
          } else {
            // Server error: ease to a graceful stop
            hasFailed = true;
            failureMessage = serverResult.errorMessage || 'Unable to spin. Please try again.';
            totalDecelDegrees = 720;
            decelDuration = 1800;
          }
        }

        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // --- PHASE 2: Ultra-Smooth Quartic Deceleration to Winning Voucher ---
        const decelElapsed = time - decelStartTime;
        const progress = Math.min(1, decelElapsed / decelDuration);

        // Continuous quartic-style deceleration curve: 1 - (1 - u)^3.5
        const eased = 1 - Math.pow(1 - progress, 3.5);
        const currentAngle = decelStartAngle + totalDecelDegrees * eased;

        rotationRef.current = currentAngle;
        if (wheelSvgRef.current) {
          wheelSvgRef.current.style.transform = `rotate(${currentAngle}deg)`;
        }

        // Calculate momentary speed ratio for dynamic audio pitch and volume
        const currentSpeed = cruiseSpeed * Math.pow(1 - progress, 2.5);
        const speedRatio = Math.max(0.4, currentSpeed / cruiseSpeed);

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
          setRotation(finalAngle);
          if (wheelSvgRef.current) {
            wheelSvgRef.current.style.transform = `rotate(${finalAngle}deg)`;
          }
          if (flapperNeedleRef.current) {
            flapperNeedleRef.current.style.transform = 'rotate(0deg)';
          }
          setIsSpinning(false);
          isSpinningRef.current = false;

          if (hasFailed) {
            setErrorMessage(failureMessage);
          } else if (winningTargetReward) {
            setWinningReward(winningTargetReward);
            playVictoryChime();

            if (onRewardWon) {
              onRewardWon(winningTargetReward);
            }

            // Open winning popup smoothly
            setTimeout(() => {
              setShowPrizeModal(true);
            }, 300);
          }
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  if (!isOpen) return null;

  const numSlices = Math.max(1, rewards.length);
  const sliceAngle = 360 / numSlices;
  const wheelRadius = 240;
  const centerCoord = 250;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm select-none overflow-y-auto">
      <div className="relative w-full max-w-md bg-[#1A120B] border border-amber-600/40 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col items-center my-auto">
        {/* Header Bar */}
        <div className="w-full flex items-center justify-between border-b border-amber-500/20 pb-2.5 mb-2">
          <h2 className="text-base sm:text-lg font-bold text-amber-100 font-['Cinzel',serif] tracking-wider">
            Spin Wheel
          </h2>
          <button
            onClick={onClose}
            disabled={isSpinning}
            className="p-1 rounded-xl text-neutral-400 hover:text-white transition cursor-pointer disabled:opacity-30"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="w-full mb-3 p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Wheel Container */}
        {isLoadingRewards ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-amber-300">
            <RotateCw className="w-8 h-8 animate-spin text-amber-400" />
            <span className="text-xs font-semibold tracking-wider">Loading...</span>
          </div>
        ) : (
          <div className="relative flex items-center justify-center my-3">
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
            <div
              className="relative rounded-full shadow-[0_0_30px_rgba(245,158,11,0.35)] overflow-hidden"
              style={{ width: '320px', height: '320px', maxWidth: '82vw', maxHeight: '82vw' }}
            >
              <svg
                ref={wheelSvgRef}
                viewBox="0 0 500 500"
                className="w-full h-full select-none will-change-transform"
                style={{
                  transform: `rotate(${rotation}deg)`
                }}
              >
                <defs>
                  {/* Multi-stop luxury metallic gold rim gradient */}
                  <linearGradient id="modal-gold-rim-metal" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDE68A" />
                    <stop offset="25%" stopColor="#B45309" />
                    <stop offset="50%" stopColor="#F59E0B" />
                    <stop offset="75%" stopColor="#78350F" />
                    <stop offset="100%" stopColor="#FCD34D" />
                  </linearGradient>

                  {/* 3D metallic peg rivet gradient */}
                  <radialGradient id="modal-gold-peg-grad" cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="25%" stopColor="#FDE68A" />
                    <stop offset="60%" stopColor="#D97706" />
                    <stop offset="100%" stopColor="#78350F" />
                  </radialGradient>

                  {/* Radial spoke divider golden shimmer */}
                  <linearGradient id="modal-gold-spoke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDE68A" />
                    <stop offset="50%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#92400E" />
                  </linearGradient>

                  {/* Radial slice sheen highlight */}
                  <radialGradient id="modal-slice-sheen" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
                    <stop offset="65%" stopColor="#000000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
                  </radialGradient>

                  {/* Voucher badge drop shadow */}
                  <filter id="modal-badge-shadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.65" />
                  </filter>
                </defs>

                {/* Multi-layered Outer Casino Rim */}
                <circle
                  cx={centerCoord}
                  cy={centerCoord}
                  r="247"
                  fill="#0C0704"
                  stroke="url(#modal-gold-rim-metal)"
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
                              fill="url(#modal-slice-sheen)"
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
                              stroke="url(#modal-gold-spoke-grad)"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                          </g>
                        );
                      })}

                      {/* Perimeter 3D Metallic Golden Pegs / Rivets */}
                      {Array.from({ length: totalPegs }).map((_, p) => (
                        <g key={`modal-peg-${p}`} transform={`rotate(${p * pegAngleStep}, ${centerCoord}, ${centerCoord})`}>
                          <circle
                            cx={centerCoord}
                            cy={centerCoord - 238}
                            r="3.8"
                            fill="url(#modal-gold-peg-grad)"
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
                  stroke="url(#modal-gold-rim-metal)"
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
                  disabled={(!isMasterSession && hasSpun) || isSpinning || rewards.length === 0}
                  className="pointer-events-auto w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 hover:from-amber-200 hover:via-amber-400 hover:to-amber-600 border-[4px] border-[#140D07] shadow-[0_0_18px_rgba(245,158,11,0.55),inset_0_2px_4px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.5)] hover:shadow-[0_0_25px_rgba(245,158,11,0.85),inset_0_2px_4px_rgba(255,255,255,0.9)] flex items-center justify-center cursor-pointer active:scale-95 transition-all disabled:opacity-75 disabled:cursor-not-allowed group"
                >
                  <span className="text-xs sm:text-sm font-black font-['Cinzel',serif] tracking-wider text-neutral-950 uppercase drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
                    {isSpinning ? '...' : (!isMasterSession && hasSpun) ? 'DONE' : 'SPIN'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SIMPLIFIED WINNING POPUP (Direct Focus on Congratulations)   */}
      {/* ------------------------------------------------------------- */}
      {showPrizeModal && winningReward && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="relative w-full max-w-sm bg-[#1C120B] border border-amber-500/50 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            {/* Simple Top (X) Close Button */}
            <button
              onClick={() => setShowPrizeModal(false)}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-label="Close winning popup"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Large Attractive Winning Message (Main Focus) */}
            <div className="pt-2 space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-amber-200 tracking-wide font-['Cinzel',serif]">
                YEEEE! YOU WON! 🎉
              </h2>
              <p className="text-sm sm:text-base font-bold text-amber-300">
                Enjoy Your Diwali Gift! 🪔
              </p>
            </div>

            {/* Prominent Reward Image / Voucher on Winning Result */}
            <div className="w-28 h-28 sm:w-32 sm:h-32 mx-auto rounded-2xl bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 p-1 shadow-[0_0_25px_rgba(245,158,11,0.5)] flex items-center justify-center overflow-hidden animate-[zoomIn_0.4s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="w-full h-full rounded-[14px] bg-[#1C1226] p-2 flex items-center justify-center overflow-hidden">
                {winningReward.imageUrl ? (
                  <img
                    src={resolveAssetUrl(winningReward.imageUrl)}
                    alt={winningReward.name}
                    className="w-full h-full object-contain drop-shadow"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-1">
                    <Gift className="w-10 h-10 text-amber-400 drop-shadow mb-1 animate-pulse" />
                    <span className="text-sm font-black font-['Cinzel',serif] text-amber-200">
                      {parseVoucherTitle(winningReward.name).line1}
                    </span>
                    {parseVoucherTitle(winningReward.name).line2 && (
                      <span className="text-xs font-bold text-amber-300/80 tracking-wider">
                        {parseVoucherTitle(winningReward.name).line2}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Reward Name */}
            <div>
              <h3 className="text-lg font-bold text-amber-100">
                {winningReward.name}
              </h3>
              {winningReward.description && (
                <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                  {winningReward.description}
                </p>
              )}
            </div>

            {/* Coupon Code Display Box */}
            {winningReward.couponCode && (
              <div className="bg-[#120B06] border border-amber-500/40 rounded-xl p-3">
                <span className="text-[10px] uppercase font-mono tracking-widest text-amber-300/70 block mb-0.5">
                  Coupon Code
                </span>
                <span className="font-mono font-black text-base tracking-widest text-amber-200 select-all">
                  {winningReward.couponCode}
                </span>
              </div>
            )}

            {/* Terms and Conditions */}
            {winningReward.termsAndConditions && (
              <p className="text-[10px] text-neutral-400 italic leading-snug">
                Terms: {winningReward.termsAndConditions}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
