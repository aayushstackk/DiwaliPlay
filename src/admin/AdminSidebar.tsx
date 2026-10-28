/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AdminSection } from './types';
import {
  BarChart3,
  Users,
  Gamepad2,
  Palette,
  Music,
  Bomb,
  Trophy,
  Sliders,
  FileText,
  X
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useBranding } from '../hooks/useBranding';

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSelectSection: (section: AdminSection) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    description: 'Telemetry & analytics'
  },
  {
    id: 'players',
    label: 'Players',
    icon: Users,
    description: 'Registrations & status'
  },
  {
    id: 'sessions',
    label: 'Game Sessions',
    icon: Gamepad2,
    description: 'Completed matches & scores'
  },
  {
    id: 'branding',
    label: 'Branding & Design',
    icon: Palette,
    description: 'Make Your Design'
  },
  {
    id: 'sound',
    label: 'Sound Studio',
    icon: Music,
    description: 'Audio Control Center'
  },
  {
    id: 'bombs',
    label: 'Bomb Management',
    icon: Bomb,
    description: 'Points, colours & spawn settings'
  },
  {
    id: 'wishes',
    label: 'Wishes & Achievements',
    icon: Trophy,
    description: 'Post-game templates'
  },
  {
    id: 'settings',
    label: 'Game Settings',
    icon: Sliders,
    description: 'Timer & gameplay mode'
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: FileText,
    description: 'Leaderboard & exports'
  }
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeSection,
  onSelectSection,
  isOpenMobile,
  onCloseMobile
}) => {
  const branding = useBranding();

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0B132B] border-r border-slate-800/90 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <span className="font-['Cinzel',serif] font-black text-sm text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-cyan-400 to-teal-300 tracking-wider">
              DIWALI PLAY
            </span>
            <span className="text-[10px] text-cyan-400/80 font-mono tracking-widest uppercase">
              Control Panel
            </span>
          </div>

          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 lg:hidden cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Organization / Brand Logo Area */}
        <div className="px-4 py-3 bg-[#080D1D] border-b border-slate-800/80 flex items-center justify-center shrink-0">
          <BrandLogo
            brandLogoUrl={branding.brandLogoUrl}
            brandName={branding.brandName}
            size="compact"
            className="w-full justify-center"
          />
        </div>

        {/* Navigation list with hidden scrollbar track */}
        <nav className="flex-1 overflow-y-auto p-2.5 space-y-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 flex items-center gap-3 group cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/15 to-teal-500/10 text-cyan-200 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-300/80'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{item.label}</div>
                  <div className="text-[10px] text-slate-500 truncate hidden xl:block">
                    {item.description}
                  </div>
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)] shrink-0" />
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
