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

interface SpinWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName?: string;
  mobileNumber?: string;
  sessionId?: string | null;
  isTestMode?: boolean;
  onRewardWon?: (reward: RewardItem) => void;
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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpinningRef = useRef<boolean>(false);
  const rotationRef = useRef<number>(0);
  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
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

  // Realistic mechanical "kt kt kt" flapper tick sound
  const playRealisticTick = useCallback(() => {
    const now = performance.now();
    if (now - lastTickTimeRef.current < 28) return; // Prevent audio overload
    lastTickTimeRef.current = now;

    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      // Realistic flapper click: fast pitch drop + bandpass filter
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

  // Cheerful victory sound when the wheel lands on the winning slice
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
    if (hasSpun || isSpinningRef.current || isSpinning || rewards.length === 0) return;
    isSpinningRef.current = true;
    setHasSpun(true);
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
        playerName,
        mobileNumber,
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

    // 3. Start wheel animation IMMEDIATELY on this exact frame (0ms delay)
    const cruiseSpeed = 1200; // degrees per second
    const accelDuration = 300; // ms to reach full cruise speed
    const minCruiseTime = 1100; // ms of thrilling fast spin before slowing down
    const animStartTime = performance.now();

    let lastSegmentIndex = Math.floor(initialAngle / sliceAngle);

    // Deceleration trajectory state
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

        // Apply rotation directly to DOM for zero-latency 60+ FPS
        rotationRef.current = currentAngle;
        if (wheelSvgRef.current) {
          wheelSvgRef.current.style.transform = `rotate(${currentAngle}deg)`;
        }

        // Realistic flapper sound as segments pass
        const currentSegmentIndex = Math.floor(currentAngle / sliceAngle);
        if (currentSegmentIndex > lastSegmentIndex) {
          playRealisticTick();
          lastSegmentIndex = currentSegmentIndex;
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

            // Compute seamless cubic ease-out deceleration matching incoming cruiseSpeed
            const idealDecelDistance = (cruiseSpeed * 2.8) / 3;
            const fullTurns = Math.max(3, Math.ceil((idealDecelDistance - forwardDelta) / 360));
            totalDecelDegrees = fullTurns * 360 + forwardDelta;
            decelDuration = ((3 * totalDecelDegrees) / cruiseSpeed) * 1000;
          } else {
            // Server error: ease to a graceful stop
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

        // Realistic flapper sound during slowdown
        const currentSegmentIndex = Math.floor(currentAngle / sliceAngle);
        if (currentSegmentIndex > lastSegmentIndex) {
          playRealisticTick();
          lastSegmentIndex = currentSegmentIndex;
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          // --- Complete Stop on Winner ---
          const finalAngle = decelStartAngle + totalDecelDegrees;
          rotationRef.current = finalAngle;
          setRotation(finalAngle);
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
            {/* Top Pointer Indicator (Clean Downward Marker) */}
            <div className="absolute -top-2.5 z-20 flex flex-col items-center pointer-events-none drop-shadow-md">
              <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-neutral-900 shadow" />
              <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[14px] border-t-amber-400 -mt-0.5" />
            </div>

            {/* SVG Wheel (Clean, Readable, Modern Festive) */}
            <div
              className="relative rounded-full shadow-lg overflow-hidden"
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
                {/* Clean Outer Rim */}
                <circle
                  cx={centerCoord}
                  cy={centerCoord}
                  r="247"
                  fill="#1C140E"
                  stroke="#D97706"
                  strokeWidth="4"
                />

                {/* Slices */}
                {rewards.map((reward, i) => {
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
                    <g key={reward.id}>
                      {/* Segment Arc */}
                      <path
                        d={pathData}
                        fill={fillColor}
                        stroke="#FAF5EA"
                        strokeWidth="1.5"
                        strokeOpacity="0.4"
                      />

                      {/* Reward Logo/Image Only on Slice */}
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
                  disabled={hasSpun || isSpinning || rewards.length === 0}
                  className="pointer-events-auto w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-amber-500 hover:bg-amber-400 border-4 border-[#1A120B] shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <span className="text-xs sm:text-sm font-black font-['Cinzel',serif] tracking-wider text-neutral-950 uppercase">
                    {isSpinning ? '...' : hasSpun ? 'DONE' : 'SPIN'}
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

            {/* Reward Image Thumbnail */}
            <div className="w-20 h-20 mx-auto rounded-2xl bg-white p-2 shadow-inner flex items-center justify-center overflow-hidden border border-amber-400/50">
              {winningReward.imageUrl ? (
                <img
                  src={winningReward.imageUrl}
                  alt={winningReward.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Gift className="w-10 h-10 text-amber-600" />
              )}
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
