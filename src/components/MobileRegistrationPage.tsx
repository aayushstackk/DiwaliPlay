/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { User, Phone, CheckCircle2, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { gameApi } from '../services/api';
import { RegisterUserResponse } from '../types/backend';
import { validatePlayerName, validateMobileNumber } from '../utils/validation';
import { BrandingBlock } from './BrandingBlock';
import { TermsModal } from './TermsModal';

export const MobileRegistrationPage: React.FC = () => {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationResult, setRegistrationResult] = useState<RegisterUserResponse | null>(() => {
    try {
      const saved = sessionStorage.getItem('diwali_registration_pass');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow letters and spaces
    const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
    setName(val);
    if (error) setError(null);
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobile(val);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Frontend validation for Player Name
    const nameVal = validatePlayerName(name);
    if (!nameVal.valid) {
      setError(nameVal.error || 'Please enter a correct name.');
      return;
    }

    // 2. Frontend validation for Mobile Number
    const mobileVal = validateMobileNumber(mobile);
    if (!mobileVal.valid) {
      setError(mobileVal.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }

    // 3. Frontend validation for Terms & Conditions consent
    if (!agreedToTerms) {
      setError('Please agree to the Terms & Conditions to request an OTP.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await gameApi.registerUser({
        name: nameVal.normalized,
        mobileNumber: mobileVal.normalized,
        termsAccepted: true,
        termsVersion: '1.0'
      });

      if (res.success) {
        setRegistrationResult(res);
        try {
          sessionStorage.setItem('diwali_registration_pass', JSON.stringify(res));
        } catch {
          // Ignore storage restrictions
        }
      } else {
        setError(res.message || 'Registration failed. Please check your details.');
      }
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Unable to connect to server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#0A0713] text-neutral-100 flex flex-col justify-between p-4 sm:p-6 font-['Plus_Jakarta_Sans',sans-serif] selection:bg-amber-500 selection:text-neutral-950 relative select-none">
      {/* Subtle festive background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-orange-600/10 rounded-full blur-[90px] pointer-events-none" />

      {/* TOP COMPACT HEADER */}
      <header className="w-full max-w-sm mx-auto text-center z-10 flex flex-col items-center pt-1 shrink-0">
        <BrandingBlock size="mobile" className="mb-2" />
        <h2 className="text-xs sm:text-sm font-bold tracking-widest text-amber-200/90 font-mono uppercase bg-amber-500/10 border border-amber-400/30 px-3 py-1 rounded-full">
          PLAYER REGISTRATION
        </h2>
      </header>

      {/* MAIN CONTAINER (Single Viewport, No Scroll) */}
      <main className="w-full max-w-sm mx-auto my-auto z-10 py-2 shrink-0">
        {!registrationResult ? (
          /* REGISTRATION FORM */
          <div className="bg-neutral-900/90 border border-amber-500/30 rounded-2xl p-5 shadow-[0_0_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Notice */}
              {error && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Player Name */}
              <div>
                <label className="block text-[11px] font-mono font-semibold tracking-wider text-amber-300 uppercase mb-1">
                  Player Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                    <User className="w-4 h-4 text-amber-400/70" />
                  </div>
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    value={name}
                    onChange={handleNameChange}
                    placeholder="Enter your name"
                    autoComplete="name"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={40}
                    className="w-full pl-9 pr-3 py-2.5 bg-neutral-950/90 border border-neutral-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 rounded-xl text-neutral-100 placeholder-neutral-500 text-sm font-medium transition-all outline-none"
                  />
                </div>
              </div>

              {/* 10-Digit Mobile Number */}
              <div>
                <label className="block text-[11px] font-mono font-semibold tracking-wider text-amber-300 uppercase mb-1">
                  10-Digit Mobile Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400 font-mono text-xs font-bold">
                    +91
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={mobile}
                    onChange={handleMobileChange}
                    placeholder="10-digit number"
                    autoComplete="tel-national"
                    className="w-full pl-11 pr-3 py-2.5 bg-neutral-950/90 border border-neutral-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 rounded-xl text-neutral-100 placeholder-neutral-500 font-mono text-sm tracking-wider font-semibold transition-all outline-none"
                  />
                </div>
              </div>

              {/* Terms & Conditions Agreement Checkbox & Link */}
              <div className="flex items-start gap-2.5 pt-0.5">
                <input
                  type="checkbox"
                  id="terms-consent"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    if (error) setError(null);
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-amber-500 accent-amber-500 cursor-pointer focus:ring-amber-400"
                />
                <label htmlFor="terms-consent" className="text-xs text-neutral-300 select-none leading-relaxed">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer inline transition-colors"
                  >
                    Terms & Conditions
                  </button>
                </label>
              </div>

              {/* Submit / Request OTP Action */}
              <button
                type="submit"
                disabled={isSubmitting || !name.trim() || mobile.length !== 10 || !agreedToTerms}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-neutral-950 font-bold font-['Cinzel',serif] text-xs sm:text-sm tracking-wider uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                    <span>REQUESTING OTP...</span>
                  </>
                ) : (
                  <>
                    <span>REQUEST OTP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* CODE SUCCESS SCREEN (Single Viewport, No Expiry, No Long Lists) */
          <div className="bg-neutral-900/90 border-2 border-amber-400/80 rounded-2xl p-5 shadow-[0_0_40px_rgba(245,158,11,0.25)] backdrop-blur-md text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
            {/* Status icon */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
              registrationResult.isExistingCode
                ? 'bg-amber-500/15 border border-amber-400/50 text-amber-400'
                : 'bg-emerald-500/15 border border-emerald-400/50 text-emerald-400'
            }`}>
              {registrationResult.isExistingCode ? (
                <Sparkles className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </div>

            <span className={`text-[10px] font-mono uppercase tracking-widest font-bold px-3 py-0.5 rounded-full border mb-1 ${
              registrationResult.isExistingCode
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
            }`}>
              {registrationResult.isExistingCode ? 'ACTIVE GAME PASS RETRIEVED' : 'REGISTRATION SUCCESSFUL'}
            </span>

            <h2 className="text-lg sm:text-xl font-bold text-amber-100 font-['Cinzel',serif]">
              WELCOME, {registrationResult.user.name.toUpperCase()}!
            </h2>

            <p className="text-xs text-amber-200/80 mt-1 font-medium">
              {registrationResult.isExistingCode
                ? 'You already have an active pass! Your 4-digit game code:'
                : 'Your 4-digit game code:'}
            </p>

            {/* 4-DIGIT GAME CODE BOXES */}
            <div className="my-3 w-full border-2 border-amber-400/70 bg-neutral-950/95 rounded-2xl py-3.5 px-3 shadow-[0_0_25px_rgba(245,158,11,0.2)] flex items-center justify-center gap-2.5">
              {registrationResult.code.split('').map((char, index) => (
                <div
                  key={index}
                  className="w-12 h-14 sm:w-14 sm:h-16 bg-neutral-900 border-2 border-amber-400/70 text-amber-300 rounded-xl flex items-center justify-center font-mono text-3xl font-extrabold tracking-tighter shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                >
                  {char}
                </div>
              ))}
            </div>

            {/* SHORT CLEAR INSTRUCTION */}
            <div className="w-full bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 my-1 flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs font-semibold text-amber-200">
                Enter this 4-digit game code on the kiosk.
              </p>
            </div>

            {/* Register another player button */}
            <button
              onClick={() => {
                try {
                  sessionStorage.removeItem('diwali_registration_pass');
                } catch {
                  // Ignore
                }
                setRegistrationResult(null);
                setName('');
                setMobile('');
                setAgreedToTerms(false);
                setError(null);
              }}
              className="mt-3 text-xs text-amber-400/80 hover:text-amber-300 underline font-mono cursor-pointer"
            >
              ← Register another player
            </button>
          </div>
        )}
      </main>

      {/* COMPACT FOOTER */}
      <footer className="w-full max-w-sm mx-auto text-center z-10 pb-1 shrink-0">
        <span className="text-[10px] text-neutral-500 font-mono">
          Diwali Fun Play · Kiosk Pass
        </span>
      </footer>

      {/* Accessible Terms & Conditions Modal */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        onAccept={() => {
          setAgreedToTerms(true);
          setShowTermsModal(false);
          if (error) setError(null);
        }}
      />
    </div>
  );
};
