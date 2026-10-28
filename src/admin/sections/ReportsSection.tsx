/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AdminOverviewStats, GameSession, User, LeaderboardEntry } from '../../types/backend';
import {
  FileText,
  Download,
  Trophy,
  CheckCircle2,
  XCircle,
  BarChart3,
  Calendar,
  Sparkles,
  Info
} from 'lucide-react';

interface ReportsSectionProps {
  stats: AdminOverviewStats | null;
  sessions: GameSession[];
  users: User[];
  isLoading: boolean;
}

export const ReportsSection: React.FC<ReportsSectionProps> = ({
  stats,
  sessions,
  users,
  isLoading
}) => {
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED');
  const abandonedSessions = sessions.filter((s) => s.status === 'ABANDONED');
  const totalSessions = sessions.length;

  const completionRate = totalSessions > 0
    ? Math.round((completedSessions.length / totalSessions) * 100)
    : 0;

  const totalCrackers = completedSessions.reduce((acc, s) => acc + (s.crackerCount || 0), 0);
  const avgCrackers = completedSessions.length > 0
    ? Math.round(totalCrackers / completedSessions.length)
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Export Status Banner */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm mb-1 text-amber-100">
              Data Export Feature Status
            </h3>
            <p className="text-amber-300/80 leading-relaxed">
              Live telemetry and leaderboard summaries are generated in real-time below from authenticated session records. Automated CSV and Excel file downloads are currently in development for <strong>Phase 4</strong>, pending server-side streaming endpoints.
            </p>
          </div>
        </div>

        <button
          disabled
          className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-500 text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed shrink-0"
          title="Direct CSV/Excel export will activate in Phase 4"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV (Phase 4)</span>
        </button>
      </div>

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-4">
          <span className="text-[11px] text-neutral-400 font-medium block mb-1">
            Overall Completion Rate
          </span>
          <div className="text-2xl font-black text-amber-100 font-mono">
            {completionRate}%
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">
            {completedSessions.length} completed vs {abandonedSessions.length} abandoned
          </div>
        </div>

        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-4">
          <span className="text-[11px] text-neutral-400 font-medium block mb-1">
            Total Mobile Registrations
          </span>
          <div className="text-2xl font-black text-neutral-100 font-mono">
            {users.length}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">
            {users.filter((u) => u.hasPlayed).length} participants played
          </div>
        </div>

        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-4">
          <span className="text-[11px] text-neutral-400 font-medium block mb-1">
            Avg Crackers per Round
          </span>
          <div className="text-2xl font-black text-orange-200 font-mono">
            {avgCrackers}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">
            Total burst count: {totalCrackers.toLocaleString()}
          </div>
        </div>

        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-4">
          <span className="text-[11px] text-neutral-400 font-medium block mb-1">
            Top All-Time Score
          </span>
          <div className="text-2xl font-black text-yellow-200 font-mono">
            {stats?.highestScore || 0}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">
            Average: {stats?.averageScore || 0} pts
          </div>
        </div>
      </div>

      {/* Leaderboard Table Card */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-amber-500/15 bg-neutral-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold text-neutral-100 font-['Cinzel',serif] tracking-wide">
              Official Leaderboard Rankings
            </h2>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            Top 10 Performers
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-neutral-400 text-xs">
            Loading leaderboard data...
          </div>
        ) : !stats || stats.leaderboard.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            No completed matches available for ranking.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-semibold text-center w-16">Rank</th>
                  <th className="py-3 px-4 font-semibold">Player Name</th>
                  <th className="py-3 px-4 font-semibold text-right">Score</th>
                  <th className="py-3 px-4 font-semibold text-right">Crackers Burst</th>
                  <th className="py-3 px-4 font-semibold text-right">Max Velocity</th>
                  <th className="py-3 px-4 font-semibold text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {stats.leaderboard.map((entry) => (
                  <tr key={entry.sessionId} className="hover:bg-neutral-900/50">
                    <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                      #{entry.rank}
                    </td>
                    <td className="py-3 px-4 font-semibold text-neutral-100">
                      {entry.userName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-200">
                      {entry.score}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-neutral-300">
                      {entry.crackerCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-neutral-300">
                      {entry.maxSpeed} px/s
                    </td>
                    <td className="py-3 px-4 text-right text-neutral-400">
                      {new Date(entry.completedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
