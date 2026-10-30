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
import { useAdminTheme } from '../AdminThemeContext';

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
  const { isLight } = useAdminTheme();
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

  // Theme-aware styles
  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] shadow-[0_2px_8px_rgba(73,52,38,0.05)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 shadow-sm';
  const labelColor = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Feedback Banner */}
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

      {/* Controls & Filter Bar */}
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
            placeholder="Search by player, code (#8536), or session ID..."
            className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs transition-colors outline-none ${
              isLight
                ? 'bg-[#FAF4E8] border border-[#D8C7AE] text-[#493426] placeholder-[#806B58] focus:border-[#B36D4E]'
                : 'bg-slate-900/90 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-400'
            }`}
          />
        </div>

        {/* Right Action Controls: Sort + Delete All */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Sort Controls */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border ${
            isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <button
              type="button"
              onClick={() => {
                setSortBy('newest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                sortBy === 'newest'
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
                setSortBy('oldest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                sortBy === 'oldest'
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

          {/* Delete All Sessions Button */}
          {sessions.length > 0 && (
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
              <span>Delete All Sessions</span>
            </button>
          )}
        </div>
      </div>

      {/* Sessions Table Card */}
      <div className={`${cardBg} border rounded-2xl overflow-hidden shadow-xl`}>
        {isLoading ? (
          <div className={`p-12 text-center text-xs flex flex-col items-center ${labelColor}`}>
            <div className={`w-8 h-8 border-2 ${isLight ? 'border-[#76513D]' : 'border-cyan-400'} border-t-transparent rounded-full animate-spin mb-3`} />
            <span>Loading gameplay sessions...</span>
          </div>
        ) : error ? (
          <div className={`p-8 text-center text-xs ${isLight ? 'text-[#A74747]' : 'text-rose-300'}`}>
            {error}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className={`p-12 text-center text-xs ${labelColor}`}>
            No gameplay sessions match the selected filters.
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
                  <th className="py-3.5 px-4 font-bold">Player</th>
                  <th className="py-3.5 px-4 font-bold">Code</th>
                  <th className="py-3.5 px-4 font-bold">Start Time</th>
                  <th className="py-3.5 px-4 font-bold">End Time</th>
                  <th className="py-3.5 px-4 font-bold text-right">Score</th>
                  <th className="py-3.5 px-4 font-bold text-right">Crackers</th>
                  <th className="py-3.5 px-4 font-bold text-right">Combos</th>
                  <th className="py-3.5 px-4 font-bold text-right">Punches</th>
                  <th className="py-3.5 px-4 font-bold text-center">Photo</th>
                  <th className="py-3.5 px-4 font-bold text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-[#E8DCCB]' : 'divide-slate-800/60'}`}>
                {paginatedSessions.map((session) => {
                  const playerName = userMap.get(session.userId) || 'Anonymous Player';

                  return (
                    <tr
                      key={session.id}
                      className={`transition-colors ${isLight ? 'hover:bg-[#F5ECE0]' : 'hover:bg-slate-900/50'}`}
                    >
                      <td className={`py-3 px-4 font-medium ${primaryText}`}>
                        <div className="font-bold">{playerName}</div>
                        <div className={`text-[10px] font-mono truncate max-w-[130px] ${labelColor}`}>
                          {session.id}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-bold">
                        <span className={`font-mono text-xs ${isLight ? 'text-[#B36D4E]' : 'text-cyan-300'}`}>
                          #{session.code}
                        </span>
                      </td>

                      <td className={`py-3 px-4 font-mono text-[11px] whitespace-nowrap ${primaryText}`}>
                        {formatTimestamp(session.startTime)}
                      </td>

                      <td className="py-3 px-4 text-[11px] whitespace-nowrap">
                        {session.status === 'PLAYING' || session.status === 'INITIALIZED' ? (
                          <span className={`inline-flex items-center gap-1.5 font-semibold ${
                            isLight ? 'text-[#B36D4E]' : 'text-cyan-300'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                              isLight ? 'bg-[#B36D4E]' : 'bg-cyan-400'
                            }`} />
                            <span>In Progress</span>
                          </span>
                        ) : session.endTime ? (
                          <span className={`font-mono ${primaryText}`}>
                            {formatTimestamp(session.endTime)}
                          </span>
                        ) : (
                          <span className={`font-mono ${labelColor}`}>—</span>
                        )}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                        isLight ? 'text-[#76513D]' : 'text-cyan-200'
                      }`}>
                        {session.score}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono ${primaryText}`}>
                        {session.crackerCount || 0}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono ${primaryText}`}>
                        {session.comboCount || 0}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono ${primaryText}`}>
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
                            className={`group relative w-10 h-10 rounded-lg overflow-hidden border focus:outline-none transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 mx-auto block ${
                              isLight
                                ? 'border-[#D8C7AE] hover:border-[#B36D4E] bg-[#FAF4E8]'
                                : 'border-cyan-500/30 hover:border-cyan-400 bg-slate-900'
                            }`}
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
                          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] italic border ${
                            isLight
                              ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58]'
                              : 'bg-slate-900/60 border-slate-800 text-slate-500'
                          }`}>
                            <Camera className={`w-3 h-3 shrink-0 ${labelColor}`} />
                            <span>No photo</span>
                          </div>
                        )}
                      </td>

                      {/* Individual Delete Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSessionToDelete(session)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            isLight
                              ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58] hover:text-[#A74747] hover:border-[#A74747]/50'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/50'
                          }`}
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
                {Math.min(currentPage * pageSize, filteredSessions.length)}
              </span>{' '}
              of{' '}
              <span className={`font-bold ${primaryText}`}>
                {filteredSessions.length}
              </span>{' '}
              sessions
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

      {/* Confirmation Modal: Delete Single Session */}
      {sessionToDelete && (
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
                  Delete Game Session
                </h3>
                <p className={`text-xs mt-1 ${labelColor}`}>
                  Are you sure you want to delete this session record? Unrelated player registrations will not be affected.
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
              isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className={labelColor}>Player:</span>
                <span className={`font-bold ${primaryText}`}>
                  {userMap.get(sessionToDelete.userId) || 'Anonymous'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={labelColor}>Final Score:</span>
                <span className={`font-mono font-bold ${isLight ? 'text-[#76513D]' : 'text-cyan-300'}`}>
                  {sessionToDelete.score} pts
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={labelColor}>Code / Session ID:</span>
                <span className={`font-mono ${primaryText}`}>#{sessionToDelete.code}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
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

      {/* Confirmation Modal: Delete ALL Sessions */}
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
                  Delete All Game Sessions?
                </h3>
                <p className={`text-xs mt-1 leading-relaxed ${labelColor}`}>
                  This will permanently clear <strong className={primaryText}>all {sessions.length} game sessions and match scores</strong>. Registered player accounts will remain intact.
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              isLight
                ? 'bg-[#A74747]/10 border-[#A74747]/30 text-[#782828]'
                : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            }`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#A74747]' : 'text-rose-400'}`} />
              <span>This action is permanent and cannot be undone.</span>
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
                <span>{isDeletingAll ? 'Deleting All...' : 'Yes, Delete All Sessions'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className={`rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative border ${
              isLight
                ? 'bg-[#FBF5EA] border-[#D8C7AE]'
                : 'bg-[#0F1B2E] border-cyan-500/30'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-4 border-b flex items-center justify-between ${
              isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
            }`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${primaryText}`}>
                  <Camera className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                  <span>Captured Player Photo</span>
                </h3>
                <p className={`text-[11px] mt-0.5 ${isLight ? 'text-[#806B58]' : 'text-cyan-300/80'}`}>
                  {selectedPhoto.playerName} {selectedPhoto.code ? `(Code: #${selectedPhoto.code})` : ''} · {selectedPhoto.score} Points
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight
                    ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#F3E9DA]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`}
                title="Close photo preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`p-4 flex items-center justify-center max-h-[70vh] overflow-hidden ${
              isLight ? 'bg-[#FAF4E8]' : 'bg-slate-950'
            }`}>
              <img
                src={selectedPhoto.url}
                alt={`Photo for ${selectedPhoto.playerName}`}
                className={`max-h-[60vh] w-auto rounded-xl object-contain border shadow-lg ${
                  isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
                }`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
