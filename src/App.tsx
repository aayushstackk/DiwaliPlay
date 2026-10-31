/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useHandTracking } from './hooks/useHandTracking';
import { GameState } from './types/motion';
import { HandTargetBoxes } from './components/HandTargetBoxes';
import { CountdownOverlay } from './components/CountdownOverlay';
import { GameOverModal } from './components/GameOverModal';
import { PhotoCaptureModal } from './components/PhotoCaptureModal';
import { KioskStartupScreen } from './components/KioskStartupScreen';
import { SpinWheelModal } from './components/SpinWheelModal';
import { DiwaliWallpaper } from './components/DiwaliWallpaper';
import { BombGameOverlay } from './components/BombGameOverlay';
import { useBranding } from './hooks/useBranding';
import { GAME_DURATION_SECONDS, formatGameTimer } from './utils/scoreSystem';
import { Camera, Sparkles, AlertTriangle, Timer, Trophy, RotateCcw, Maximize2, Minimize2, Target } from 'lucide-react';
import { gameApi } from './services/api';
import { User, TRIAL_CODE, BombConfig, BombGameSettings, RewardItem, GameSession } from './types/backend';
import { DEFAULT_BOMB_CONFIGS, DEFAULT_BOMB_SETTINGS } from './utils/bombDefaults';

