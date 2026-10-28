/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  BombConfig,
  BombGameSettings,
  BombSoundPreset,
  BombImagePreset,
  AssetRecord,
} from '../../types/backend';
import { adminApi } from '../../services/api';
import { SoundEngine } from '../../utils/soundEngine';
import { CartoonBombSvg } from '../../components/CartoonBombSvg';
import { DEFAULT_BOMB_SETTINGS } from '../../utils/bombDefaults';
import {
  Bomb,
  Plus,
  Edit2,
  Trash2,
  Play,
  Volume2,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Upload,
  RefreshCw,
  Sparkles,
  Eye,
  Info,
  X,
  ShieldAlert,
  Zap,
} from 'lucide-react';

const PRESET_COLORS = [
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber / Gold
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#1E293B', // Obsidian / Black
];

const SOUND_PRESETS: { id: BombSoundPreset; label: string; desc: string }[] = [
  { id: 'pop', label: 'Crisp Pop (+100)', desc: 'High-energy balloon/bubble cartoon pop' },
  { id: 'blast', label: 'Boom Blast (+150)', desc: 'Deep resonant explosion thump' },
  { id: 'chime', label: 'Victory Chime (+300)', desc: 'Sparkling celebratory arpeggio chime' },
  { id: 'penalty_buzz', label: 'Penalty Buzz (-150)', desc: 'Dissonant warning buzzer for penalties' },
  { id: 'rocket', label: 'Rocket Whistle', desc: 'Screaming whistle launch blast' },
  { id: 'sparkle', label: 'Fountain Plume', desc: 'Continuous sparkling fountain hiss' },
  { id: 'custom', label: 'Custom Uploaded Audio', desc: 'Your own uploaded MP3 / WAV audio file' },
];

const IMAGE_PRESETS: { id: BombImagePreset; label: string; desc: string }[] = [
  { id: 'red_classic', label: 'Red Classic Smile', desc: 'Sweet happy cartoon face' },
  { id: 'blue_happy', label: 'Blue Joyful Grin', desc: 'Cool smiling eyes and confident grin' },
  { id: 'green_super', label: 'Green Super Joy', desc: 'Ecstatic laughing mouth with tongue' },
  { id: 'black_penalty', label: 'Black Penalty Skull', desc: 'Furious angry face with jagged teeth' },
  { id: 'custom', label: 'Custom Uploaded Image', desc: 'Your custom uploaded PNG/SVG/JPG asset' },
];

