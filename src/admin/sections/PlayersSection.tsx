/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { User } from '../../types/backend';
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
  Users
} from 'lucide-react';

interface PlayersSectionProps {
  users: User[];
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

export const PlayersSection: React.FC<PlayersSectionProps> = ({
  users,
  isLoading,
  error,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [revealedMobiles, setRevealedMobiles] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-75 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-cyan-400/80" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by player name or mobile..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-700 focus:border-cyan-400 rounded-xl text-slate-100 text-xs placeholder-slate-500 transition-colors outline-none"
          />
        </div>

        {/* Right Action Controls: Sort + Delete All */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Sort Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSortOrder('newest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                sortOrder === 'newest'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-sm'
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
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                sortOrder === 'oldest'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-sm'
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
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete All Players</span>
            </button>
          )}
        </div>
      </div>

      {/* Players Table Card */}
      <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3 shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
            <span>Loading player records...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-300 text-xs">
            {error}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No player records match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-cyan-500/15 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 font-semibold">Player Name</th>
                  <th className="py-3.5 px-4 font-semibold">Mobile Number</th>
                  <th className="py-3.5 px-4 font-semibold">Registration Date</th>
                  <th className="py-3.5 px-4 font-semibold">Game Feedback</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Game Count</th>
                  <th className="py-3.5 px-4 font-semibold text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedUsers.map((user) => {
                  const isRevealed = !!revealedMobiles[user.id];
                  const displayMobile = isRevealed
                    ? user.mobileNumber
                    : `******${user.mobileNumber.slice(-4)}`;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-slate-100">
                        {user.name}
                      </td>

                      <td className="py-3 px-4 text-slate-300 font-mono">
                        <div className="inline-flex items-center gap-2">
                          <span>{displayMobile}</span>
                          <button
                            type="button"
                            onClick={() => toggleMobileReveal(user.id)}
                            className="p-1 rounded text-slate-500 hover:text-cyan-300 transition-colors cursor-pointer"
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

                      <td className="py-3 px-4 text-slate-400">
                        {new Date(user.createdAt).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </td>

                      <td className="py-3 px-4">
                        {user.feedback === 'Excellent' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Excellent
                          </span>
                        ) : user.feedback === 'Good' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            Good
                          </span>
                        ) : user.feedback === 'Needs Improvement' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Needs Improvement
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700/50">
                            Not Submitted
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                        {user.playCount || (user.hasPlayed ? 1 : 0)}
                      </td>

                      {/* Individual Delete Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setUserToDelete(user)}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 transition-colors"
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
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-200">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-200">
                {Math.min(currentPage * pageSize, filteredUsers.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-200">
                {filteredUsers.length}
              </span>{' '}
              players
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2 font-mono text-slate-300">
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0F1B2E] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Delete Player Registration
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Are you sure you want to delete this player? Active game codes for this player will also be removed.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Player Name:</span>
                <span className="font-bold text-slate-100">{userToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Mobile Number:</span>
                <span className="font-mono text-cyan-300">{userToDelete.mobileNumber}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeletingSingle}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingle}
                disabled={isDeletingSingle}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0F1B2E] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-200">
                  Delete All Player Registrations?
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  This will permanently delete <strong className="text-slate-200">all {users.length} player registrations</strong> and their associated active game codes. Game session telemetry logs will be preserved.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>This action is irreversible and cannot be undone.</span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-all disabled:opacity-50"
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
