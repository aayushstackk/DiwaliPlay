/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  TrackedHand,
  LandmarkPoint,
  PerformanceMetrics,
  CrackerStats,
  SoundStats,
  GameScoreState,
} from '../types/motion';
import {
  LEFT_TARGET_AREA,
  RIGHT_TARGET_AREA,
  getPalmCenterScreen,
  isPointInsideRect,
  categorizeSpeed,
  calculateMovementDirection,
  extrapolateLandmarks,
  renderHandSkeleton,
  renderHandTrail,
  renderHandCenterMarker,
  renderHandFlame,
  resetHandFlameState,
  HandTrailPoint,
} from '../utils/motionMath';
import { recognizeHandGesture } from '../utils/gestureRecognition';
import { CrackerEngine } from '../utils/crackerEngine';
import { HandTrackingWorkerClient, getTrackingPreference } from '../utils/handTrackingWorkerClient';
import { WORKER_FAST_ENOUGH_MS, benchmarkDetector, chooseTracker } from '../utils/trackerSelection';
import { getTrackingOverrides, getWebGlRendererName } from '../utils/trackingOverrides';
import type { HandDetectionResult } from '../utils/handTrackingWorkerProtocol';
import { SoundEngine, CrackerSoundType } from '../utils/soundEngine';
import { SfxKey, GameAudioSettings } from '../types/backend';
import { INITIAL_SCORE_STATE, calculateBurstPoints } from '../utils/scoreSystem';
import {
  isAndroidDevice,
  isLowEndHardware,
  subscribeLowEndMode,
  getCanvasRenderScale,
  recordFrameTimeForAdaptiveQuality,
} from '../utils/device';

// Hand-detection rate cap in low-end mode. Rendering stays at display rate; hand
// positions between detections come from the existing velocity extrapolation.
const LOW_END_INFERENCE_FPS = 24;

const DEFAULT_HAND = (side: 'left' | 'right'): TrackedHand => ({
  side,
  detected: false,
  screenCenter: { x: side === 'left' ? 0.25 : 0.75, y: 0.5 },
  pixelX: 0,
  pixelY: 0,
  percentX: side === 'left' ? 25 : 75,
  percentY: 50,
  movementSpeed: 0,
  movementCategory: 'Idle',
  landmarks: [],
  inTargetArea: false,
  consecutiveDetectedFrames: 0,
  lastSeenTimestamp: 0,
  gesture: 'UNKNOWN',
  direction: 'STATIONARY',
  velocityX: 0,
  velocityY: 0,
  acceleration: 0,
  distanceMoved: 0,
  isPredicted: false,
});

const trackingOverrides = getTrackingOverrides(
  typeof window !== 'undefined' ? window.location.search : ''
);

const smoothTiming = (previous: number, sample: number) =>
  previous > 0 ? previous * 0.8 + sample * 0.2 : sample;

const describeCameraMode = (stream: MediaStream | null) => {
  const settings = stream?.getVideoTracks()[0]?.getSettings();
  if (!settings) return '';
  return `${settings.width}x${settings.height} @ ${Math.round(settings.frameRate ?? 0)}`;
};

const DEFAULT_METRICS: PerformanceMetrics = {
  cameraFps: 0,
  processingFps: 0,
  renderFps: 0,
  detectionMs: 0,
  frameToResultMs: 0,
  cameraDelayMs: null,
  cameraMode: '',
  trackerMode: '',
  gpuName: '',
  lowEndMode: false,
  trackingConfidence: 0,
  leftSpeed: 0,
  rightSpeed: 0,
  leftDetected: false,
  rightDetected: false,
  leftGesture: 'UNKNOWN',
  rightGesture: 'UNKNOWN',
  trackingLossCount: 0,
  leftTrackingLosses: 0,
  rightTrackingLosses: 0,
  maxSpeedRecorded: 0,
  crackersBurst: 0,
  isCombo: false,
  audioReady: false,
  lastSound: 'None',
  activeSounds: 0,
  masterVolume: 85,
  effectVolume: 90,
  musicVolume: 80,
  isMuted: false,
};

const DEFAULT_CRACKER_STATS: CrackerStats = {
  crackersBurst: 0,
  isCombo: false,
  comboMultiplier: 1,
  activeParticles: 0,
  lastCrackerStyle: 'SPARK_BURST',
};

const DEFAULT_SOUND_STATS: SoundStats = {
  isUnlocked: false,
  isMuted: false,
  masterVolume: 0.85,
  effectVolume: 0.9,
  musicVolume: 0.8,
  activeVoices: 0,
  lastSoundName: 'None',
};

const MAX_PREDICTION_GRACE_FRAMES = 2;

// Helper to determine spawn interval (ms) based on hand speed
function getBurstInterval(speed: number): number {
  if (speed < 40) return 999999; // idle
  if (speed < 140) return 220;   // slow movement -> few crackers
  if (speed < 320) return 110;   // normal movement -> medium crackers
  if (speed < 550) return 60;    // fast movement -> many crackers
  return 32;                     // very fast -> maximum activity
}

export interface UseHandTrackingOptions {
  renderSkeleton?: boolean;
  enabled?: boolean;
}

