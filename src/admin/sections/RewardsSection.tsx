/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RewardItem, RewardsSettings, SpinRecord, RewardMode } from '../../types/backend';
import { adminApi } from '../../services/api';
import { useAdminTheme } from '../AdminThemeContext';
import {
  Gift,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  History,
  RotateCw,
  Image as ImageIcon,
  Upload,
  Play,
  Power
} from 'lucide-react';
import { SpinWheelModal } from '../../components/SpinWheelModal';

type ActiveTab = 'rewards' | 'test_wheel' | 'spin_history';

interface ToastNotification {
  id: string;
  type: 'success' | 'error';
  title: string;
  message: string;
}

export const RewardsSection: React.FC = () => {
  const { isLight } = useAdminTheme();

  // Dynamic Theme Palette
  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] text-[#493426] shadow-[0_1px_4px_rgba(73,52,38,0.04)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 text-slate-100 shadow-sm';
  const cardSubBg = isLight ? 'bg-[#FAF4E8] border-[#D8C7AE]' : 'bg-slate-900/90 border-slate-800';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';
  const secondaryText = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const inputBg = isLight
    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] placeholder-[#806B58]/60 focus:border-[#B36D4E]'
    : 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-400';

  // State
  const [activeTab, setActiveTab] = useState<ActiveTab>('rewards');
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [settings, setSettings] = useState<RewardsSettings>({ enabled: true });
  const [spinRecords, setSpinRecords] = useState<SpinRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTogglingMaster, setIsTogglingMaster] = useState(false);

  // Modals
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<RewardItem | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Test Wheel Modal
  const [isTestWheelOpen, setIsTestWheelOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: 'success' | 'error', title: string, message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    const id = Date.now().toString();
    setToast({ id, type, title, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3200);
  }, []);

  // Load all initial data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rewardsRes, spinRes] = await Promise.all([
        adminApi.getRewards().catch(() => null),
        adminApi.getSpinResults().catch(() => null)
      ]);

      if (rewardsRes?.success) {
        setRewards(rewardsRes.rewards || []);
        if (typeof rewardsRes.enabled === 'boolean') {
          setSettings({ enabled: rewardsRes.enabled });
        }
      }
      if (spinRes?.success) {
        setSpinRecords(spinRes.spinResults || []);
      }
    } catch (err: any) {
      showToast('error', 'Failed to load data', err.message || 'Please refresh page.');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Master ON/OFF toggle (placed right beside title)
  const handleToggleMaster = async () => {
    const newStatus = !settings.enabled;
    setIsTogglingMaster(true);
    try {
      const res = await adminApi.updateRewardsSettings({ enabled: newStatus });
      if (res.success && res.settings) {
        setSettings(res.settings);
        showToast(
          'success',
          newStatus ? 'Spin Wheel Enabled' : 'Spin Wheel Disabled',
          newStatus ? 'Spin & Win is now visible to players.' : 'Spin & Win is now hidden from players.'
        );
      } else {
        showToast('error', 'Toggle Error', res.message || 'Could not update Spin Wheel status.');
      }
    } catch (err: any) {
      showToast('error', 'Toggle Error', err.message || 'Server error.');
    } finally {
      setIsTogglingMaster(false);
    }
  };

  const [togglingRewardId, setTogglingRewardId] = useState<string | null>(null);

  // Individual Reward Activate / Deactivate Toggle
  const handleToggleActive = async (reward: RewardItem) => {
    if (!reward || !reward.id) {
      showToast('error', 'Toggle Error', 'Reward ID is missing.');
      return;
    }
    const newActive = reward.isActive === false;
    setTogglingRewardId(reward.id);
    try {
      const res = await adminApi.updateReward(reward.id, { isActive: newActive });
      if (res.success && res.reward) {
        setRewards((prev) =>
          prev.map((r) => (r.id === res.reward.id ? { ...r, ...res.reward } : r))
        );
        showToast(
          'success',
          newActive ? 'Reward Activated' : 'Reward Deactivated',
          newActive
            ? `"${res.reward.name}" is now active and eligible for winning.`
            : `"${res.reward.name}" is now inactive and will not appear on the wheel.`
        );
      } else {
        showToast('error', 'Toggle Error', res.message || 'Could not update reward status.');
      }
    } catch (err: any) {
      showToast('error', 'Toggle Error', err.message || 'Could not update reward status.');
    } finally {
      setTogglingRewardId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Reward Form State
  // ---------------------------------------------------------------------------
  const [formMode, setFormMode] = useState<RewardMode>('chance');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCouponCode, setFormCouponCode] = useState('');
  const [formTerms, setFormTerms] = useState('');
  // String state for chances to allow complete clearing / Backspace without snapping
  const [formChances, setFormChances] = useState<string>('10');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formMinScore, setFormMinScore] = useState<string>('');
  const [formMaxScore, setFormMaxScore] = useState<string>('');
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Validate Score Range Overlap with other active score-based rewards
  const checkScoreOverlap = useCallback(
    (minStr: string, maxStr: string, ignoreId?: string): string | null => {
      const trimmedMin = minStr.trim();
      const trimmedMax = maxStr.trim();
      if (!trimmedMin || !trimmedMax) return null;

      const minVal = Number(trimmedMin);
      const maxVal = Number(trimmedMax);
      if (isNaN(minVal) || isNaN(maxVal)) return 'Scores must be valid numbers.';
      if (minVal > maxVal) return 'Minimum score cannot be greater than Maximum score.';

      const conflicting = rewards.find((r) => {
        if (r.id === ignoreId) return false;
        if (r.isActive === false) return false;
        if ((r.mode || (typeof r.minScore === 'number' ? 'score' : 'chance')) !== 'score') return false;
        if (typeof r.minScore !== 'number' || typeof r.maxScore !== 'number') return false;
        return minVal <= r.maxScore && maxVal >= r.minScore;
      });

      if (conflicting) {
        return `Score range (${minVal} - ${maxVal}) overlaps with active reward "${conflicting.name}" (${conflicting.minScore} - ${conflicting.maxScore}).`;
      }
      return null;
    },
    [rewards]
  );

  const handleMinScoreChange = (val: string) => {
    setFormMinScore(val);
    if (formMode === 'score') {
      const err = checkScoreOverlap(val, formMaxScore, editingReward?.id);
      setOverlapWarning(err);
    }
  };

  const handleMaxScoreChange = (val: string) => {
    setFormMaxScore(val);
    if (formMode === 'score') {
      const err = checkScoreOverlap(formMinScore, val, editingReward?.id);
      setOverlapWarning(err);
    }
  };

  const handleModeSwitch = (newMode: RewardMode) => {
    setFormMode(newMode);
    if (newMode === 'score') {
      const err = checkScoreOverlap(formMinScore, formMaxScore, editingReward?.id);
      setOverlapWarning(err);
    } else {
      setOverlapWarning(null);
    }
  };

  const openAddRewardModal = () => {
    setEditingReward(null);
    setFormMode('chance');
    setFormName('');
    setFormDescription('');
    setFormCouponCode('');
    setFormTerms('');
    setFormChances('10');
    setFormImageUrl('/logo/ItsSpotlight.png');
    setFormMinScore('');
    setFormMaxScore('');
    setOverlapWarning(null);
    setIsRewardModalOpen(true);
  };

  const openEditRewardModal = (reward: RewardItem) => {
    setEditingReward(reward);
    const initialMode: RewardMode =
      reward.mode === 'score' || (typeof reward.minScore === 'number' && !reward.mode)
        ? 'score'
        : 'chance';
    setFormMode(initialMode);
    setFormName(reward.name || '');
    setFormDescription(reward.description || '');
    setFormCouponCode(reward.couponCode || '');
    setFormTerms(reward.termsAndConditions || '');
    setFormChances(reward.chances !== undefined && reward.chances !== null ? String(reward.chances) : '10');
    setFormImageUrl(reward.imageUrl || '');
    setFormMinScore(typeof reward.minScore === 'number' ? String(reward.minScore) : '');
    setFormMaxScore(typeof reward.maxScore === 'number' ? String(reward.maxScore) : '');
    setOverlapWarning(null);
    setIsRewardModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const res = await adminApi.uploadAsset(file, 'reward_images');
      if (res.success && res.asset?.url) {
        setFormImageUrl(res.asset.url);
        showToast('success', 'Image Uploaded', 'Reward image uploaded successfully.');
      } else {
        showToast('error', 'Upload Failed', res.message || 'Could not upload image.');
      }
    } catch (err: any) {
      showToast('error', 'Upload Error', err.message || 'File upload failed.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('error', 'Validation Error', 'Please enter a reward name.');
      return;
    }
    if (!formCouponCode.trim()) {
      showToast('error', 'Validation Error', 'Please enter a coupon code.');
      return;
    }
    if (!formImageUrl.trim()) {
      showToast('error', 'Validation Error', 'Please provide or upload a reward image/logo.');
      return;
    }

    let parsedChances = 0;
    let parsedMinScore: number | undefined = undefined;
    let parsedMaxScore: number | undefined = undefined;

    if (formMode === 'chance') {
      const trimmed = formChances.trim();
      const val = Number(trimmed);
      if (!trimmed || isNaN(val) || val < 1) {
        showToast('error', 'Validation Error', 'Please enter a valid numeric value for Reward Chances (min 1).');
        return;
      }
      parsedChances = Math.max(1, Math.round(val));
    } else {
      // Score Based Validation
      const minStr = formMinScore.trim();
      const maxStr = formMaxScore.trim();
      if (!minStr || !maxStr) {
        showToast('error', 'Validation Error', 'Please enter both Minimum and Maximum Score for Score Based reward.');
        return;
      }
      const minVal = Number(minStr);
      const maxVal = Number(maxStr);
      if (isNaN(minVal) || isNaN(maxVal)) {
        showToast('error', 'Validation Error', 'Scores must be valid numbers.');
        return;
      }
      if (minVal > maxVal) {
        showToast('error', 'Validation Error', 'Minimum score cannot be greater than Maximum score.');
        return;
      }
      const overlapErr = checkScoreOverlap(minStr, maxStr, editingReward?.id);
      if (overlapErr) {
        showToast('error', 'Score Overlap Error', overlapErr);
        return;
      }
      parsedMinScore = minVal;
      parsedMaxScore = maxVal;
      parsedChances = 0;
    }

    try {
      if (editingReward) {
        const res = await adminApi.updateReward(editingReward.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          couponCode: formCouponCode.trim().toUpperCase(),
          termsAndConditions: formTerms.trim(),
          mode: formMode,
          chances: parsedChances,
          imageUrl: formImageUrl.trim(),
          minScore: parsedMinScore,
          maxScore: parsedMaxScore
        });
        if (res.success && res.reward) {
          setRewards((prev) => prev.map((r) => (r.id === res.reward.id ? res.reward : r)));
          showToast('success', 'Reward Updated', `"${res.reward.name}" has been updated.`);
          setIsRewardModalOpen(false);
        }
      } else {
        const res = await adminApi.createReward({
          name: formName.trim(),
          description: formDescription.trim(),
          couponCode: formCouponCode.trim().toUpperCase(),
          termsAndConditions: formTerms.trim(),
          mode: formMode,
          chances: parsedChances,
          imageUrl: formImageUrl.trim(),
          minScore: parsedMinScore,
          maxScore: parsedMaxScore
        });
        if (res.success && res.reward) {
          setRewards((prev) => [...prev, res.reward]);
          showToast('success', 'Reward Added', `"${res.reward.name}" added successfully.`);
          setIsRewardModalOpen(false);
        }
      }
    } catch (err: any) {
      showToast('error', 'Save Failed', err.message || 'Failed to save reward.');
    }
  };

  // Delete Action Execution
  const handleExecuteDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await adminApi.deleteReward(deleteConfirm.id);
      if (res.success) {
        setRewards((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
        showToast('success', 'Reward Deleted', `"${deleteConfirm.title}" has been deleted.`);
      }
    } catch (err: any) {
      showToast('error', 'Delete Failed', err.message || 'Could not delete item.');
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="p-3 sm:p-4 max-w-full space-y-2.5">
      {/* ------------------------------------------------------------- */}
      {/* Toast Notification                                            */}
      {/* ------------------------------------------------------------- */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 pointer-events-auto animate-[slideDown_0.25s_ease-out]">
          <div
            className={`flex items-start gap-2.5 p-3 rounded-xl border shadow-xl backdrop-blur-md ${
              toast.type === 'success'
                ? isLight
                  ? 'bg-[#FAF4E8] border-[#58734B]/50 text-[#493426]'
                  : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100'
                : isLight
                ? 'bg-[#FAF4E8] border-[#A74747]/50 text-[#493426]'
                : 'bg-rose-950/90 border-rose-500/50 text-rose-100'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2
                className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  isLight ? 'text-[#58734B]' : 'text-emerald-400'
                }`}
              />
            ) : (
              <AlertCircle
                className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  isLight ? 'text-[#A74747]' : 'text-rose-400'
                }`}
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold leading-tight">{toast.title}</h4>
              <p className={`text-[10px] mt-0.5 ${isLight ? 'text-[#806B58]' : 'text-slate-300'}`}>
                {toast.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1 & 3. CONSOLIDATED ONE-LINE HEADER BAR (Fit on One Screen)   */}
      {/* Title + ON/OFF Toggle side-by-side, Tabs & Add Reward right  */}
      {/* ------------------------------------------------------------- */}
      <div className={`px-3 py-2 rounded-xl border flex flex-wrap items-center justify-between gap-2.5 ${cardBg}`}>
        {/* Left: Spin Wheel Title + Compact ON/OFF Toggle Immediately Beside */}
        <div className="flex items-center gap-2.5">
          <h2 className={`text-sm sm:text-base font-bold ${primaryText}`}>Spin Wheel</h2>

          {/* Compact ON/OFF Switch */}
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={handleToggleMaster}
              disabled={isTogglingMaster}
              className="sr-only peer"
            />
            <div className="w-8 h-4.5 bg-[#D8C7AE] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#58734B]"></div>
            <span className={`ms-1.5 text-[11px] font-bold uppercase tracking-wider ${primaryText}`}>
              {settings.enabled ? 'ON' : 'OFF'}
            </span>
          </label>
        </div>

        {/* Right: Compact Tab Navigation & Add Reward Button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg border border-[#D8C7AE]/50">
            <button
              onClick={() => setActiveTab('rewards')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'rewards'
                  ? isLight
                    ? 'bg-[#76513D] text-[#FDF9F3] shadow-xs'
                    : 'bg-amber-500 text-neutral-950 font-extrabold shadow-xs'
                  : isLight
                  ? 'text-[#806B58] hover:text-[#493426]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gift className="w-3 h-3" />
              <span>Rewards ({rewards.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('test_wheel')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'test_wheel'
                  ? isLight
                    ? 'bg-[#76513D] text-[#FDF9F3] shadow-xs'
                    : 'bg-amber-500 text-neutral-950 font-extrabold shadow-xs'
                  : isLight
                  ? 'text-[#806B58] hover:text-[#493426]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Play className="w-3 h-3" />
              <span>Test Wheel</span>
            </button>

            <button
              onClick={() => setActiveTab('spin_history')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'spin_history'
                  ? isLight
                    ? 'bg-[#76513D] text-[#FDF9F3] shadow-xs'
                    : 'bg-amber-500 text-neutral-950 font-extrabold shadow-xs'
                  : isLight
                  ? 'text-[#806B58] hover:text-[#493426]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3 h-3" />
              <span>History ({spinRecords.length})</span>
            </button>
          </div>

          <button
            onClick={openAddRewardModal}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer shadow-xs ${
              isLight
                ? 'bg-[#76513D] hover:bg-[#5f4130] text-[#FDF9F3]'
                : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black'
            }`}
          >
            <Plus className="w-3 h-3" />
            <span>Add Reward</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: LANDSCAPE COMPACT REWARD CARDS                         */}
      {/* Displays ONLY Image, Name, and Activate/Edit/Delete buttons   */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'rewards' && (
        <div>
          {rewards.length === 0 ? (
            <div className={`p-8 rounded-xl border text-center ${cardBg}`}>
              <Gift className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
              <p className={`text-xs font-semibold ${primaryText}`}>No rewards configured</p>
              <p className={`text-[11px] mt-0.5 ${secondaryText}`}>
                Click "Add Reward" above to add your first prize or voucher.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
              {rewards.map((reward) => {
                const isInactive = reward.isActive === false;

                return (
                  <div
                    key={reward.id}
                    className={`p-2 rounded-xl border flex flex-col items-center justify-between text-center transition-all hover:shadow-xs relative group ${cardBg} ${
                      isInactive ? 'opacity-55 border-dashed' : 'opacity-100'
                    }`}
                  >
                    {/* Reward Image Thumbnail */}
                    <div
                      onClick={() => openEditRewardModal(reward)}
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg border flex items-center justify-center p-1 overflow-hidden cursor-pointer ${cardSubBg} ${
                        isInactive ? 'grayscale contrast-75' : ''
                      }`}
                      title="Click to edit reward"
                    >
                      {reward.imageUrl ? (
                        <img
                          src={reward.imageUrl}
                          alt={reward.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Gift className="w-5 h-5 text-amber-500" />
                      )}
                    </div>

                    {/* Reward Name Only */}
                    <h4
                      onClick={() => openEditRewardModal(reward)}
                      className={`text-[11px] font-bold leading-tight line-clamp-1 truncate w-full mt-1.5 cursor-pointer ${primaryText}`}
                      title={reward.name}
                    >
                      {reward.name}
                    </h4>

                    {/* 3 Compact Actions: Activate/Deactivate Toggle, Edit, Delete */}
                    <div className="mt-1.5 pt-1 border-t border-[#D8C7AE]/50 w-full flex items-center justify-center gap-1">
                      {/* Activate / Deactivate Toggle Button */}
                      <button
                        type="button"
                        disabled={togglingRewardId === reward.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(reward);
                        }}
                        className={`p-1 rounded-md border text-xs cursor-pointer transition disabled:opacity-50 ${
                          !isInactive
                            ? isLight
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/25'
                              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                            : isLight
                            ? 'bg-neutral-200/60 border-neutral-300 text-neutral-400 hover:text-neutral-700'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                        title={!isInactive ? 'Active: Click to Deactivate' : 'Inactive: Click to Activate'}
                        aria-label={!isInactive ? 'Deactivate reward' : 'Activate reward'}
                      >
                        <Power className={`w-3 h-3 stroke-[2.5] ${togglingRewardId === reward.id ? 'animate-spin' : ''}`} />
                      </button>

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditRewardModal(reward);
                        }}
                        className={`p-1 rounded-md border text-xs cursor-pointer transition ${
                          isLight
                            ? 'bg-[#FAF4E8] hover:bg-[#EFE4D2] border-[#D8C7AE] text-[#76513D]'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        }`}
                        title="Edit Reward"
                        aria-label="Edit reward"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({
                            id: reward.id,
                            title: reward.name
                          });
                        }}
                        className={`p-1 rounded-md border text-xs cursor-pointer transition ${
                          isLight
                            ? 'bg-[#A74747]/10 hover:bg-[#A74747]/20 border-[#A74747]/30 text-[#A74747]'
                            : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300'
                        }`}
                        title="Delete Reward"
                        aria-label="Delete reward"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: LIVE WHEEL TEST                                        */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'test_wheel' && (
        <div className={`p-6 rounded-xl border text-center ${cardBg}`}>
          <div className="max-w-sm mx-auto space-y-3">
            <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center bg-[#B36D4E]/15 border border-[#B36D4E]/40 text-[#B36D4E]">
              <RotateCw className="w-6 h-6" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${primaryText}`}>Test Spin Wheel</h3>
              <p className={`text-xs mt-0.5 ${secondaryText}`}>
                Test the wheel animation, clockwise rotation, and winning popup.
              </p>
            </div>

            <div>
              <button
                onClick={() => setIsTestWheelOpen(true)}
                disabled={rewards.filter((r) => r.isActive !== false && r.mode !== 'score').length === 0}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                  isLight
                    ? 'bg-[#76513D] hover:bg-[#5f4130] text-[#FDF9F3]'
                    : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Test Wheel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: SPIN HISTORY                                           */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'spin_history' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${secondaryText}`}>
              Recorded Spins ({spinRecords.length})
            </span>
            <button
              onClick={loadData}
              disabled={isLoading}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                isLight ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#76513D]' : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <RotateCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {spinRecords.length === 0 ? (
            <div className={`p-8 rounded-xl border text-center ${cardBg}`}>
              <History className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
              <p className={`text-xs font-semibold ${primaryText}`}>No spin records yet</p>
            </div>
          ) : (
            <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead
                    className={`border-b font-bold uppercase tracking-wider ${
                      isLight ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58]' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <tr>
                      <th className="px-3.5 py-2">Player Name</th>
                      <th className="px-3.5 py-2">Mobile Number</th>
                      <th className="px-3.5 py-2">Prize Won</th>
                      <th className="px-3.5 py-2">Coupon Code</th>
                      <th className="px-3.5 py-2">Date & Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8C7AE]/60">
                    {spinRecords.map((spin) => {
                      const dateObj = new Date(spin.timestamp);
                      const formattedDate = dateObj.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      });
                      const formattedTime = dateObj.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      });
                      return (
                        <tr
                          key={spin.id}
                          className={`transition ${
                            isLight ? 'hover:bg-[#FAF4E8]/80' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="px-3.5 py-2 font-bold">{spin.playerName || 'Guest Player'}</td>
                          <td className="px-3.5 py-2 font-mono">{spin.mobileNumber || 'N/A'}</td>
                          <td className="px-3.5 py-2 font-semibold text-[#B36D4E]">{spin.rewardName}</td>
                          <td className="px-3.5 py-2 font-mono font-bold">{spin.couponCode}</td>
                          <td className={`px-3.5 py-2 text-[11px] ${secondaryText}`}>
                            {formattedDate} {formattedTime}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. ADD / EDIT REWARD FORM MODAL                               */}
      {/* Two-option Mode Selector: [ Chance Based ] | [ Score Based ]  */}
      {/* ------------------------------------------------------------- */}
      {isRewardModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div
            className={`w-full max-w-md rounded-2xl border p-4 sm:p-5 shadow-2xl animate-[fadeIn_0.15s_ease-out] my-6 ${cardBg}`}
          >
            <div className="flex items-center justify-between border-b border-[#D8C7AE]/60 pb-2.5 mb-3">
              <h3 className={`text-sm font-bold flex items-center gap-1.5 ${primaryText}`}>
                <Gift className="w-4 h-4 text-[#B36D4E]" />
                <span>{editingReward ? 'Edit Reward' : 'Add New Reward'}</span>
              </h3>
              <button
                onClick={() => setIsRewardModalOpen(false)}
                className={`p-1 rounded-lg border text-xs cursor-pointer ${
                  isLight ? 'border-[#D8C7AE] hover:bg-[#FAF4E8]' : 'border-slate-700 hover:bg-slate-800'
                }`}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveReward} className="space-y-3">
              {/* 5. REWARD SELECTION MODE TOGGLE */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                  Reward Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border border-[#D8C7AE]/70 bg-black/5 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('chance')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      formMode === 'chance'
                        ? isLight
                          ? 'bg-[#76513D] text-[#FDF9F3] shadow-xs'
                          : 'bg-amber-500 text-neutral-950 font-black shadow-xs'
                        : isLight
                        ? 'text-[#806B58] hover:text-[#493426]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎲 Chance Based
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('score')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      formMode === 'score'
                        ? isLight
                          ? 'bg-[#76513D] text-[#FDF9F3] shadow-xs'
                          : 'bg-amber-500 text-neutral-950 font-black shadow-xs'
                        : isLight
                        ? 'text-[#806B58] hover:text-[#493426]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎯 Score Based
                  </button>
                </div>
              </div>

              {/* Reward Image / Logo */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                  Reward Logo / Image *
                </label>
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-12 h-12 rounded-xl border flex items-center justify-center p-1 overflow-hidden flex-shrink-0 ${cardSubBg}`}
                  >
                    {formImageUrl ? (
                      <img
                        src={formImageUrl}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 opacity-40" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      required
                      value={formImageUrl}
                      onChange={(e) => setFormImageUrl(e.target.value)}
                      placeholder="Paste image URL or upload..."
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputBg}`}
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold cursor-pointer ${
                          isLight
                            ? 'bg-[#FAF4E8] hover:bg-[#EFE4D2] border-[#D8C7AE] text-[#76513D]'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        }`}
                      >
                        <Upload className="w-2.5 h-2.5" />
                        <span>{isUploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reward Name */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                  Reward Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. ₹500 Festive Voucher"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputBg}`}
                />
              </div>

              {/* Coupon Code */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  value={formCouponCode}
                  onChange={(e) => setFormCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DIWALI500"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold tracking-wider uppercase outline-none ${inputBg}`}
                />
              </div>

              {/* 4. CHANCE BASED MODE: Show ONLY "Reward Chances" numeric input (No "Weight", No "%") */}
              {formMode === 'chance' && (
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                    Reward Chances
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={formChances}
                    onChange={(e) => setFormChances(e.target.value)}
                    placeholder="e.g. 10"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none ${inputBg}`}
                  />
                  <p className={`text-[10px] mt-0.5 ${secondaryText}`}>
                    Number used directly as the reward's winning probability on the wheel.
                  </p>
                </div>
              )}

              {/* 5. SCORE BASED MODE: Show Minimum and Maximum Score inputs (Hide Chances) */}
              {formMode === 'score' && (
                <div className="space-y-1.5 p-2.5 rounded-xl border border-[#D8C7AE]/70 bg-black/5 dark:bg-white/5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                        Minimum Score
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={formMinScore}
                        onChange={(e) => handleMinScoreChange(e.target.value)}
                        placeholder="e.g. 1000"
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none ${inputBg}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                        Maximum Score
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={formMaxScore}
                        onChange={(e) => handleMaxScoreChange(e.target.value)}
                        placeholder="e.g. 2500"
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none ${inputBg}`}
                      />
                    </div>
                  </div>

                  {/* Overlap Warning Box */}
                  {overlapWarning && (
                    <div
                      className={`p-2 rounded-lg border flex items-start gap-1.5 text-[11px] ${
                        isLight
                          ? 'bg-[#A74747]/10 border-[#A74747]/40 text-[#A74747]'
                          : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{overlapWarning}</span>
                    </div>
                  )}

                  <p className={`text-[10px] ${secondaryText}`}>
                    Awarded when the player's final game score falls within this range.
                  </p>
                </div>
              )}

              {/* Description */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                  Reward Description
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Flat ₹500 discount on shopping above ₹1,999"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputBg}`}
                />
              </div>

              {/* Terms & Conditions */}
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${secondaryText}`}>
                  Terms & Conditions
                </label>
                <textarea
                  rows={2}
                  value={formTerms}
                  onChange={(e) => setFormTerms(e.target.value)}
                  placeholder="e.g. Valid until Nov 30, 2026. Single use per customer."
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none resize-none ${inputBg}`}
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-2 border-t border-[#D8C7AE]/60 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRewardModalOpen(false)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                    isLight ? 'border-[#D8C7AE] text-[#806B58] hover:bg-[#FAF4E8]' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(overlapWarning)}
                  className={`px-4 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider cursor-pointer shadow-xs disabled:opacity-50 ${
                    isLight
                      ? 'bg-[#76513D] hover:bg-[#5f4130] text-[#FDF9F3]'
                      : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black'
                  }`}
                >
                  Save Reward
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DELETE CONFIRMATION DIALOG                                    */}
      {/* ------------------------------------------------------------- */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div
            className={`w-full max-w-xs rounded-2xl border p-4 shadow-2xl text-center space-y-2.5 ${cardBg}`}
          >
            <div className="w-9 h-9 rounded-full mx-auto flex items-center justify-center bg-rose-500/10 border border-rose-500/30 text-rose-500">
              <Trash2 className="w-4 h-4" />
            </div>
            <h4 className={`text-xs font-bold ${primaryText}`}>Delete Reward</h4>
            <p className={`text-[11px] ${secondaryText}`}>
              Are you sure you want to delete <strong className={primaryText}>"{deleteConfirm.title}"</strong>?
            </p>
            <div className="pt-1 flex items-center justify-center gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className={`px-3 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                  isLight ? 'border-[#D8C7AE] text-[#806B58]' : 'border-slate-700 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                className="px-3.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* LIVE TEST WHEEL MODAL                                         */}
      {/* ------------------------------------------------------------- */}
      {isTestWheelOpen && (
        <SpinWheelModal
          isOpen={isTestWheelOpen}
          onClose={() => setIsTestWheelOpen(false)}
          playerName="Admin Preview"
          mobileNumber="9999999999"
          isTestMode={true}
        />
      )}
    </div>
  );
};
