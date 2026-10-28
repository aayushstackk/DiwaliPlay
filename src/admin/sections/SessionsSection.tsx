/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { GameSession, User } from '../../types/backend';
import { adminApi } from '../../services/api';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Camera,
  X,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface SessionsSectionProps {
  sessions: GameSession[];
  users: User[];
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

export const SessionsSection: React.FC<SessionsSectionProps> = ({
  sessions,
  users,
  isLoading,
  error,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    playerName: string;
    score: number;
    code?: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Deletion States
  const [sessionToDelete, setSessionToDelete] = useState<GameSession | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Escape key listener for photo modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPhoto(null);
      }
    };
    if (selectedPhoto) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPhoto]);

  // Consistent date & time formatter across the table
  const formatTimestamp = (dateString?: string | null): string => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  // Pre-index users for instant O(1) lookup by ID
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      if (u.id) map.set(u.id, u.name);
    });
    return map;
  }, [users]);

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    const result = sessions.filter((s) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const playerName = (userMap.get(s.userId) || '').toLowerCase();
        const codeMatch = (s.code || '').toLowerCase().includes(query);
        const nameMatch = playerName.includes(query);
        const idMatch = (s.id || '').toLowerCase().includes(query);
        if (!nameMatch && !codeMatch && !idMatch) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const timeA = new Date(a.startTime || 0).getTime();
      const timeB = new Date(b.startTime || 0).getTime();
      return sortBy === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [sessions, sortBy, searchQuery, userMap]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, currentPage, pageSize]);

  // Handle Single Session Deletion
  const handleConfirmDeleteSingle = async () => {
    if (!sessionToDelete) return;
    setIsDeletingSingle(true);
    setFeedback(null);

    try {
      const res = await adminApi.deleteSession(sessionToDelete.id);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Game session record deleted successfully.'
        });
        setSessionToDelete(null);
        if (onRefresh) onRefresh();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to delete session.' });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.data?.message || err.message || 'Error deleting game session.'
      });
    } finally {
      setIsDeletingSingle(false);
    }
  };

  // Handle Delete All Sessions
  const handleConfirmDeleteAll = async () => {
    setIsDeletingAll(true);
    setFeedback(null);

    try {
      const res = await adminApi.deleteAllSessions();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `All ${res.count ?? ''} game sessions deleted successfully.`
        });
        setShowDeleteAllModal(false);
        if (onRefresh) onRefresh();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to delete all sessions.' });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.data?.message || err.message || 'Error deleting all game sessions.'
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Feedback Banner */}
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

      {/* Controls & Filter Bar */}
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
            placeholder="Search by player, code (#8536), or session ID..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-700 focus:border-cyan-400 rounded-xl text-slate-100 text-xs placeholder-slate-500 transition-colors outline-none"
          />
        </div>

        {/* Right Action Controls: Sort + Delete All */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Sort Controls */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSortBy('newest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                sortBy === 'newest'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Newest First
            </button>
            <button
              type="button"
              onClick={() => {
                setSortBy('oldest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                sortBy === 'oldest'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Oldest First
            </button>
          </div>

          {/* Delete All Sessions Button */}
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAllModal(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete All Sessions</span>
            </button>
          )}
        </div>
      </div>

      {/* Sessions Table Card */}
      <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3 shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
            <span>Loading gameplay sessions...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-300 text-xs">
            {error}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No gameplay sessions match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-cyan-500/15 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 font-semibold">Player</th>
                  <th className="py-3.5 px-4 font-semibold">Code</th>
                  <th className="py-3.5 px-4 font-semibold">Start Time</th>
                  <th className="py-3.5 px-4 font-semibold">End Time</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Score</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Crackers</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Combos</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Punches</th>
                  <th className="py-3.5 px-4 font-semibold text-center">Photo</th>
                  <th className="py-3.5 px-4 font-semibold text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedSessions.map((session) => {
                  const playerName = userMap.get(session.userId) || 'Anonymous Player';

                  return (
                    <tr
                      key={session.id}
                      className="hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-slate-100">
                        <div className="font-semibold">{playerName}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">
                          {session.id}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        <span className="font-mono text-cyan-300 font-bold text-xs">
                          #{session.code}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                        {formatTimestamp(session.startTime)}
                      </td>

                      <td className="py-3 px-4 text-[11px] whitespace-nowrap">
                        {session.status === 'PLAYING' || session.status === 'INITIALIZED' ? (
                          <span className="inline-flex items-center gap-1.5 text-cyan-300 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            <span>In Progress</span>
                          </span>
                        ) : session.endTime ? (
                          <span className="text-slate-300 font-mono">
                            {formatTimestamp(session.endTime)}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-cyan-200 text-sm">
                        {session.score}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {session.crackerCount || 0}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {session.comboCount || 0}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {session.punchCount || 0}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {session.photoUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPhoto({
                                url: session.photoUrl!,
                                playerName,
                                score: session.score,
                                code: session.code
                              })
                            }
                            className="group relative w-10 h-10 rounded-lg overflow-hidden border border-cyan-500/30 hover:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 mx-auto block bg-slate-900"
                            title={`Click to preview photo for ${playerName}`}
                          >
                            <img
                              src={session.photoUrl}
                              alt={`Photo of ${playerName}`}
                              className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 text-slate-500 text-[11px] italic">
                            <Camera className="w-3 h-3 text-slate-600 shrink-0" />
                            <span>No photo</span>
                          </div>
                        )}
                      </td>

                      {/* Individual Delete Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSessionToDelete(session)}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete session record"
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
        {filteredSessions.length > 0 && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-200">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-200">
                {Math.min(currentPage * pageSize, filteredSessions.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-200">
                {filteredSessions.length}
              </span>{' '}
              sessions
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

      {/* Confirmation Modal: Delete Single Session */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0F1B2E] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Delete Game Session
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Are you sure you want to delete this session record? Unrelated player registrations will not be affected.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Player:</span>
                <span className="font-bold text-slate-100">
                  {userMap.get(sessionToDelete.userId) || 'Anonymous'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Final Score:</span>
                <span className="font-mono text-cyan-300 font-bold">{sessionToDelete.score} pts</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Code / Session ID:</span>
                <span className="font-mono text-slate-300">#{sessionToDelete.code}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
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

      {/* Confirmation Modal: Delete ALL Sessions */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0F1B2E] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-200">
                  Delete All Game Sessions?
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  This will permanently clear <strong className="text-slate-200">all {sessions.length} game sessions and match scores</strong>. Registered player accounts will remain intact.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>This action is permanent and cannot be undone.</span>
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
                <span>{isDeletingAll ? 'Deleting All...' : 'Yes, Delete All Sessions'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-[#0F1B2E] border border-cyan-500/30 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-cyan-400" />
                  <span>Captured Player Photo</span>
                </h3>
                <p className="text-[11px] text-cyan-300/80 mt-0.5">
                  {selectedPhoto.playerName} {selectedPhoto.code ? `(Code: #${selectedPhoto.code})` : ''} · {selectedPhoto.score} Points
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close photo preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[70vh] overflow-hidden">
              <img
                src={selectedPhoto.url}
                alt={`Photo for ${selectedPhoto.playerName}`}
                className="max-h-[60vh] w-auto rounded-xl object-contain border border-slate-800 shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
