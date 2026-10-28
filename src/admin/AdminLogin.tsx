/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { adminApi } from '../services/api';
import { AdminUser, AdminRole } from '../types/backend';
import { Shield, Lock, User as UserIcon, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { BrandingBlock } from '../components/BrandingBlock';

interface AdminLoginProps {
  onLoginSuccess: (user: { id: string; username: string; role: AdminRole }) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [setupSuccessMessage, setSetupSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSetupSuccessMessage(null);

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);

    try {
      if (isSetupMode) {
        // One-time Initial Setup flow
        const res = await adminApi.setup({
          username: cleanUser,
          password
        });
        setIsLoading(false);
        setSetupSuccessMessage(res.message || 'Superadmin account created successfully! Please log in.');
        setIsSetupMode(false);
        setPassword('');
      } else {
        // Standard Admin Login flow
        const res = await adminApi.login({
          username: cleanUser,
          password
        });
        setIsLoading(false);

        if (res.success && res.user) {
          onLoginSuccess(res.user);
        } else {
          setErrorMessage(res.message || 'Invalid username or password.');
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      console.error('[Admin Login] Error:', err);

      if (err.status === 401) {
        setErrorMessage('Invalid username or password. Please verify your credentials.');
      } else if (err.status === 403) {
        if (isSetupMode) {
          setErrorMessage('Admin account is already initialized. Please switch to standard login.');
        } else {
          setErrorMessage(err.data?.message || 'Access forbidden: this account may be disabled.');
        }
      } else if (err.status === 429) {
        setErrorMessage('Too many failed attempts. Please wait 15 minutes before trying again.');
      } else if (err.status === 0) {
        setErrorMessage('Unable to connect to the server. Please check your network connection.');
      } else {
        setErrorMessage(err.data?.message || err.message || 'An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#09070F] text-neutral-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden select-none">
      {/* Subtle festive background lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-red-600/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        {/* Branding Header */}
        <div className="mb-6 flex flex-col items-center">
          <BrandingBlock size="compact" className="mb-4" />
          <div className="flex items-center gap-2 text-xs text-amber-300/80 font-medium tracking-widest uppercase">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Management Console</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#14101F]/80 backdrop-blur-xl border border-amber-500/25 rounded-2xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          <div className="mb-6 text-center">
            <h2 className="text-xl sm:text-2xl font-bold font-['Cinzel',serif] text-amber-100">
              {isSetupMode ? 'Initial Superadmin Setup' : 'Admin Portal Login'}
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              {isSetupMode
                ? 'Create the primary administrator account (at least 10 chars, mixed symbols).'
                : 'Sign in to access kiosk telemetry, game sessions, and configuration.'}
            </p>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {setupSuccessMessage && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{setupSuccessMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-username"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <UserIcon className="w-4 h-4 text-amber-400/70" />
                </div>
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin username"
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-900/90 border border-neutral-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl text-neutral-100 text-sm placeholder-neutral-500 transition-colors outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Lock className="w-4 h-4 text-amber-400/70" />
                </div>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete={isSetupMode ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-900/90 border border-neutral-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl text-neutral-100 text-sm placeholder-neutral-500 transition-colors outline-none"
                  required
                />
              </div>
              {isSetupMode && (
                <p className="text-[11px] text-amber-300/80 mt-1">
                  Must be at least 10 characters with numbers and special characters.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm tracking-wide bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-neutral-950 shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : isSetupMode ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create Superadmin Account</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Sign In to Dashboard</span>
                </>
              )}
            </button>
          </form>

          {/* Toggle setup mode */}
          <div className="mt-6 pt-5 border-t border-neutral-800 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSetupMode(!isSetupMode);
                setErrorMessage(null);
                setSetupSuccessMessage(null);
              }}
              className="text-xs text-amber-300/80 hover:text-amber-200 underline underline-offset-4 cursor-pointer transition-colors"
            >
              {isSetupMode
                ? 'Back to regular sign in'
                : 'First-time setup? Initialize superadmin account'}
            </button>
          </div>
        </div>

        {/* Safe navigation link back to kiosk */}
        <div className="mt-6 text-center">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← Return to Kiosk Display
          </a>
        </div>
      </div>
    </div>
  );
};
