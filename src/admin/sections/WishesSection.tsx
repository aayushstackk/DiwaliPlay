/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AchievementTier } from '../../types/backend';
import { adminApi } from '../../services/api';
import { DEFAULT_ACHIEVEMENT_TIERS } from '../../utils/achievements';
import {
  Trophy,
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Tag,
  MessageSquare,
  Award,
  Layers,
  X,
  Check
} from 'lucide-react';

export const WishesSection: React.FC = () => {
  const [tiers, setTiers] = useState<AchievementTier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [editingTier, setEditingTier] = useState<AchievementTier | null>(null);
  const [isNewTier, setIsNewTier] = useState(false);

  // Wish Edit / Add Modal
  const [activeTierForWish, setActiveTierForWish] = useState<string | null>(null);
  const [wishText, setWishText] = useState('');
  const [editingWishIndex, setEditingWishIndex] = useState<number | null>(null);

  // Load existing tiers from settings
  useEffect(() => {
    let mounted = true;
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const res = await adminApi.getSettings();
        if (mounted && res.success && res.settings.achievementTiers && res.settings.achievementTiers.length > 0) {
          setTiers(res.settings.achievementTiers);
        } else if (mounted) {
          setTiers(DEFAULT_ACHIEVEMENT_TIERS);
        }
      } catch (err) {
        console.warn('Failed to load achievement tiers:', err);
        if (mounted) setTiers(DEFAULT_ACHIEVEMENT_TIERS);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    fetchSettings();
    return () => {
      mounted = false;
    };
  }, []);

  // Save Tiers to Backend Database
  const handleSaveTiers = async (tiersToSave = tiers) => {
    // Validate score ranges
    for (const t of tiersToSave) {
      if (typeof t.minScore !== 'number' || isNaN(t.minScore) || t.minScore < 0) {
        setFeedback({ type: 'error', message: `Tier "${t.title}" must have a valid minimum score >= 0.` });
        return;
      }
      if (t.maxScore !== null && typeof t.maxScore === 'number' && t.maxScore < t.minScore) {
        setFeedback({ type: 'error', message: `Tier "${t.title}" max score cannot be less than its min score.` });
        return;
      }
      if (!t.wishes || t.wishes.length === 0) {
        setFeedback({ type: 'error', message: `Tier "${t.title}" must have at least one wish configured.` });
        return;
      }
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await adminApi.updateSettings({
        achievementTiers: tiersToSave
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Achievement tiers and wishes successfully saved to database! Active in Game Over screen.'
        });
      } else {
        setFeedback({ type: 'error', message: 'Failed to save achievement tiers.' });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.data?.message || err.message || 'Error updating achievement tiers.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to Factory Defaults
  const handleResetDefaults = () => {
    if (!confirm('Reset all achievement tiers and wishes back to factory defaults?')) return;
    setTiers(DEFAULT_ACHIEVEMENT_TIERS);
    setFeedback({
      type: 'success',
      message: 'Reset to factory defaults. Click "Save Tiers & Wishes" to persist.'
    });
  };

  // Open Add Tier Modal
  const handleOpenAddTier = () => {
    setEditingTier({
      id: `tier_${Date.now()}`,
      title: 'New Achievement Tier',
      subtitle: 'Motion Challenger',
      minScore: 0,
      maxScore: null,
      emoji: '🏆',
      badgeColor: 'from-amber-400 via-amber-300 to-yellow-200',
      wishes: [
        'HAPPY DIWALI, {playerName}! 🪔✨\nYou scored {score} points!\nWishing you boundless joy and prosperity.\n— {brandName}'
      ]
    });
    setIsNewTier(true);
  };

  // Open Edit Tier Modal
  const handleOpenEditTier = (tier: AchievementTier) => {
    setEditingTier({ ...tier });
    setIsNewTier(false);
  };

  // Save Tier from Modal
  const handleSaveTierModal = () => {
    if (!editingTier) return;
    if (!editingTier.title.trim()) {
      alert('Please enter a tier title.');
      return;
    }

    if (isNewTier) {
      const updated = [...tiers, editingTier];
      setTiers(updated);
    } else {
      const updated = tiers.map((t) => (t.id === editingTier.id ? editingTier : t));
      setTiers(updated);
    }

    setEditingTier(null);
  };

  // Delete Tier
  const handleDeleteTier = (tierId: string) => {
    if (tiers.length <= 1) {
      alert('You must have at least one achievement tier configured.');
      return;
    }
    const t = tiers.find((item) => item.id === tierId);
    if (!confirm(`Delete achievement tier "${t?.title}"?`)) return;
    setTiers((prev) => prev.filter((item) => item.id !== tierId));
  };

  // Open Add Wish Modal
  const handleOpenAddWish = (tierId: string) => {
    setActiveTierForWish(tierId);
    setEditingWishIndex(null);
    setWishText('HAPPY DIWALI, {playerName}! 🪔✨\nSpectacular performance with {score} points!\nMay this year bring you glowing wins and golden memories.\nWarm regards,\n{brandName}');
  };

  // Open Edit Wish Modal
  const handleOpenEditWish = (tierId: string, index: number) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier || !tier.wishes[index]) return;
    setActiveTierForWish(tierId);
    setEditingWishIndex(index);
    setWishText(tier.wishes[index]);
  };

  // Save Wish from Modal
  const handleSaveWishModal = () => {
    if (!activeTierForWish || !wishText.trim()) return;

    setTiers((prev) =>
      prev.map((t) => {
        if (t.id !== activeTierForWish) return t;
        const wishes = [...t.wishes];
        if (editingWishIndex !== null) {
          wishes[editingWishIndex] = wishText.trim();
        } else {
          wishes.push(wishText.trim());
        }
        return { ...t, wishes };
      })
    );

    setActiveTierForWish(null);
    setEditingWishIndex(null);
    setWishText('');
  };

  // Delete Wish from Tier
  const handleDeleteWish = (tierId: string, index: number) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    if (tier.wishes.length <= 1) {
      alert('Each tier must have at least one wish configured.');
      return;
    }
    if (!confirm('Delete this wish message?')) return;
    setTiers((prev) =>
      prev.map((t) => {
        if (t.id !== tierId) return t;
        return {
          ...t,
          wishes: t.wishes.filter((_, idx) => idx !== index)
        };
      })
    );
  };

  // Insert Variable helper
  const handleInsertTag = (tag: string) => {
    setWishText((prev) => prev + tag);
  };

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[350px] text-slate-400">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3 shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
        <p className="text-xs">Loading Wishes & Achievement Tiers...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Save Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Trophy className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-wide">
              Wishes & Achievements
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Dynamic score ranges, achievement badges, and multiple rotating festive wishes
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddTier}
            className="px-3.5 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Tier</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveTiers()}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Tiers & Wishes'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Dynamic Template Tags Quick Reference Box */}
      <div className="p-4 rounded-2xl bg-[#0F1B2E]/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-cyan-300">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-semibold text-slate-200">
            Dynamic Template Tags Supported in Wishes:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
            {'{playerName}'}
          </span>
          <span className="px-2 py-0.5 rounded bg-teal-500/15 border border-teal-500/30 text-teal-300">
            {'{score}'}
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
            {'{rank}'}
          </span>
          <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300">
            {'{brandName}'}
          </span>
        </div>
      </div>

      {/* Tiers List */}
      <div className="space-y-5">
        {tiers.map((tier, tierIdx) => {
          const scoreLabel =
            tier.maxScore === null || tier.maxScore === undefined
              ? `${tier.minScore}+ Pts`
              : `${tier.minScore} - ${tier.maxScore} Pts`;

          return (
            <div
              key={tier.id || tierIdx}
              className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4"
            >
              {/* Tier Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="text-2xl p-2 rounded-xl bg-slate-900 border border-slate-800">
                    {tier.emoji || '🪔'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-base font-bold text-slate-100">
                        {tier.title}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        {scoreLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {tier.subtitle || 'Festival Motion Challenger'} ·{' '}
                      <span className="text-teal-400 font-mono">
                        {tier.wishes.length} {tier.wishes.length === 1 ? 'wish' : 'wishes (rotating)'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddWish(tier.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Add Wish</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditTier(tier)}
                    className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                    title="Edit Tier Settings"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteTier(tier.id)}
                    className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-xs transition-colors"
                    title="Delete Tier"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Wishes List within Tier */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {tier.wishes.map((wish, wIdx) => (
                  <div
                    key={wIdx}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between gap-3 group hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-2">
                        <span className="font-semibold text-cyan-400/90">
                          WISH #{wIdx + 1}
                        </span>
                        <span>Multi-line formatting preserved</span>
                      </div>
                      <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans">
                        {wish}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditWish(tier.id, wIdx)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteWish(tier.id, wIdx)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-[11px] font-medium flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tier Add / Edit Modal */}
      {editingTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0F1B2E] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-cyan-400" />
                <span>{isNewTier ? 'Add Achievement Tier' : 'Edit Achievement Tier'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingTier(null)}
                className="p-1 text-slate-400 hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Title & Emoji */}
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3 space-y-1">
                  <label className="text-slate-400 font-medium">Tier Title</label>
                  <input
                    type="text"
                    value={editingTier.title}
                    onChange={(e) => setEditingTier({ ...editingTier, title: e.target.value })}
                    placeholder="e.g. Diwali Legend"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">Emoji</label>
                  <input
                    type="text"
                    value={editingTier.emoji || '🪔'}
                    onChange={(e) => setEditingTier({ ...editingTier, emoji: e.target.value })}
                    className="w-full text-center px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-cyan-400 text-base"
                  />
                </div>
              </div>

              {/* Subtitle */}
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">Subtitle / Tagline</label>
                <input
                  type="text"
                  value={editingTier.subtitle || ''}
                  onChange={(e) => setEditingTier({ ...editingTier, subtitle: e.target.value })}
                  placeholder="e.g. Grand Fireworks Legend"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-cyan-400"
                />
              </div>

              {/* Score Range: Min and Max */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">Min Score (Pts)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingTier.minScore}
                    onChange={(e) =>
                      setEditingTier({ ...editingTier, minScore: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">
                    Max Score <span className="text-slate-500 font-normal">(Leave blank for open-ended)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="None (unbounded)"
                    value={editingTier.maxScore !== null && editingTier.maxScore !== undefined ? editingTier.maxScore : ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      setEditingTier({ ...editingTier, maxScore: val });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingTier(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTierModal}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                {isNewTier ? 'Create Tier' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wish Add / Edit Modal */}
      {activeTierForWish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0F1B2E] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <span>{editingWishIndex !== null ? 'Edit Festive Wish' : 'Add New Festive Wish'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setActiveTierForWish(null)}
                className="p-1 text-slate-400 hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-[11px] text-slate-400 mr-1">Insert Variable:</span>
                {['{playerName}', '{score}', '{rank}', '{brandName}'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleInsertTag(tag)}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 font-mono text-[10.5px] transition-colors"
                  >
                    +{tag}
                  </button>
                ))}
              </div>

              <textarea
                rows={6}
                value={wishText}
                onChange={(e) => setWishText(e.target.value)}
                placeholder="Write your greeting message here..."
                className="w-full p-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-sans leading-relaxed outline-none focus:border-cyan-400 text-xs resize-none"
              />

              <p className="text-[11px] text-slate-500">
                Tip: Use multiple lines. Line 1 is treated as the banner greeting, middle lines as personal blessings, and the last line as your signoff.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTierForWish(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveWishModal}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                {editingWishIndex !== null ? 'Update Wish' : 'Add Wish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
