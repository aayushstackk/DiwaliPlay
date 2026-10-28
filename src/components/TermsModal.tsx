/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X, ShieldCheck, Camera, Trophy, Sparkles, FileText, Check } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export const TermsContent: React.FC = () => {
  return (
    <div className="space-y-4 text-xs sm:text-sm text-neutral-300 leading-relaxed font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Overview Banner */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-amber-100 block mb-0.5">
            Diwali Fun Play — Participant Guidelines (Version 1.0)
          </span>
          Please review these terms before generating your game pass code. Participation is voluntary.
        </div>
      </div>

      {/* Section 1 */}
      <section className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1.5">
        <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs sm:text-sm">
          <FileText className="w-4 h-4 text-amber-400" />
          <h3>1. Event Participation & Game Pass Code</h3>
        </div>
        <p className="text-neutral-300 text-xs">
          Participation in the Diwali Fun Play motion challenge is open to event attendees. Each valid 10-digit mobile number receives one unique 4-digit game pass code. Each mobile number is entitled to one official gameplay round to ensure fair participation for all attendees.
        </p>
      </section>

      {/* Section 2 */}
      <section className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1.5">
        <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs sm:text-sm">
          <Camera className="w-4 h-4 text-amber-400" />
          <h3>2. Optical Camera Sensor & Real-Time Hand Tracking</h3>
        </div>
        <p className="text-neutral-300 text-xs">
          The interactive game kiosk utilizes a standard web camera connected to a client-side computer vision system (MediaPipe) to detect hand positions, speed, and gestures. Hand tracking is processed locally in real time solely to power in-game cracker effects, sparkles, and motions. Live video is displayed on-screen during the initial alignment phase and is hidden during active gameplay. Live video feeds are not continuously recorded or broadcast.
        </p>
      </section>

      {/* Section 3 */}
      <section className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1.5">
        <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs sm:text-sm">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3>3. Gameplay Scores, Metrics & Celebration Photo</h3>
        </div>
        <p className="text-neutral-300 text-xs">
          Upon completing the 35-second motion challenge, your score, cracker count, top movement speed, combo multiplier, and session duration are recorded in the event leaderboard system. A single celebration photo frame is captured at the moment of game completion to generate your personalized celebration souvenir card.
        </p>
      </section>

      {/* Section 4 */}
      <section className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1.5">
        <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs sm:text-sm">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3>4. Optional Participant Feedback</h3>
        </div>
        <p className="text-neutral-300 text-xs">
          At the conclusion of the game, players may optionally select and submit feedback regarding their experience (Good, Excellent, or Needs Improvement). This feedback is recorded alongside the session to help organizers evaluate and improve event operations.
        </p>
      </section>

      {/* Section 5 */}
      <section className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1.5">
        <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs sm:text-sm">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <h3>5. Data Privacy & Administrative Handling</h3>
        </div>
        <p className="text-neutral-300 text-xs">
          Registration details (player name and mobile number) and associated gameplay scores are maintained in the event database to identify participants, authenticate kiosk entry, prevent duplicate plays, and display leaderboard standings. Information is used strictly for the administration and operation of this interactive event experience.
        </p>
      </section>

      <div className="text-[11px] text-neutral-500 font-mono text-center pt-1">
        Diwali Fun Play · Terms & Conditions · Version 1.0
      </div>
    </div>
  );
};

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, onAccept }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] bg-[#0E0A1A] border border-amber-500/30 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden text-neutral-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-amber-500/20 flex items-center justify-between bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-amber-100 font-['Cinzel',serif] tracking-wide">
                Terms & Conditions
              </h2>
              <span className="text-[10px] text-amber-400/80 font-mono uppercase tracking-wider">
                Diwali Fun Play Experience
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto max-h-[62vh] space-y-4">
          <TermsContent />
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-amber-500/20 bg-neutral-950/80 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer transition-all"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>I Agree & Accept</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

