/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { AdminOverviewStats, GameSession, User } from '../../types/backend';
import {
  Users,
  Gamepad2,
  Trophy,
  Flame,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { AdminSection } from '../types';

interface OverviewSectionProps {
  stats: AdminOverviewStats | null;
  sessions: GameSession[];
  users?: User[];
  isLoading: boolean;
  error: string | null;
  onNavigateSection: (section: AdminSection) => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  stats,
  sessions,
  users = [],
  isLoading,
  error,
  onNavigateSection
}) => {
  // Date picker state: defaults to today's local date (YYYY-MM-DD)
  const getTodayYmd = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayYmd);

  // Format selected date for card title: e.g. "Game Plays — 25 Oct 2026"
  const formattedSelectedDate = useMemo(() => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Lookup map for player names by userId
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    if (users) {
      users.forEach((u) => map.set(u.id, u.name));
    }
    if (stats?.recentUsers) {
      stats.recentUsers.forEach((u) => {
        if (!map.has(u.id)) map.set(u.id, u.name);
      });
    }
    return map;
  }, [users, stats?.recentUsers]);

  // Completed sessions list (excluding trial sessions)
  const completedSessionsList = useMemo(() => {
    return sessions.filter(
      (s) => s.status === 'COMPLETED' && !s.id.startsWith('trial_') && s.code !== '8536'
    );
  }, [sessions]);

  // Total crackers burst across completed sessions
  const totalCrackersBurst = useMemo(() => {
    return completedSessionsList.reduce((acc, s) => acc + (s.crackerCount || 0), 0);
  }, [completedSessionsList]);

  // Date-filtered game plays count
  const selectedDateGamesCount = useMemo(() => {
    return completedSessionsList.filter((s) => {
      const dateStr = s.endTime || s.startTime;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const localYmd = `${y}-${m}-${day}`;
      const utcYmd = d.toISOString().slice(0, 10);

      return localYmd === selectedDate || utcYmd === selectedDate;
    }).length;
  }, [completedSessionsList, selectedDate]);

  // Highest score all-time across all completed sessions
  const highestScore = useMemo(() => {
    if (completedSessionsList.length > 0) {
      return Math.max(...completedSessionsList.map((s) => s.score || 0));
    }
    return stats?.highestScore || 0;
  }, [completedSessionsList, stats?.highestScore]);

  // Average score across completed, recorded games (safely handles 0 games)
  const averageScore = useMemo(() => {
    if (completedSessionsList.length > 0) {
      const sum = completedSessionsList.reduce((acc, s) => acc + (s.score || 0), 0);
      return Math.round(sum / completedSessionsList.length);
    }
    if (stats?.averageScore && !isNaN(stats.averageScore)) {
      return stats.averageScore;
    }
    return 0;
  }, [completedSessionsList, stats?.averageScore]);

  // Recent game sessions sorted by startTime newest first
  const recentGamePlayers = useMemo(() => {
    const realSessions = sessions.filter(
      (s) => !s.id.startsWith('trial_') && s.code !== '8536'
    );
    if (realSessions.length > 0) {
      return [...realSessions]
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 5);
    }
    return (stats?.recentSessions || []).slice(0, 5);
  }, [sessions, stats?.recentSessions]);

  // Recent player registrations
  const recentRegistrations = useMemo(() => {
    if (users && users.length > 0) {
      return [...users]
        .filter((u) => !u.id.startsWith('trial_'))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
    }
    return (stats?.recentUsers || []).slice(0, 5);
  }, [users, stats?.recentUsers]);

  // Hall of fame top 5 performers
  const topPerformers = useMemo(() => {
    if (stats?.leaderboard && stats.leaderboard.length > 0) {
      return stats.leaderboard.slice(0, 5);
    }
    return completedSessionsList
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map((s, idx) => ({
        rank: idx + 1,
        sessionId: s.id,
        userId: s.userId,
        userName: userMap.get(s.userId) || 'Champion',
        score: s.score || 0,
        crackerCount: s.crackerCount || 0,
        maxSpeed: s.maxSpeed || 0,
        completedAt: s.endTime || s.startTime
      }));
  }, [stats?.leaderboard, completedSessionsList, userMap]);

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3 shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
        <p className="text-xs">Loading live system telemetry...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 m-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sm mb-1">Failed to load telemetry data</h3>
          <p className="text-rose-300/90">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs">
        No telemetry records currently available.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* 6 Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Registered Players */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-cyan-500/30 rounded-2xl p-4 flex flex-col justify-between transition-colors shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium tracking-wide">Registered Players</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-100 font-mono">
            {stats.totalUsers}
          </div>
          <div className="h-3" aria-hidden="true" />
        </div>

        {/* Metric 2: Completed Games */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between transition-colors shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium tracking-wide">Completed Games</span>
            <Gamepad2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono">
            {stats.completedSessions}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            of {stats.totalSessions} total sessions
          </div>
        </div>

        {/* Metric 3: Date-based Game Plays */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-blue-500/30 rounded-2xl p-4 flex flex-col justify-between transition-colors shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium tracking-wide truncate" title={`Game Plays — ${formattedSelectedDate}`}>
              Plays — {formattedSelectedDate}
            </span>
            <Calendar className="w-4 h-4 text-blue-400 shrink-0 ml-1" />
          </div>
          <div className="text-2xl font-black text-blue-300 font-mono">
            {selectedDateGamesCount}
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700 hover:border-cyan-500/40 rounded-lg px-2 py-0.5 text-[10px] font-mono text-cyan-300 outline-none cursor-pointer transition-colors [color-scheme:dark]"
              title="Filter game plays by date"
            />
          </div>
        </div>

        {/* Metric 4: Total Crackers Burst */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-rose-500/30 rounded-2xl p-4 flex flex-col justify-between transition-colors shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium tracking-wide">Crackers Burst</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-300 font-mono">
            {totalCrackersBurst.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Interactive bursts
          </div>
        </div>

        {/* Metric 5: Highest Score */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between transition-colors shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium tracking-wide">Highest Score</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono">
            {highestScore.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            All-time record
          </div>
        </div>

        {/* Metric 6: Average Score */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-teal-500/30 rounded-2xl p-4 flex flex-col justify-between transition-colors shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-medium tracking-wide">Average Score</span>
            <Sparkles className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-teal-300 font-mono">
            {averageScore.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Across completed games
          </div>
        </div>
      </div>

      {/* Two Column Section: Recent Game Players & Recent Player Registrations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Recent Game Players */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-100 tracking-wide">
              Recent Game Players
            </h2>
            <button
              onClick={() => onNavigateSection('sessions')}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-x-auto">
            {recentGamePlayers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No game sessions recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {recentGamePlayers.map((session) => {
                  const playerName = userMap.get(session.userId) || `Player #${session.code}`;

                  return (
                    <div
                      key={session.id}
                      className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/20 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                          <span>{playerName}</span>
                          <span className="text-slate-600" aria-hidden="true">·</span>
                          <span
                            className={`text-[11px] font-medium ${
                              session.status === 'COMPLETED'
                                ? 'text-emerald-400'
                                : session.status === 'ABANDONED'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {session.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{session.crackerCount || 0} crackers</span>
                          <span className="text-slate-600" aria-hidden="true">·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {session.startTime
                              ? new Date(session.startTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'Recent'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-bold text-cyan-300 font-mono">
                          {(session.score || 0).toLocaleString()} pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Recent Player Registrations */}
        <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-100 tracking-wide">
              Recent Player Registrations
            </h2>
            <button
              onClick={() => onNavigateSection('players')}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-x-auto">
            {recentRegistrations.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No player registrations recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {recentRegistrations.map((user) => (
                  <div
                    key={user.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/20 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        {user.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>
                          Mobile: ******{user.mobileNumber ? user.mobileNumber.slice(-4) : '****'}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard Spotlight Preview: Hall of Fame Top Performers (Top 5) */}
      <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-100 tracking-wide flex items-center gap-2">
            <Trophy className="w-4 h-4 text-cyan-400" />
            <span>Hall of Fame Top Performers</span>
          </h2>
          <button
            onClick={() => onNavigateSection('reports')}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-medium"
          >
            <span>Full Leaderboard</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {topPerformers.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            No completed sessions recorded for leaderboard yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {topPerformers.map((entry) => (
              <div
                key={entry.sessionId}
                className="p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/20 hover:border-cyan-400/40 relative overflow-hidden flex flex-col justify-between transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    Rank #{entry.rank}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {entry.completedAt
                      ? new Date(entry.completedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric'
                        })
                      : ''}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-100 truncate mb-1">
                  {entry.userName}
                </div>
                <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-slate-800">
                  <span className="text-lg font-black text-cyan-200 font-mono">
                    {entry.score.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {entry.crackerCount || 0} crackers
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
