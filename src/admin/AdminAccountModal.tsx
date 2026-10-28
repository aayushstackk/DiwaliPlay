/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Shield, Mail, KeyRound, Eye, EyeOff, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { AdminRole } from '../types/backend';
import { adminApi } from '../services/api';

interface AdminAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    username: string;
    email?: string;
    role: AdminRole;
  };
  onUserUpdated?: (updatedUser: { email?: string; username: string }) => void;
}

export const AdminAccountModal: React.FC<AdminAccountModalProps> = ({
  isOpen,
  onClose,
  user,
  onUserUpdated
}) => {
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync email when modal opens or user updates
  useEffect(() => {
    if (isOpen) {
      setEmail(user.email || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, user.email]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const emailTrimmed = email.trim();
    const hasEmailChanged = emailTrimmed !== (user.email || '');
    const isChangingPassword = Boolean(newPassword || currentPassword || confirmPassword);

    if (!hasEmailChanged && !isChangingPassword) {
      setError('No changes were made.');
      return;
    }

    // Validate email format if changed and not empty
    if (hasEmailChanged && emailTrimmed !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        setError('Please enter a valid email address.');
        return;
      }
    }

    // Validate password change fields
    if (isChangingPassword) {
      if (!currentPassword) {
        setError('Current password is required to set a new password.');
        return;
      }
      if (!newPassword) {
        setError('Please enter a new password.');
        return;
      }
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters long.');
        return;
      }
      if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        setError('New password must contain both letters and numbers.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match. Please verify and retype.');
        return;
      }
    }

    try {
      setIsLoading(true);

      const res = await adminApi.updateAccount({
        email: hasEmailChanged ? emailTrimmed : undefined,
        currentPassword: isChangingPassword ? currentPassword : undefined,
        newPassword: isChangingPassword ? newPassword : undefined
      });

      if (res.success) {
        setSuccess(res.message || 'Account settings updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');

        if (onUserUpdated) {
          onUserUpdated({
            username: user.username,
            email: res.user?.email ?? emailTrimmed
          });
        }
      } else {
        setError(res.message || 'Failed to update account settings.');
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Failed to update account settings. Please try again.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0F1B2E] border border-cyan-500/25 rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-cyan-500/15 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-wide">
                Account Settings
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Logged in as <span className="text-cyan-300 font-semibold">{user.username}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status Messages */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-400 stroke-[3] shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Section 1: Email Address */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-cyan-400" />
              <span>Admin Email Address</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. admin@yourdomain.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-slate-100 text-xs font-mono placeholder:text-slate-500 transition-all outline-none"
            />
            <p className="text-[11px] text-slate-500">
              Used for security notifications and account management.
            </p>
          </div>

          {/* Divider */}
          <div className="pt-2 border-t border-cyan-500/15">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider font-mono">
                Change Password
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Leave password fields blank if you only wish to change your email address.
            </p>

            {/* Current Password */}
            <div className="space-y-1.5 mb-3">
              <label className="text-[11px] font-medium text-slate-300">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-slate-100 text-xs font-mono placeholder:text-slate-500 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5 mb-3">
              <label className="text-[11px] font-medium text-slate-300">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters (letters + numbers)"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-slate-100 text-xs font-mono placeholder:text-slate-500 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-300">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-slate-100 text-xs font-mono placeholder:text-slate-500 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-cyan-500/15 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

