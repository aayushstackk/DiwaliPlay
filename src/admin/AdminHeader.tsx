/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AdminSection } from './types';
import { AdminRole } from '../types/backend';
import { Menu, LogOut, User as UserIcon, RefreshCw, Settings } from 'lucide-react';
import { AdminAccountModal } from './AdminAccountModal';

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
  const meta = SECTION_TITLES[activeSection] || SECTION_TITLES.overview;

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#0F172A]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3.5 flex items-center justify-between">
        {/* Left: Mobile hamburger & Section Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileSidebar}
            className="p-2 rounded-xl bg-slate-900 border border-slate-750 text-slate-300 hover:text-cyan-300 lg:hidden cursor-pointer"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>{meta.title}</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
              {meta.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Actions and User Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Refresh data button */}
          <button
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh real-time data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Admin Identity & Account Settings Trigger */}
          <button
            onClick={() => setIsAccountModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 hover:border-cyan-500/40 text-xs text-slate-200 transition-all cursor-pointer group shadow-sm"
            title="Account Settings"
          >
            <div className="flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
              <span className="font-semibold text-slate-200 group-hover:text-white transition-colors">
                {user.username}
              </span>
            </div>
            <Settings className="w-3 h-3 text-slate-400 group-hover:text-cyan-400 transition-colors ml-0.5" />
          </button>

          {/* Logout button */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors cursor-pointer"
            title="Sign out of Admin Console"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
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
