/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdminSection } from './types';
import { AdminLogin } from './AdminLogin';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { adminApi } from '../services/api';
import {
  AdminRole,
  AdminOverviewStats,
  GameSession,
  User,
  SystemSettings
} from '../types/backend';
import { OverviewSection } from './sections/OverviewSection';
import { PlayersSection } from './sections/PlayersSection';
import { SessionsSection } from './sections/SessionsSection';
import { BrandingSection } from './sections/BrandingSection';
import { SoundStudioSection } from './sections/SoundStudioSection';
import { BombManagementSection } from './sections/BombManagementSection';
import { WishesSection } from './sections/WishesSection';
import { GameSettingsSection } from './sections/GameSettingsSection';
import { ReportsSection } from './sections/ReportsSection';
import { RewardsSection } from './sections/RewardsSection';
import { AdminThemeProvider, useAdminTheme } from './AdminThemeContext';

interface AuthenticatedAdminUser {
  id: string;
  username: string;
  email?: string;
  role: AdminRole;
  lastLoginAt?: string | null;
}

const AdminAppContent: React.FC = () => {
  const { isLight } = useAdminTheme();

  // Auth state
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauthenticated' | 'authenticated'>('checking');
  const [currentUser, setCurrentUser] = useState<AuthenticatedAdminUser | null>(null);

  // Navigation state (initial section from hash if valid, otherwise overview)
  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace('#', '') as AdminSection;
      const validSections: AdminSection[] = [
        'overview', 'players', 'sessions', 'branding', 'wallpapers',
        'sound', 'bombs', 'wishes', 'settings', 'reports', 'rewards'
      ];
      if (validSections.includes(hash)) return hash;
    }
    return 'overview';
  });

  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState(false);

  // Telemetry & Records Data
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync hash with activeSection
  const handleSelectSection = (section: AdminSection) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      window.location.hash = section;
    }
  };

  // 1. Check existing session on mount via /api/admin/auth/me
  const checkSession = useCallback(async () => {
    try {
      const res = await adminApi.getMe();
      if (res.success && res.user) {
        setCurrentUser(res.user);
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
      }
    } catch (err: any) {
      // 401 or network error -> show login
      setAuthStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // 2. Load Telemetry, Players, Sessions, and Settings when authenticated
  const loadAllData = useCallback(async (isSilentRefresh = false) => {
    if (!isSilentRefresh) {
      setIsLoadingData(true);
    } else {
      setIsRefreshing(true);
    }
    setDataError(null);

    try {
      const [overviewRes, usersRes, sessionsRes, settingsRes] = await Promise.all([
        adminApi.getOverview().catch((e) => {
          console.warn('[Admin] Overview fetch error:', e);
          return null;
        }),
        adminApi.getUsers().catch((e) => {
          console.warn('[Admin] Users fetch error:', e);
          return null;
        }),
        adminApi.getSessions().catch((e) => {
          console.warn('[Admin] Sessions fetch error:', e);
          return null;
        }),
        adminApi.getSettings().catch((e) => {
          console.warn('[Admin] Settings fetch error:', e);
          return null;
        })
      ]);

      if (overviewRes?.success && overviewRes.stats) {
        setStats(overviewRes.stats);
      }
      if (usersRes?.success && usersRes.users) {
        setUsers(usersRes.users);
      }
      if (sessionsRes?.success && sessionsRes.sessions) {
        setSessions(sessionsRes.sessions);
      }
      if (settingsRes?.success && settingsRes.settings) {
        setSettings(settingsRes.settings);
      }
    } catch (err: any) {
      console.error('[Admin] Data loading error:', err);
      if (err.status === 401) {
        // Session expired
        setAuthStatus('unauthenticated');
        setCurrentUser(null);
      } else {
        setDataError(err.message || 'Failed to load data from server.');
      }
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadAllData();
    }
  }, [authStatus, loadAllData]);

  // 3. Logout handler
  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch (err) {
      console.warn('[Admin] Logout error:', err);
    } finally {
      setCurrentUser(null);
      setAuthStatus('unauthenticated');
    }
  };

  // 4. Login success handler
  const handleLoginSuccess = (user: AuthenticatedAdminUser) => {
    setCurrentUser(user);
    setAuthStatus('authenticated');
  };

  // Rendering during initial auth check
  if (authStatus === 'checking') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-200 ${
        isLight ? 'bg-[#F1E8D9] text-[#493426]' : 'bg-[#0B1120] text-cyan-100'
      }`}>
        <div className={`w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mb-4 ${
          isLight
            ? 'border-[#76513D] shadow-[0_0_15px_rgba(118,81,61,0.25)]'
            : 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
        }`} />
        <span className={`font-sans tracking-wider text-sm font-semibold ${
          isLight ? 'text-[#7E6B5A]' : 'text-slate-300'
        }`}>
          Verifying Admin Session...
        </span>
      </div>
    );
  }

  // If unauthenticated, render login screen
  if (authStatus === 'unauthenticated' || !currentUser) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  // Authenticated Dashboard Layout
  return (
    <div className={`min-h-screen flex transition-colors duration-200 ${
      isLight ? 'bg-[#F1E8D9] text-[#493426]' : 'bg-[#0B1120] text-slate-100'
    }`}>
      {/* Sidebar Navigation */}
      <AdminSidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        isOpenMobile={isOpenMobileSidebar}
        onCloseMobile={() => setIsOpenMobileSidebar(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        <AdminHeader
          activeSection={activeSection}
          user={currentUser}
          onLogout={handleLogout}
          onRefreshData={() => loadAllData(true)}
          onOpenMobileSidebar={() => setIsOpenMobileSidebar(true)}
          isRefreshing={isRefreshing}
          onUserUpdated={(updated) =>
            setCurrentUser((prev) => (prev ? { ...prev, ...updated } : prev))
          }
        />

        <main className="flex-1 pb-12">
          {activeSection === 'overview' && (
            <OverviewSection
              stats={stats}
              sessions={sessions}
              users={users}
              isLoading={isLoadingData}
              error={dataError}
              onNavigateSection={handleSelectSection}
            />
          )}

          {activeSection === 'players' && (
            <PlayersSection
              users={users}
              isLoading={isLoadingData}
              error={dataError}
              onRefresh={() => loadAllData(true)}
            />
          )}

          {activeSection === 'sessions' && (
            <SessionsSection
              sessions={sessions}
              users={users}
              isLoading={isLoadingData}
              error={dataError}
              onRefresh={() => loadAllData(true)}
            />
          )}

          {(activeSection === 'branding' || activeSection === 'wallpapers') && (
            <BrandingSection
              settings={settings}
              onSettingsUpdated={(newSettings) => setSettings(newSettings)}
              currentUserRole={currentUser.role}
              initialTab={activeSection === 'wallpapers' ? 'wallpapers' : 'branding'}
            />
          )}

          {activeSection === 'sound' && (
            <SoundStudioSection />
          )}

          {activeSection === 'bombs' && (
            <BombManagementSection />
          )}

          {activeSection === 'wishes' && (
            <WishesSection />
          )}

          {activeSection === 'settings' && (
            <GameSettingsSection
              settings={settings}
              onSettingsUpdated={(newSettings) => setSettings(newSettings)}
              currentUserRole={currentUser.role}
            />
          )}

          {activeSection === 'reports' && (
            <ReportsSection
              stats={stats}
              sessions={sessions}
              users={users}
              isLoading={isLoadingData}
            />
          )}

          {activeSection === 'rewards' && (
            <RewardsSection />
          )}
        </main>
      </div>
    </div>
  );
};

export const AdminApp: React.FC = () => {
  return (
    <AdminThemeProvider>
      <AdminAppContent />
    </AdminThemeProvider>
  );
};