export default function App() {
  const branding = useBranding();
  const isTouchMode = branding.gameplayMode === 'touch';
  const isCameraMode = !isTouchMode;

  const {
    videoRef,
    canvasRef,
    isModelLoading,
    modelLoadingProgress,
    cameraError,
    startCamera,
    stopCamera,
    leftHand,
    rightHand,
    crackerStats,
    gameScore,
    comboNotice,
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
    playGameOverFanfare,
    isCrackerModeActive,
    setIsCrackerModeActive,
    isGameplayActive,
    setIsGameplayActive,
    unlockAudio,
    playSound,
    resetStats,
  } = useHandTracking({ enabled: isCameraMode });

  const [phase, setPhase] = useState<GameState>('IDLE');
  const [playerName, setPlayerName] = useState<string>('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 1
  const [countdownValue, setCountdownValue] = useState<number | 'GO!' | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(GAME_DURATION_SECONDS);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [bombConfigs, setBombConfigs] = useState<BombConfig[]>(DEFAULT_BOMB_CONFIGS);
  const [bombSettings, setBombSettings] = useState<BombGameSettings>(DEFAULT_BOMB_SETTINGS);
  const [isSpinWheelOpen, setIsSpinWheelOpen] = useState(false);
  const [earnedReward, setEarnedReward] = useState<GameSession['earnedReward'] | null>(null);
  const [rewardsEnabled, setRewardsEnabled] = useState(true);
  const activeSessionIdRef = useRef<string | null>(null);
  const isSessionCompletedRef = useRef<boolean>(false);
  const wasTargetAchievedRef = useRef<boolean>(false);

  // Time references for 1-second hands ready detection and precise 35s timer
  const bothHandsHoldStartRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameStartTimeRef = useRef<number | null>(null);
  const timerRafRef = useRef<number | null>(null);

  // Capture a still frame of the player from the active webcam feed for the souvenir card
  const captureWebcamSnapshot = (): string | null => {
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Keep photo orientation consistent with gameplay view (mirrored horizontally)
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (err) {
      console.warn('Graceful fallback: camera snapshot failed', err);
      return null;
    }
  };

  // Both hands detected in target area condition
  const bothHandsInTarget =
    leftHand.detected && leftHand.inTargetArea && rightHand.detected && rightHand.inTargetArea;

  // Gameplay tracking visuals mode: during PLAYING, show only sleek hand center markers
  useEffect(() => {
    const isPlaying = phase === 'PLAYING';
    setIsCrackerModeActive(isPlaying);
    setIsGameplayActive(isPlaying);
  }, [phase, setIsCrackerModeActive, setIsGameplayActive]);

  // Load Bomb Configurations & Game Settings from backend
  useEffect(() => {
    gameApi
      .getBombs()
      .then((res) => {
        if (res.success) {
          if (res.bombs && res.bombs.length > 0) {
            setBombConfigs(res.bombs);
          }
          if (res.settings) {
            setBombSettings(res.settings);
          }
        }
      })
      .catch((err) => {
        console.warn('Bomb config load note:', err);
      });

    gameApi
      .getRewards()
      .then((res) => {
        if (res.success) {
          setRewardsEnabled(res.enabled ?? true);
        }
      })
      .catch((err) => {
        console.warn('Rewards settings load note:', err);
      });
  }, [phase]);

  // Synchronize audio settings from branding / backend to SoundEngine
  useEffect(() => {
    if (branding.audioSettings) {
      applyAudioSettings(branding.audioSettings);
    }
  }, [branding.audioSettings, applyAudioSettings]);

  // Background Music Controller: Play during PLAYING phase, stop otherwise
  useEffect(() => {
    if (phase === 'PLAYING') {
      startBgm();
    } else {
      stopBgm();
    }
    return () => {
      stopBgm();
    };
  }, [phase, startBgm, stopBgm]);

  // 1-second hold detection logic for IDLE phase
  useEffect(() => {
    if (phase !== 'IDLE') return;

    // A valid verified player code is required to start a game round
    if (!activeCode || !currentUser) {
      bothHandsHoldStartRef.current = null;
      setHoldProgress(0);
      return;
    }

    if (bothHandsInTarget) {
      if (!bothHandsHoldStartRef.current) {
        bothHandsHoldStartRef.current = performance.now();
      }

      const interval = setInterval(() => {
        if (!bothHandsHoldStartRef.current) return;
        const elapsed = performance.now() - bothHandsHoldStartRef.current;
        const progress = Math.min(elapsed / 1000, 1);
        setHoldProgress(progress);

        if (progress >= 1) {
          clearInterval(interval);
          setPhase('READY');
          setTimeout(() => {
            startCountdownSequence();
          }, 350);
        }
      }, 50);

      return () => clearInterval(interval);
    } else {
      bothHandsHoldStartRef.current = null;
      setHoldProgress(0);
    }
  }, [bothHandsInTarget, phase, activeCode, currentUser]);

  // Countdown sequence: 3 -> 2 -> 1 -> GO! -> PLAYING (35s round)
  const startCountdownSequence = () => {
    setCountdownValue(3);
    setPhase('COUNTDOWN');
    playCountdownStep(3);

    let currentStep = 3;
    const stepInterval = setInterval(() => {
      currentStep -= 1;
      if (currentStep > 0) {
        setCountdownValue(currentStep);
        playCountdownStep(currentStep as 3 | 2 | 1);
      } else if (currentStep === 0) {
        setCountdownValue('GO!');
        playCountdownStep('GO');
      } else {
        clearInterval(stepInterval);
        setCountdownValue(null);
        resetGameScore();
        wasTargetAchievedRef.current = false;
        setIsCrackerModeActive(true);
        setRemainingSeconds(GAME_DURATION_SECONDS);
        gameStartTimeRef.current = performance.now();
        isSessionCompletedRef.current = false;
        setPhase('PLAYING');

        // Start backend session if player entered a valid code
        if (activeCode) {
          if (activeCode === TRIAL_CODE) {
            activeSessionIdRef.current = 'trial_session_8536';
            setActiveSessionId('trial_session_8536');
          } else {
            gameApi
              .startSession(activeCode, 'kiosk_main_65')
              .then((res) => {
                if (res.success && res.session) {
                  activeSessionIdRef.current = res.session.id;
                  setActiveSessionId(res.session.id);
                }
              })
              .catch((err) => {
                console.warn('Session start note:', err);
              });
          }
        }
      }
    }, 850);

    countdownTimerRef.current = stepInterval as unknown as NodeJS.Timeout;
  };

  // High-Precision 35-Second Game Timer based on performance.now()
  useEffect(() => {
    if (phase !== 'PLAYING') return;

    let rafId: number;
    const tick = () => {
      if (!gameStartTimeRef.current) return;
      const elapsed = (performance.now() - gameStartTimeRef.current) / 1000;
      const left = Math.max(0, GAME_DURATION_SECONDS - elapsed);
      setRemainingSeconds(left);

      if (left <= 0) {
        if (isSessionCompletedRef.current) return;
        isSessionCompletedRef.current = true;

        setIsCrackerModeActive(false);
        setIsGameplayActive(false);
        gameStartTimeRef.current = null;

        // Automatic photo capture countdown on Game Over in BOTH Touch Mode & Camera Mode
        setPhase('PHOTO_COUNTDOWN');
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    timerRafRef.current = rafId;

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [phase, setIsCrackerModeActive, setIsGameplayActive]);

  // Handler when photo capture countdown finishes, user snaps, or skips
  const handlePhotoCaptured = useCallback(
    (photo: string | null) => {
      setCapturedPhoto(photo);
      playSfx('game_over');

      // Persist session completion to backend with captured photo
      const currentTargetSession = activeSessionIdRef.current || activeSessionId;
      if (currentTargetSession) {
        gameApi
          .completeSession({
            sessionId: currentTargetSession,
            score: gameScore.score,
            crackerCount: gameScore.crackersBurst,
            maxSpeed: gameScore.maxSpeed,
            comboCount: gameScore.combosAwarded ?? gameScore.comboCount,
            punchCount: gameScore.punchCount,
            photoData: photo || undefined,
            combosCount: gameScore.combosAwarded ?? gameScore.comboCount,
            penaltyDeductions: gameScore.penaltyDeductions ?? 0,
            comboBonusPoints: gameScore.comboBonusPoints ?? 0,
            targetScore: branding.targetScoreEnabled ? branding.targetScore : undefined,
            targetAchieved: branding.targetScoreEnabled ? (gameScore.score >= branding.targetScore) : undefined,
          })
          .then((res) => {
            if (res.success && res.session?.earnedReward) {
              setEarnedReward(res.session.earnedReward);
            }
          })
          .catch((err) => {
            console.warn('Session complete note:', err);
          });
      }

      setPhase('GAME_OVER');
    },
    [playSfx, activeSessionId, gameScore, branding]
  );

  const handlePlayTick = useCallback(() => {
    playCountdownStep(1);
  }, [playCountdownStep]);

  const handlePlayCapture = useCallback(() => {
    playSfx('photo_shutter');
  }, [playSfx]);

  // Restart / Return to Home Handler: Cleans state completely for the next player
  const handleResetToHome = useCallback(() => {
    setEarnedReward(null);
    setIsSpinWheelOpen(false);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (timerRafRef.current) {
      cancelAnimationFrame(timerRafRef.current);
      timerRafRef.current = null;
    }
    gameStartTimeRef.current = null;
    bothHandsHoldStartRef.current = null;
    activeSessionIdRef.current = null;
    isSessionCompletedRef.current = false;
    wasTargetAchievedRef.current = false;
    setHoldProgress(0);
    setCountdownValue(null);
    setRemainingSeconds(GAME_DURATION_SECONDS);
    setCapturedPhoto(null);
    resetStats();
    resetGameScore();
    setIsCrackerModeActive(false);
    stopBgm();

    // Stop webcam stream completely
    stopCamera();

    // Completely wipe player, code, and session for next player
    setActiveCode(null);
    setCurrentUser(null);
    setActiveSessionId(null);
    setPlayerName('');

    setPhase('IDLE');
    branding.advanceWallpaper();
  }, [stopCamera, stopBgm, resetStats, resetGameScore, setIsCrackerModeActive, branding]);

  // Live condition: Target Achieved popup is visible whenever currentScore >= targetScore
  const showTargetAchievedPopup =
    phase === 'PLAYING' &&
    Boolean(
      branding.targetScoreEnabled &&
      branding.targetScore > 0 &&
      gameScore.score >= branding.targetScore
    );

  // Target Achieved Celebration Sound & Particles: triggers whenever score reaches target
  useEffect(() => {
    if (showTargetAchievedPopup) {
      if (!wasTargetAchievedRef.current) {
        playSound('MEGA_BLAST');
        triggerBombBurstParticles(
          typeof window !== 'undefined' ? window.innerWidth / 2 : 640,
          typeof window !== 'undefined' ? window.innerHeight * 0.35 : 250,
          '#F59E0B'
        );
      }
      wasTargetAchievedRef.current = true;
    } else {
      wasTargetAchievedRef.current = false;
    }
  }, [showTargetAchievedPopup, playSound, triggerBombBurstParticles]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const isKioskStartup = !activeCode || !currentUser;
  const brandDisplayName = branding.brandName ? branding.brandName.toUpperCase() : 'ITSSPOTLIGHT';
  const isWallpaperEnabled = branding.wallpaperEnabled !== false;
  const isCameraPreviewVisible =
    !isKioskStartup &&
    (
      // When Camera Feed ("OFF - Live Camera Background") is selected, show camera feed during countdown, playing, and game-over
      (!isWallpaperEnabled && (phase === 'PLAYING' || phase === 'COUNTDOWN' || phase === 'GAME_OVER')) ||
      // In Camera Interactive Mode, show camera during calibration and countdown
      (isCameraMode && (phase === 'IDLE' || phase === 'READY' || phase === 'COUNTDOWN'))
    );
  const isWallpaperVisible =
    !isKioskStartup &&
    isWallpaperEnabled &&
    (phase === 'PLAYING' ||
      phase === 'GAME_OVER' ||
      phase === 'PHOTO_COUNTDOWN' ||
      (isTouchMode && phase === 'COUNTDOWN'));

  // Ensure camera stream is started whenever live camera background is required in Touch Mode
  useEffect(() => {
    if (!isKioskStartup && isTouchMode && !isWallpaperEnabled && (phase === 'COUNTDOWN' || phase === 'PLAYING')) {
      if (!videoRef.current?.srcObject) {
        startCamera().catch((err) => {
          console.warn('Touch camera background auto-start notice:', err);
        });
      }
    }
  }, [isKioskStartup, isTouchMode, isWallpaperEnabled, phase, startCamera]);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#0A0713] text-neutral-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif] select-none">
      {/* KIOSK START SCREEN: Full-screen registration & 4-digit code entry overlay */}
      {isKioskStartup && (
        <div className="fixed inset-0 z-50 bg-[#0A0713]">
          <KioskStartupScreen
            onCodeVerified={async (user, code, session) => {
              setCurrentUser(user);
              setActiveCode(code);
              setPlayerName(user.name);
              if (session?.id) {
                activeSessionIdRef.current = session.id;
                setActiveSessionId(session.id);
              } else if (code === TRIAL_CODE) {
                activeSessionIdRef.current = 'trial_session_8536';
                setActiveSessionId('trial_session_8536');
              } else {
                activeSessionIdRef.current = null;
                setActiveSessionId(null);
              }
              await unlockAudio();

              if (isTouchMode) {
                // Touch Gameplay Mode: If live camera background is selected, start camera feed
                if (!isWallpaperEnabled) {
                  try {
                    await startCamera();
                  } catch (err) {
                    console.warn('Touch Mode camera start note:', err);
                  }
                }
                // Skip calibration, go directly to countdown!
                startCountdownSequence();
              } else {
                // Camera Interactive Mode: Start camera and enter calibration
                setPhase('IDLE');
                await startCamera();
              }
            }}
            onPlayChime={() => playSound('CHAKRI')}
            rewardsEnabled={rewardsEnabled}
            onOpenSpinWheel={() => setIsSpinWheelOpen(true)}
          />
        </div>
      )}

      {/* Admin Configured Wallpaper: shown during gameplay/game-over */}
      {isWallpaperVisible && (
        <DiwaliWallpaper
          wallpaperUrl={branding.currentWallpaperUrl}
          opacity={branding.wallpaperOpacity}
        />
      )}

      {/* Camera Live Preview: visible during hand alignment & countdown, and also during gameplay when wallpaper is OFF (AR Mode) */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className={
          isCameraPreviewVisible
            ? 'fixed inset-0 w-full h-full object-cover -scale-x-100 z-0 pointer-events-none transition-opacity duration-300 opacity-100'
            : 'fixed inset-0 w-full h-full object-cover -scale-x-100 opacity-0 pointer-events-none -z-50 transition-opacity duration-300'
        }
      />

      {/* Contrast vignette over live camera preview */}
      {isCameraPreviewVisible && (
        <div
          className={`fixed inset-0 pointer-events-none z-0 ${
            phase === 'PLAYING' || phase === 'GAME_OVER'
              ? 'bg-gradient-to-b from-neutral-950/40 via-transparent to-neutral-950/40'
              : 'bg-gradient-to-b from-neutral-950/70 via-transparent to-neutral-950/60'
          }`}
        />
      )}

      {/* Fullscreen Canvas for Hand Trails, Sparks & Cracker Explosions */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Colourful Bomb Touch Game Layer: Active bombs, touch/hand collision & burst animations */}
      {!isKioskStartup && phase === 'PLAYING' && (
        <BombGameOverlay
          isActive={phase === 'PLAYING'}
          leftHand={leftHand}
          rightHand={rightHand}
          bombConfigs={bombConfigs}
          settings={bombSettings}
          isTouchMode={isTouchMode}
          onBombTouch={(bomb) => {
            recordBombTouch(bomb.points, bomb);
          }}
          onPlayBurstSound={(bomb) => {
            playBombBurstSound(bomb);
          }}
          onTriggerParticles={(x, y, color) => {
            triggerBombBurstParticles(x, y, color);
          }}
        />
      )}

      {/* Top Essential Header Bar */}
      {!isKioskStartup && (
        <header className="fixed top-0 inset-x-0 z-30 pointer-events-none flex items-center justify-between px-4 sm:px-8 py-3 sm:py-5">
          {/* Top Branding: Line 1 + Line 2 + Line 3 */}
          <div className="flex items-center gap-2 sm:gap-3 bg-neutral-950/70 backdrop-blur-md px-3.5 py-1.5 sm:px-5 sm:py-2.5 rounded-2xl border border-amber-500/30 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 animate-pulse flex-shrink-0" />
            <div className="flex items-baseline gap-1.5 sm:gap-2">
              <span className="font-['Cinzel',serif] font-black text-amber-200 text-sm sm:text-lg md:text-xl tracking-wider drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]">
                {branding.experienceTitle || 'DIWALI FUN PLAY'}
              </span>
              <span className="text-[11px] sm:text-xs font-bold text-amber-400/90 tracking-wide uppercase">
                {branding.connectorText ? `${branding.connectorText} ` : ''}{brandDisplayName}
              </span>
            </div>
          </div>

          {/* In-Game Stats: Timer & Score during PLAYING */}
          {phase === 'PLAYING' && (
            <div className="flex flex-col items-end gap-1.5 sm:gap-2">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Remaining Game Timer */}
                <div
                  className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2.5 rounded-2xl backdrop-blur-md border transition-all duration-200 shadow-[0_4px_25px_rgba(0,0,0,0.6)] ${
                    remainingSeconds <= 10
                      ? 'bg-rose-950/85 border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.5)] animate-pulse'
                      : 'bg-neutral-950/70 border-amber-500/35 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                  }`}
                >
                  <Timer
                    className={`w-4 h-4 sm:w-5 sm:h-5 ${
                      remainingSeconds <= 10 ? 'text-rose-400' : 'text-amber-400'
                    }`}
                  />
                  <span
                    className={`font-mono font-black text-base sm:text-2xl tracking-wider ${
                      remainingSeconds <= 10
                        ? 'text-rose-200 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                        : 'text-amber-100 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                    }`}
                  >
                    {formatGameTimer(remainingSeconds)}
                  </span>
                </div>

                {/* Current Score */}
                <div className="flex items-center gap-2 bg-neutral-950/70 backdrop-blur-md px-3.5 py-1.5 sm:px-4 sm:py-2.5 rounded-2xl border border-amber-500/35 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] sm:text-xs font-mono font-bold text-neutral-400 uppercase">
                      SCORE
                    </span>
                    <span className="font-mono font-black text-base sm:text-2xl text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]">
                      {gameScore.score.toLocaleString()}
                    </span>
                  </div>

                  {/* Combo Count Badge in HUD */}
                  {(gameScore.combosAwarded ?? 0) > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-neutral-950 uppercase shadow-[0_0_10px_rgba(245,158,11,0.4)] animate-in fade-in">
                      {gameScore.combosAwarded} {gameScore.combosAwarded === 1 ? 'COMBO' : 'COMBOS'}
                    </span>
                  )}
                </div>
              </div>

              {/* Target Score Progress Bar: ONLY rendered when Target Score is enabled */}
              {branding.targetScoreEnabled && branding.targetScore > 0 && (
                <div className="w-full max-w-[280px] sm:max-w-[340px] bg-neutral-950/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-amber-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.6)] flex flex-col gap-1 pointer-events-auto">
                  <div className="flex items-center justify-between text-[10.5px] sm:text-[11px] font-mono">
                    <div className="flex items-center gap-1 text-amber-300 font-bold">
                      <Target className="w-3.5 h-3.5 text-amber-400" />
                      <span>TARGET GOAL</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-200 font-bold">
                        {gameScore.score.toLocaleString()} / {branding.targetScore.toLocaleString()}
                      </span>
                      <span
                        className={`font-black text-[10px] px-1.5 py-0.2 rounded ${
                          gameScore.score >= branding.targetScore
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {Math.min(100, Math.round((gameScore.score / branding.targetScore) * 100))}%
                      </span>
                    </div>
                  </div>

                  {/* Slim animated progress bar capped at 100% */}
                  <div className="w-full h-2 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-300 ease-out rounded-full ${
                        gameScore.score >= branding.targetScore
                          ? 'bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]'
                          : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(0, Math.round((gameScore.score / branding.targetScore) * 100)))}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtle Change Code / Fullscreen controls (visible during IDLE) */}
          {phase === 'IDLE' && (
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                onClick={handleResetToHome}
                title="Change Player / Code"
                className="px-3 py-1.5 rounded-xl bg-neutral-950/70 hover:bg-neutral-900 border border-neutral-700/60 text-neutral-300 hover:text-white text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-md shadow-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Change Code</span>
              </button>
              <button
                onClick={toggleFullscreen}
                title="Toggle Fullscreen"
                className="p-2 rounded-xl bg-neutral-950/70 hover:bg-neutral-900 border border-neutral-700/60 text-neutral-300 hover:text-white transition-all cursor-pointer backdrop-blur-md shadow-lg"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          )}
        </header>
      )}

      {/* Vision Model Loading Overlay (Only in Camera Mode) */}
      {!isKioskStartup && isCameraMode && isModelLoading && (
        <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-40">
          <div className="relative flex items-center justify-center w-16 h-16 mb-4">
            <div className="w-16 h-16 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
            <Sparkles className="w-6 h-6 text-amber-400 absolute" />
          </div>
          <h2 className="text-lg font-bold text-amber-200 font-['Cinzel',serif] tracking-wider mb-1">
            INITIALIZING VISION ENGINE
          </h2>
          <p className="text-xs font-mono text-amber-400/80 max-w-sm">
            {modelLoadingProgress}
          </p>
        </div>
      )}

      {/* Camera Access Error Overlay (Only in Camera Mode) */}
      {!isKioskStartup && isCameraMode && !isModelLoading && cameraError && (
        <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-40">
          <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-3">
            <AlertTriangle className="w-7 h-7 text-rose-400" />
          </div>
          <h2 className="text-lg font-bold text-rose-200 tracking-wider mb-2">
            CAMERA ACCESS REQUIRED
          </h2>
          <p className="text-xs sm:text-sm text-neutral-300 max-w-md mb-5 leading-relaxed">
            {cameraError}
          </p>
          <div className="flex gap-3">
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-[0_0_20px_rgba(245,158,11,0.4)] cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Grant & Start Camera</span>
            </button>
            <button
              onClick={handleResetToHome}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg transition-all cursor-pointer"
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Hand Alignment Target Zones (IDLE / READY) (Only in Camera Mode) */}
      {!isKioskStartup && isCameraMode && (phase === 'IDLE' || phase === 'READY') && (
        <HandTargetBoxes
          leftHand={leftHand}
          rightHand={rightHand}
          holdProgress={holdProgress}
          isReady={phase === 'READY'}
        />
      )}

      {/* Countdown Overlay (3, 2, 1, GO!) */}
      {!isKioskStartup && phase === 'COUNTDOWN' && countdownValue !== null && (
        <CountdownOverlay countdownValue={countdownValue} />
      )}

      {/* 3-Bomb Combo Bonus Notification Banner */}
      {comboNotice && (
        <div className="fixed top-36 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-in fade-in zoom-in duration-200 flex flex-col items-center">
          <div className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 border border-yellow-200 shadow-[0_0_40px_rgba(251,191,36,0.9)] text-neutral-950 font-black font-mono tracking-wider text-sm sm:text-base flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <span>COMBO x3 &nbsp;+50 BONUS!</span>
            <span className="text-lg">💥</span>
          </div>
        </div>
      )}

      {/* Target-Achieved Celebratory Non-Blocking Overlay */}
      {showTargetAchievedPopup && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
          <div className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-neutral-950/95 via-amber-950/90 to-neutral-950/95 border-2 border-amber-400 shadow-[0_0_50px_rgba(245,158,11,0.7)] backdrop-blur-md flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(245,158,11,0.6)]">
              🎯
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-black font-['Cinzel',serif] tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-200 drop-shadow-[0_0_14px_rgba(251,191,36,0.9)]">
                TARGET ACHIEVED!
              </span>
              <span className="text-xs font-mono font-bold text-amber-200/95 tracking-wide">
                {branding.targetScore.toLocaleString()} POINTS REACHED 🎆
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Automatic Game-Over Photo Countdown Modal (Touch & Camera Modes) */}
      {!isKioskStartup && phase === 'PHOTO_COUNTDOWN' && (
        <PhotoCaptureModal
          playerName={playerName}
          existingStream={(videoRef.current?.srcObject as MediaStream) || null}
          onPhotoCaptured={handlePhotoCaptured}
          onPlayTick={handlePlayTick}
          onPlayCapture={handlePlayCapture}
        />
      )}

      {/* Game Over Modal */}
      {!isKioskStartup && phase === 'GAME_OVER' && (
        <GameOverModal
          scoreState={gameScore}
          playerName={playerName}
          brandName={branding.brandName}
          capturedPhoto={capturedPhoto}
          onPlayAgain={handleResetToHome}
          onClose={handleResetToHome}
          onUpdatePlayerName={(name) => setPlayerName(name)}
          onPlayChime={() => playSound('FLOWER_POT')}
          sessionId={activeSessionIdRef.current || activeSessionId}
          isTrial={activeCode === TRIAL_CODE || (activeSessionIdRef.current?.startsWith('trial_') ?? false)}
          targetScoreEnabled={branding.targetScoreEnabled}
          targetScore={branding.targetScore}
          achievementTiers={branding.achievementTiers}
          earnedReward={earnedReward}
          rewardsEnabled={rewardsEnabled}
          onOpenSpinWheel={() => setIsSpinWheelOpen(true)}
          mobileNumber={currentUser?.mobileNumber || ''}
        />
      )}

      {/* Lucky Spin Wheel Modal */}
      {isSpinWheelOpen && (
        <SpinWheelModal
          isOpen={isSpinWheelOpen}
          onClose={() => setIsSpinWheelOpen(false)}
          playerName={playerName || currentUser?.name || 'Player'}
          mobileNumber={currentUser?.mobileNumber || ''}
          sessionId={activeSessionIdRef.current || activeSessionId}
        />
      )}
    </div>
  );
}
