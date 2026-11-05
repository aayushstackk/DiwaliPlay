/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, AlertTriangle, Check, Camera } from 'lucide-react';

export interface PhotoCaptureModalProps {
  playerName?: string;
  existingStream?: MediaStream | null;
  onPhotoCaptured: (photoDataUrl: string | null) => void;
  onPlayTick?: () => void;
  onPlayCapture?: () => void;
}

export const PhotoCaptureModal: React.FC<PhotoCaptureModalProps> = ({
  playerName = 'Player',
  existingStream,
  onPhotoCaptured,
  onPlayTick,
  onPlayCapture,
}) => {
  const [countdown, setCountdown] = useState<number>(5);
  const [isClickPhase, setIsClickPhase] = useState<boolean>(false);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [isCaptured, setIsCaptured] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dedicatedStreamRef = useRef<MediaStream | null>(null);
  const isDedicatedRef = useRef<boolean>(false);
  const hasCapturedRef = useRef<boolean>(false);
  const isReadyRef = useRef<boolean>(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const captureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollReadyIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable references for callbacks to prevent effect dependency churn
  const onPhotoCapturedRef = useRef(onPhotoCaptured);
  onPhotoCapturedRef.current = onPhotoCaptured;

  const onPlayTickRef = useRef(onPlayTick);
  onPlayTickRef.current = onPlayTick;

  const onPlayCaptureRef = useRef(onPlayCapture);
  onPlayCaptureRef.current = onPlayCapture;

  // Snapshot from video element onto mirrored canvas
  const performSnapshot = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
      return null;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Mirror horizontally so snapshot matches the selfie preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (err) {
      console.warn('Snapshot capture warning:', err);
      return null;
    }
  }, []);

  // Cleanup helper for dedicated camera tracks (Touch Mode)
  const stopDedicatedCamera = useCallback(() => {
    if (isDedicatedRef.current && dedicatedStreamRef.current) {
      try {
        dedicatedStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('Error stopping dedicated camera track:', err);
      }
      dedicatedStreamRef.current = null;
    }
  }, []);

  // Trigger snapshot and transition
  const triggerCaptureSequence = useCallback(() => {
    if (hasCapturedRef.current) return;
    hasCapturedRef.current = true;

    // Clear any running countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Play camera shutter sound
    onPlayCaptureRef.current?.();

    // Trigger visual camera flash
    setIsFlashing(true);

    // Capture snapshot from video element
    const snapshot = performSnapshot();
    setIsCaptured(true);

    // Keep flash and "CLICK!" briefly visible (~450ms), then stop dedicated stream & finish
    captureTimeoutRef.current = setTimeout(() => {
      setIsFlashing(false);
      stopDedicatedCamera();
      onPhotoCapturedRef.current(snapshot);
    }, 450);
  }, [performSnapshot, stopDedicatedCamera]);

  const triggerCaptureSequenceRef = useRef(triggerCaptureSequence);
  triggerCaptureSequenceRef.current = triggerCaptureSequence;

  // Frame readiness verification handler
  const handleCheckReady = useCallback(() => {
    if (isReadyRef.current) return;
    const v = videoRef.current;
    if (v && v.readyState >= 2 && v.videoWidth > 0) {
      if (v.paused) {
        v.play().catch((err) => console.warn('Video resume notice:', err));
      }
      isReadyRef.current = true;
      setIsCameraReady(true);
    }
  }, []);

  // Stream-to-video synchronization helper
  useEffect(() => {
    const video = videoRef.current;
    const activeStream = isDedicatedRef.current ? dedicatedStreamRef.current : existingStream;
    if (video && activeStream && video.srcObject !== activeStream) {
      video.srcObject = activeStream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.play().catch((err) => console.warn('Stream sync playback notice:', err));
    }
  });

  // Acquire camera stream:
  // - Camera Mode: Reuse existing live stream
  // - Touch Mode: Automatically request front camera with robust multi-tier fallback
  useEffect(() => {
    let isCancelled = false;
    isReadyRef.current = false;
    setIsCameraReady(false);
    setCameraError(null);

    const checkVideoReady = (): boolean => {
      if (isCancelled || isReadyRef.current) return false;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        if (v.paused) {
          v.play().catch((err) => console.warn('Video resume notice:', err));
        }
        isReadyRef.current = true;
        setIsCameraReady(true);
        return true;
      }
      return false;
    };

    const setupCamera = async () => {
      // 1. Check if an active, live stream is already available (Camera Interactive Mode)
      if (
        existingStream &&
        existingStream.getVideoTracks().length > 0 &&
        existingStream.getVideoTracks().some((track) => track.readyState === 'live')
      ) {
        isDedicatedRef.current = false;
        const video = videoRef.current;
        if (video) {
          video.srcObject = existingStream;
          video.muted = true;
          video.playsInline = true;
          video.setAttribute('playsinline', 'true');
          try {
            await video.play();
          } catch (playErr) {
            console.warn('Playback of existing camera stream:', playErr);
          }
        }

        // Check immediately if already ready
        if (checkVideoReady()) return;

        // Poll every 50ms until readyState >= 2
        pollReadyIntervalRef.current = setInterval(() => {
          if (checkVideoReady() && pollReadyIntervalRef.current) {
            clearInterval(pollReadyIntervalRef.current);
            pollReadyIntervalRef.current = null;
          }
        }, 50);

        return;
      }

      // 2. Touch Mode (or Camera Mode without live stream):
      // Acquire front camera using a robust 3-tier fallback strategy
      try {
        isDedicatedRef.current = true;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('MediaDevices camera API is not supported in this environment');
        }

        let stream: MediaStream | null = null;

        // Tier 1: Front camera (user facing) with ideal 720p/1080p resolution
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 30, min: 15 },
            },
            audio: false,
          });
        } catch (tier1Err) {
          console.warn('Tier 1 camera constraints not met, trying Tier 2:', tier1Err);
          // Tier 2: Front camera without strict resolution
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user' },
              audio: false,
            });
          } catch (tier2Err) {
            console.warn('Tier 2 camera constraints not met, trying Tier 3 fallback:', tier2Err);
            // Tier 3: Any video device (crucial on Windows/desktops/USB webcams that don't report facingMode)
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        if (isCancelled) {
          if (stream) stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (!stream) {
          throw new Error('No camera stream could be acquired');
        }

        dedicatedStreamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          video.setAttribute('playsinline', 'true');
          try {
            await video.play();
          } catch (playErr) {
            console.warn('Playback of dedicated camera stream:', playErr);
          }
        }

        if (checkVideoReady()) return;

        // Poll until readyState >= 2 and videoWidth > 0
        pollReadyIntervalRef.current = setInterval(() => {
          if (checkVideoReady() && pollReadyIntervalRef.current) {
            clearInterval(pollReadyIntervalRef.current);
            pollReadyIntervalRef.current = null;
          }
        }, 50);

        // Safety watchdog: if after 8s no valid video frame is produced, flag error gracefully
        watchdogTimeoutRef.current = setTimeout(() => {
          if (!isCancelled && !isReadyRef.current) {
            console.warn('Camera stream watchdog timeout: no frames received within 8s');
            setCameraError('Camera failed to start video feed. Continuing to celebration results...');
          }
        }, 8000);
      } catch (err: any) {
        console.warn('Camera acquisition error in PhotoCaptureModal:', err);
        if (!isCancelled) {
          const isDenied =
            err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
          setCameraError(
            isDenied
              ? 'Camera permission was denied. Continuing automatically to your celebration results...'
              : 'Front camera unavailable. Continuing automatically to your celebration results...'
          );
        }
      }
    };

    setupCamera();

    return () => {
      isCancelled = true;
      if (pollReadyIntervalRef.current) {
        clearInterval(pollReadyIntervalRef.current);
        pollReadyIntervalRef.current = null;
      }
      if (watchdogTimeoutRef.current) {
        clearTimeout(watchdogTimeoutRef.current);
        watchdogTimeoutRef.current = null;
      }
      stopDedicatedCamera();
    };
  }, [existingStream, stopDedicatedCamera]);

  // Automatic 5-second countdown strictly once camera is verified ready
  useEffect(() => {
    if (!isCameraReady || cameraError || hasCapturedRef.current) return;

    setCountdown(5);
    setIsClickPhase(false);

    // Initial tick sound at 5
    onPlayTickRef.current?.();

    let currentRemaining = 5;

    countdownIntervalRef.current = setInterval(() => {
      if (hasCapturedRef.current) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        return;
      }

      currentRemaining -= 1;

      if (currentRemaining > 0) {
        setCountdown(currentRemaining);
        onPlayTickRef.current?.();
      } else if (currentRemaining === 0) {
        // Show "CLICK!" and trigger capture
        setCountdown(0);
        setIsClickPhase(true);

        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }

        triggerCaptureSequenceRef.current();
      }
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isCameraReady, cameraError]);

  // Graceful auto-advance on camera error: 2.2s delay then proceed to Game Over without buttons
  useEffect(() => {
    if (!cameraError || hasCapturedRef.current) return;

    errorTimeoutRef.current = setTimeout(() => {
      if (!hasCapturedRef.current) {
        hasCapturedRef.current = true;
        stopDedicatedCamera();
        onPhotoCapturedRef.current(null);
      }
    }, 2200);

    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
    };
  }, [cameraError, stopDedicatedCamera]);

  // Comprehensive unmount cleanup
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      if (pollReadyIntervalRef.current) clearInterval(pollReadyIntervalRef.current);
      if (watchdogTimeoutRef.current) clearTimeout(watchdogTimeoutRef.current);
      stopDedicatedCamera();
    };
  }, [stopDedicatedCamera]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 lg:p-4 kiosk:p-0 bg-neutral-950/92 backdrop-blur-md select-none overflow-hidden animate-in fade-in duration-300">
      {/* Fullscreen Camera Shutter Flash */}
      {isFlashing && (
        <div className="fixed inset-0 z-[60] bg-white pointer-events-none transition-opacity duration-300 opacity-95 animate-in fade-in" />
      )}

      {/* Near-full-screen frame: the camera image fills it edge to edge, everything else sits on top */}
      <div className="w-full h-full max-w-[1800px] max-h-[1010px] rounded-2xl sm:rounded-3xl overflow-hidden bg-neutral-900 border-2 border-amber-400/70 relative shadow-[0_0_80px_rgba(245,158,11,0.35)] box-border">
        {/* Live Mirrored Camera Feed */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          onLoadedMetadata={handleCheckReady}
          onLoadedData={handleCheckReady}
          onCanPlay={handleCheckReady}
          onPlaying={handleCheckReady}
          className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-300 ${
            isCameraReady && !cameraError ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Scrims keeping the overlaid text legible over any video */}
        <div className="absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-black/85 via-black/55 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-black/80 via-black/45 to-transparent pointer-events-none z-10" />

        {/* Festive Golden Corner Accents */}
        <div className="absolute top-3 left-3 w-6 h-6 kiosk:w-9 kiosk:h-9 border-t-2 border-l-2 border-amber-300/80 pointer-events-none z-10" />
        <div className="absolute top-3 right-3 w-6 h-6 kiosk:w-9 kiosk:h-9 border-t-2 border-r-2 border-amber-300/80 pointer-events-none z-10" />
        <div className="absolute bottom-3 left-3 w-6 h-6 kiosk:w-9 kiosk:h-9 border-b-2 border-l-2 border-amber-300/80 pointer-events-none z-10" />
        <div className="absolute bottom-3 right-3 w-6 h-6 kiosk:w-9 kiosk:h-9 border-b-2 border-r-2 border-amber-300/80 pointer-events-none z-10" />

        {/* Camera Loading State */}
        {!isCameraReady && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-20 bg-neutral-950/80">
            <div className="w-12 h-12 kiosk:w-16 kiosk:h-16 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin mb-3" />
            <span className="text-xs sm:text-sm kiosk:text-xl font-bold text-amber-200 font-mono tracking-wider">
              STARTING CAMERA...
            </span>
            <span className="text-[11px] kiosk:text-base text-neutral-400 mt-1">
              Preparing front selfie camera for your victory souvenir
            </span>
          </div>
        )}

        {/* Camera Error State (Graceful & 100% Automatic) */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center z-20 bg-neutral-950/90 animate-in fade-in duration-200">
            <div className="w-12 h-12 kiosk:w-16 kiosk:h-16 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mb-2.5">
              <AlertTriangle className="w-6 h-6 kiosk:w-8 kiosk:h-8" />
            </div>
            <h3 className="text-sm kiosk:text-2xl font-bold text-rose-200 font-['Cinzel',serif] mb-1">
              Camera Unavailable
            </h3>
            <p className="text-xs kiosk:text-lg text-neutral-300 max-w-sm kiosk:max-w-xl mb-3 leading-relaxed">
              {cameraError}
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs kiosk:text-base font-mono">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
              <span>Continuing to results...</span>
            </div>
          </div>
        )}

        {/* Title, over the top scrim */}
        <div className="absolute top-0 inset-x-0 px-16 sm:px-24 kiosk:px-36 pt-3 sm:pt-4 kiosk:pt-7 text-center pointer-events-none z-[21]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-amber-500/50 text-amber-300 text-[10px] sm:text-xs kiosk:text-base font-semibold uppercase tracking-wider mb-1 sm:mb-1.5 kiosk:mb-2.5">
            <Sparkles className="w-3.5 h-3.5 kiosk:w-4 kiosk:h-4 text-amber-400 animate-pulse" />
            <span>Victory Celebration Souvenir</span>
            <Sparkles className="w-3.5 h-3.5 kiosk:w-4 kiosk:h-4 text-amber-400 animate-pulse" />
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl kiosk:text-6xl font-black font-['Cinzel',serif] tracking-wider text-amber-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            Ready for a Shot? 📸
          </h2>

          <p className="text-xs sm:text-sm kiosk:text-xl font-medium text-amber-50 mt-1 kiosk:mt-2 font-['Plus_Jakarta_Sans',sans-serif] drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
            Strike your best festive pose, <span className="font-bold text-amber-300 uppercase">{playerName}</span>! Souvenir photo auto-capturing in a moment 🎆
          </p>
        </div>

        {/* Compact Top-Right Countdown Timer (Unobtrusive & Face-Safe) */}
        {isCameraReady && !cameraError && !isCaptured && countdown > 0 && !isClickPhase && (
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 kiosk:top-8 kiosk:right-8 z-[22] pointer-events-none">
            <div
              key={countdown}
              className="relative w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 kiosk:w-28 kiosk:h-28 rounded-full bg-neutral-950/80 backdrop-blur-md border border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.55)] flex items-center justify-center animate-in zoom-in-90 duration-200"
            >
              {/* SVG Progress Ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 48 48">
                <defs>
                  <linearGradient id="timerGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="50%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#FDE047" />
                  </linearGradient>
                </defs>
                {/* Subtle track ring */}
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="rgba(245, 158, 11, 0.25)"
                  strokeWidth="2.5"
                />
                {/* Dynamic remaining arc */}
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="url(#timerGoldGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={125.66}
                  strokeDashoffset={125.66 * (1 - countdown / 5)}
                  className="transition-all duration-300 ease-out"
                />
              </svg>

              {/* Subtle pulsing tick aura */}
              <div className="absolute inset-0 rounded-full border border-amber-400/30 animate-ping opacity-40 pointer-events-none" />

              {/* Countdown Number */}
              <span className="relative z-10 text-xl sm:text-3xl lg:text-4xl kiosk:text-6xl font-black font-mono text-amber-100 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)] leading-none select-none">
                {countdown}
              </span>
            </div>
          </div>
        )}

        {/* "CLICK!" Instant Shutter Display */}
        {isClickPhase && !isCaptured && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-25 animate-in zoom-in-90 duration-150">
            <div className="px-6 py-3 kiosk:px-10 kiosk:py-5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-neutral-950 font-black font-['Cinzel',serif] tracking-wider text-2xl sm:text-3xl kiosk:text-5xl shadow-[0_0_50px_rgba(245,158,11,0.9)] flex items-center gap-2.5">
              <Camera className="w-7 h-7 kiosk:w-11 kiosk:h-11 stroke-[2.5]" />
              <span>CLICK! 📸</span>
            </div>
          </div>
        )}

        {/* Captured Success Stamp */}
        {isCaptured && (
          <div className="absolute inset-0 flex items-center justify-center z-30 bg-neutral-950/60 backdrop-blur-xs animate-in zoom-in duration-200">
            <div className="px-5 py-2.5 kiosk:px-9 kiosk:py-4 rounded-2xl bg-gradient-to-r from-emerald-500/95 to-teal-500/95 border border-emerald-300 text-neutral-950 font-black font-['Cinzel',serif] tracking-wider text-sm sm:text-base kiosk:text-3xl flex items-center gap-2 shadow-[0_0_35px_rgba(16,185,129,0.85)]">
              <Check className="w-5 h-5 kiosk:w-8 kiosk:h-8 stroke-[3]" />
              <span>PHOTO CAPTURED!</span>
            </div>
          </div>
        )}

        {/* Automatic Progress Status (Zero Buttons, Pure Automation), over the bottom scrim */}
        <div className="absolute bottom-3 sm:bottom-5 kiosk:bottom-8 inset-x-0 px-10 flex items-center justify-center pointer-events-none z-[21]">
          <div className="inline-flex items-center gap-2 kiosk:gap-3 px-4 py-1.5 kiosk:px-7 kiosk:py-3 rounded-full bg-black/60 border border-amber-500/50 text-amber-100 text-xs sm:text-sm kiosk:text-2xl font-mono font-medium text-center">
            {isCaptured ? (
              <>
                <Check className="w-3.5 h-3.5 kiosk:w-6 kiosk:h-6 text-emerald-400 flex-shrink-0" />
                <span className="text-emerald-300 font-bold">Transferring to celebration results...</span>
              </>
            ) : isClickPhase ? (
              <>
                <Camera className="w-3.5 h-3.5 kiosk:w-6 kiosk:h-6 text-amber-400 animate-pulse flex-shrink-0" />
                <span className="text-amber-300 font-bold">Capturing your celebration moment!</span>
              </>
            ) : isCameraReady ? (
              <>
                <Sparkles className="w-3.5 h-3.5 kiosk:w-6 kiosk:h-6 text-amber-400 animate-spin flex-shrink-0" />
                <span>Auto-capturing in <strong className="text-amber-300 font-bold">{countdown}s</strong> • Strike your pose!</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 kiosk:w-5 kiosk:h-5 rounded-full border border-amber-400/40 border-t-amber-400 animate-spin flex-shrink-0" />
                <span>Starting selfie camera...</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
