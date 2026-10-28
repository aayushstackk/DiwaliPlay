/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { GameSession, User } from '../../types/backend';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Camera,
  X
} from 'lucide-react';

interface SessionsSectionProps {
  sessions: GameSession[];
  users: User[];
  isLoading: boolean;
  error: string | null;
}

export const SessionsSection: React.FC<SessionsSectionProps> = ({
  sessions,
  users,
  isLoading,
  error
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
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return '—';
    }
  };

  // Build userId -> userName map
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      map.set(u.id, u.name);
    }
    return map;
  }, [users]);

  const filteredSessions = useMemo(() => {
    const list = sessions.filter((s) => {
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const userName = (userMap.get(s.userId) || '').toLowerCase();
        const codeMatch = (s.code || '').toLowerCase().includes(query);
        const idMatch = (s.id || '').toLowerCase().includes(query);
        const nameMatch = userName.includes(query);

        if (!codeMatch && !idMatch && !nameMatch) return false;
      }

      return true;
    });

    // Sort by session start/creation timestamp
    return list.sort((a, b) => {
      const timeA = new Date(a.startTime || 0).getTime();
      const timeB = new Date(b.startTime || 0).getTime();
      if (sortBy === 'newest') {
        return timeB - timeA;
      } else {
        return timeA - timeB;
      }
    });
  }, [sessions, searchQuery, userMap, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, currentPage, pageSize]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Search & Filter Controls */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
            <Search className="w-4 h-4 text-amber-400/80" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by player, code, or session ID..."
            className="w-full pl-10 pr-4 py-2 bg-neutral-900/90 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-100 text-xs placeholder-neutral-500 transition-colors outline-none"
          />
        </div>

        {/* Sort By Dropdown Control */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <label htmlFor="session-sort" className="text-xs font-semibold text-neutral-400 whitespace-nowrap">
            Sort By:
          </label>
          <select
            id="session-sort"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as 'newest' | 'oldest');
              setCurrentPage(1);
            }}
            className="px-3.5 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-100 text-xs font-medium transition-colors outline-none cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 text-center text-neutral-400 text-xs flex flex-col items-center">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
            <span>Loading gameplay sessions...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-300 text-xs">
            {error}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            No gameplay sessions match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-amber-500/15 bg-neutral-950/60 text-neutral-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 font-semibold">Player</th>
                  <th className="py-3.5 px-4 font-semibold">Code</th>
                  <th className="py-3.5 px-4 font-semibold">Start Time</th>
                  <th className="py-3.5 px-4 font-semibold">End Time</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Score</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Crackers</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Max Speed</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Combos</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Punches</th>
                  <th className="py-3.5 px-4 font-semibold text-center">Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {paginatedSessions.map((session) => {
                  const playerName = userMap.get(session.userId) || 'Anonymous Player';

                  return (
                    <tr
                      key={session.id}
                      className="hover:bg-neutral-900/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-neutral-100">
                        <div className="font-semibold">{playerName}</div>
                        <div className="text-[10px] text-neutral-500 font-mono truncate max-w-[130px]">
                          {session.id}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-neutral-300">
                        <span className="font-mono text-amber-300/90 font-bold text-xs">
                          #{session.code}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-neutral-300 font-mono text-[11px] whitespace-nowrap">
                        {formatTimestamp(session.startTime)}
                      </td>

                      <td className="py-3 px-4 text-[11px] whitespace-nowrap">
                        {session.status === 'PLAYING' || session.status === 'INITIALIZED' ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>In Progress</span>
                          </span>
                        ) : session.endTime ? (
                          <span className="text-neutral-300 font-mono">
                            {formatTimestamp(session.endTime)}
                          </span>
                        ) : (
                          <span className="text-neutral-500 font-mono">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-200 text-sm">
                        {session.score}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-neutral-300">
                        {session.crackerCount || 0}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-neutral-300">
                        {session.maxSpeed || 0} px/s
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-neutral-300">
                        {session.comboCount || 0}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-neutral-300">
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
                            className="group relative w-10 h-10 rounded-lg overflow-hidden border border-amber-500/30 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 mx-auto block bg-neutral-900"
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
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-900/60 border border-neutral-800 text-neutral-500 text-[11px] italic">
                            <Camera className="w-3 h-3 text-neutral-600 shrink-0" />
                            <span>No photo</span>
                          </div>
                        )}
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
          <div className="p-4 border-t border-amber-500/15 bg-neutral-950/40 flex items-center justify-between text-xs text-neutral-400">
            <div>
              Showing{' '}
              <span className="font-semibold text-neutral-200">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-neutral-200">
                {Math.min(currentPage * pageSize, filteredSessions.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-neutral-200">
                {filteredSessions.length}
              </span>{' '}
              sessions
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-amber-500/30 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2 font-mono text-neutral-300">
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-amber-500/30 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-[#14101F] border border-amber-500/30 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-100 font-['Cinzel',serif] flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span>Captured Player Photo</span>
                </h3>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  {selectedPhoto.playerName} {selectedPhoto.code ? `(Code: #${selectedPhoto.code})` : ''} · {selectedPhoto.score} Points
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Close photo preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-neutral-950 flex items-center justify-center max-h-[70vh] overflow-hidden">
              <img
                src={selectedPhoto.url}
                alt={`Photo for ${selectedPhoto.playerName}`}
                className="max-h-[60vh] w-auto rounded-xl object-contain border border-neutral-800 shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
