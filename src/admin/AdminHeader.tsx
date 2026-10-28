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
    title: 'Admin Dashboard',
    subtitle: 'Manage your Diwali Fun Play experience'
  },
  players: {
    title: 'Registered Players',
    subtitle: 'Searchable participant records, mobile status, and kiosk play history'
  },
  sessions: {
    title: 'Game Sessions',
    subtitle: 'Detailed motion challenge records, accuracy metrics, and captured photos'
  },
  branding: {
    title: 'Branding & Visual Layout',
    subtitle: 'Make Your Design'
  },
  wallpapers: {
    title: 'Kiosk Wallpapers',
    subtitle: 'Active background configuration and multi-wallpaper rotation plan'
  },
  sound: {
    title: 'Sound Studio',
    subtitle: 'Diwali cracker audio cues, SFX combinations, and audio mixer'
  },
  crackers: {
    title: 'Cracker & Visual Effects',
    subtitle: 'Motion-gesture mappings, dual-hand sparklers, and firework physics'
  },
  bombs: {
    title: 'Bomb Management',
    subtitle: 'Colourful interactive targets, point values, penalty bombs, burst sounds & spawn dynamics'
  },
  wishes: {
    title: 'Wishes & Achievements',
    subtitle: 'Personalized greeting cards, high score badges, and photo templates'
  },
  settings: {
    title: 'Game Settings & Rules',
    subtitle: 'Session countdown duration, single-use code expiry, and repeat plays'
  },
  reports: {
    title: 'Analytics Reports & Exports',
    subtitle: 'Leaderboard summaries, completion rates, and upcoming Excel/CSV exports'
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
  const meta = SECTION_TITLES[activeSection];

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#0B0814]/90 backdrop-blur-md border-b border-amber-500/15 px-4 sm:px-6 py-3.5 flex items-center justify-between">
        {/* Left: Mobile hamburger & Section Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileSidebar}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-amber-200 lg:hidden cursor-pointer"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-base sm:text-lg font-bold text-neutral-100 flex items-center gap-2">
              <span>{meta.title}</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-neutral-400 hidden sm:block">
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
            className="p-2 rounded-xl bg-neutral-900/80 border border-neutral-800 hover:border-amber-500/30 text-neutral-300 hover:text-amber-200 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh real-time data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {/* Admin Identity & Account Settings Trigger (Single dynamic username, no duplicate role label) */}
          <button
            onClick={() => setIsAccountModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800/90 border border-neutral-800 hover:border-amber-500/35 text-xs text-neutral-200 transition-all cursor-pointer group shadow-sm"
            title="Account Settings (Change Email & Password)"
          >
            <div className="flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300 transition-colors" />
              <span className="font-semibold text-neutral-200 group-hover:text-white transition-colors">
                {user.username}
              </span>
            </div>
            <Settings className="w-3 h-3 text-neutral-500 group-hover:text-amber-400 transition-colors ml-0.5" />
          </button>

          {/* Logout button */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-200 text-xs font-medium transition-colors cursor-pointer"
            title="Sign out of Admin Console"
          >
            <LogOut className="w-3.5 h-3.5 text-red-400" />
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
