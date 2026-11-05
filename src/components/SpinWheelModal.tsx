/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RewardItem } from '../types/backend';
import { gameApi } from '../services/api';
import {
  X,
  Gift,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import { resolveAssetUrl } from '../utils/assetUrl';
import { SpinWheel, parseVoucherTitle } from './SpinWheel';

interface SpinWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName?: string;
  mobileNumber?: string;
  sessionId?: string | null;
  isTestMode?: boolean;
  onRewardWon?: (reward: RewardItem) => void;
}

/** The admin panel's live wheel preview. Players spin on the game-over screen instead. */
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
  const [winningReward, setWinningReward] = useState<RewardItem | null>(null);
  const [showPrizeModal, setShowPrizeModal] = useState(false);

  // Master OTP Testing Session detection (unlimited spins)
  const isMasterSession = Boolean(
    isTestMode ||
    (typeof window !== 'undefined' && sessionStorage.getItem('diwali_master_otp') === 'true') ||
    (sessionId?.startsWith('trial_'))
  );

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

  const handleSpinStart = useCallback(() => {
    setIsSpinning(true);
    setWinningReward(null);
    setShowPrizeModal(false);
    setErrorMessage(null);
  }, []);

  const handleSpinWon = useCallback((reward: RewardItem) => {
    setIsSpinning(false);
    setWinningReward(reward);
    onRewardWon?.(reward);

    // Open winning popup smoothly
    setTimeout(() => {
      setShowPrizeModal(true);
    }, 300);
  }, [onRewardWon]);

  const handleSpinFailed = useCallback((message: string) => {
    setIsSpinning(false);
    setErrorMessage(message);
  }, []);

  if (!isOpen) return null;

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
          <div
            className="relative my-3"
            style={{ width: '320px', height: '320px', maxWidth: '82vw', maxHeight: '82vw' }}
          >
            <SpinWheel
              rewards={rewards}
              playerName={playerName}
              mobileNumber={mobileNumber}
              sessionId={sessionId}
              isMaster={isMasterSession}
              onSpinStart={handleSpinStart}
              onSpinWon={handleSpinWon}
              onSpinFailed={handleSpinFailed}
            />
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