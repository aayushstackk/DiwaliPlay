/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trophy, Sparkles, Info, Heart, Award } from 'lucide-react';

export const WishesSection: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Informational Notice */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sm mb-1 text-amber-100">
            Wishes & Achievement Card Architecture
          </h3>
          <p className="text-amber-300/80 leading-relaxed">
            At Game Over, the application renders a high-definition commemorative card combining the player's photo, calculated score tier, achievement title, and a warm festive greeting. A dynamic visual template builder with custom frame borders is scheduled for <strong>Phase 4</strong>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Achievement Tiers Card */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                Active Achievement Tiers
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-amber-500/30 flex items-center justify-between">
                <div>
                  <div className="font-bold text-amber-300 font-['Cinzel',serif] text-sm">
                    Diwali Legend
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    "May your Diwali shine as brightly as your legendary motion skills!"
                  </div>
                </div>
                <span className="font-mono text-amber-400 font-bold text-xs">2000+ Pts</span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-amber-200 font-['Cinzel',serif] text-sm">
                    Light Master
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    "Brilliant play! Lighting up the celebration with stellar energy."
                  </div>
                </div>
                <span className="font-mono text-amber-300 font-bold text-xs">1500 - 1999 Pts</span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-orange-200 font-['Cinzel',serif] text-sm">
                    Rocket Ace
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    "Fast hands and soaring spirits! A true festival celebration."
                  </div>
                </div>
                <span className="font-mono text-orange-300 font-bold text-xs">1000 - 1499 Pts</span>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-neutral-200 font-['Cinzel',serif] text-sm">
                    Festive Sparkler
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    "Wishing you joy, prosperity, and endless festive moments!"
                  </div>
                </div>
                <span className="font-mono text-neutral-400 font-bold text-xs">&lt; 1000 Pts</span>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-neutral-500">
            Achievement titles appear on the final generated download card.
          </div>
        </div>

        {/* Dynamic Personalization Variables & Phase 4 Roadmap */}
        <div className="bg-[#14101F]/70 border border-amber-500/15 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800">
              <Award className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-neutral-100 font-['Cinzel',serif]">
                Template Variables & Phase 4 Editor
              </h2>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              Supported template tags dynamically replaced when generating greeting cards for players:
            </p>

            <div className="space-y-3 text-xs mb-4">
              <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="font-mono text-amber-300 font-bold block">{`{playerName}`}</span>
                  <span className="text-[11px] text-neutral-400">Player's registered name (e.g., "Rahul Sharma")</span>
                </div>
                <span className="text-[10px] text-emerald-400">Active</span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="font-mono text-amber-300 font-bold block">{`{score}`}</span>
                  <span className="text-[11px] text-neutral-400">Final score achieved across the 35s game</span>
                </div>
                <span className="text-[10px] text-emerald-400">Active</span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="font-mono text-amber-300 font-bold block">{`{rank}`}</span>
                  <span className="text-[11px] text-neutral-400">Player leaderboard position among participants</span>
                </div>
                <span className="text-[10px] text-emerald-400">Active</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-400">
              In Phase 4, operators will be able to customize greeting copy, upload festive floral borders, and adjust typography sizing.
            </p>
          </div>

          <div className="mt-6 p-3 rounded-xl bg-neutral-950/70 border border-neutral-800/80 text-center text-xs text-neutral-400">
            Custom card template visual editor will be enabled in Phase 4.
          </div>
        </div>
      </div>
    </div>
  );
};
