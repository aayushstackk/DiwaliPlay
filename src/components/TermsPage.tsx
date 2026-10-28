/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { TermsContent } from './TermsModal';
import { BrandingBlock } from './BrandingBlock';

export const TermsPage: React.FC = () => {
  return (
    <div className="min-h-screen w-screen bg-[#0A0713] text-neutral-100 flex flex-col justify-between p-4 sm:p-8 font-['Plus_Jakarta_Sans',sans-serif] relative">
      {/* Background ambient lighting */}
      <div className="fixed top-0 left-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-80 h-80 bg-orange-600/10 rounded-full blur-[130px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-2xl mx-auto z-10 pt-2 pb-4 flex flex-col items-center">
        <BrandingBlock size="mobile" className="mb-2" />
        <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs font-mono font-bold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>TERMS & CONDITIONS</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl mx-auto z-10 flex-1 my-2">
        <div className="bg-neutral-900/90 border border-amber-500/30 rounded-2xl p-5 sm:p-7 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-md">
          <TermsContent />

          <div className="pt-6 border-t border-neutral-800 flex justify-center">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/register';
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer transition-all active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Registration</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-2xl mx-auto text-center z-10 pt-4 pb-2 text-[10px] text-neutral-500 font-mono">
        Diwali Fun Play · Participant Terms & Conditions
      </footer>
    </div>
  );
};

