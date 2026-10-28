/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, QrCode, Sparkles, Check, AlertCircle, Delete, KeyRound, Flame } from 'lucide-react';
import { gameApi } from '../services/api';
import { User } from '../types/backend';
import { QrCodeSvg } from './QrCodeSvg';

interface KioskCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCodeVerified: (user: User, code: string) => void;
  onPlayChime?: () => void;
}

export const KioskCodeModal: React.FC<KioskCodeModalProps> = ({
  isOpen,
  onClose,
  onCodeVerified,
  onPlayChime
}) => {
  const [digits, setDigits] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUser, setSuccessUser] = useState<User | null>(null);

  // Dynamic registration URL for mobile phone camera scanning
  const [registrationUrl, setRegistrationUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/register`;
      setRegistrationUrl(url);
    }
  }, []);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setDigits([]);
      setError(null);
      setSuccessUser(null);
      setIsVerifying(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle number pad tap (large touch-friendly 65-inch buttons)
  const handleDigitTap = (digit: string) => {
    if (digits.length >= 4 || isVerifying || successUser) return;
    setError(null);
    const newDigits = [...digits, digit];
    setDigits(newDigits);

    // Auto-verify as soon as 4th digit is entered
    if (newDigits.length === 4) {
      verifyCode(newDigits.join(''));
    }
  };

  const handleDeleteTap = () => {
    if (digits.length === 0 || isVerifying || successUser) return;
    setError(null);
    setDigits((prev) => prev.slice(0, prev.length - 1));
  };

  const handleClearTap = () => {
    if (isVerifying || successUser) return;
    setError(null);
    setDigits([]);
  };

  // Verify entered 4-digit code
  const verifyCode = async (codeStr: string) => {
    try {
      setIsVerifying(true);
      setError(null);

      const res = await gameApi.verifyKioskCode(codeStr);

      if (res.success && res.valid && res.user) {
        setSuccessUser(res.user);
        if (onPlayChime) onPlayChime();

        // Brief pleasant visual confirmation then launch into ready state
        setTimeout(() => {
          onCodeVerified(res.user!, codeStr);
        }, 1100);
      } else {
        setError(res.message || 'Invalid or expired 4-digit code. Please check or register again.');
        setDigits([]);
      }
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Verification failed. Please try again.');
      setDigits([]);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-200">
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-[#0F0B1A] border-2 border-amber-500/40 rounded-3xl shadow-[0_0_80px_rgba(245,158,11,0.25)] flex flex-col md:flex-row overflow-hidden max-h-[92dvh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-11 h-11 rounded-full bg-neutral-900/80 border border-neutral-700 hover:border-amber-400 text-neutral-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* LEFT PANEL: QR SCAN FOR MOBILE REGISTRATION */}
        <div className="w-full md:w-5/12 bg-neutral-950/70 border-b md:border-b-0 md:border-r border-amber-500/20 p-6 sm:p-8 flex flex-col items-center justify-between text-center">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider mb-3">
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span>Step 1 · Mobile Pass</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-amber-100 font-['Cinzel',serif]">
              SCAN TO REGISTER
            </h3>
            <p className="text-xs text-amber-200/60 mt-1 max-w-xs">
              Scan with your mobile camera to get your unique 4-digit entry pass instantly.
            </p>
          </div>

          {/* QR CODE PREVIEW */}
          <div className="my-5 flex flex-col items-center">
            {registrationUrl ? (
              <QrCodeSvg url={registrationUrl} size={180} />
            ) : (
              <div className="w-48 h-48 bg-neutral-900 rounded-xl flex items-center justify-center text-xs text-neutral-500">
                Generating QR...
              </div>
            )}
            <span className="text-[11px] font-mono text-amber-300/80 mt-3 font-semibold tracking-wider">
              Scan with any Smartphone Camera
            </span>
          </div>

          {/* Direct Link Info */}
          <div className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl p-2.5 text-[11px] font-mono text-neutral-400 flex items-center justify-between">
            <span className="truncate">URL: /register</span>
            <span className="text-amber-400 font-bold shrink-0">INSTANT</span>
          </div>
        </div>

        {/* RIGHT PANEL: TOUCHSCREEN 4-DIGIT PIN ENTRY */}
        <div className="w-full md:w-7/12 p-6 sm:p-8 flex flex-col justify-between bg-gradient-to-b from-[#140E24] to-[#0A0713]">
          {/* Header */}
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider mb-2">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>Step 2 · Enter Code</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-amber-100 font-['Cinzel',serif]">
              ENTER 4-DIGIT GAME CODE
            </h2>
            <p className="text-xs text-amber-200/70 mt-0.5">
              Type the 4-digit code shown on your phone screen:
            </p>
          </div>

          {/* STATUS NOTICES */}
          {error && (
            <div className="my-2.5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successUser && (
            <div className="my-2.5 p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/50 text-emerald-300 text-xs flex items-center gap-2 animate-pulse">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-bold">
                Welcome, {successUser.name}! Code verified. Preparing fun play...
              </span>
            </div>
          )}

          {/* 4-DIGIT PIN BOXES DISPLAY */}
          <div className="my-4 flex items-center justify-center gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((idx) => {
              const val = digits[idx] || '';
              const isFilled = digits.length > idx;
              const isCurrent = digits.length === idx;

              return (
                <div
                  key={idx}
                  className={`w-14 h-16 sm:w-16 sm:h-20 rounded-2xl flex items-center justify-center font-mono text-3xl sm:text-4xl font-extrabold transition-all duration-150 ${
                    successUser
                      ? 'bg-emerald-950/80 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                      : isFilled
                      ? 'bg-neutral-900 border-2 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                      : isCurrent
                      ? 'bg-neutral-950 border-2 border-amber-500/80 text-neutral-400 animate-pulse'
                      : 'bg-neutral-950/80 border border-neutral-700 text-neutral-600'
                  }`}
                >
                  {val || '•'}
                </div>
              );
            })}
          </div>

          {/* 65-INCH TOUCHSCREEN OPTIMIZED KEYPAD */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 max-w-sm mx-auto w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                disabled={isVerifying || !!successUser}
                onClick={() => handleDigitTap(num)}
                className="h-13 sm:h-14 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 border border-amber-500/20 hover:border-amber-400 text-neutral-100 hover:text-amber-300 font-mono text-2xl font-bold transition-all active:scale-95 shadow-md flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                {num}
              </button>
            ))}

            {/* Clear Button */}
            <button
              type="button"
              disabled={isVerifying || !!successUser || digits.length === 0}
              onClick={handleClearTap}
              className="h-13 sm:h-14 rounded-2xl bg-neutral-900/50 hover:bg-neutral-800/80 border border-neutral-800 text-neutral-400 hover:text-neutral-200 font-mono text-xs font-bold tracking-wider uppercase transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              CLEAR
            </button>

            {/* Zero Key */}
            <button
              type="button"
              disabled={isVerifying || !!successUser}
              onClick={() => handleDigitTap('0')}
              className="h-13 sm:h-14 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 border border-amber-500/20 hover:border-amber-400 text-neutral-100 hover:text-amber-300 font-mono text-2xl font-bold transition-all active:scale-95 shadow-md flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              disabled={isVerifying || !!successUser || digits.length === 0}
              onClick={handleDeleteTap}
              className="h-13 sm:h-14 rounded-2xl bg-neutral-900/60 hover:bg-neutral-800 border border-neutral-800 text-amber-400 hover:text-amber-300 transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-40"
              aria-label="Delete"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Helper instructions */}
          <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
            <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Need a 4-digit code? Scan the QR code on the left</span>
            </span>
            <span className="text-[11px] font-mono text-amber-400/90 font-semibold">
              Valid for 2 min
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