export function useHandTracking(options?: UseHandTrackingOptions) {
  const isEnabled = options?.enabled !== false;
  const renderSkeletonRef = useRef(options?.renderSkeleton ?? true);
  renderSkeletonRef.current = options?.renderSkeleton ?? true;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingCameraPromiseRef = useRef<Promise<MediaStream | null> | null>(null);

  const [isModelLoading, setIsModelLoading] = useState(isEnabled);
  const [modelLoadingProgress, setModelLoadingProgress] = useState('Initializing MediaPipe vision pipeline...');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Cracker Test Mode state
  const [isCrackerModeActive, setIsCrackerModeActive] = useState(true);
  const [isGameplayActive, setIsGameplayActive] = useState(false);
  const isGameplayActiveRef = useRef(false);
  isGameplayActiveRef.current = isGameplayActive;
  const [crackerStats, setCrackerStats] = useState<CrackerStats>(DEFAULT_CRACKER_STATS);

  // Sound Engine state
  const soundEngineRef = useRef<SoundEngine>(new SoundEngine({ maxPolyphony: 8 }));
  const [soundStats, setSoundStats] = useState<SoundStats>(DEFAULT_SOUND_STATS);

  // Real-time 35-Second Game Score state
  const gameScoreRef = useRef<GameScoreState>({ ...INITIAL_SCORE_STATE });
  const [gameScore, setGameScore] = useState<GameScoreState>(INITIAL_SCORE_STATE);

  // 3-Bomb Combo Reward Tracking (~1.0s sliding window)
  const comboRewardHitsRef = useRef<number[]>([]);
  const [comboNotice, setComboNotice] = useState<{
    id: number;
    comboCount: number;
    bonusPoints: number;
    message: string;
  } | null>(null);
  const comboNoticeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Throttled UI states
  const [leftHand, setLeftHand] = useState<TrackedHand>(DEFAULT_HAND('left'));
  const [rightHand, setRightHand] = useState<TrackedHand>(DEFAULT_HAND('right'));
  const [metrics, setMetrics] = useState<PerformanceMetrics>(DEFAULT_METRICS);

  const isAndroid = isAndroidDevice();

  // MediaPipe & Rendering loop refs
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  // Off-main-thread detection (preferred). When null, detection runs on the main thread.
  const workerClientRef = useRef<HandTrackingWorkerClient | null>(null);
  // Set if the worker fails at runtime, so the loop falls back to main-thread detection
  const fallbackToMainThreadRef = useRef<(() => void) | null>(null);
  // Why this tracker was picked, for the ?timing=1 readout
  const trackerChoiceNoteRef = useRef('');
  const animationFrameIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isInferringRef = useRef(false);

  // Cracker Particle Engine Instance (Object-pooled, zero GC overhead)
  // On Android, 350 particles provide abundant festive visuals while halving CPU/GPU particle load
  // Lazily created once (a plain `new` in useRef's argument would re-allocate the pool on every render)
  const crackerEngineRef = useRef<CrackerEngine>(null as unknown as CrackerEngine);
  if (!crackerEngineRef.current) {
    crackerEngineRef.current = new CrackerEngine(isAndroid ? 350 : 700, isLowEndHardware());
  }

  // Logical (CSS pixel) size of the effects canvas. The backing store may be smaller in
  // low-end mode; all hand/particle coordinates stay in these logical pixels.
  const canvasViewSizeRef = useRef({
    w: typeof window !== 'undefined' ? window.innerWidth || 1920 : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight || 1080 : 1080,
  });

  // Apply low-end quality changes (incl. mid-session adaptive switches) to the particle engine
  useEffect(() => {
    return subscribeLowEndMode((isLowEnd) => crackerEngineRef.current.setLowEndMode(isLowEnd));
  }, []);

  // Cracker spawn timer trackers
  const spawnTimersRef = useRef({
    left: 0,
    right: 0,
    combo: 0,
    lastFrameTime: performance.now(),
  });

  // Container holding latest tracking state for the throttling timer
  const latestDataRef = useRef<{
    left: TrackedHand;
    right: TrackedHand;
    metrics: PerformanceMetrics;
    crackerStats: CrackerStats;
    soundStats: SoundStats;
    gameScore: GameScoreState;
  }>({
    left: DEFAULT_HAND('left'),
    right: DEFAULT_HAND('right'),
    metrics: DEFAULT_METRICS,
    crackerStats: DEFAULT_CRACKER_STATS,
    soundStats: DEFAULT_SOUND_STATS,
    gameScore: INITIAL_SCORE_STATE,
  });

  // Tracking history & Kinematics state for both hands
  const historyRef = useRef({
    left: {
      prevPx: 0,
      prevPy: 0,
      prevTime: 0,
      smoothedSpeed: 0,
      prevSpeed: 0,
      vx: 0,
      vy: 0,
      acceleration: 0,
      distanceMoved: 0,
      consecutiveFrames: 0,
      lostFrames: 0,
      lastRealLandmarks: [] as LandmarkPoint[],
      trackingLosses: 0,
      trail: [] as HandTrailPoint[],
      activeMarks: null as LandmarkPoint[] | null,
      isDetected: false,
      isPredicted: false,
      gesture: 'UNKNOWN' as import('../types/motion').HandGesture,
    },
    right: {
      prevPx: 0,
      prevPy: 0,
      prevTime: 0,
      smoothedSpeed: 0,
      prevSpeed: 0,
      vx: 0,
      vy: 0,
      acceleration: 0,
      distanceMoved: 0,
      consecutiveFrames: 0,
      lostFrames: 0,
      lastRealLandmarks: [] as LandmarkPoint[],
      trackingLosses: 0,
      trail: [] as HandTrailPoint[],
      activeMarks: null as LandmarkPoint[] | null,
      isDetected: false,
      isPredicted: false,
      gesture: 'UNKNOWN' as import('../types/motion').HandGesture,
    },
    maxSpeed: 0,
  });

  // FPS measurement counters
  const fpsCountersRef = useRef({
    camFrameCount: 0,
    procFrameCount: 0,
    lastMeasureTime: performance.now(),
    measuredCamFps: 0,
    measuredProcFps: 0,
    renderFrameCount: 0,
    measuredRenderFps: 0,
    detectionMs: 0,
    frameToResultMs: 0,
    cameraDelayMs: 0,
  });

  // Sound Engine Methods
  const unlockAudio = useCallback(async () => {
    const success = await soundEngineRef.current.unlockAudio();
    if (success) {
      setSoundStats((prev) => ({ ...prev, isUnlocked: true }));
    }
    return success;
  }, []);

  const toggleMute = useCallback(() => {
    const muted = soundEngineRef.current.toggleMute();
    setSoundStats((prev) => ({ ...prev, isMuted: muted }));
    return muted;
  }, []);

  const setMasterVolume = useCallback((vol: number) => {
    soundEngineRef.current.setMasterVolume(vol);
    setSoundStats((prev) => ({ ...prev, masterVolume: vol }));
  }, []);

  const setEffectVolume = useCallback((vol: number) => {
    soundEngineRef.current.setEffectVolume(vol);
    setSoundStats((prev) => ({ ...prev, effectVolume: vol }));
  }, []);

  const setMusicVolume = useCallback((vol: number) => {
    soundEngineRef.current.setMusicVolume(vol);
    setSoundStats((prev) => ({ ...prev, musicVolume: vol }));
  }, []);

  const playSound = useCallback((type: CrackerSoundType) => {
    soundEngineRef.current.playSound(type);
  }, []);

  // Reset tracking & cracker stats
  const resetStats = useCallback(() => {
    historyRef.current.left.trackingLosses = 0;
    historyRef.current.right.trackingLosses = 0;
    historyRef.current.left.distanceMoved = 0;
    historyRef.current.right.distanceMoved = 0;
    historyRef.current.maxSpeed = 0;
    historyRef.current.left.trail = [];
    historyRef.current.right.trail = [];
    historyRef.current.left.activeMarks = null;
    historyRef.current.left.isDetected = false;
    historyRef.current.right.activeMarks = null;
    historyRef.current.right.isDetected = false;
    crackerEngineRef.current.reset();
    comboRewardHitsRef.current = [];
    if (comboNoticeTimeoutRef.current) {
      clearTimeout(comboNoticeTimeoutRef.current);
      comboNoticeTimeoutRef.current = null;
    }
    setComboNotice(null);
    gameScoreRef.current = { ...INITIAL_SCORE_STATE };
    setGameScore({ ...INITIAL_SCORE_STATE });
  }, []);

  const resetGameScore = useCallback(() => {
    comboRewardHitsRef.current = [];
    if (comboNoticeTimeoutRef.current) {
      clearTimeout(comboNoticeTimeoutRef.current);
      comboNoticeTimeoutRef.current = null;
    }
    setComboNotice(null);
    gameScoreRef.current = { ...INITIAL_SCORE_STATE };
    historyRef.current.left.trail = [];
    historyRef.current.right.trail = [];
    historyRef.current.left.activeMarks = null;
    historyRef.current.left.isDetected = false;
    historyRef.current.right.activeMarks = null;
    historyRef.current.right.isDetected = false;
    crackerEngineRef.current.reset();
    setGameScore({ ...INITIAL_SCORE_STATE });
  }, []);

  // Initialize MediaPipe HandLandmarker
  useEffect(() => {
    if (!isEnabled) {
      setIsModelLoading(false);
      return;
    }
    let isMounted = true;

    async function initMediaPipe() {
      try {
        setIsModelLoading(true);
        setModelLoadingProgress('Loading MediaPipe Vision WASM assets...');

        const wasmBasePath = `/mediapipe/${__MEDIAPIPE_VERSION__}/wasm`;
        // Self-hosted copy of hand_landmarker/float16/1 (public/models)
        const modelAssetPath = '/models/hand_landmarker.task';

        const preference = getTrackingPreference();

        // 1) Worker: a slow detection pass can't stall animation
        let client: HandTrackingWorkerClient | null = null;
        if (preference !== 'main') {
          try {
            setModelLoadingProgress('Starting hand tracking worker...');
            client = await HandTrackingWorkerClient.create({
              wasmBasePath,
              modelAssetPath,
              delegate: trackingOverrides.delegate,
              numHands: trackingOverrides.numHands,
            });
            if (!isMounted) {
              client.close();
              return;
            }
            if (preference === 'auto') {
              await pickFasterTracker(client);
              return;
            }
            startWorkerTracker(client);
            return;
          } catch (workerErr) {
            client?.close();
            console.warn('[HandTracking] Worker unavailable, falling back to main thread:', workerErr);
          }
        }

        // 2) Main thread: forced, or the worker can't run here
        if (!isMounted) return;
        const landmarker = await createMainThreadLandmarker();
        if (!isMounted) {
          landmarker.close();
          return;
        }
        handLandmarkerRef.current = landmarker;
        setIsModelLoading(false);
      } catch (err: unknown) {
        console.error('Failed to initialize HandLandmarker:', err);
        if (isMounted) {
          setIsModelLoading(false);
          setCameraError(
            err instanceof Error
              ? `Vision Model Error: ${err.message}`
              : 'Failed to load MediaPipe hand detection model. Please check your internet connection.'
          );
        }
      }
    }

    function startWorkerTracker(client: HandTrackingWorkerClient) {
      console.info(`[HandTracking] Running in worker (${client.delegate} delegate)`);
      workerClientRef.current = client;
      setIsModelLoading(false);
    }

    // Some kiosks' browsers run the model far slower in a worker than on the main thread, which
    // makes tracking lag. Time both on a test frame before anyone is playing, and only leave the
    // worker when the main thread is clearly faster and fast enough not to stutter the game.
    async function pickFasterTracker(client: HandTrackingWorkerClient) {
      setModelLoadingProgress('Checking hand tracking speed...');
      const workerMs = await benchmarkDetector(async (frame, timestamp) => {
        await client.detect(await createImageBitmap(frame), timestamp);
        return client.lastInferenceMs;
      });
      if (!isMounted) {
        client.close();
        return;
      }

      let landmarker: HandLandmarker | null = null;
      let mainMs = Infinity;
      if (workerMs > WORKER_FAST_ENOUGH_MS) {
        try {
          landmarker = await createMainThreadLandmarker();
          const candidate = landmarker;
          mainMs = await benchmarkDetector((frame, timestamp) => {
            const start = performance.now();
            candidate.detectForVideo(frame, timestamp);
            return performance.now() - start;
          });
        } catch (mainErr) {
          console.warn('[HandTracking] Main-thread benchmark failed, keeping the worker:', mainErr);
        }
      }
      if (!isMounted) {
        client.close();
        landmarker?.close();
        return;
      }

      const choice = chooseTracker(workerMs, mainMs);
      const measured = Number.isFinite(mainMs)
        ? `worker ${Math.round(workerMs)} ms, main ${Math.round(mainMs)} ms`
        : `worker ${Math.round(workerMs)} ms`;
      trackerChoiceNoteRef.current = measured;
      console.info(`[HandTracking] Benchmark: ${measured}; using ${choice}`);

      if (choice === 'main' && landmarker) {
        client.close();
        handLandmarkerRef.current = landmarker;
        setIsModelLoading(false);
        return;
      }
      landmarker?.close();
      startWorkerTracker(client);
    }

    async function createMainThreadLandmarker(): Promise<HandLandmarker> {
      setModelLoadingProgress('Loading MediaPipe Vision WASM assets...');
      const vision = await FilesetResolver.forVisionTasks(`/mediapipe/${__MEDIAPIPE_VERSION__}/wasm`);

      setModelLoadingProgress('Loading Hand Landmarker with WebGL GPU acceleration...');

      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/hand_landmarker.task',
          delegate: trackingOverrides.delegate ?? 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: trackingOverrides.numHands,
        minHandDetectionConfidence: 0.35,
        minHandPresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
    }

    async function initMainThreadLandmarker() {
      if (handLandmarkerRef.current) return;
      setIsModelLoading(true);
      const landmarker = await createMainThreadLandmarker();
      if (!isMounted) {
        landmarker.close();
        return;
      }
      handLandmarkerRef.current = landmarker;
      setIsModelLoading(false);
    }

    // Runtime worker failure (crash / repeated errors): switch to main-thread detection
    fallbackToMainThreadRef.current = () => {
      const client = workerClientRef.current;
      if (!client) return;
      workerClientRef.current = null;
      client.close();
      console.warn('[HandTracking] Worker failed at runtime, switching to main-thread detection');
      initMainThreadLandmarker().catch((err) => {
        console.error('Main-thread HandLandmarker fallback failed:', err);
        if (isMounted) {
          setIsModelLoading(false);
          setCameraError('Failed to load MediaPipe hand detection model.');
        }
      });
    };

    initMediaPipe();

    return () => {
      isMounted = false;
      fallbackToMainThreadRef.current = null;
      if (workerClientRef.current) {
        workerClientRef.current.close();
        workerClientRef.current = null;
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
    };
  }, []);

  // Start Webcam Stream (640x480 at up to 60fps for speed and responsiveness)
  const startCamera = useCallback(async () => {
    if (pendingCameraPromiseRef.current) {
      return pendingCameraPromiseRef.current;
    }

    const task = (async () => {
      setCameraError(null);
      try {
        if (streamRef.current) {
          const activeTracks = streamRef.current.getTracks();
          if (activeTracks.length > 0 && activeTracks.some((t) => t.readyState === 'live')) {
            if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
              videoRef.current.srcObject = streamRef.current;
              await videoRef.current.play().catch(() => {});
            }
            setIsCameraActive(true);
            return streamRef.current;
          }
          activeTracks.forEach((track) => track.stop());
        }

        const lowEndCamera = isLowEndHardware();
        const videoConstraints: MediaTrackConstraints = lowEndCamera || isAndroid
          ? {
              // Low-end: don't pay to decode 60fps frames, but a slower camera adds latency
              width: { ideal: 640, max: 640 },
              height: { ideal: 480, max: 480 },
              frameRate: { ideal: 30, max: 30 },
              facingMode: { ideal: 'user' },
            }
          : {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 60, min: 30 },
              facingMode: 'user',
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        // If stopCamera was called while getUserMedia was resolving, stop tracks immediately
        if (pendingCameraPromiseRef.current === null) {
          stream.getTracks().forEach((track) => track.stop());
          return null;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch((playErr) => {
            console.warn('Webcam initial play note:', playErr);
          });
          setIsCameraActive(true);
        }
        return stream;
      } catch (err: unknown) {
        console.error('Webcam access error:', err);
        const isDenied =
          err instanceof DOMException &&
          (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        setCameraError(
          isDenied
            ? 'Camera permission denied. Please click the camera icon in Chrome’s address bar to grant permission.'
            : 'Unable to access laptop webcam. Please ensure camera is connected and not used by another app.'
        );
        setIsCameraActive(false);
        return null;
      } finally {
        pendingCameraPromiseRef.current = null;
      }
    })();

    pendingCameraPromiseRef.current = task;
    return task;
  }, []);

  // Ensure video element gets stream if attached or re-attached
  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) => console.warn('Webcam playback notice:', err));
    }
  }, [isCameraActive]);

  // Stop Webcam Stream completely
  const stopCamera = useCallback(() => {
    pendingCameraPromiseRef.current = null;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
      setCameraError(null);
    } catch (err) {
      console.warn('Error stopping camera:', err);
    }
  }, []);

  // Main High-Performance Detection, Audio & Cracker Particle Loop
  useEffect(() => {
    let lastVideoTime = -1;
    let lastInferenceTime = -1;
    let rvfcHandle: number | null = null;
    let isCancelled = false;
    let rvfcActive = false;
    let inferenceTokens = 1;
    let workerErrorCount = 0;
    const MAX_WORKER_ERRORS = 5;
    let lastThrottleCheck = 0;
    let lastRenderTime = 0;
    let hasUndetectedFrame = false;

    const recordDetectionTiming = (detectionMs: number, frameToResultMs: number) => {
      const counters = fpsCountersRef.current;
      counters.detectionMs = smoothTiming(counters.detectionMs, detectionMs);
      counters.frameToResultMs = smoothTiming(counters.frameToResultMs, frameToResultMs);
    };

    const runInference = (currentTime: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = handLandmarkerRef.current;
      const workerClient = workerClientRef.current;

      const canTrackHands =
        isEnabled &&
        Boolean(workerClient || landmarker) &&
        Boolean(video && video.readyState >= 2 && !video.paused);

      if (!canTrackHands || !video || !canvas) {
        return;
      }

      if (video.currentTime === lastVideoTime || isInferringRef.current) {
        return;
      }

      // Low-end, main thread only: cap detection at ~24fps using a token bucket (with a 30fps
      // camera this runs 4 of every 5 frames). The worker doesn't block rendering and only
      // ever has one frame in flight, so capping it would just add lag.
      if (!workerClient && isLowEndHardware()) {
        const elapsed = lastThrottleCheck > 0 ? currentTime - lastThrottleCheck : 1000;
        lastThrottleCheck = currentTime;
        inferenceTokens = Math.min(1, inferenceTokens + (elapsed * LOW_END_INFERENCE_FPS) / 1000);
        if (inferenceTokens < 1) {
          return;
        }
        inferenceTokens -= 1;
      }

      lastVideoTime = video.currentTime;
      isInferringRef.current = true;
      hasUndetectedFrame = false;

      // Monotonically increasing timestamp protection for MediaPipe Tasks Vision
      if (currentTime <= lastInferenceTime) {
        currentTime = lastInferenceTime + 1;
      }
      lastInferenceTime = currentTime;

      // Off-main-thread path: snapshot the frame and let the worker detect asynchronously.
      // isInferringRef stays true until the result arrives, so frames never queue up.
      if (workerClient) {
        const captureTime = currentTime;
        createImageBitmap(video)
          .then((bitmap) => {
            if (isCancelled || workerClientRef.current !== workerClient) {
              bitmap.close();
              return null;
            }
            return workerClient.detect(bitmap, captureTime);
          })
          .then((results) => {
            if (results && !isCancelled) {
              recordDetectionTiming(workerClient.lastInferenceMs, performance.now() - captureTime);
              processResults(results, captureTime);
            }
          })
          .catch((workerErr) => {
            console.warn('Worker inference frame dropped:', workerErr);
            workerErrorCount++;
            if (workerClient.failed || workerErrorCount >= MAX_WORKER_ERRORS) {
              fallbackToMainThreadRef.current?.();
            }
          })
          .finally(() => {
            isInferringRef.current = false;
            // A camera frame that arrived during this detection was skipped. Start on the
            // newest frame now: waiting for the next one halves the detection rate whenever
            // inference outlasts a camera frame, and MediaPipe then loses fast-moving hands.
            // Only when one really arrived: a live video's currentTime keeps moving between
            // frames, so that check alone would re-detect the same frame in a tight loop.
            if (!isCancelled && hasUndetectedFrame) {
              runInference(performance.now());
            }
          });
        return;
      }

      if (!landmarker) {
        isInferringRef.current = false;
        return;
      }

      try {
        const detectStart = performance.now();
        const results = landmarker.detectForVideo(video, currentTime);
        const detectMs = performance.now() - detectStart;
        recordDetectionTiming(detectMs, detectMs);
        processResults(results, currentTime);
      } catch (inferenceErr) {
        console.warn('Inference frame dropped:', inferenceErr);
      } finally {
        isInferringRef.current = false;
      }
    };

    // Shared result handling for worker and main-thread detection.
    // `currentTime` is the frame's capture time, so speeds/trails stay accurate even
    // when worker results arrive a few ms later.
    const processResults = (results: HandDetectionResult, currentTime: number) => {
      const canvas = canvasRef.current;
      const crackerEngine = crackerEngineRef.current;
      const soundEngine = soundEngineRef.current;
      if (!canvas) return;
      const viewW = canvasViewSizeRef.current.w;
      const viewH = canvasViewSizeRef.current.h;
      workerErrorCount = 0;

      try {
        fpsCountersRef.current.procFrameCount++;

      const detectedLandmarks = results.landmarks || [];
      const handednessList = results.handedness || [];

      let totalConfidence = 0;
      for (const handCategories of handednessList) {
        if (handCategories && handCategories[0]) {
          totalConfidence += handCategories[0].score;
        }
      }
      const avgConfidence =
        handednessList.length > 0 ? totalConfidence / handednessList.length : 0;

      // Spatial & Temporal Hand Association
      let rawLeft: LandmarkPoint[] | null = null;
      let rawRight: LandmarkPoint[] | null = null;

      if (detectedLandmarks.length === 1) {
        const marks = detectedLandmarks[0] as LandmarkPoint[];
        const palm = getPalmCenterScreen(marks);
        const prevL = historyRef.current.left;
        const prevR = historyRef.current.right;

        const distL = prevL.prevPx > 0 ? Math.abs(palm.x * viewW - prevL.prevPx) : 9999;
        const distR = prevR.prevPx > 0 ? Math.abs(palm.x * viewW - prevR.prevPx) : 9999;

        if (distL < distR && distL < viewW * 0.4) {
          rawLeft = marks;
        } else if (distR < distL && distR < viewW * 0.4) {
          rawRight = marks;
        } else {
          if (palm.x < 0.5) rawLeft = marks;
          else rawRight = marks;
        }
      } else if (detectedLandmarks.length >= 2) {
        const handA = detectedLandmarks[0] as LandmarkPoint[];
        const handB = detectedLandmarks[1] as LandmarkPoint[];
        const palmA = getPalmCenterScreen(handA);
        const palmB = getPalmCenterScreen(handB);

        if (palmA.x < palmB.x) {
          rawLeft = handA;
          rawRight = handB;
        } else {
          rawLeft = handB;
          rawRight = handA;
        }
      }

      // -------------------------------------------------------------
      // LEFT HAND PROCESSING WITH DEAD RECKONING
      // -------------------------------------------------------------
      const histL = historyRef.current.left;
      let activeLeftMarks: LandmarkPoint[] | null = null;
      let isLeftPredicted = false;
      let isLeftDetected = false;

      const dtL = histL.prevTime > 0 ? (currentTime - histL.prevTime) / 1000 : 0.016;

      if (rawLeft) {
        histL.consecutiveFrames++;
        histL.lostFrames = 0;
        histL.lastRealLandmarks = rawLeft;
        activeLeftMarks = rawLeft;
        isLeftPredicted = false;
        isLeftDetected = true;
      } else if (histL.lastRealLandmarks.length > 0 && histL.lostFrames < MAX_PREDICTION_GRACE_FRAMES) {
        histL.lostFrames++;
        isLeftPredicted = true;
        isLeftDetected = true;
        activeLeftMarks = extrapolateLandmarks(
          histL.lastRealLandmarks,
          histL.vx,
          histL.vy,
          dtL,
          viewW,
          viewH,
          0.82
        );
        histL.lastRealLandmarks = activeLeftMarks;
      } else {
        if (histL.consecutiveFrames > 0 && histL.lostFrames >= MAX_PREDICTION_GRACE_FRAMES) {
          histL.trackingLosses++;
        }
        histL.consecutiveFrames = 0;
        histL.lostFrames++;
        isLeftDetected = false;
        activeLeftMarks = null;
      }

      let updatedLeft: TrackedHand;
      if (activeLeftMarks && isLeftDetected) {
        const palm = getPalmCenterScreen(activeLeftMarks);
        const px = Math.round(palm.x * viewW);
        const py = Math.round(palm.y * viewH);

        if (dtL > 0.003 && histL.prevPx > 0) {
          const dX = px - histL.prevPx;
          const dY = py - histL.prevPy;
          const instantSpeed = Math.hypot(dX, dY) / dtL;
          histL.distanceMoved += Math.hypot(dX, dY);

          histL.vx = dX / dtL;
          histL.vy = dY / dtL;

          const alpha = instantSpeed > 250 ? 0.65 : 0.35;
          const newSpeed = alpha * instantSpeed + (1 - alpha) * histL.smoothedSpeed;
          histL.acceleration = (newSpeed - histL.prevSpeed) / dtL;
          histL.prevSpeed = histL.smoothedSpeed;
          histL.smoothedSpeed = newSpeed;

          if (newSpeed > historyRef.current.maxSpeed) {
            historyRef.current.maxSpeed = Math.round(newSpeed);
          }
        }
        histL.prevPx = px;
        histL.prevPy = py;
        histL.prevTime = currentTime;

        // Maintain smooth trailing light ribbon
        histL.trail.push({ x: px, y: py, time: currentTime, speed: histL.smoothedSpeed });
        histL.trail = histL.trail.filter((pt) => currentTime - pt.time < 350).slice(-20);

        const gesture = recognizeHandGesture(activeLeftMarks);
        const direction = calculateMovementDirection(histL.vx, histL.vy);
        const inArea = isPointInsideRect(palm, LEFT_TARGET_AREA);

        updatedLeft = {
          side: 'left',
          detected: true,
          screenCenter: palm,
          pixelX: px,
          pixelY: py,
          percentX: Math.round(palm.x * 100),
          percentY: Math.round(palm.y * 100),
          movementSpeed: Math.round(histL.smoothedSpeed),
          movementCategory: categorizeSpeed(histL.smoothedSpeed),
          landmarks: activeLeftMarks,
          inTargetArea: inArea,
          consecutiveDetectedFrames: histL.consecutiveFrames,
          lastSeenTimestamp: currentTime,
          gesture,
          direction,
          velocityX: Math.round(histL.vx),
          velocityY: Math.round(histL.vy),
          acceleration: Math.round(histL.acceleration),
          distanceMoved: Math.round(histL.distanceMoved),
          isPredicted: isLeftPredicted,
        };
        histL.activeMarks = activeLeftMarks;
        histL.isDetected = true;
        histL.isPredicted = isLeftPredicted;
        histL.gesture = gesture;
      } else {
        histL.smoothedSpeed = 0;
        histL.vx = 0;
        histL.vy = 0;
        if (histL.trail.length > 0) {
          histL.trail.shift();
        }
        histL.activeMarks = null;
        histL.isDetected = false;
        histL.isPredicted = false;
        histL.gesture = 'UNKNOWN';
        updatedLeft = {
          ...latestDataRef.current.left,
          detected: false,
          inTargetArea: false,
          movementSpeed: 0,
          movementCategory: 'Idle',
          landmarks: [],
          gesture: 'UNKNOWN',
          direction: 'STATIONARY',
          isPredicted: false,
        };
      }

      // -------------------------------------------------------------
      // RIGHT HAND PROCESSING WITH DEAD RECKONING
      // -------------------------------------------------------------
      const histR = historyRef.current.right;
      let activeRightMarks: LandmarkPoint[] | null = null;
      let isRightPredicted = false;
      let isRightDetected = false;

      const dtR = histR.prevTime > 0 ? (currentTime - histR.prevTime) / 1000 : 0.016;

      if (rawRight) {
        histR.consecutiveFrames++;
        histR.lostFrames = 0;
        histR.lastRealLandmarks = rawRight;
        activeRightMarks = rawRight;
        isRightPredicted = false;
        isRightDetected = true;
      } else if (histR.lastRealLandmarks.length > 0 && histR.lostFrames < MAX_PREDICTION_GRACE_FRAMES) {
        histR.lostFrames++;
        isRightPredicted = true;
        isRightDetected = true;
        activeRightMarks = extrapolateLandmarks(
          histR.lastRealLandmarks,
          histR.vx,
          histR.vy,
          dtR,
          viewW,
          viewH,
          0.82
        );
        histR.lastRealLandmarks = activeRightMarks;
      } else {
        if (histR.consecutiveFrames > 0 && histR.lostFrames >= MAX_PREDICTION_GRACE_FRAMES) {
          histR.trackingLosses++;
        }
        histR.consecutiveFrames = 0;
        histR.lostFrames++;
        isRightDetected = false;
        activeRightMarks = null;
      }

      let updatedRight: TrackedHand;
      if (activeRightMarks && isRightDetected) {
        const palm = getPalmCenterScreen(activeRightMarks);
        const px = Math.round(palm.x * viewW);
        const py = Math.round(palm.y * viewH);

        if (dtR > 0.003 && histR.prevPx > 0) {
          const dX = px - histR.prevPx;
          const dY = py - histR.prevPy;
          const instantSpeed = Math.hypot(dX, dY) / dtR;
          histR.distanceMoved += Math.hypot(dX, dY);

          histR.vx = dX / dtR;
          histR.vy = dY / dtR;

          const alpha = instantSpeed > 250 ? 0.65 : 0.35;
          const newSpeed = alpha * instantSpeed + (1 - alpha) * histR.smoothedSpeed;
          histR.acceleration = (newSpeed - histR.prevSpeed) / dtR;
          histR.prevSpeed = histR.smoothedSpeed;
          histR.smoothedSpeed = newSpeed;

          if (newSpeed > historyRef.current.maxSpeed) {
            historyRef.current.maxSpeed = Math.round(newSpeed);
          }
        }
        histR.prevPx = px;
        histR.prevPy = py;
        histR.prevTime = currentTime;

        // Maintain smooth trailing light ribbon
        histR.trail.push({ x: px, y: py, time: currentTime, speed: histR.smoothedSpeed });
        histR.trail = histR.trail.filter((pt) => currentTime - pt.time < 350).slice(-20);

        const gesture = recognizeHandGesture(activeRightMarks);
        const direction = calculateMovementDirection(histR.vx, histR.vy);
        const inArea = isPointInsideRect(palm, RIGHT_TARGET_AREA);

        updatedRight = {
          side: 'right',
          detected: true,
          screenCenter: palm,
          pixelX: px,
          pixelY: py,
          percentX: Math.round(palm.x * 100),
          percentY: Math.round(palm.y * 100),
          movementSpeed: Math.round(histR.smoothedSpeed),
          movementCategory: categorizeSpeed(histR.smoothedSpeed),
          landmarks: activeRightMarks,
          inTargetArea: inArea,
          consecutiveDetectedFrames: histR.consecutiveFrames,
          lastSeenTimestamp: currentTime,
          gesture,
          direction,
          velocityX: Math.round(histR.vx),
          velocityY: Math.round(histR.vy),
          acceleration: Math.round(histR.acceleration),
          distanceMoved: Math.round(histR.distanceMoved),
          isPredicted: isRightPredicted,
        };
        histR.activeMarks = activeRightMarks;
        histR.isDetected = true;
        histR.isPredicted = isRightPredicted;
        histR.gesture = gesture;
      } else {
        histR.smoothedSpeed = 0;
        histR.vx = 0;
        histR.vy = 0;
        if (histR.trail.length > 0) {
          histR.trail.shift();
        }
        histR.activeMarks = null;
        histR.isDetected = false;
        histR.isPredicted = false;
        histR.gesture = 'UNKNOWN';
        updatedRight = {
          ...latestDataRef.current.right,
          detected: false,
          inTargetArea: false,
          movementSpeed: 0,
          movementCategory: 'Idle',
          landmarks: [],
          gesture: 'UNKNOWN',
          direction: 'STATIONARY',
          isPredicted: false,
        };
      }

      // -------------------------------------------------------------
      // DIWALI CRACKER PARTICLE & SOUND CO-SIMULATION
      // -------------------------------------------------------------
      const isComboActive =
        updatedLeft.detected &&
        updatedRight.detected &&
        updatedLeft.movementSpeed > 260 &&
        updatedRight.movementSpeed > 260;

      if (isCrackerModeActive) {
        const timers = spawnTimersRef.current;
        const gs = gameScoreRef.current;

        // Hand movement alone MUST NOT trigger any sound or award points.
        // Record physical movement telemetry (speed & combo detection)
        gs.maxSpeed = Math.max(
          gs.maxSpeed,
          updatedLeft.movementSpeed,
          updatedRight.movementSpeed
        );

        if (isComboActive) {
          gs.multiplier = 2;
          const dt = (currentTime - timers.lastFrameTime) / 1000;
          gs.comboDurationSec += Math.min(Math.max(dt, 0), 0.1);
        } else {
          gs.multiplier = 1;
        }

        timers.lastFrameTime = currentTime;
      }

      // Continuous festive sparkles following hand movements
      if (updatedLeft.detected) {
        crackerEngine.addMotionSparkles(
          updatedLeft.pixelX,
          updatedLeft.pixelY,
          'left',
          updatedLeft.movementSpeed
        );
      }
      if (updatedRight.detected) {
        crackerEngine.addMotionSparkles(
          updatedRight.pixelX,
          updatedRight.pixelY,
          'right',
          updatedRight.movementSpeed
        );
      }

      // Compute FPS every 500ms
      const fpsCounters = fpsCountersRef.current;
      const elapsedMeasure = currentTime - fpsCounters.lastMeasureTime;
      if (elapsedMeasure >= 500) {
        fpsCounters.measuredCamFps = Math.round((fpsCounters.camFrameCount / elapsedMeasure) * 1000);
        fpsCounters.measuredProcFps = Math.round((fpsCounters.procFrameCount / elapsedMeasure) * 1000);
        fpsCounters.measuredRenderFps = Math.round((fpsCounters.renderFrameCount / elapsedMeasure) * 1000);
        fpsCounters.camFrameCount = 0;
        fpsCounters.procFrameCount = 0;
        fpsCounters.renderFrameCount = 0;
        fpsCounters.lastMeasureTime = currentTime;
      }

      // Update ref container for throttled React rendering
      latestDataRef.current = {
        left: updatedLeft,
        right: updatedRight,
        metrics: {
          cameraFps: fpsCounters.measuredCamFps,
          processingFps: fpsCounters.measuredProcFps,
          renderFps: fpsCounters.measuredRenderFps,
          detectionMs: Math.round(fpsCounters.detectionMs),
          frameToResultMs: Math.round(fpsCounters.frameToResultMs),
          cameraDelayMs: fpsCounters.cameraDelayMs > 0 ? Math.round(fpsCounters.cameraDelayMs) : null,
          cameraMode: describeCameraMode(streamRef.current),
          trackerMode: `${
            workerClientRef.current
              ? `Worker ${workerClientRef.current.delegate}`
              : `Main ${trackingOverrides.delegate ?? 'GPU'}`
          }, ${trackingOverrides.numHands} hand(s)${
            trackerChoiceNoteRef.current ? ` (${trackerChoiceNoteRef.current})` : ''
          }`,
          gpuName: workerClientRef.current?.rendererName || getWebGlRendererName(),
          lowEndMode: isLowEndHardware(),
          trackingConfidence: Math.round(avgConfidence * 100),
          leftSpeed: updatedLeft.movementSpeed,
          rightSpeed: updatedRight.movementSpeed,
          leftDetected: updatedLeft.detected,
          rightDetected: updatedRight.detected,
          leftGesture: updatedLeft.gesture,
          rightGesture: updatedRight.gesture,
          trackingLossCount: histL.trackingLosses + histR.trackingLosses,
          leftTrackingLosses: histL.trackingLosses,
          rightTrackingLosses: histR.trackingLosses,
          maxSpeedRecorded: historyRef.current.maxSpeed,
          crackersBurst: crackerEngine.totalBursts,
          isCombo: isComboActive,
          audioReady: soundEngine.isUnlocked,
          lastSound: soundEngine.lastSoundName,
          activeSounds: soundEngine.activeVoices,
          masterVolume: Math.round(soundEngine.masterVolume * 100),
          effectVolume: Math.round(soundEngine.effectVolume * 100),
          musicVolume: Math.round(soundEngine.musicVolume * 100),
          isMuted: soundEngine.isMuted,
        },
        crackerStats: {
          crackersBurst: crackerEngine.totalBursts,
          isCombo: isComboActive,
          comboMultiplier: isComboActive ? 2 : 1,
          activeParticles: crackerEngine.activeCount,
          lastCrackerStyle: crackerEngine.lastStyle,
        },
        soundStats: {
          isUnlocked: soundEngine.isUnlocked,
          isMuted: soundEngine.isMuted,
          masterVolume: soundEngine.masterVolume,
          effectVolume: soundEngine.effectVolume,
          musicVolume: soundEngine.musicVolume,
          activeVoices: soundEngine.activeVoices,
          lastSoundName: soundEngine.lastSoundName,
        },
        gameScore: { ...gameScoreRef.current },
      };
      } catch (processErr) {
        console.warn('Hand result processing failed:', processErr);
      }
    };

    const setupRVFC = () => {
      const video = videoRef.current;
      if (video && 'requestVideoFrameCallback' in video && !rvfcActive) {
        rvfcActive = true;
        const rvfcLoop = (_now?: number, metadata?: { captureTime?: number }) => {
          if (isCancelled) return;
          const counters = fpsCountersRef.current;
          counters.camFrameCount++;
          hasUndetectedFrame = true;
          // Not every camera driver reports a capture time, so this can stay empty
          if (metadata?.captureTime) {
            const delay = performance.now() - metadata.captureTime;
            if (delay >= 0 && delay < 2000) {
              counters.cameraDelayMs = smoothTiming(counters.cameraDelayMs, delay);
            }
          }
          runInference(performance.now());
          const v = videoRef.current;
          if (v && 'requestVideoFrameCallback' in v && !isCancelled) {
            rvfcHandle = (v as any).requestVideoFrameCallback(rvfcLoop);
          } else {
            rvfcActive = false;
          }
        };
        rvfcHandle = (video as any).requestVideoFrameCallback(rvfcLoop);
      }
    };

    const processFrame = () => {
      if (isCancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const crackerEngine = crackerEngineRef.current;

      if (!canvas) {
        animationFrameIdRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Logical size = viewport in CSS pixels; backing store is scaled down in low-end mode
      // (CSS stretches the canvas back to full screen)
      const viewW = window.innerWidth || 1920;
      const viewH = window.innerHeight || 1080;
      const renderScale = getCanvasRenderScale();
      const backingW = Math.round(viewW * renderScale);
      const backingH = Math.round(viewH * renderScale);
      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
      }
      canvasViewSizeRef.current.w = viewW;
      canvasViewSizeRef.current.h = viewH;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameIdRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const currentTime = performance.now();
      fpsCountersRef.current.renderFrameCount++;

      // Feed adaptive quality monitor (auto-switches to low-end mode if FPS drops below ~42)
      if (lastRenderTime > 0) {
        recordFrameTimeForAdaptiveQuality(currentTime - lastRenderTime);
      }
      lastRenderTime = currentTime;

      // Ensure RVFC is running if supported, otherwise fallback to per-frame inference
      if (!rvfcActive) {
        setupRVFC();
      }
      if (!rvfcActive) {
        runInference(currentTime);
      }

      // -------------------------------------------------------------
      // 60FPS CANVAS RENDERING & PARTICLE SIMULATION
      // Always executes on every rAF tick to deliver silky smooth 60fps visuals decoupled from camera FPS
      // -------------------------------------------------------------
      ctx.setTransform(canvas.width / viewW, 0, 0, canvas.height / viewH, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);

      const renderHistL = historyRef.current.left;
      const renderHistR = historyRef.current.right;

      // Update & Render Fireworks Particle Layer (burst explosions)
      crackerEngine.update();
      crackerEngine.render(ctx, viewW, viewH);

      if (isEnabled) {
        if (isGameplayActiveRef.current) {
          // -------------------------------------------------------------
          // ACTIVE GAMEPLAY PHASE: SHOW ONLY ANIMATED FIRE FLAMES
          // Hide all hand skeletons, finger landmarks, connecting lines,
          // fingertip markers, debug overlays, and ordinary center markers.
          // Display animated fire flames with glowing core, flicker, and embers.
          // -------------------------------------------------------------
          if (renderHistL.isDetected && renderHistL.prevPx > 0) {
            renderHandFlame(
              ctx,
              renderHistL.prevPx,
              renderHistL.prevPy,
              'left',
              renderHistL.smoothedSpeed,
              renderHistL.vx,
              renderHistL.vy,
              renderHistL.prevTime
            );
          }
          if (renderHistR.isDetected && renderHistR.prevPx > 0) {
            renderHandFlame(
              ctx,
              renderHistR.prevPx,
              renderHistR.prevPy,
              'right',
              renderHistR.smoothedSpeed,
              renderHistR.vx,
              renderHistR.vy,
              renderHistR.prevTime
            );
          }
        } else {
          // Reset flame interpolation and embers when outside active gameplay
          resetHandFlameState();

          // -------------------------------------------------------------
          // CALIBRATION / ALIGNMENT PHASE (IDLE, READY, COUNTDOWN):
          // Render full hand skeletons, guidance joints & glowing motion trails
          // so the player can position their hands correctly into target zones.
          // -------------------------------------------------------------
          renderHandTrail(ctx, renderHistL.trail, 'left');
          renderHandTrail(ctx, renderHistR.trail, 'right');

          if (renderHistL.isDetected && renderHistL.activeMarks && renderHistL.activeMarks.length > 0) {
            renderHandSkeleton(
              ctx,
              renderHistL.activeMarks,
              'left',
              viewW,
              viewH,
              renderHistL.smoothedSpeed,
              renderHistL.gesture,
              renderHistL.isPredicted
            );
          }
          if (renderHistR.isDetected && renderHistR.activeMarks && renderHistR.activeMarks.length > 0) {
            renderHandSkeleton(
              ctx,
              renderHistR.activeMarks,
              'right',
              viewW,
              viewH,
              renderHistR.smoothedSpeed,
              renderHistR.gesture,
              renderHistR.isPredicted
            );
          }
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameIdRef.current = requestAnimationFrame(processFrame);

    return () => {
      isCancelled = true;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (rvfcHandle !== null && videoRef.current && 'cancelVideoFrameCallback' in videoRef.current) {
        (videoRef.current as any).cancelVideoFrameCallback(rvfcHandle);
      }
    };
  }, [isCrackerModeActive]);

  // Throttled UI updater (filters unchanged values so React doesn't churn at 25Hz)
  useEffect(() => {
    let prevScore = -1;
    let prevIsCombo = false;
    let prevLeftDetected = false;
    let prevRightDetected = false;
    let prevLeftInTarget = false;
    let prevRightInTarget = false;
    let metricsTimer = 0;

    const timer = setInterval(() => {
      const latest = latestDataRef.current;
      const now = performance.now();

      // Only update hand states when detection or target box status changes
      if (
        latest.left.detected !== prevLeftDetected ||
        latest.left.inTargetArea !== prevLeftInTarget
      ) {
        prevLeftDetected = latest.left.detected;
        prevLeftInTarget = latest.left.inTargetArea;
        setLeftHand(latest.left);
      }
      if (
        latest.right.detected !== prevRightDetected ||
        latest.right.inTargetArea !== prevRightInTarget
      ) {
        prevRightDetected = latest.right.detected;
        prevRightInTarget = latest.right.inTargetArea;
        setRightHand(latest.right);
      }

      // Only update score when it actually changes
      if (latest.gameScore.score !== prevScore || latest.crackerStats.isCombo !== prevIsCombo) {
        prevScore = latest.gameScore.score;
        prevIsCombo = latest.crackerStats.isCombo;
        setGameScore(latest.gameScore);
        setCrackerStats(latest.crackerStats);
      }

      // Metrics updated smoothly at 4Hz (every 250ms) to prevent unnecessary React reconciliation
      if (now - metricsTimer >= 250) {
        metricsTimer = now;
        setMetrics(latest.metrics);
      }
    }, 40);

    return () => clearInterval(timer);
  }, []);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const playCountdownBeep = useCallback((isFinal = false) => {
    soundEngineRef.current.playCountdownBeep(isFinal);
  }, []);

  const playGameOverFanfare = useCallback(() => {
    soundEngineRef.current.playGameOverFanfare();
  }, []);

  const recordBombTouch = useCallback(
    (
      points: number,
      bomb?: {
        id?: string;
        points?: number;
        isPenalty?: boolean;
        color?: string;
      }
    ) => {
      const gs = gameScoreRef.current;
      const now = performance.now();
      const isPenalty =
        points < 0 ||
        Boolean(bomb && (bomb.isPenalty || (typeof bomb.points === 'number' && bomb.points < 0)));

      // Initialize extended fields if missing
      if (typeof gs.bombsBurst !== 'number') gs.bombsBurst = gs.crackersBurst || 0;
      if (typeof gs.combosAwarded !== 'number') gs.combosAwarded = 0;
      if (typeof gs.penaltyDeductions !== 'number') gs.penaltyDeductions = 0;
      if (typeof gs.comboBonusPoints !== 'number') gs.comboBonusPoints = 0;

      gs.crackersBurst += 1;
      gs.bombsBurst += 1;

      if (isPenalty) {
        // Penalty bomb (e.g. Black Bomb):
        // 1. Deduct points
        const penaltyAmount = Math.abs(points);
        gs.score = Math.max(0, gs.score - penaltyAmount);
        gs.penaltyDeductions += penaltyAmount;
        gs.lastDeltaPoints = -penaltyAmount;
        gs.lastDeltaLabel = `-${penaltyAmount}`;

        // 2. BREAK / RESET COMBO STREAK IMMEDIATELY
        comboRewardHitsRef.current = [];
      } else {
        // Eligible reward bomb:
        // 1. Add normal burst points
        gs.score = Math.max(0, gs.score + points);
        gs.lastDeltaPoints = points;
        gs.lastDeltaLabel = `+${points}`;

        // 2. Sliding combo window check (1.0 second = 1000 ms)
        const COMBO_WINDOW_MS = 1000;
        const validHits = comboRewardHitsRef.current.filter((t) => now - t <= COMBO_WINDOW_MS);
        validHits.push(now);

        if (validHits.length >= 3) {
          // Player burst 3 eligible reward bombs within 1 second -> Award +50 bonus!
          const COMBO_BONUS = 50;
          gs.score += COMBO_BONUS;
          gs.comboBonusPoints += COMBO_BONUS;
          gs.combosAwarded += 1;
          gs.comboCount = gs.combosAwarded;
          gs.lastDeltaPoints = points + COMBO_BONUS;
          gs.lastDeltaLabel = `+${points} (+50 COMBO!)`;

          // Clear combo window so same 3 bombs cannot re-trigger
          comboRewardHitsRef.current = [];

          // Trigger combo notification
          setComboNotice({
            id: Date.now() + Math.random(),
            comboCount: gs.combosAwarded,
            bonusPoints: COMBO_BONUS,
            message: 'COMBO x3  +50 BONUS',
          });

          if (comboNoticeTimeoutRef.current) {
            clearTimeout(comboNoticeTimeoutRef.current);
          }
          comboNoticeTimeoutRef.current = setTimeout(() => {
            setComboNotice(null);
          }, 1400);

          // Play configured combo celebration sound
          soundEngineRef.current.playComboSound();
        } else {
          comboRewardHitsRef.current = validHits;
        }
      }

      latestDataRef.current.gameScore = { ...gs };
      setGameScore({ ...gs });
    },
    []
  );

  const triggerBombBurstParticles = useCallback((x: number, y: number, color?: string) => {
    if (crackerEngineRef.current) {
      crackerEngineRef.current.createBombBurst(x, y, color);
    }
  }, []);

  const playBombBurstSound = useCallback((bomb: { soundPreset?: string; soundUrl?: string | null }) => {
    if (soundEngineRef.current) {
      soundEngineRef.current.playBombBurstSound(bomb);
    }
  }, []);

  const getLiveTrackedHands = useCallback(() => {
    return {
      left: latestDataRef.current.left,
      right: latestDataRef.current.right,
    };
  }, []);

  const clearComboNotice = useCallback(() => {
    setComboNotice(null);
  }, []);

  const playCountdownStep = useCallback((step: 3 | 2 | 1 | 'GO') => {
    soundEngineRef.current.playCountdownStep(step);
  }, []);

  const playSfx = useCallback((key: SfxKey, options?: { pitch?: number; vol?: number; pan?: number }) => {
    soundEngineRef.current.playSfx(key, options);
  }, []);

  const startBgm = useCallback(() => {
    soundEngineRef.current.startBgm();
  }, []);

  const stopBgm = useCallback(() => {
    soundEngineRef.current.stopBgm();
  }, []);

  const applyAudioSettings = useCallback((settings: GameAudioSettings) => {
    soundEngineRef.current.applyAudioSettings(settings);
  }, []);

  return {
    videoRef,
    canvasRef,
    isModelLoading,
    modelLoadingProgress,
    isCameraActive,
    cameraError,
    startCamera,
    stopCamera,
    leftHand,
    rightHand,
    getLiveTrackedHands,
    metrics,
    crackerStats,
    soundStats,
    gameScore,
    comboNotice,
    clearComboNotice,
    resetGameScore,
    recordBombTouch,
    triggerBombBurstParticles,
    playBombBurstSound,
    playCountdownBeep,
    playCountdownStep,
    playSfx,
    startBgm,
    stopBgm,
    applyAudioSettings,
    soundEngine: soundEngineRef.current,
    playGameOverFanfare,
    isCrackerModeActive,
    setIsCrackerModeActive,
    isGameplayActive,
    setIsGameplayActive,
    unlockAudio,
    toggleMute,
    setMasterVolume,
    setEffectVolume,
    setMusicVolume,
    playSound,
    resetStats,
  };
}
