/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { User, GameSession, SpinRecord } from '../../types/backend';
import { adminApi } from '../../services/api';
import {
  Search,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  X,
  Users,
  Gift
} from 'lucide-react';
import { useAdminTheme } from '../AdminThemeContext';

interface PlayersSectionProps {
  users: User[];
  sessions?: GameSession[];
  spinResults?: SpinRecord[];
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

export const PlayersSection: React.FC<PlayersSectionProps> = ({
  users,
  sessions = [],
  spinResults = [],
  isLoading,
  error,
  onRefresh
}) => {
  const { isLight } = useAdminTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [revealedMobiles, setRevealedMobiles] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Pre-index won vouchers per player for consistent, accurate display
  const playerVoucherMap = useMemo(() => {
    const map = new Map<string, { status: 'WON' | 'NOT_SPUN' | 'NO_REWARD'; rewardName?: string; couponCode?: string; timestamp?: string }>();

    // Map all user sessions
    const userSessionIdsMap = new Map<string, Set<string>>();
    const sessionEarnedRewardMap = new Map<string, { name: string; couponCode: string; time?: string }>();

    (sessions || []).forEach((s) => {
      if (s.userId) {
        if (!userSessionIdsMap.has(s.userId)) {
          userSessionIdsMap.set(s.userId, new Set());
        }
        userSessionIdsMap.get(s.userId)!.add(s.id);
      }
      if (s.earnedReward?.name) {
        sessionEarnedRewardMap.set(s.id, {
          name: s.earnedReward.name,
          couponCode: s.earnedReward.couponCode,
          time: s.endTime || s.startTime
        });
      }
    });

    users.forEach((u) => {
      const userSessions = userSessionIdsMap.get(u.id);

      // Find matching spin results by userId, sessionId, or mobile number
      const matchingSpins = (spinResults || []).filter((sr) => {
        if (sr.userId && sr.userId === u.id) return true;
        if (sr.sessionId && userSessions && userSessions.has(sr.sessionId)) return true;
        if (sr.mobileNumber && u.mobileNumber && sr.mobileNumber === u.mobileNumber) return true;
        return false;
      });

      if (matchingSpins.length > 0) {
        matchingSpins.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const latestSpin = matchingSpins[0];
        if (latestSpin.rewardName && latestSpin.rewardName.trim() && latestSpin.rewardName.toLowerCase() !== 'no reward') {
          map.set(u.id, {
            status: 'WON',
            rewardName: latestSpin.rewardName,
            couponCode: latestSpin.couponCode,
            timestamp: latestSpin.timestamp
          });
          return;
        } else {
          map.set(u.id, {
            status: 'NO_REWARD',
            timestamp: latestSpin.timestamp
          });
          return;
        }
      }

      // Check if any completed session for this player holds an earnedReward
      if (userSessions) {
        for (const sid of userSessions) {
          const reward = sessionEarnedRewardMap.get(sid);
          if (reward && reward.name && reward.name.trim() && reward.name.toLowerCase() !== 'no reward') {
            map.set(u.id, {
              status: 'WON',
              rewardName: reward.name,
              couponCode: reward.couponCode,
              timestamp: reward.time
            });
            return;
          }
        }
      }

      // Player has not spun
      map.set(u.id, { status: 'NOT_SPUN' });
    });

    return map;
  }, [users, sessions, spinResults]);

  // Deletion States
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const toggleMobileReveal = (userId: string) => {
    setRevealedMobiles((prev) => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const filteredUsers = useMemo(() => {
    const result = users.filter((u) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const nameMatch = (u.name || '').toLowerCase().includes(query);
        const mobileMatch = (u.mobileNumber || '').includes(query);
        if (!nameMatch && !mobileMatch) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [users, sortOrder, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Handle Single Player Deletion
  const handleConfirmDeleteSingle = async () => {
    if (!userToDelete) return;
    setIsDeletingSingle(true);
    setFeedback(null);

    try {
      const res = await adminApi.deleteUser(userToDelete.id);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Player "${userToDelete.name}" deleted successfully.`
        });
        setUserToDelete(null);
        if (onRefresh) onRefresh();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to delete player.' });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.data?.message || err.message || 'Error deleting player registration.'
      });
    } finally {
      setIsDeletingSingle(false);
    }
  };

  // Handle Delete All Players
  const handleConfirmDeleteAll = async () => {
    setIsDeletingAll(true);
    setFeedback(null);

    try {
      const res = await adminApi.deleteAllUsers();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `All ${res.count ?? ''} player registrations deleted successfully.`
        });
        setShowDeleteAllModal(false);
        if (onRefresh) onRefresh();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to delete all players.' });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.data?.message || err.message || 'Error deleting all player registrations.'
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Theme-aware style helpers
  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] shadow-[0_2px_8px_rgba(73,52,38,0.05)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 shadow-sm';
  const labelColor = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? isLight
                ? 'bg-[#58734B]/15 border-[#58734B]/40 text-[#3B5031]'
                : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : isLight
                ? 'bg-[#A74747]/15 border-[#A74747]/40 text-[#782828]'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#58734B]' : 'text-emerald-400'}`} />
            ) : (
              <AlertCircle className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#A74747]' : 'text-rose-400'}`} />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-75 transition-opacity cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className={`${cardBg} border rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center`}>
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400/80'}`} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by player name or mobile..."
            className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs transition-colors outline-none ${
              isLight
                ? 'bg-[#FAF4E8] border border-[#D8C7AE] text-[#493426] placeholder-[#806B58] focus:border-[#B36D4E]'
                : 'bg-slate-900/90 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-400'
            }`}
          />
        </div>

        {/* Right Action Controls: Sort + Delete All */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Sort Control */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border ${
            isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <button
              type="button"
              onClick={() => {
                setSortOrder('newest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                sortOrder === 'newest'
                  ? isLight
                    ? 'bg-[#76513D] text-[#FDF9F3] shadow-sm'
                    : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-sm'
                  : isLight
                    ? 'text-[#806B58] hover:text-[#493426]'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Newest First
            </button>
            <button
              type="button"
              onClick={() => {
                setSortOrder('oldest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                sortOrder === 'oldest'
                  ? isLight
                    ? 'bg-[#76513D] text-[#FDF9F3] shadow-sm'
                    : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-sm'
                  : isLight
                    ? 'text-[#806B58] hover:text-[#493426]'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Oldest First
            </button>
          </div>

          {/* Delete All Players Button */}
          {users.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAllModal(true)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight
                  ? 'bg-[#A74747]/10 border border-[#A74747]/30 hover:bg-[#A74747]/20 text-[#A74747]'
                  : 'bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All Players</span>
            </button>
          )}
        </div>
      </div>

      {/* Players Table Card */}
      <div className={`${cardBg} border rounded-2xl overflow-hidden shadow-xl`}>
        {isLoading ? (
          <div className={`p-12 text-center text-xs flex flex-col items-center ${labelColor}`}>
            <div className={`w-8 h-8 border-2 ${isLight ? 'border-[#76513D]' : 'border-cyan-400'} border-t-transparent rounded-full animate-spin mb-3`} />
            <span>Loading player records...</span>
          </div>
        ) : error ? (
          <div className={`p-8 text-center text-xs ${isLight ? 'text-[#A74747]' : 'text-rose-300'}`}>
            {error}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className={`p-12 text-center text-xs ${labelColor}`}>
            No player records match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={`border-b uppercase tracking-wider text-[10px] ${
                  isLight
                    ? 'bg-[#F3E9DA] border-[#D8C7AE] text-[#493426]'
                    : 'bg-slate-950/60 border-cyan-500/15 text-slate-400'
                }`}>
                  <th className="py-3.5 px-4 font-bold">Player Name</th>
                  <th className="py-3.5 px-4 font-bold">Mobile Number</th>
                  <th className="py-3.5 px-4 font-bold">Won Voucher</th>
                  <th className="py-3.5 px-4 font-bold">Registration Date</th>
                  <th className="py-3.5 px-4 font-bold">Game Feedback</th>
                  <th className="py-3.5 px-4 font-bold text-right">Game Count</th>
                  <th className="py-3.5 px-4 font-bold text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-[#E8DCCB]' : 'divide-slate-800/60'}`}>
                {paginatedUsers.map((user) => {
                  const isRevealed = !!revealedMobiles[user.id];
                  const displayMobile = isRevealed
                    ? user.mobileNumber
                    : `******${user.mobileNumber.slice(-4)}`;

                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors ${isLight ? 'hover:bg-[#F5ECE0]' : 'hover:bg-slate-900/50'}`}
                    >
                      <td className={`py-3 px-4 font-semibold ${primaryText}`}>
                        {user.name}
                      </td>

                      <td className={`py-3 px-4 font-mono ${primaryText}`}>
                        <div className="inline-flex items-center gap-2">
                          <span>{displayMobile}</span>
                          <button
                            type="button"
                            onClick={() => toggleMobileReveal(user.id)}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              isLight ? 'text-[#806B58] hover:text-[#B36D4E]' : 'text-slate-500 hover:text-cyan-300'
                            }`}
                            title={isRevealed ? 'Mask phone number' : 'Reveal full phone number'}
                          >
                            {isRevealed ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Won Voucher Column */}
                      <td className="py-3 px-4">
                        {(() => {
                          const v = playerVoucherMap.get(user.id) || { status: 'NOT_SPUN' };
                          if (v.status === 'WON') {
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-sm w-fit ${
                                  isLight
                                    ? 'bg-[#B36D4E]/15 text-[#76513D] border-[#B36D4E]/30'
                                    : 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                                }`}>
                                  <Gift className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span>{v.rewardName}</span>
                                </span>
                                {v.couponCode && (
                                  <span className={`text-[10px] font-mono px-1 truncate max-w-[130px] ${labelColor}`} title={`Coupon: ${v.couponCode}`}>
                                    {v.couponCode}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          if (v.status === 'NO_REWARD') {
                            return (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border w-fit ${
                                isLight
                                  ? 'bg-[#E8DCCB]/60 text-[#806B58] border-[#D8C7AE]'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}>
                                No Reward
                              </span>
                            );
                          }
                          return (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border w-fit ${
                              isLight
                                ? 'bg-[#F3E9DA]/50 text-[#806B58] border-[#D8C7AE]/60'
                                : 'bg-slate-900/60 text-slate-500 border-slate-800'
                            }`}>
                              Not Spun
                            </span>
                          );
                        })()}
                      </td>

                      <td className={`py-3 px-4 ${labelColor}`}>
                        {new Date(user.createdAt).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </td>

                      <td className="py-3 px-4">
                        {user.feedback === 'Excellent' ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isLight
                              ? 'bg-[#58734B]/15 text-[#3B5031] border-[#58734B]/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            Excellent
                          </span>
                        ) : user.feedback === 'Good' ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isLight
                              ? 'bg-[#B36D4E]/15 text-[#8B452B] border-[#B36D4E]/30'
                              : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                          }`}>
                            Good
                          </span>
                        ) : user.feedback === 'Needs Improvement' ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isLight
                              ? 'bg-[#A74747]/15 text-[#782828] border-[#A74747]/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}>
                            Needs Improvement
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                            isLight
                              ? 'bg-[#FAF4E8] text-[#806B58] border-[#D8C7AE]'
                              : 'bg-slate-800/60 text-slate-400 border-slate-700/50'
                          }`}>
                            Not Submitted
                          </span>
                        )}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono font-bold ${primaryText}`}>
                        {user.playCount || (user.hasPlayed ? 1 : 0)}
                      </td>

                      {/* Individual Delete Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setUserToDelete(user)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            isLight
                              ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58] hover:text-[#A74747] hover:border-[#A74747]/50'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/50'
                          }`}
                          title="Delete player registration"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredUsers.length > 0 && (
          <div className={`p-4 border-t flex items-center justify-between text-xs ${
            isLight
              ? 'border-[#D8C7AE] bg-[#F3E9DA] text-[#806B58]'
              : 'border-slate-800 bg-slate-950/40 text-slate-400'
          }`}>
            <div>
              Showing{' '}
              <span className={`font-bold ${primaryText}`}>
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className={`font-bold ${primaryText}`}>
                {Math.min(currentPage * pageSize, filteredUsers.length)}
              </span>{' '}
              of{' '}
              <span className={`font-bold ${primaryText}`}>
                {filteredUsers.length}
              </span>{' '}
              players
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLight
                    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:border-[#B36D4E]'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-cyan-500/30'
                }`}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className={`px-2 font-mono font-bold ${primaryText}`}>
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLight
                    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:border-[#B36D4E]'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-cyan-500/30'
                }`}
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal: Delete Single Player */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border ${
            isLight
              ? 'bg-[#FBF5EA] border-[#D8C7AE]'
              : 'bg-[#0F1B2E] border-slate-800'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isLight
                  ? 'bg-[#A74747]/15 border-[#A74747]/30 text-[#A74747]'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
              }`}>
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${primaryText}`}>
                  Delete Player Registration
                </h3>
                <p className={`text-xs mt-1 ${labelColor}`}>
                  Are you sure you want to delete this player? Active game codes for this player will also be removed.
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
              isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className={labelColor}>Player Name:</span>
                <span className={`font-bold ${primaryText}`}>{userToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={labelColor}>Mobile Number:</span>
                <span className={`font-mono font-bold ${isLight ? 'text-[#B36D4E]' : 'text-cyan-300'}`}>
                  {userToDelete.mobileNumber}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeletingSingle}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                  isLight
                    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:bg-[#F3E9DA]'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingle}
                disabled={isDeletingSingle}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isLight
                    ? 'bg-[#A74747] hover:bg-[#8D3838] shadow-[0_2px_12px_rgba(167,71,71,0.25)]'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                }`}
              >
                {isDeletingSingle ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeletingSingle ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete ALL Players */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border ${
            isLight
              ? 'bg-[#FBF5EA] border-[#A74747]/40'
              : 'bg-[#0F1B2E] border-rose-500/40'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isLight
                  ? 'bg-[#A74747]/15 border-[#A74747]/30 text-[#A74747]'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isLight ? 'text-[#782828]' : 'text-rose-200'}`}>
                  Delete All Player Registrations?
                </h3>
                <p className={`text-xs mt-1 leading-relaxed ${labelColor}`}>
                  This will permanently delete <strong className={primaryText}>all {users.length} player registrations</strong> and their associated active game codes. Game session telemetry logs will be preserved.
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              isLight
                ? 'bg-[#A74747]/10 border-[#A74747]/30 text-[#782828]'
                : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            }`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#A74747]' : 'text-rose-400'}`} />
              <span>This action is irreversible and cannot be undone.</span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                  isLight
                    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:bg-[#F3E9DA]'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isLight
                    ? 'bg-[#A74747] hover:bg-[#8D3838] shadow-[0_2px_15px_rgba(167,71,71,0.3)]'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                }`}
              >
                {isDeletingAll ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeletingAll ? 'Deleting All...' : 'Yes, Delete All Players'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