export const BombManagementSection: React.FC = () => {
  const [bombs, setBombs] = useState<BombConfig[]>([]);
  const [settings, setSettings] = useState<BombGameSettings>({
    ...DEFAULT_BOMB_SETTINGS
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit / Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBomb, setEditingBomb] = useState<BombConfig | null>(null);
  const [isSavingBomb, setIsSavingBomb] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);

  // Deleting State & Custom Confirmation Modal
  const [deletingBombId, setDeletingBombId] = useState<string | null>(null);
  const [confirmDeleteBomb, setConfirmDeleteBomb] = useState<BombConfig | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#EF4444');
  const [formPoints, setFormPoints] = useState(100);
  const [formSpawnWeight, setFormSpawnWeight] = useState(10);
  const [formSoundPreset, setFormSoundPreset] = useState<BombSoundPreset>('pop');
  const [formSoundUrl, setFormSoundUrl] = useState<string | null>(null);
  const [formImagePreset, setFormImagePreset] = useState<BombImagePreset>('red_classic');
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [formIsActive, setFormIsActive] = useState(true);

  // Audio preview engine
  const soundEngineRef = useRef<SoundEngine | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    soundEngineRef.current = new SoundEngine();
  }, []);

  // Play sound preview helper
  const previewSound = (preset: BombSoundPreset, url?: string | null) => {
    if (!soundEngineRef.current) return;
    soundEngineRef.current.unlockAudio();

    if (url) {
      try {
        const audio = new Audio(url);
        audio.volume = 0.85;
        audio.play().catch((e) => console.warn('Preview error:', e));
        return;
      } catch (e) {
        console.warn('Audio preview fallback:', e);
      }
    }

    switch (preset) {
      case 'blast':
        soundEngineRef.current.playBombBlast();
        break;
      case 'chime':
        soundEngineRef.current.playBombChime();
        break;
      case 'penalty_buzz':
        soundEngineRef.current.playPenaltyBuzz();
        break;
      case 'rocket':
        soundEngineRef.current.synthRocket();
        break;
      case 'sparkle':
        soundEngineRef.current.synthFlowerPot();
        break;
      case 'pop':
      default:
        soundEngineRef.current.playBombPop();
        break;
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getBombs();
      if (res.success) {
        const loaded = res.bombs || [];
        setBombs(loaded);
        console.log('[BombDelete UI] Step 6: Refreshed list from backend:', {
          totalCount: loaded.length,
          activeCount: loaded.filter((b) => b.isActive && !b.isDeleted).length,
          disabledCount: loaded.filter((b) => !b.isActive || b.isDeleted).length
        });
        if (res.settings) {
          setSettings({ ...DEFAULT_BOMB_SETTINGS, ...res.settings });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load bomb configurations.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save Settings handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setFeedback(null);
    try {
      const res = await adminApi.updateBombSettings(settings);
      if (res.success && res.settings) {
        setSettings(res.settings);
        setFeedback({ type: 'success', message: 'Bomb spawn dynamics updated successfully.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update spawn settings.' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingBomb(null);
    setFormName('Golden Star Bomb');
    setFormColor('#F59E0B');
    setFormPoints(200);
    setFormSpawnWeight(8);
    setFormSoundPreset('pop');
    setFormSoundUrl(null);
    setFormImagePreset('red_classic');
    setFormImageUrl(null);
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (bomb: BombConfig) => {
    setEditingBomb(bomb);
    setFormName(bomb.name);
    setFormColor(bomb.color);
    setFormPoints(bomb.points);
    setFormSpawnWeight(bomb.spawnWeight);
    setFormSoundPreset(bomb.soundPreset);
    setFormSoundUrl(bomb.soundUrl || null);
    setFormImagePreset(bomb.imagePreset);
    setFormImageUrl(bomb.imageUrl || null);
    setFormIsActive(bomb.isActive);
    setIsModalOpen(true);
  };

  // Upload Custom Image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAsset(true);
    try {
      const res = await adminApi.uploadAsset(file, 'bomb_assets', `bomb_img_${file.name}`);
      if (res.success && res.asset) {
        setFormImageUrl(res.asset.url);
        setFormImagePreset('custom');
        setFeedback({ type: 'success', message: `Bomb image "${file.name}" uploaded successfully.` });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Image upload failed.' });
    } finally {
      setIsUploadingAsset(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
  };

  // Upload Custom Audio
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAsset(true);
    try {
      const res = await adminApi.uploadAsset(file, 'bomb_assets', `bomb_audio_${file.name}`);
      if (res.success && res.asset) {
        setFormSoundUrl(res.asset.url);
        setFormSoundPreset('custom');
        setFeedback({ type: 'success', message: `Burst sound "${file.name}" uploaded successfully.` });
        previewSound('custom', res.asset.url);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Audio upload failed.' });
    } finally {
      setIsUploadingAsset(false);
      if (audioFileInputRef.current) audioFileInputRef.current.value = '';
    }
  };

  // Save / Update Bomb
  const handleSaveBomb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFeedback({ type: 'error', message: 'Bomb name is required.' });
      return;
    }

    setIsSavingBomb(true);
    setFeedback(null);

    const payload: Partial<BombConfig> = {
      name: formName.trim(),
      color: formColor,
      points: Number(formPoints),
      spawnWeight: Number(formSpawnWeight),
      soundPreset: formSoundPreset,
      soundUrl: formSoundPreset === 'custom' ? formSoundUrl : null,
      imagePreset: formImagePreset,
      imageUrl: formImagePreset === 'custom' ? formImageUrl : null,
      isActive: formIsActive,
    };

    try {
      if (editingBomb) {
        const res = await adminApi.updateBomb(editingBomb.id, payload);
        if (res.success) {
          setFeedback({ type: 'success', message: `Bomb "${formName}" updated successfully.` });
          setIsModalOpen(false);
          await loadData();
        }
      } else {
        const res = await adminApi.createBomb(payload);
        if (res.success) {
          setFeedback({ type: 'success', message: `Bomb "${formName}" created successfully.` });
          setIsModalOpen(false);
          await loadData();
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save bomb configuration.' });
    } finally {
      setIsSavingBomb(false);
    }
  };

  // Delete / Remove Bomb confirmation flow
  const handleRequestDelete = (bomb: BombConfig) => {
    console.log('[BombDelete UI] Step 1: Confirmation modal opened for bomb:', {
      id: bomb.id,
      name: bomb.name,
      points: bomb.points,
      isDefault: Boolean(bomb.isDefault)
    });
    setConfirmDeleteBomb(bomb);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteBomb) return;
    const bombToDelete = confirmDeleteBomb;
    console.log('[BombDelete UI] Step 1: Confirm Delete clicked in modal for bomb:', {
      id: bombToDelete.id,
      name: bombToDelete.name,
      points: bombToDelete.points,
      isDefault: Boolean(bombToDelete.isDefault)
    });

    setDeletingBombId(bombToDelete.id);
    setFeedback(null);

    try {
      console.log('[BombDelete UI] Step 2: Calling adminApi.deleteBomb for ID:', bombToDelete.id);
      const res = await adminApi.deleteBomb(bombToDelete.id);
      console.log('[BombDelete UI] Step 4: Backend responded with:', res);

      if (res.success) {
        // Immediate optimistic UI update:
        // Default bombs become soft-deleted/disabled, custom bombs are filtered out
        setBombs((prev) =>
          bombToDelete.isDefault
            ? prev.map((b) => (b.id === bombToDelete.id ? { ...b, isActive: false, isDeleted: true } : b))
            : prev.filter((b) => b.id !== bombToDelete.id)
        );

        setFeedback({
          type: 'success',
          message: res.message || `Bomb "${bombToDelete.name}" removed from active gameplay.`
        });
        setConfirmDeleteBomb(null);
        if (isModalOpen && editingBomb?.id === bombToDelete.id) {
          setIsModalOpen(false);
        }

        // Fetch fresh list from server
        await loadData();
      } else {
        console.warn('[BombDelete UI] Backend returned res.success === false:', res);
        setFeedback({
          type: 'error',
          message: res.message || 'Failed to delete bomb configuration.'
        });
        setConfirmDeleteBomb(null);
      }
    } catch (err: any) {
      console.error('[BombDelete UI] Error caught during delete:', {
        status: err?.status,
        message: err?.message,
        data: err?.data
      });
      // Keep bomb visible in active list on failure!
      const statusText = err?.status ? ` (HTTP ${err.status})` : '';
      setFeedback({
        type: 'error',
        message: `Deletion failed${statusText}: ${err?.message || 'Server error occurred.'}`
      });
      setConfirmDeleteBomb(null);
    } finally {
      setDeletingBombId(null);
    }
  };

  // Re-enable / restore a disabled or soft-deleted bomb
  const handleReEnableBomb = async (bomb: BombConfig) => {
    setFeedback(null);
    console.log('[BombRestore UI] Re-enabling bomb:', { id: bomb.id, name: bomb.name });
    try {
      const res = await adminApi.updateBomb(bomb.id, { isActive: true, isDeleted: false });
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Bomb "${bomb.name}" re-enabled and restored to active gameplay.`
        });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to restore bomb.' });
      }
    } catch (err: any) {
      console.error('[BombRestore UI] Error re-enabling bomb:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to restore bomb.' });
    }
  };

  // Toggle active state quickly
  const handleToggleActive = async (bomb: BombConfig) => {
    try {
      const res = await adminApi.updateBomb(bomb.id, { isActive: !bomb.isActive });
      if (res.success) {
        await loadData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update bomb state.' });
    }
  };

  const activeBombs = bombs.filter((b) => b.isActive && !b.isDeleted);
  const disabledBombs = bombs.filter((b) => !b.isActive || b.isDeleted);
  const totalActiveWeight = activeBombs.reduce((sum, b) => sum + Math.max(1, b.spawnWeight || 5), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-500/15 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Bomb className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-amber-100 font-['Cinzel',serif] tracking-wider">
                BOMB MANAGEMENT
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400">
                Configure colourful floating bomb targets, point rewards, penalty bombs, burst sounds & spawn rates.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Bomb</span>
          </button>
        </div>
      </div>

      {/* 2. Feedback Notification */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Global Spawn Dynamics Settings */}
      <div className="bg-[#120E1E] border border-amber-500/20 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-amber-500/10 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm sm:text-base font-bold text-amber-200 uppercase tracking-wider font-['Cinzel',serif]">
              Gameplay Spawn Settings
            </h2>
          </div>
          <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900/80 px-2.5 py-1 rounded-lg border border-neutral-800">
            Global Rules
          </span>
        </div>

        <form onSubmit={handleSaveSettings} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-neutral-300 uppercase mb-1.5">
              Min Spawn Delay
            </label>
            <div className="relative">
              <input
                type="number"
                min={200}
                max={5000}
                step={50}
                value={settings.minSpawnDelayMs}
                onChange={(e) =>
                  setSettings({ ...settings, minSpawnDelayMs: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-neutral-950/80 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-neutral-500 font-mono">
                ms
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Minimum wait before spawning next launch</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-neutral-300 uppercase mb-1.5">
              Max Spawn Delay
            </label>
            <div className="relative">
              <input
                type="number"
                min={settings.minSpawnDelayMs}
                max={10000}
                step={50}
                value={settings.maxSpawnDelayMs}
                onChange={(e) =>
                  setSettings({ ...settings, maxSpawnDelayMs: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-neutral-950/80 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-neutral-500 font-mono">
                ms
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Maximum wait between launches</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-neutral-300 uppercase mb-1.5">
              Max Concurrent Bombs
            </label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={8}
                value={settings.maxConcurrentBombs}
                onChange={(e) =>
                  setSettings({ ...settings, maxConcurrentBombs: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-neutral-950/80 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-neutral-500 font-mono">
                active
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Maximum bombs simultaneously on screen</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-neutral-300 uppercase mb-1.5">
              Max Burst Size
            </label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={3}
                step={1}
                value={settings.maxBurstSize ?? 3}
                onChange={(e) =>
                  setSettings({ ...settings, maxBurstSize: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-neutral-950/80 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-neutral-500 font-mono">
                bombs
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Max bombs fired in one burst (1–3)</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-neutral-300 uppercase mb-1.5">
              Launch Speed Multiplier
            </label>
            <div className="relative">
              <input
                type="number"
                min={1.0}
                max={2.2}
                step={0.05}
                value={settings.launchSpeedMultiplier ?? 1.45}
                onChange={(e) =>
                  setSettings({ ...settings, launchSpeedMultiplier: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-neutral-950/80 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-neutral-500 font-mono">
                x
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Arcade velocity (1.45 = +45% faster launch)</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-neutral-300 uppercase mb-1.5">
              Burst Stagger Interval
            </label>
            <div className="relative">
              <input
                type="number"
                min={50}
                max={250}
                step={5}
                value={settings.burstIntervalMs ?? 75}
                onChange={(e) =>
                  setSettings({ ...settings, burstIntervalMs: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-neutral-950/80 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-neutral-500 font-mono">
                ms
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Delay between rapid burst shots (50–100ms)</p>
          </div>

          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-2 flex flex-col justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSavingSettings ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Save Spawn Dynamics</span>
            </button>
          </div>
        </form>
      </div>

      {/* 4. Active Bombs Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-neutral-100 font-['Cinzel',serif] tracking-wider">
              Configured Bomb Types
            </h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-amber-300 border border-amber-500/20">
              {activeBombs.length} Active
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-neutral-400 text-xs font-mono">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
            Loading bomb configurations...
          </div>
        ) : activeBombs.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 text-xs font-mono border border-neutral-800 rounded-2xl bg-neutral-950/40">
            No active bombs currently configured. Re-enable an archived bomb below or create a new bomb above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeBombs.map((bomb) => {
              const isPenalty = bomb.points < 0;
              const probPercent =
                totalActiveWeight > 0
                  ? Math.round((bomb.spawnWeight / totalActiveWeight) * 100)
                  : 0;

              return (
                <div
                  key={bomb.id}
                  className={`bg-[#120E1E] border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-2xl ${
                    isPenalty
                      ? 'border-rose-500/30 hover:border-rose-500/60 shadow-[0_4px_20px_rgba(239,68,68,0.15)]'
                      : 'border-amber-500/25 hover:border-amber-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.4)]'
                  }`}
                >
                  <div>
                    {/* Top Status & Point Tag */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          isPenalty
                            ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                            : bomb.points >= 300
                            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                            : 'bg-amber-950/80 border-amber-500 text-amber-300'
                        }`}
                      >
                        {isPenalty ? 'Penalty Target' : 'Reward Target'}
                      </span>

                      <button
                        onClick={() => handleToggleActive(bomb)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-md border cursor-pointer transition-all bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/80"
                        title="Click to quickly disable"
                      >
                        Active
                      </button>
                    </div>

                    {/* Centered Bomb Visual Preview */}
                    <div className="py-4 flex flex-col items-center justify-center">
                      <div className="p-3 rounded-2xl bg-neutral-950/80 border border-neutral-800 shadow-inner">
                        <CartoonBombSvg bomb={bomb} size={84} showBadge={true} />
                      </div>
                      <h3 className="text-base font-bold text-neutral-100 mt-3 text-center tracking-wide">
                        {bomb.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: bomb.color }}
                        />
                        <span className="font-mono text-xs text-neutral-400">
                          {bomb.color}
                        </span>
                      </div>
                    </div>

                    {/* Stats & Attributes */}
                    <div className="mt-2 space-y-2 text-xs border-t border-neutral-800/80 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Score Value:</span>
                        <span
                          className={`font-mono font-bold text-sm ${
                            isPenalty ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {bomb.points > 0 ? `+${bomb.points}` : bomb.points} pts
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Spawn Frequency:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-neutral-200">
                            Weight {bomb.spawnWeight}
                          </span>
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            ~{probPercent}%
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Burst Sound:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-neutral-300 capitalize">
                            {bomb.soundPreset}
                          </span>
                          <button
                            onClick={() => previewSound(bomb.soundPreset, bomb.soundUrl)}
                            title="Play Audio Preview"
                            className="p-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 cursor-pointer transition-all"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-neutral-800/80">
                    <button
                      onClick={() => handleOpenEdit(bomb)}
                      className="flex-1 py-1.5 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleRequestDelete(bomb)}
                      disabled={deletingBombId !== null}
                      title="Delete Bomb"
                      className="p-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-rose-100 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {deletingBombId === bomb.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Disabled / Archived Bombs */}
      {disabledBombs.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-neutral-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-neutral-300 font-['Cinzel',serif] tracking-wider">
                Disabled / Archived Bomb Types
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-900 text-rose-300 border border-rose-500/30">
                {disabledBombs.length} Inactive
              </span>
            </div>
            <p className="hidden sm:block text-xs text-neutral-500">
              Archived records are excluded from gameplay. Click Re-enable to restore.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {disabledBombs.map((bomb) => {
              const isPenalty = bomb.points < 0;
              return (
                <div
                  key={bomb.id}
                  className="bg-[#0e0a16] border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between opacity-80 hover:opacity-100 transition-all duration-200"
                >
                  <div>
                    {/* Top Status & Point Tag */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border bg-neutral-900 border-neutral-700 text-neutral-400">
                        {isPenalty ? 'Penalty Target' : 'Reward Target'}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-rose-950/60 border-rose-500/40 text-rose-300">
                        Disabled
                      </span>
                    </div>

                    {/* Centered Bomb Visual Preview */}
                    <div className="py-4 flex flex-col items-center justify-center grayscale opacity-60">
                      <div className="p-3 rounded-2xl bg-neutral-950/80 border border-neutral-800 shadow-inner">
                        <CartoonBombSvg bomb={bomb} size={72} showBadge={false} />
                      </div>
                      <h3 className="text-base font-bold text-neutral-300 mt-3 text-center tracking-wide line-through decoration-rose-500/50">
                        {bomb.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: bomb.color }}
                        />
                        <span className="font-mono text-xs text-neutral-500">
                          {bomb.isDefault ? 'Default Preset' : 'Custom Bomb'}
                        </span>
                      </div>
                    </div>

                    {/* Stats & Attributes */}
                    <div className="mt-2 space-y-2 text-xs border-t border-neutral-800/80 pt-3 text-neutral-400">
                      <div className="flex items-center justify-between">
                        <span>Score Value:</span>
                        <span className="font-mono font-bold text-xs text-neutral-300">
                          {bomb.points > 0 ? `+${bomb.points}` : bomb.points} pts
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Burst Sound:</span>
                        <span className="font-mono text-[11px] text-neutral-400 capitalize">
                          {bomb.soundPreset}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      onClick={() => handleReEnableBomb(bomb)}
                      className="w-full py-2 px-3 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-600/50 hover:border-emerald-500 text-emerald-300 hover:text-emerald-100 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    >
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Re-enable Bomb</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Add / Edit Bomb Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#120E1E] border border-amber-500/30 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-amber-500/15 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <Bomb className="w-5 h-5 text-amber-400" />
                <h3 className="text-base sm:text-lg font-black text-amber-100 font-['Cinzel',serif] tracking-wider">
                  {editingBomb ? `Edit Bomb: ${editingBomb.name}` : 'Create New Bomb Type'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBomb} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Left Form Columns */}
                <div className="sm:col-span-2 space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                      Bomb Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Red Bomb, Golden Bomb"
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 text-xs focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  {/* Points & Weight */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                        Point Value
                      </label>
                      <input
                        type="number"
                        required
                        value={formPoints}
                        onChange={(e) => setFormPoints(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setFormPoints(100)}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                        >
                          +100
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPoints(150)}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                        >
                          +150
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPoints(300)}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                        >
                          +300
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPoints(-150)}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 hover:text-white border border-rose-800"
                        >
                          -150 (Penalty)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                        Spawn Weight (1 - 50)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        required
                        value={formSpawnWeight}
                        onChange={(e) => setFormSpawnWeight(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
                      />
                      <p className="text-[10px] text-neutral-500 mt-1">Relative random likelihood</p>
                    </div>
                  </div>

                  {/* Theme Color */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                      Theme Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="w-10 h-8 rounded-lg cursor-pointer bg-neutral-900 border border-neutral-700"
                      />
                      <input
                        type="text"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="w-28 px-2 py-1.5 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs"
                      />
                      <div className="flex items-center gap-1 ml-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFormColor(c)}
                            className="w-5 h-5 rounded-full border border-white/20 transition-transform hover:scale-125"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Cartoon Preset / Custom Image */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                      Visual Style & Preset
                    </label>
                    <select
                      value={formImagePreset}
                      onChange={(e) => setFormImagePreset(e.target.value as BombImagePreset)}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 text-xs focus:border-amber-400 focus:outline-none"
                    >
                      {IMAGE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} - {p.desc}
                        </option>
                      ))}
                    </select>

                    {formImagePreset === 'custom' && (
                      <div className="mt-2.5 p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-neutral-400">Custom Image Asset:</span>
                          <input
                            ref={imageFileInputRef}
                            type="file"
                            accept=".png,.svg,.webp,.jpg,.jpeg"
                            onChange={handleImageUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => imageFileInputRef.current?.click()}
                            disabled={isUploadingAsset}
                            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{isUploadingAsset ? 'Uploading...' : 'Upload Image'}</span>
                          </button>
                        </div>
                        {formImageUrl && (
                          <div className="text-[10px] font-mono text-neutral-400 truncate">
                            URL: {formImageUrl}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Burst Sound Effect */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                      Burst Sound Effect
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={formSoundPreset}
                        onChange={(e) => {
                          const val = e.target.value as BombSoundPreset;
                          setFormSoundPreset(val);
                          previewSound(val, formSoundUrl);
                        }}
                        className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 text-xs focus:border-amber-400 focus:outline-none"
                      >
                        {SOUND_PRESETS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label} ({s.desc})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => previewSound(formSoundPreset, formSoundUrl)}
                        className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-200 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                        title="Test Sound"
                      >
                        <Play className="w-3 h-3 text-amber-400" />
                        <span>Test</span>
                      </button>
                    </div>

                    {formSoundPreset === 'custom' && (
                      <div className="mt-2.5 p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-neutral-400">Custom Audio File:</span>
                          <input
                            ref={audioFileInputRef}
                            type="file"
                            accept=".mp3,.wav,.ogg,.m4a"
                            onChange={handleAudioUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => audioFileInputRef.current?.click()}
                            disabled={isUploadingAsset}
                            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{isUploadingAsset ? 'Uploading...' : 'Upload Audio'}</span>
                          </button>
                        </div>
                        {formSoundUrl && (
                          <div className="text-[10px] font-mono text-neutral-400 truncate">
                            URL: {formSoundUrl}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Active Toggle */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="formIsActive"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 bg-neutral-950 border-neutral-700 focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="formIsActive" className="text-xs text-neutral-200 cursor-pointer">
                      Enable this bomb in active gameplay
                    </label>
                  </div>
                </div>

                {/* Right Interactive Live Preview Card */}
                <div className="sm:col-span-1 flex flex-col items-center justify-center p-4 rounded-2xl bg-neutral-950/90 border border-neutral-800">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-3">
                    Live Preview
                  </span>
                  <div className="p-4 rounded-2xl bg-[#0A0713] border border-amber-500/20 shadow-inner flex flex-col items-center">
                    <CartoonBombSvg
                      bomb={{
                        id: 'modal_preview',
                        color: formColor,
                        points: formPoints,
                        imagePreset: formImagePreset,
                        imageUrl: formImageUrl,
                      }}
                      size={100}
                      showBadge={true}
                    />
                  </div>
                  <span className="text-xs font-bold text-neutral-200 mt-3 text-center">
                    {formName || 'Bomb Preview'}
                  </span>
                  <span
                    className={`text-xs font-mono font-bold mt-1 ${
                      formPoints < 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {formPoints > 0 ? `+${formPoints}` : formPoints} pts
                  </span>

                  <button
                    type="button"
                    onClick={() => previewSound(formSoundPreset, formSoundUrl)}
                    className="mt-4 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Play Sound</span>
                  </button>
                </div>
              </div>

              {/* Form Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
                {editingBomb ? (
                  <button
                    type="button"
                    disabled={deletingBombId !== null}
                    onClick={() => handleRequestDelete(editingBomb)}
                    className="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-rose-100 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {deletingBombId === editingBomb.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Delete Bomb</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBomb}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingBomb ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>{editingBomb ? 'Save Changes' : 'Create Bomb'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 6. Dedicated Delete Confirmation Modal */}
      {confirmDeleteBomb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#120E1E] border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-neutral-100 font-['Cinzel',serif] tracking-wide">
                  Delete Bomb Configuration
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Are you sure you want to remove <span className="text-rose-300 font-semibold font-mono">"{confirmDeleteBomb.name}"</span>?
                </p>
              </div>
            </div>

            {/* Bomb Mini Preview */}
            <div className="mt-4 p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 shrink-0">
                <CartoonBombSvg bomb={confirmDeleteBomb} size={48} showBadge={false} />
              </div>
              <div className="flex-1 text-xs">
                <div className="font-bold text-neutral-200">{confirmDeleteBomb.name}</div>
                <div className="text-neutral-400 text-[11px] mt-0.5">
                  Value:{' '}
                  <span className="font-mono text-emerald-400">
                    {confirmDeleteBomb.points > 0 ? `+${confirmDeleteBomb.points}` : confirmDeleteBomb.points} pts
                  </span>{' '}
                  • Weight: <span className="font-mono text-amber-300">{confirmDeleteBomb.spawnWeight}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {confirmDeleteBomb.isDefault
                  ? 'This is a default bomb type. It will be safely disabled and hidden from new games without affecting historical player scores.'
                  : 'This bomb will be removed from future gameplay spawns. Historical game records and player scores remain fully preserved.'}
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
              <button
                type="button"
                disabled={deletingBombId !== null}
                onClick={() => setConfirmDeleteBomb(null)}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-xl cursor-pointer disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBombId !== null}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deletingBombId === confirmDeleteBomb.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

