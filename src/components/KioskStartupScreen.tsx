/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Delete, Check, Gift } from 'lucide-react';
import { gameApi } from '../services/api';
import { User, GameSession } from '../types/backend';
import { QrCodeSvg } from './QrCodeSvg';
import { BrandingBlock } from './BrandingBlock';

interface KioskStartupScreenProps {
  onCodeVerified: (user: User, code: string, session?: GameSession) => void;
  onPlayChime?: () => void;
  rewardsEnabled?: boolean;
  onOpenSpinWheel?: () => void;
}

export const KioskStartupScreen: React.FC<KioskStartupScreenProps> = ({
  onCodeVerified,
  onPlayChime,
  rewardsEnabled = true,
  onOpenSpinWheel
}) => {
  const [digits, setDigits] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUser, setSuccessUser] = useState<User | null>(null);
  const [registrationUrl, setRegistrationUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/register`;
      setRegistrationUrl(url);
    }
  }, []);

  const verifyCode = useCallback(async (codeStr: string) => {
    if (codeStr.length !== 4 || isVerifying) return;
    try {
      setIsVerifying(true);
      setError(null);

      const res = await gameApi.verifyKioskCode(codeStr);

      if (res.success && res.valid && res.user) {
        setSuccessUser(res.user);
        if (onPlayChime) onPlayChime();

        setTimeout(() => {
          onCodeVerified(res.user!, codeStr, res.session);
        }, 800);
      } else {
        setError(res.message || 'Invalid 4-digit code');
        setDigits([]);
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Invalid 4-digit code';
      setError(msg);
      setDigits([]);
    } finally {
      setIsVerifying(false);
    }
  }, [isVerifying, onCodeVerified, onPlayChime]);

  const handleDigitTap = useCallback((digit: string) => {
    if (digits.length >= 4 || isVerifying || successUser) return;
    setError(null);
    const newDigits = [...digits, digit];
    setDigits(newDigits);
  }, [digits, isVerifying, successUser]);

  const handleDeleteTap = useCallback(() => {
    if (digits.length === 0 || isVerifying || successUser) return;
    setError(null);
    setDigits((prev) => prev.slice(0, prev.length - 1));
  }, [digits, isVerifying, successUser]);

  const handleClearTap = useCallback(() => {
    if (isVerifying || successUser) return;
    setError(null);
    setDigits([]);
  }, [isVerifying, successUser]);

  const handlePlayClick = useCallback(() => {
    if (digits.length === 4) {
      verifyCode(digits.join(''));
    }
  }, [digits, verifyCode]);

  // Support physical keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isVerifying || successUser) return;
      if (e.key >= '0' && e.key <= '9') {
        handleDigitTap(e.key);
      } else if (e.key === 'Backspace') {
        handleDeleteTap();
      } else if (e.key === 'Escape') {
        handleClearTap();
      } else if (e.key === 'Enter') {
        if (digits.length === 4) {
          verifyCode(digits.join(''));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigitTap, handleDeleteTap, handleClearTap, verifyCode, digits, isVerifying, successUser]);

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#0A0713] text-neutral-100 flex flex-col justify-between p-3 sm:p-5 select-none font-['Plus_Jakarta_Sans',sans-serif] relative">
      {/* Festive Background Ambient Lighting */}
      <div className="absolute top-0 left-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-orange-600/10 rounded-full blur-[130px] pointer-events-none" />

      {/* TOP HEADER: EXACTLY 3-LINE BRANDING BLOCK */}
      <header className="w-full max-w-5xl mx-auto text-center z-10 shrink-0 pt-1 relative">
        <BrandingBlock size="kiosk" />

        {/* Spin & Win Floating Pill */}
        {rewardsEnabled && onOpenSpinWheel && (
          <div className="absolute right-0 top-1 hidden sm:flex items-center">
            <button
              type="button"
              onClick={onOpenSpinWheel}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.5)] border border-amber-300 transition-transform active:scale-95 cursor-pointer"
            >
              <Gift className="w-4 h-4 text-neutral-950 animate-bounce" />
              <span>Spin & Win</span>
            </button>
          </div>
        )}
      </header>

      {/* MAIN VIEWPORT-FITTING HUB (Zero Scroll) */}
      <main className="w-full max-w-5xl mx-auto my-auto z-10 py-1 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 items-center max-h-[82vh]">
          {/* LEFT: QR CODE SECTION */}
          <div className="flex flex-col items-center justify-center text-center p-4 sm:p-6 rounded-3xl bg-neutral-900/80 border border-amber-500/30 backdrop-blur-md shadow-[0_0_40px_rgba(245,158,11,0.15)]">
            <h2 className="text-xl sm:text-2xl font-bold text-amber-100 font-['Cinzel',serif] tracking-wider mb-3">
              SCAN TO PLAY
            </h2>

            {/* QR CODE */}
            <div className="p-3.5 bg-white/5 border border-amber-500/30 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.2)] flex items-center justify-center">
              {registrationUrl ? (
                <QrCodeSvg url={registrationUrl} size={175} />
              ) : (
                <div className="w-[175px] h-[175px] bg-neutral-950 rounded-xl flex items-center justify-center text-xs text-neutral-500 font-mono">
                  Loading QR...
                </div>
              )}
            </div>

            {/* ✨ FREE TO PLAY ✨ */}
            <div className="mt-4 px-6 py-2 rounded-full bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border-2 border-amber-400 text-amber-200 font-extrabold text-sm sm:text-base tracking-widest uppercase shadow-[0_0_25px_rgba(245,158,11,0.35)] animate-pulse">
              ✨ FREE TO PLAY ✨
            </div>
          </div>

          {/* RIGHT: CODE ENTRY & TOUCHSCREEN KEYPAD */}
          <div className="flex flex-col items-center justify-center p-4 sm:p-6 rounded-3xl bg-neutral-900/90 border border-amber-500/35 backdrop-blur-md shadow-[0_0_45px_rgba(245,158,11,0.15)] w-full">
            <h2 className="text-xl sm:text-2xl font-bold text-amber-100 font-['Cinzel',serif] tracking-wider mb-2">
              ENTER YOUR CODE
            </h2>

            {/* Error or Success Notice */}
            {error && (
              <div className="w-full max-w-xs mb-2 py-1.5 px-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 text-xs font-bold text-center animate-in fade-in">
                {error}
              </div>
            )}

            {successUser && (
              <div className="w-full max-w-xs mb-2 py-1.5 px-3 rounded-xl bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-1.5 animate-pulse">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Welcome, {successUser.name}! Starting...</span>
              </div>
            )}

            {/* 4 CODE BOXES */}
            <div className="mb-3 flex items-center justify-center gap-2.5 sm:gap-3.5">
              {[0, 1, 2, 3].map((idx) => {
                const val = digits[idx] || '';
                const isFilled = digits.length > idx;
                const isCurrent = digits.length === idx;

                return (
                  <div
                    key={idx}
                    className={`w-12 h-14 sm:w-14 sm:h-16 rounded-xl flex items-center justify-center font-mono text-2xl sm:text-3xl font-black transition-all ${
                      successUser
                        ? 'bg-emerald-950/90 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.5)]'
                        : isFilled
                        ? 'bg-neutral-950 border-2 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                        : isCurrent
                        ? 'bg-neutral-950 border-2 border-amber-500/90 text-amber-400 animate-pulse'
                        : 'bg-neutral-950/80 border border-neutral-700 text-neutral-600'
                    }`}
                  >
                    {val || '—'}
                  </div>
                );
              })}
            </div>

            {/* NUMERIC KEYPAD */}
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full max-w-[280px] sm:max-w-[300px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={isVerifying || !!successUser}
                  onClick={() => handleDigitTap(num)}
                  className="h-10 sm:h-11 rounded-xl bg-neutral-950/80 hover:bg-neutral-800 border border-amber-500/25 hover:border-amber-400 text-neutral-100 hover:text-amber-300 font-mono text-xl font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-40"
                >
                  {num}
                </button>
              ))}

              {/* CLEAR */}
              <button
                type="button"
                disabled={isVerifying || !!successUser || digits.length === 0}
                onClick={handleClearTap}
                className="h-10 sm:h-11 rounded-xl bg-neutral-950/60 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 font-mono text-xs font-bold tracking-wider uppercase transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-30"
              >
                CLEAR
              </button>

              {/* ZERO */}
              <button
                type="button"
                disabled={isVerifying || !!successUser}
                onClick={() => handleDigitTap('0')}
                className="h-10 sm:h-11 rounded-xl bg-neutral-950/80 hover:bg-neutral-800 border border-amber-500/25 hover:border-amber-400 text-neutral-100 hover:text-amber-300 font-mono text-xl font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-40"
              >
                0
              </button>

              {/* BACKSPACE */}
              <button
                type="button"
                disabled={isVerifying || !!successUser || digits.length === 0}
                onClick={handleDeleteTap}
                className="h-10 sm:h-11 rounded-xl bg-neutral-950/60 hover:bg-neutral-800 border border-neutral-800 text-amber-400 hover:text-amber-300 transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-30"
                aria-label="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* [ PLAY ] BUTTON */}
            <div className="w-full max-w-[280px] sm:max-w-[300px] mt-3">
              <button
                type="button"
                disabled={digits.length !== 4 || isVerifying || !!successUser}
                onClick={handlePlayClick}
                className="w-full h-11 sm:h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-neutral-950 font-bold font-['Cinzel',serif] text-sm tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(245,158,11,0.35)] disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95"
              >
                {isVerifying ? (
                  <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>PLAY</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* COMPACT FOOTER (Clean, No Extra Text) */}
      <footer className="w-full max-w-5xl mx-auto text-center z-10 pb-1 shrink-0">
        <span className="text-[10px] text-neutral-500 font-mono">
          Free Diwali Fun Play · Kiosk Experience
        </span>
      </footer>
    </div>
  );
};
