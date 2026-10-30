/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AdminSection } from './types';
import { AdminRole } from '../types/backend';
import { Menu, LogOut, User as UserIcon, RefreshCw, Settings, Sun, Moon } from 'lucide-react';
import { AdminAccountModal } from './AdminAccountModal';
import { useAdminTheme } from './AdminThemeContext';

interface AdminHeaderProps {
  activeSection: AdminSection;
  user: {
    id: string;
    username: string;
    email?: string;
    role: AdminRole;
    lastLoginAt?: string | null;
  };
  onLogout: () => void;
  onRefreshData: () => void;
  onOpenMobileSidebar: () => void;
  isRefreshing?: boolean;
  onUserUpdated?: (updatedUser: { email?: string; username: string }) => void;
}

const SECTION_TITLES: Record<AdminSection, { title: string; subtitle: string }> = {
  overview: {
    title: 'Executive Dashboard',
    subtitle: 'System telemetry, session throughput, and key metrics'
  },
  players: {
    title: 'Player Registrations',
    subtitle: 'Participant database, phone numbers, and kiosk records'
  },
  sessions: {
    title: 'Game Sessions',
    subtitle: 'Completed play sessions, scores, and captured souvenirs'
  },
  branding: {
    title: 'Branding & Visual Layout',
    subtitle: 'Brand assets, company logo, titles, and wallpaper styling'
  },
  wallpapers: {
    title: 'Kiosk Wallpapers',
    subtitle: 'Active background configuration and rotation playlist'
  },
  sound: {
    title: 'Sound Studio',
    subtitle: 'Game audio control center, countdown sounds, BGM & custom audio library'
  },
  bombs: {
    title: 'Bomb Management',
    subtitle: 'Targets, points, penalty bombs, sound presets, and spawn rates'
  },
  wishes: {
    title: 'Wishes & Achievements',
    subtitle: 'Greeting templates, high-score badges, and personalized souvenir cards'
  },
  settings: {
    title: 'Game Settings & Rules',
    subtitle: 'Round timer, target score, OTP expiry, and interaction mode (Camera vs Touch)'
  },
  reports: {
    title: 'Analytics Reports & Exports',
    subtitle: 'Leaderboard rankings, completion statistics, and data exports'
  }
};

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeSection,
  user,
  onLogout,
  onRefreshData,
  onOpenMobileSidebar,
  isRefreshing = false,
  onUserUpdated
}) => {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const { theme, toggleTheme, isLight } = useAdminTheme();
  const meta = SECTION_TITLES[activeSection] || SECTION_TITLES.overview;

  return (
    <>
      <header
        className={`sticky top-0 z-30 backdrop-blur-md border-b px-4 sm:px-6 py-3.5 flex items-center justify-between transition-colors duration-200 ${
          isLight
            ? 'bg-[#FBF5EA]/95 border-[#D8C7AE] text-[#493426] shadow-[0_2px_12px_rgba(73,52,38,0.04)]'
            : 'bg-[#0F172A]/90 border-slate-800/80 text-slate-100'
        }`}
      >
        {/* Left: Mobile hamburger & Section Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileSidebar}
            className={`p-2 rounded-xl border lg:hidden cursor-pointer transition-colors ${
              isLight
                ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:bg-[#EFE4D2]'
                : 'bg-slate-900 border-slate-750 text-slate-300 hover:text-cyan-300'
            }`}
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h1
              className={`text-base sm:text-lg font-bold flex items-center gap-2 ${
                isLight ? 'text-[#493426]' : 'text-slate-100'
              }`}
            >
              <span>{meta.title}</span>
            </h1>
            <p
              className={`text-[11px] sm:text-xs hidden sm:block ${
                isLight ? 'text-[#7E6B5A]' : 'text-slate-400'
              }`}
            >
              {meta.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Actions, Theme Toggle and User Status */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Light / Dark Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border shadow-sm ${
              isLight
                ? 'bg-[#FAF4E8] hover:bg-[#EFE4D2] border-[#D8C7AE] text-[#76513D] hover:border-[#B36D4E]/40'
                : 'bg-slate-800/80 hover:bg-slate-700/90 border-slate-700 text-amber-300 hover:border-amber-400/40'
            }`}
            title={isLight ? 'Switch to Dark Theme' : 'Switch to Earthy Light Theme'}
            aria-label={isLight ? 'Switch to Dark Theme' : 'Switch to Earthy Light Theme'}
          >
            {isLight ? (
              <>
                <Moon className="w-3.5 h-3.5 text-[#B36D4E]" />
                <span className="hidden sm:inline text-[#493426]">Dark Mode</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline text-slate-200">Light Mode</span>
              </>
            )}
          </button>

          {/* Refresh data button */}
          <button
            onClick={onRefreshData}
            disabled={isRefreshing}
            className={`p-2 rounded-xl border transition-colors cursor-pointer disabled:opacity-50 ${
              isLight
                ? 'bg-[#FAF4E8] hover:bg-[#EFE4D2] border-[#D8C7AE] text-[#76513D] hover:text-[#B36D4E]'
                : 'bg-slate-800/80 hover:bg-slate-700/90 border-slate-700/80 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300'
            }`}
            title="Refresh real-time data"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                isRefreshing
                  ? isLight
                    ? 'animate-spin text-[#B36D4E]'
                    : 'animate-spin text-cyan-400'
                  : ''
              }`}
            />
          </button>

          {/* Admin Identity & Account Settings Trigger */}
          <button
            onClick={() => setIsAccountModalOpen(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer group shadow-sm ${
              isLight
                ? 'bg-[#FAF4E8] hover:bg-[#EFE4D2] border-[#D8C7AE] hover:border-[#B36D4E]/50 text-[#493426]'
                : 'bg-slate-800/80 hover:bg-slate-700/90 border-slate-700 hover:border-cyan-500/40 text-slate-200'
            }`}
            title="Account Settings"
          >
            <div className="flex items-center gap-1.5">
              <UserIcon
                className={`w-3.5 h-3.5 transition-colors ${
                  isLight
                    ? 'text-[#B36D4E] group-hover:text-[#76513D]'
                    : 'text-cyan-400 group-hover:text-cyan-300'
                }`}
              />
              <span
                className={`font-semibold transition-colors ${
                  isLight
                    ? 'text-[#493426] group-hover:text-[#76513D]'
                    : 'text-slate-200 group-hover:text-white'
                }`}
              >
                {user.username}
              </span>
            </div>
            <Settings
              className={`w-3 h-3 transition-colors ml-0.5 ${
                isLight
                  ? 'text-[#9A8472] group-hover:text-[#B36D4E]'
                  : 'text-slate-400 group-hover:text-cyan-400'
              }`}
            />
          </button>

          {/* Logout button */}
          <button
            onClick={onLogout}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              isLight
                ? 'bg-[#B36D4E]/10 hover:bg-[#B36D4E]/20 border-[#B36D4E]/30 text-[#B36D4E]'
                : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300'
            }`}
            title="Sign out of Admin Console"
          >
            <LogOut className={`w-3.5 h-3.5 ${isLight ? 'text-[#B36D4E]' : 'text-rose-400'}`} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Account Settings Modal */}
      <AdminAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        user={user}
        onUserUpdated={onUserUpdated}
      />
    </>
  );
};
