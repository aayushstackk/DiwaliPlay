/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { User } from '../../types/backend';
import { Search, Eye, EyeOff, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';

interface PlayersSectionProps {
  users: User[];
  isLoading: boolean;
  error: string | null;
}

export const PlayersSection: React.FC<PlayersSectionProps> = ({
  users,
  isLoading,
  error
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [revealedMobiles, setRevealedMobiles] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const toggleMobileReveal = (userId: string) => {
    setRevealedMobiles((prev) => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const filteredUsers = useMemo(() => {
    const result = users.filter((u) => {
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const nameMatch = (u.name || '').toLowerCase().includes(query);
        const mobileMatch = (u.mobileNumber || '').includes(query);
        if (!nameMatch && !mobileMatch) return false;
      }

      return true;
    });

    // Sort by registration timestamp (createdAt)
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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Controls Bar */}
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
            placeholder="Search by player name or mobile..."
            className="w-full pl-10 pr-4 py-2 bg-neutral-900/90 border border-neutral-700 focus:border-amber-400 rounded-xl text-neutral-100 text-xs placeholder-neutral-500 transition-colors outline-none"
          />
        </div>

        {/* Sort By Control */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs text-neutral-400 font-medium flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
            <span>Sort By:</span>
          </span>
          <div className="flex items-center gap-1 p-1 bg-neutral-900/90 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => {
                setSortOrder('newest');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                sortOrder === 'newest'
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
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
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Oldest First
            </button>
          </div>
        </div>
      </div>

      {/* Players Table Card */}
      <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 text-center text-neutral-400 text-xs flex flex-col items-center">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
            <span>Loading player records...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-300 text-xs">
            {error}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            No player records match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-amber-500/15 bg-neutral-950/60 text-neutral-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 font-semibold">Player Name</th>
                  <th className="py-3.5 px-4 font-semibold">Mobile Number</th>
                  <th className="py-3.5 px-4 font-semibold">Registration Date</th>
                  <th className="py-3.5 px-4 font-semibold">Game Feedback</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Game Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {paginatedUsers.map((user) => {
                  const isRevealed = !!revealedMobiles[user.id];
                  const displayMobile = isRevealed
                    ? user.mobileNumber
                    : `******${user.mobileNumber.slice(-4)}`;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-neutral-900/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-neutral-100">
                        {user.name}
                      </td>

                      <td className="py-3 px-4 text-neutral-300 font-mono">
                        <div className="inline-flex items-center gap-2">
                          <span>{displayMobile}</span>
                          <button
                            type="button"
                            onClick={() => toggleMobileReveal(user.id)}
                            className="p-1 rounded text-neutral-500 hover:text-amber-300 transition-colors cursor-pointer"
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

                      <td className="py-3 px-4 text-neutral-400">
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
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Good
                          </span>
                        ) : user.feedback === 'Needs Improvement' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                            Needs Improvement
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-neutral-400 bg-neutral-800/60 border border-neutral-700/50">
                            Not Submitted
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-neutral-200">
                        {user.playCount || (user.hasPlayed ? 1 : 0)}
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
          <div className="p-4 border-t border-amber-500/15 bg-neutral-950/40 flex items-center justify-between text-xs text-neutral-400">
            <div>
              Showing{' '}
              <span className="font-semibold text-neutral-200">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-neutral-200">
                {Math.min(currentPage * pageSize, filteredUsers.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-neutral-200">
                {filteredUsers.length}
              </span>{' '}
              players
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
    </div>
  );
};
