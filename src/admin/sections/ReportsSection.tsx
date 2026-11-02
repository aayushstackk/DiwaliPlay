/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { AdminOverviewStats, GameSession, User, SpinRecord } from '../../types/backend';
import {
  FileText,
  Download,
  Trophy,
  CheckCircle2,
  XCircle,
  BarChart3,
  Calendar,
  Sparkles,
  Info,
  Printer,
  Camera,
  FileSpreadsheet,
  FileJson,
  Search,
  X,
  Gift,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Users
} from 'lucide-react';
import { useAdminTheme } from '../AdminThemeContext';

interface ReportsSectionProps {
  stats: AdminOverviewStats | null;
  sessions: GameSession[];
  users: User[];
  spinResults?: SpinRecord[];
  isLoading: boolean;
}

// Helper to safely escape CSV values according to RFC 4180
function escapeCsvValue(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

// Helper to trigger browser download for text/blob/binary content
function downloadBlob(content: BlobPart, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Generate descriptive filename with export format and current date
function getExportFilename(format: 'csv' | 'json' | 'pdf' | 'xlsx'): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `diwaliplay-report-${year}-${month}-${day}.${format}`;
}

interface ProcessedPhoto {
  base64: string;
  extension: 'jpeg' | 'png';
  width: number;
  height: number;
}

// Safely download and process image bytes for Excel embedding with dimensions for proportional scaling
async function loadAndProcessImage(url: string): Promise<ProcessedPhoto | null> {
  if (!url || typeof url !== 'string' || !url.trim()) return null;

  try {
    // 1. Try Image element + Canvas approach to extract natural dimensions and compressed JPEG base64
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 6000);
      img.src = url;
    });

    if (loaded && img.naturalWidth > 0 && img.naturalHeight > 0) {
      try {
        const canvas = document.createElement('canvas');
        // Cap maximum dimensions to 400px so Excel files stay lightweight & fast to open
        const maxDim = 400;
        let targetW = img.naturalWidth;
        let targetH = img.naturalHeight;
        if (targetW > maxDim || targetH > maxDim) {
          if (targetW > targetH) {
            targetH = Math.round((targetH * maxDim) / targetW);
            targetW = maxDim;
          } else {
            targetW = Math.round((targetW * maxDim) / targetH);
            targetH = maxDim;
          }
        }
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrl.split(',')[1];
          if (base64) {
            return {
              base64,
              extension: 'jpeg',
              width: targetW,
              height: targetH
            };
          }
        }
      } catch (canvasErr) {
        console.warn('Canvas export warning (likely CORS on remote image):', canvasErr);
      }
    }

    // 2. Direct Data URL fallback
    if (url.startsWith('data:image/')) {
      const match = url.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        let ext = match[1].toLowerCase();
        if (ext === 'jpg') ext = 'jpeg';
        if (ext === 'jpeg' || ext === 'png') {
          return {
            base64: match[2],
            extension: ext as 'jpeg' | 'png',
            width: 400,
            height: 300
          };
        }
      }
    }

    // 3. Fallback: fetch blob/arrayBuffer from asset endpoint
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext: 'jpeg' | 'png' = blob.type.includes('png') ? 'png' : 'jpeg';

    const buffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return {
      base64,
      extension: ext,
      width: 400,
      height: 300
    };
  } catch (err) {
    console.warn('Failed to load player photo for Excel export:', err);
    return null;
  }
}

export const ReportsSection: React.FC<ReportsSectionProps> = ({
  stats,
  sessions,
  users,
  spinResults = [],
  isLoading
}) => {
  const { isLight } = useAdminTheme();
  const [reportView, setReportView] = useState<'sessions' | 'spin'>('sessions');
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'csv' | 'json' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Sessions Report filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; playerName: string } | null>(null);

  // Spin & Win Report filters & pagination
  const [voucherFilter, setVoucherFilter] = useState<string>('ALL');
  const [playerFilter, setPlayerFilter] = useState<string>('');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [spinCurrentPage, setSpinCurrentPage] = useState<number>(1);
  const spinPageSize = 12;

  // Close photo lightbox with Escape key
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

  // Map users for fast lookup by ID
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      if (u.id) map.set(u.id, u.name);
    });
    return map;
  }, [users]);

  // Full user object map for mobile numbers and additional metadata
  const userObjMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => {
      if (u.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

  // Pre-index sessions by ID
  const sessionObjMap = useMemo(() => {
    const map = new Map<string, GameSession>();
    (sessions || []).forEach((s) => {
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [sessions]);

  // --------------------------------------------------------------------------
  // SPIN & WIN REPORT DATA MODEL
  // --------------------------------------------------------------------------
  const allSpinEntries = useMemo(() => {
    interface SpinReportItem {
      id: string;
      playerName: string;
      playerCodeOrId: string;
      mobileNumber: string;
      sessionId: string;
      score: number | null;
      voucherName: string;
      couponCode: string;
      spinDateTime: string;
      timestamp: number;
    }

    const list: SpinReportItem[] = [];
    const seenSessionIds = new Set<string>();

    // 1. Process explicit spin results from spin_results collection
    (spinResults || []).forEach((sr) => {
      const session = sr.sessionId ? sessionObjMap.get(sr.sessionId) : undefined;
      const user = sr.userId ? userObjMap.get(sr.userId) : (session?.userId ? userObjMap.get(session.userId) : undefined);
      if (sr.sessionId) seenSessionIds.add(sr.sessionId);

      const playerName = sr.playerName || user?.name || (session as any)?.userName || 'Player';
      const playerCode = session?.code
        ? `#${session.code}`
        : (user as any)?.code
        ? `#${(user as any).code}`
        : (sr.userId ? sr.userId.slice(-6) : '—');
      const score = typeof session?.score === 'number' ? session.score : null;
      const spinDate = sr.timestamp || session?.endTime || session?.startTime || new Date().toISOString();

      list.push({
        id: sr.id,
        playerName,
        playerCodeOrId: playerCode,
        mobileNumber: sr.mobileNumber || user?.mobileNumber || '',
        sessionId: sr.sessionId || '—',
        score,
        voucherName: sr.rewardName || 'Special Reward',
        couponCode: sr.couponCode || '',
        spinDateTime: spinDate,
        timestamp: new Date(spinDate).getTime() || 0
      });
    });

    // 2. Also incorporate sessions that have earnedReward not captured in spinResults
    (sessions || []).forEach((s) => {
      if (s.earnedReward?.name && !seenSessionIds.has(s.id)) {
        seenSessionIds.add(s.id);
        const user = s.userId ? userObjMap.get(s.userId) : undefined;
        const playerName = user?.name || (s as any).userName || 'Player';
        const playerCode = s.code ? `#${s.code}` : (user as any)?.code ? `#${(user as any).code}` : (s.userId ? s.userId.slice(-6) : '—');
        const spinDate = s.endTime || s.startTime || new Date().toISOString();

        list.push({
          id: `session_reward_${s.id}`,
          playerName,
          playerCodeOrId: playerCode,
          mobileNumber: user?.mobileNumber || (s as any).mobileNumber || '',
          sessionId: s.id,
          score: typeof s.score === 'number' ? s.score : null,
          voucherName: s.earnedReward.name,
          couponCode: s.earnedReward.couponCode || '',
          spinDateTime: spinDate,
          timestamp: new Date(spinDate).getTime() || 0
        });
      }
    });

    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }, [spinResults, sessions, sessionObjMap, userObjMap]);

  // Distinct list of voucher names for filter dropdown
  const distinctVoucherNames = useMemo(() => {
    const set = new Set<string>();
    allSpinEntries.forEach((e) => {
      if (e.voucherName && e.voucherName.trim()) set.add(e.voucherName.trim());
    });
    return Array.from(set).sort();
  }, [allSpinEntries]);

  // Filtered Spin & Win Entries based on active filters
  const filteredSpinEntries = useMemo(() => {
    return allSpinEntries.filter((entry) => {
      if (voucherFilter !== 'ALL' && entry.voucherName !== voucherFilter) {
        return false;
      }

      if (playerFilter.trim()) {
        const q = playerFilter.trim().toLowerCase();
        const matchName = entry.playerName.toLowerCase().includes(q);
        const matchCode = entry.playerCodeOrId.toLowerCase().includes(q);
        const matchMobile = entry.mobileNumber.toLowerCase().includes(q);
        const matchSession = entry.sessionId.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchMobile && !matchSession) return false;
      }

      if (startDateFilter) {
        const startMs = new Date(startDateFilter).setHours(0, 0, 0, 0);
        if (entry.timestamp < startMs) return false;
      }
      if (endDateFilter) {
        const endMs = new Date(endDateFilter).setHours(23, 59, 59, 999);
        if (entry.timestamp > endMs) return false;
      }

      return true;
    });
  }, [allSpinEntries, voucherFilter, playerFilter, startDateFilter, endDateFilter]);

  // Voucher-wise winning counts for summary cards
  const voucherWinningCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredSpinEntries.forEach((entry) => {
      const vName = entry.voucherName || 'Other';
      counts[vName] = (counts[vName] || 0) + 1;
    });
    return counts;
  }, [filteredSpinEntries]);

  // Unique players who spun
  const uniqueSpinPlayersCount = useMemo(() => {
    const set = new Set<string>();
    filteredSpinEntries.forEach((e) => {
      if (e.playerName) set.add(e.playerName.trim().toLowerCase());
    });
    return set.size;
  }, [filteredSpinEntries]);

  // Formatter for Spin Date & Time
  const formatDateTime = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  // Paginated Spin Entries
  const totalSpinPages = Math.max(1, Math.ceil(filteredSpinEntries.length / spinPageSize));
  const paginatedSpinEntries = useMemo(() => {
    const start = (spinCurrentPage - 1) * spinPageSize;
    return filteredSpinEntries.slice(start, start + spinPageSize);
  }, [filteredSpinEntries, spinCurrentPage, spinPageSize]);

  const completedSessions = useMemo(() => {
    return sessions.filter((s) => s.status === 'COMPLETED');
  }, [sessions]);

  const abandonedSessions = useMemo(() => {
    return sessions.filter((s) => s.status === 'ABANDONED');
  }, [sessions]);

  const totalSessions = sessions.length;
  const completionRate =
    totalSessions > 0 ? Math.round((completedSessions.length / totalSessions) * 100) : 0;

  const totalCrackers = completedSessions.reduce((acc, s) => acc + (s.crackerCount || 0), 0);
  const avgCrackers =
    completedSessions.length > 0 ? Math.round(totalCrackers / completedSessions.length) : 0;

  // Comprehensive mapping of won vouchers for each session & player
  const sessionVoucherInfoMap = useMemo(() => {
    const map = new Map<
      string,
      {
        status: 'WON' | 'NOT_SPUN' | 'NO_REWARD';
        voucherName: string;
        couponCode?: string;
        spinDateTime?: string | null;
      }
    >();

    // 1. Index all spin results by sessionId
    const spinBySessionId = new Map<string, SpinRecord>();
    // 2. Also group spins by userId for fallback matching
    const spinsByUserId = new Map<string, SpinRecord[]>();
    // 3. Also group spins by mobileNumber for fallback matching
    const spinsByMobile = new Map<string, SpinRecord[]>();

    (spinResults || []).forEach((sr) => {
      if (sr.sessionId) {
        spinBySessionId.set(sr.sessionId, sr);
      }
      if (sr.userId) {
        if (!spinsByUserId.has(sr.userId)) {
          spinsByUserId.set(sr.userId, []);
        }
        spinsByUserId.get(sr.userId)!.push(sr);
      }
      if (sr.mobileNumber && sr.mobileNumber.trim()) {
        const cleanMobile = sr.mobileNumber.trim();
        if (!spinsByMobile.has(cleanMobile)) {
          spinsByMobile.set(cleanMobile, []);
        }
        spinsByMobile.get(cleanMobile)!.push(sr);
      }
    });

    const evaluateReward = (
      rawName: string | undefined | null,
      couponCode?: string | null,
      timestamp?: string | null
    ): {
      status: 'WON' | 'NOT_SPUN' | 'NO_REWARD';
      voucherName: string;
      couponCode?: string;
      spinDateTime?: string | null;
    } => {
      if (!rawName || !rawName.trim()) {
        return { status: 'NOT_SPUN', voucherName: 'Not Spun', spinDateTime: null };
      }
      const trimmed = rawName.trim();
      const lower = trimmed.toLowerCase();
      if (
        lower === 'no reward' ||
        lower === 'no voucher' ||
        lower === 'better luck next time' ||
        lower === 'try again'
      ) {
        return {
          status: 'NO_REWARD',
          voucherName: 'No Reward',
          couponCode: couponCode || undefined,
          spinDateTime: timestamp || null
        };
      }
      return {
        status: 'WON',
        voucherName: trimmed,
        couponCode: couponCode || undefined,
        spinDateTime: timestamp || null
      };
    };

    (sessions || []).forEach((s) => {
      // Step A: Direct match by sessionId in spinResults
      const spinMatch = spinBySessionId.get(s.id);
      if (spinMatch && spinMatch.rewardName) {
        map.set(s.id, evaluateReward(spinMatch.rewardName, spinMatch.couponCode, spinMatch.timestamp));
        return;
      }

      // Step B: Match by session.earnedReward
      if (s.earnedReward?.name) {
        map.set(
          s.id,
          evaluateReward(
            s.earnedReward.name,
            s.earnedReward.couponCode,
            s.endTime || s.startTime
          )
        );
        return;
      }

      // Step C: Fallback by userId if player has spun
      if (s.userId) {
        const userSpins = spinsByUserId.get(s.userId);
        if (userSpins && userSpins.length > 0) {
          const matchWithSession = userSpins.find((sp) => sp.sessionId === s.id);
          const spin = matchWithSession || userSpins[0];
          if (spin.rewardName) {
            map.set(s.id, evaluateReward(spin.rewardName, spin.couponCode, spin.timestamp));
            return;
          }
        }
      }

      // Step D: Fallback by player mobile number
      const user = userObjMap.get(s.userId);
      if (user?.mobileNumber) {
        const mobileSpins = spinsByMobile.get(user.mobileNumber.trim());
        if (mobileSpins && mobileSpins.length > 0) {
          const spin = mobileSpins.find((sp) => sp.sessionId === s.id) || mobileSpins[0];
          if (spin.rewardName) {
            map.set(s.id, evaluateReward(spin.rewardName, spin.couponCode, spin.timestamp));
            return;
          }
        }
      }

      // Default: Not Spun
      map.set(s.id, {
        status: 'NOT_SPUN',
        voucherName: 'Not Spun',
        spinDateTime: null
      });
    });

    return map;
  }, [sessions, spinResults, userObjMap]);

  // Real session export list sorted by score descending, reflecting active search filter
  const exportData = useMemo(() => {
    let list = [...completedSessions].sort((a, b) => (b.score || 0) - (a.score || 0));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const user = userObjMap.get(s.userId);
        const playerName = user?.name || userMap.get(s.userId) || (s as any).userName || 'Player';
        const mobileNumber = user?.mobileNumber || (s as any).mobileNumber || '';
        const vInfo = sessionVoucherInfoMap.get(s.id);
        const voucherName = (vInfo?.voucherName || '').toLowerCase();
        const couponCode = (vInfo?.couponCode || '').toLowerCase();
        const voucherStatus = (vInfo?.status || '').toLowerCase();

        return (
          playerName.toLowerCase().includes(q) ||
          mobileNumber.toLowerCase().includes(q) ||
          (s.id && s.id.toLowerCase().includes(q)) ||
          voucherName.includes(q) ||
          couponCode.includes(q) ||
          voucherStatus.includes(q)
        );
      });
    }
    return list;
  }, [completedSessions, searchQuery, userMap, userObjMap, sessionVoucherInfoMap]);

  // Handle Export PDF (Commemorative printable audit document)
  const handleExportPDF = () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('pdf');

    try {
      if (reportView === 'spin') {
        if (filteredSpinEntries.length === 0) {
          setExportError('No Spin & Win records available to export.');
          setExportingFormat(null);
          return;
        }

        const printableHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8" />
            <title>DiwaliPlay — Spin & Win Rewards Report</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #1e293b; background: #fff; }
              .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 16px; }
              .header h1 { margin: 0 0 4px 0; color: #92400e; font-size: 22px; font-weight: bold; }
              .header p { margin: 0; color: #64748b; font-size: 11px; }
              .stats-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
              .stat-card { flex: 1; min-width: 100px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; text-align: center; }
              .stat-val { font-size: 18px; font-weight: bold; color: #b45309; }
              .stat-lbl { font-size: 10px; color: #78350f; font-weight: 600; text-transform: uppercase; margin-top: 2px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
              th { background-color: #fef3c7; color: #92400e; padding: 8px 10px; text-align: left; border: 1px solid #fde68a; font-weight: bold; }
              td { padding: 8px 10px; border: 1px solid #e2e8f0; }
              tr:nth-child(even) { background-color: #f8fafc; }
              .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; background: #fef3c7; color: #92400e; font-weight: bold; border: 1px solid #fde68a; font-size: 10px; }
              .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>DIWALIPLAY — SPIN & WIN REWARDS AUDIT REPORT</h1>
              <p>Official Verification Report • Generated on ${new Date().toLocaleString()}</p>
            </div>
            <div class="stats-row">
              <div class="stat-card">
                <div class="stat-val">${filteredSpinEntries.length}</div>
                <div class="stat-lbl">Total Spins</div>
              </div>
              ${Object.entries(voucherWinningCounts).map(([name, count]) => `
                <div class="stat-card">
                  <div class="stat-val">${count}</div>
                  <div class="stat-lbl">${name}</div>
                </div>
              `).join('')}
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:30px">#</th>
                  <th>Player Name</th>
                  <th>Player Code/ID</th>
                  <th>Game Session</th>
                  <th>Score</th>
                  <th>Winning Voucher</th>
                  <th>Coupon Code</th>
                  <th>Spin Date & Time</th>
                </tr>
              </thead>
              <tbody>
                ${filteredSpinEntries.map((e, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${e.playerName}</strong>${e.mobileNumber ? `<br><small style="color:#64748b">${e.mobileNumber}</small>` : ''}</td>
                    <td>${e.playerCodeOrId}</td>
                    <td><code>${e.sessionId}</code></td>
                    <td>${e.score !== null ? `${e.score.toLocaleString()} pts` : '—'}</td>
                    <td><span class="badge">${e.voucherName}</span></td>
                    <td><code>${e.couponCode || '—'}</code></td>
                    <td>${new Date(e.spinDateTime).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">
              DiwaliPlay Motion Interactive Arcade • Official Audit Report • Spin & Win Module
            </div>
          </body>
          </html>
        `;

        let printFrame = document.getElementById('report-print-frame') as HTMLIFrameElement;
        if (!printFrame) {
          printFrame = document.createElement('iframe');
          printFrame.id = 'report-print-frame';
          printFrame.style.position = 'fixed';
          printFrame.style.right = '0';
          printFrame.style.bottom = '0';
          printFrame.style.width = '0';
          printFrame.style.height = '0';
          printFrame.style.border = '0';
          document.body.appendChild(printFrame);
        }

        const frameDoc = printFrame.contentWindow?.document;
        if (frameDoc) {
          frameDoc.open();
          frameDoc.write(printableHtml);
          frameDoc.close();
          setTimeout(() => {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();
            setExportSuccess('Print window opened for Spin & Win report.');
            setTimeout(() => setExportSuccess(null), 4000);
            setExportingFormat(null);
          }, 350);
        }
        return;
      }

      if (exportData.length === 0) {
        setExportError('No completed session records available to export.');
        setExportingFormat(null);
        return;
      }

      const generatedAt = new Date().toLocaleString([], {
        dateStyle: 'full',
        timeStyle: 'medium'
      });

      const sessionRowsHtml = exportData
        .map((s, idx) => {
          const playerName = userMap.get(s.userId) || 'Player';
          const startDate = s.startTime ? new Date(s.startTime) : new Date();
          const dateStr = startDate.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          const timeStr = startDate.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          });

          const photoHtml = s.photoUrl
            ? `<img src="${s.photoUrl}" alt="${playerName}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; display: block; margin: 0 auto;" />`
            : `<div style="width: 38px; height: 38px; border-radius: 6px; background-color: #f1f5f9; border: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 16px; margin: 0 auto;">🪔</div>`;

          const vInfo = sessionVoucherInfoMap.get(s.id);
          const voucherHtml = vInfo?.status === 'WON'
            ? `<span style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: #fef3c7; color: #92400e; font-weight: bold; border: 1px solid #fde68a; font-size: 10px;">${vInfo.voucherName}</span>${vInfo.couponCode ? `<br><small style="font-family: monospace; color: #b45309;">${vInfo.couponCode}</small>` : ''}`
            : `<span style="color: #94a3b8; font-size: 10px;">${vInfo?.status === 'NO_REWARD' ? 'No Reward' : 'Not Spun'}</span>`;

          return `
            <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
              <td style="padding: 10px 12px; text-align: center; font-weight: bold; font-family: monospace; color: #0284c7;">#${idx + 1}</td>
              <td style="padding: 10px 12px; text-align: center;">${photoHtml}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #0f172a;">${playerName}</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-family: monospace; color: #0369a1; font-size: 14px;">${s.score.toLocaleString()}</td>
              <td style="padding: 10px 12px; text-align: left;">${voucherHtml}</td>
              <td style="padding: 10px 12px; text-align: right; font-family: monospace; color: #334155;">${s.crackerCount || 0}</td>
              <td style="padding: 10px 12px; text-align: right; color: #475569; white-space: nowrap;">${dateStr}</td>
              <td style="padding: 10px 12px; text-align: right; color: #475569; white-space: nowrap; font-family: monospace;">${timeStr}</td>
            </tr>
          `;
        })
        .join('');

      const printableHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>DiwaliPlay - Game Sessions & Leaderboard Report</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .header {
              border-bottom: 2px solid #0284c7;
              padding-bottom: 16px;
              margin-bottom: 20px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .title {
              font-size: 24px;
              font-weight: 800;
              color: #0b1120;
              margin: 0 0 4px 0;
              letter-spacing: -0.5px;
            }
            .subtitle {
              font-size: 12px;
              color: #64748b;
              margin: 0;
            }
            .meta {
              text-align: right;
              font-size: 11px;
              color: #64748b;
              font-family: monospace;
            }
            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 24px;
            }
            .kpi-card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 10px 12px;
              background-color: #f8fafc;
            }
            .kpi-label {
              font-size: 10px;
              text-transform: uppercase;
              font-weight: 700;
              color: #64748b;
              margin-bottom: 4px;
            }
            .kpi-val {
              font-size: 20px;
              font-weight: 800;
              font-family: monospace;
              color: #0284c7;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            th {
              background-color: #0f172a;
              color: #ffffff;
              padding: 10px 12px;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              font-weight: 700;
            }
            tr {
              page-break-inside: avoid;
            }
            .footer {
              margin-top: 24px;
              border-top: 1px solid #e2e8f0;
              padding-top: 12px;
              font-size: 10px;
              color: #94a3b8;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">DIWALIPLAY OFFICIAL SESSION REPORT</h1>
              <p class="subtitle">Official motion challenge records, player scores, and souvenir photo telemetry</p>
            </div>
            <div class="meta">
              <div><strong>Generated:</strong> ${generatedAt}</div>
              <div><strong>Total Records:</strong> ${exportData.length} Completed Matches${searchQuery ? ` (Filtered: "${searchQuery}")` : ''}</div>
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Completion Rate</div>
              <div class="kpi-val">${completionRate}%</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Registrations</div>
              <div class="kpi-val">${users.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Highest Score</div>
              <div class="kpi-val">${stats?.highestScore || (exportData[0]?.score ?? 0)} pts</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Avg Crackers Burst</div>
              <div class="kpi-val">${avgCrackers}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 45px;">Rank</th>
                <th style="text-align: center; width: 55px;">Photo</th>
                <th style="text-align: left;">Player Name</th>
                <th style="text-align: right;">Final Score</th>
                <th style="text-align: left;">Won Voucher</th>
                <th style="text-align: right;">Crackers Burst</th>
                <th style="text-align: right;">Date</th>
                <th style="text-align: right;">Time</th>
              </tr>
            </thead>
            <tbody>
              ${
                sessionRowsHtml ||
                `<tr><td colspan="8" style="padding: 24px; text-align: center; color: #64748b;">No completed sessions available.</td></tr>`
              }
            </tbody>
          </table>

          <div class="footer">
            DiwaliPlay Motion Interactive Arcade · Official Audit Report · Verified Database Records
          </div>
        </body>
        </html>
      `;

      // Create print iframe
      const printIframe = document.createElement('iframe');
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = '0';
      document.body.appendChild(printIframe);

      const frameDoc = printIframe.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(printableHtml);
        frameDoc.close();

        setTimeout(() => {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
          setExportSuccess('PDF print dialog initiated.');
          setTimeout(() => {
            if (document.body.contains(printIframe)) {
              document.body.removeChild(printIframe);
            }
            setExportingFormat(null);
            setTimeout(() => setExportSuccess(null), 4000);
          }, 1500);
        }, 400);
      } else {
        setExportingFormat(null);
      }
    } catch (err: any) {
      console.error('PDF export error:', err);
      setExportingFormat(null);
      setExportError(err?.message || 'Failed to generate printable PDF.');
    }
  };

  // Handle Export CSV (Strict format, RFC 4180 with UTF-8 BOM)
  const handleExportCSV = () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('csv');

    try {
      if (reportView === 'spin') {
        if (filteredSpinEntries.length === 0) {
          setExportError('No Spin & Win records available to export.');
          setExportingFormat(null);
          return;
        }

        const headers = [
          'Player Name',
          'Player Code/ID',
          'Mobile Number',
          'Game Session ID',
          'Total Score',
          'Winning Voucher',
          'Coupon Code',
          'Spin Date',
          'Spin Time'
        ];
        const csvRows = [headers.map(escapeCsvValue).join(',')];

        filteredSpinEntries.forEach((entry) => {
          const d = new Date(entry.spinDateTime);
          const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
          const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
          const row = [
            entry.playerName,
            entry.playerCodeOrId,
            entry.mobileNumber,
            entry.sessionId,
            entry.score !== null ? entry.score : '—',
            entry.voucherName,
            entry.couponCode,
            dateStr,
            timeStr
          ];
          csvRows.push(row.map(escapeCsvValue).join(','));
        });

        const csvContent = '\uFEFF' + csvRows.join('\r\n');
        const filename = `diwaliplay-spin-rewards-report-${new Date().toISOString().slice(0, 10)}.csv`;
        downloadBlob(csvContent, 'text/csv;charset=utf-8;', filename);
        setExportSuccess(`Spin & Win CSV report successfully downloaded as ${filename}`);
        setTimeout(() => setExportSuccess(null), 4000);
        setExportingFormat(null);
        return;
      }

      if (exportData.length === 0) {
        setExportError('No completed session records available to export.');
        setExportingFormat(null);
        return;
      }

      const headers = [
        'Player Name',
        'Mobile Number',
        'Date',
        'Time',
        'Total Score',
        'Won Voucher',
        'Coupon Code',
        'Photo'
      ];

      const csvRows = [headers.map(escapeCsvValue).join(',')];

      exportData.forEach((s) => {
        const user = userObjMap.get(s.userId);
        const playerName = user?.name || userMap.get(s.userId) || (s as any).userName || 'Player';
        const mobileNumber = user?.mobileNumber || (s as any).mobileNumber || '';
        const startDate = s.startTime ? new Date(s.startTime) : new Date();
        const dateStr = startDate.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const timeStr = startDate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });

        // Do NOT put Base64 image data inside the CSV. Put a valid, accessible photo URL in the Photo column instead.
        let photoUrl = '';
        if (s.photoUrl) {
          if (s.photoUrl.startsWith('http://') || s.photoUrl.startsWith('https://')) {
            photoUrl = s.photoUrl;
          } else {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            photoUrl = `${origin}/api/session/${s.id}/photo`;
          }
        }

        const vInfo = sessionVoucherInfoMap.get(s.id);
        const wonVoucher =
          vInfo?.status === 'WON'
            ? vInfo.voucherName
            : vInfo?.status === 'NO_REWARD'
            ? 'No Reward'
            : 'Not Spun';
        const couponCode = vInfo?.couponCode || '';

        const row = [
          playerName,
          mobileNumber,
          dateStr,
          timeStr,
          s.score ?? 0,
          wonVoucher,
          couponCode,
          photoUrl
        ];

        csvRows.push(row.map(escapeCsvValue).join(','));
      });

      // Prepend UTF-8 BOM so Microsoft Excel cleanly renders characters and mobile numbers
      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const filename = getExportFilename('csv');
      downloadBlob(csvContent, 'text/csv;charset=utf-8;', filename);

      setExportSuccess(`CSV report successfully downloaded as ${filename}`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: any) {
      console.error('CSV export error:', err);
      setExportError(err?.message || 'Failed to generate and download CSV report.');
    } finally {
      setExportingFormat(null);
    }
  };

  // Handle Export Excel (.xlsx)
  const handleExportExcel = async () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('xlsx');

    try {
      if (reportView === 'spin') {
        if (filteredSpinEntries.length === 0) {
          setExportError('No Spin & Win records available to export.');
          setExportingFormat(null);
          return;
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'DiwaliPlay Admin';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Spin & Win Rewards', {
          views: [{ showGridLines: true }]
        });

        // Title row
        const titleRow = sheet.addRow(['DIWALIPLAY — SPIN & WIN REWARDS AUDIT REPORT']);
        titleRow.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFB45309' } };
        sheet.addRow([`Generated: ${new Date().toLocaleString()} | Total Filtered Spins: ${filteredSpinEntries.length}`]);
        sheet.addRow([]);

        // Header row
        const headerRow = sheet.addRow([
          'S.No',
          'Player Name',
          'Player Code/ID',
          'Mobile Number',
          'Game Session ID',
          'Total Score',
          'Winning Voucher',
          'Coupon Code',
          'Spin Date & Time'
        ]);
        headerRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFB45309' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 24;

        filteredSpinEntries.forEach((entry, idx) => {
          const d = new Date(entry.spinDateTime);
          const dateStr = !isNaN(d.getTime()) ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
          const row = sheet.addRow([
            idx + 1,
            entry.playerName,
            entry.playerCodeOrId,
            entry.mobileNumber || '—',
            entry.sessionId,
            entry.score !== null ? entry.score : '—',
            entry.voucherName,
            entry.couponCode || '—',
            dateStr
          ]);
          row.font = { name: 'Segoe UI', size: 10 };
          row.alignment = { vertical: 'middle' };
          row.height = 20;
        });

        sheet.columns = [
          { width: 8 },
          { width: 24 },
          { width: 16 },
          { width: 18 },
          { width: 28 },
          { width: 14 },
          { width: 24 },
          { width: 18 },
          { width: 24 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `diwaliplay-spin-rewards-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
        downloadBlob(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename);
        setExportSuccess(`Spin & Win Excel report successfully downloaded as ${filename}`);
        setTimeout(() => setExportSuccess(null), 4000);
        setExportingFormat(null);
        return;
      }

      if (exportData.length === 0) {
        setExportError('No completed session records available to export.');
        setExportingFormat(null);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'DiwaliPlay Admin';
      workbook.lastModifiedBy = 'DiwaliPlay Admin';
      workbook.created = new Date();
      workbook.modified = new Date();

      const worksheet = workbook.addWorksheet('Player Sessions', {
        views: [{ showGridLines: true }]
      });

      worksheet.columns = [
        { header: 'Player Name', key: 'playerName', width: 24 },
        { header: 'Mobile Number', key: 'mobileNumber', width: 18 },
        { header: 'Date', key: 'playedDate', width: 16 },
        { header: 'Time', key: 'playedTime', width: 14 },
        { header: 'Total Score', key: 'totalScore', width: 16 },
        { header: 'Won Voucher', key: 'wonVoucher', width: 22 },
        { header: 'Coupon Code', key: 'couponCode', width: 18 },
        { header: 'Photo', key: 'playerPhoto', width: 26 },
      ];

      // Header styling - Dark navy theme
      const headerRow = worksheet.getRow(1);
      headerRow.height = 32;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0F172A' }
        };
        cell.font = {
          name: 'Segoe UI',
          color: { argb: 'FFFFFFFF' },
          bold: true,
          size: 11
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF334155' } },
          bottom: { style: 'medium', color: { argb: 'FF0284C7' } },
          left: { style: 'thin', color: { argb: 'FF334155' } },
          right: { style: 'thin', color: { argb: 'FF334155' } }
        };
      });

      // Populate data rows and embed photos
      for (let i = 0; i < exportData.length; i++) {
        const s = exportData[i];
        const rowIndex = i + 2; // Row 1 is header
        const user = userObjMap.get(s.userId);
        const playerName = user?.name || userMap.get(s.userId) || 'Player';
        const mobileNumber = user?.mobileNumber || '';
        const startDate = s.startTime ? new Date(s.startTime) : new Date();
        const playedDate = startDate.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const playedTime = startDate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
        const totalScore = s.score ?? 0;
        const vInfo = sessionVoucherInfoMap.get(s.id);
        const wonVoucher =
          vInfo?.status === 'WON'
            ? vInfo.voucherName
            : vInfo?.status === 'NO_REWARD'
            ? 'No Reward'
            : 'Not Spun';
        const couponCode = vInfo?.couponCode || '';

        const row = worksheet.addRow({
          playerName,
          mobileNumber: mobileNumber || '',
          playedDate,
          playedTime,
          totalScore,
          wonVoucher,
          couponCode,
          playerPhoto: ''
        });

        // Set row height so embedded photo preview is clearly visible
        row.height = 80;

        // Cell typography & alignment
        const nameCell = row.getCell('playerName');
        nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        nameCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };

        const mobileCell = row.getCell('mobileNumber');
        mobileCell.alignment = { vertical: 'middle', horizontal: 'center' };
        mobileCell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF334155' } };
        mobileCell.numFmt = '@';

        const dateCell = row.getCell('playedDate');
        dateCell.alignment = { vertical: 'middle', horizontal: 'center' };
        dateCell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF475569' } };

        const timeCell = row.getCell('playedTime');
        timeCell.alignment = { vertical: 'middle', horizontal: 'center' };
        timeCell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF475569' } };

        const scoreCell = row.getCell('totalScore');
        scoreCell.alignment = { vertical: 'middle', horizontal: 'right' };
        scoreCell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF0284C7' } };
        scoreCell.numFmt = '#,##0';

        const voucherCell = row.getCell('wonVoucher');
        voucherCell.alignment = { vertical: 'middle', horizontal: 'center' };
        voucherCell.font = {
          name: 'Segoe UI',
          size: 10,
          bold: vInfo?.status === 'WON',
          color: { argb: vInfo?.status === 'WON' ? 'FFB45309' : 'FF64748B' }
        };

        const couponCell = row.getCell('couponCode');
        couponCell.alignment = { vertical: 'middle', horizontal: 'center' };
        couponCell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF334155' } };

        const photoCell = row.getCell('playerPhoto');
        photoCell.alignment = { vertical: 'middle', horizontal: 'center' };

        const isOdd = i % 2 === 1;
        row.eachCell({ includeEmpty: true }, (cell) => {
          if (isOdd) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        });

        // Actual player photo embedding into cell
        if (s.photoUrl) {
          try {
            const photo = await loadAndProcessImage(s.photoUrl);
            if (photo && photo.base64) {
              const imageId = workbook.addImage({
                base64: photo.base64,
                extension: photo.extension
              });

              // Proportional fit calculation without distortion
              const maxW = 140; // px
              const maxH = 92;  // px
              const scale = Math.min(maxW / photo.width, maxH / photo.height);
              const dispWidth = Math.max(20, Math.round(photo.width * scale));
              const dispHeight = Math.max(20, Math.round(photo.height * scale));

              // Approximate dimensions of cell H{rowIndex} in px (col width 26 ≈ 195px, row height 80pt ≈ 106px)
              const colWidthPx = 195;
              const rowHeightPx = 106;
              const colOffset = Math.max(0, (colWidthPx - dispWidth) / (2 * colWidthPx));
              const rowOffset = Math.max(0, (rowHeightPx - dispHeight) / (2 * rowHeightPx));

              worksheet.addImage(imageId, {
                tl: { col: 7 + colOffset, row: (rowIndex - 1) + rowOffset },
                ext: { width: dispWidth, height: dispHeight },
                editAs: 'oneCell'
              });
            } else {
              photoCell.value = 'No Photo';
              photoCell.font = { name: 'Segoe UI', italic: true, size: 10, color: { argb: 'FF94A3B8' } };
            }
          } catch (imgErr) {
            console.warn(`[Excel Export] Could not embed photo for row ${rowIndex}:`, imgErr);
            photoCell.value = 'No Photo';
            photoCell.font = { name: 'Segoe UI', italic: true, size: 10, color: { argb: 'FF94A3B8' } };
          }
        } else {
          photoCell.value = 'No Photo';
          photoCell.font = { name: 'Segoe UI', italic: true, size: 10, color: { argb: 'FF94A3B8' } };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = getExportFilename('xlsx');
      downloadBlob(
        buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename
      );

      setExportSuccess(`Excel report with embedded player photos successfully downloaded as ${filename}`);
      setTimeout(() => setExportSuccess(null), 5000);
    } catch (err: any) {
      console.error('Excel export error:', err);
      setExportError(err?.message || 'Failed to generate and download Excel (.xlsx) report.');
    } finally {
      setExportingFormat(null);
    }
  };

  // Handle Export JSON
  const handleExportJSON = () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('json');

    try {
      if (reportView === 'spin') {
        if (filteredSpinEntries.length === 0) {
          setExportError('No Spin & Win records available to export.');
          setExportingFormat(null);
          return;
        }

        const reportPayload = {
          reportTitle: 'DiwaliPlay Spin & Win Rewards Audit Report',
          exportDate: new Date().toISOString().slice(0, 10),
          generatedAt: new Date().toISOString(),
          totalFilteredSpins: filteredSpinEntries.length,
          totalAllSpins: allSpinEntries.length,
          uniquePlayers: uniqueSpinPlayersCount,
          voucherWinningCounts,
          activeFilters: {
            voucher: voucherFilter !== 'ALL' ? voucherFilter : null,
            player: playerFilter.trim() || null,
            startDate: startDateFilter || null,
            endDate: endDateFilter || null
          },
          records: filteredSpinEntries.map((e, idx) => ({
            index: idx + 1,
            playerName: e.playerName,
            playerCodeOrId: e.playerCodeOrId,
            mobileNumber: e.mobileNumber || null,
            gameSessionId: e.sessionId,
            totalScore: e.score,
            winningVoucher: e.voucherName,
            couponCode: e.couponCode || null,
            spinDateTime: e.spinDateTime
          }))
        };

        const jsonContent = JSON.stringify(reportPayload, null, 2);
        const filename = `diwaliplay-spin-rewards-report-${new Date().toISOString().slice(0, 10)}.json`;
        downloadBlob(jsonContent, 'application/json;charset=utf-8;', filename);

        setExportSuccess(`Spin & Win JSON report successfully downloaded as ${filename}`);
        setTimeout(() => setExportSuccess(null), 4000);
        setExportingFormat(null);
        return;
      }

      if (exportData.length === 0) {
        setExportError('No completed session records available to export.');
        setExportingFormat(null);
        return;
      }

      const generatedAt = new Date().toISOString();
      const records = exportData.map((s, idx) => {
        const user = userObjMap.get(s.userId);
        const playerName = user?.name || userMap.get(s.userId) || 'Player';
        const mobileNumber = user?.mobileNumber || '';
        const startDate = s.startTime ? new Date(s.startTime) : new Date();
        const dateStr = startDate.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const timeStr = startDate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });

        const vInfo = sessionVoucherInfoMap.get(s.id);
        const wonVoucher =
          vInfo?.status === 'WON'
            ? vInfo.voucherName
            : vInfo?.status === 'NO_REWARD'
            ? 'No Reward'
            : 'Not Spun';

        return {
          rank: idx + 1,
          sessionId: s.id || '',
          playerName,
          mobileNumber: mobileNumber || null,
          score: s.score ?? 0,
          wonVoucher,
          couponCode: vInfo?.couponCode || null,
          voucherStatus: vInfo?.status || 'NOT_SPUN',
          crackersBurst: s.crackerCount ?? 0,
          combos: s.combosCount ?? s.comboCount ?? 0,
          targetScore: typeof s.targetScore === 'number' ? s.targetScore : null,
          targetAchieved: typeof s.targetAchieved === 'boolean' ? s.targetAchieved : null,
          date: dateStr,
          time: timeStr,
          timestamp: s.startTime || startDate.toISOString(),
          photoUrl: s.photoUrl || null
        };
      });

      const reportPayload = {
        reportTitle: 'DiwaliPlay Official Session Report',
        exportDate: getExportFilename('json').replace('diwaliplay-report-', '').replace('.json', ''),
        generatedAt,
        totalRecords: records.length,
        filter: searchQuery.trim() ? searchQuery.trim() : null,
        summary: {
          completionRatePercent: completionRate,
          totalRegistrations: users.length,
          highestScore: stats?.highestScore || (exportData[0]?.score ?? 0),
          averageCrackersBurst: avgCrackers
        },
        records
      };

      const jsonContent = JSON.stringify(reportPayload, null, 2);
      const filename = getExportFilename('json');
      downloadBlob(jsonContent, 'application/json;charset=utf-8;', filename);

      setExportSuccess(`JSON report successfully downloaded as ${filename}`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: any) {
      console.error('JSON export error:', err);
      setExportError(err?.message || 'Failed to generate and download JSON report.');
    } finally {
      setExportingFormat(null);
    }
  };

  // Columns mapped for the Official Player Reports Table:
  // 1. Player Name, 2. Mobile Number, 3. Date, 4. Time, 5. Total Score, 6. Won Voucher, 7. Photo
  const displayedTableRows = useMemo(() => {
    return exportData.map((s) => {
      const user = userObjMap.get(s.userId);
      const playerName = user?.name || userMap.get(s.userId) || (s as any).userName || 'Player';
      const mobileNumber = user?.mobileNumber || (s as any).mobileNumber || '';
      const startDate = s.startTime ? new Date(s.startTime) : new Date();
      const dateStr = startDate.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const timeStr = startDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      const voucherInfo = sessionVoucherInfoMap.get(s.id) || {
        status: 'NOT_SPUN' as const,
        voucherName: 'Not Spun',
        spinDateTime: null
      };

      return {
        id: s.id,
        playerName,
        mobileNumber,
        date: dateStr,
        time: timeStr,
        totalScore: s.score ?? 0,
        voucherInfo,
        photoUrl: s.photoUrl || null
      };
    });
  }, [exportData, userMap, userObjMap, sessionVoucherInfoMap]);

  // Theme-aware styles
  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] shadow-[0_2px_8px_rgba(73,52,38,0.05)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 shadow-sm';
  const labelColor = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* View Selector Tabs */}
      <div className={`p-1.5 rounded-2xl border flex items-center gap-2 w-fit shadow-sm ${
        isLight ? 'bg-[#F3E9DA] border-[#D8C7AE]' : 'bg-slate-900/90 border-slate-800'
      }`}>
        <button
          type="button"
          onClick={() => setReportView('sessions')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            reportView === 'sessions'
              ? isLight
                ? 'bg-[#76513D] text-[#FDF9F3] shadow-sm'
                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : isLight
              ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#FAF4E8]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Game Sessions Report</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            reportView === 'sessions'
              ? isLight ? 'bg-black/20 text-white' : 'bg-cyan-400/20 text-cyan-200'
              : isLight ? 'bg-[#E8DCCB] text-[#493426]' : 'bg-slate-800 text-slate-300'
          }`}>
            {completedSessions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setReportView('spin')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            reportView === 'spin'
              ? isLight
                ? 'bg-[#B45309] text-white shadow-sm'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : isLight
              ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#FAF4E8]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Gift className="w-3.5 h-3.5" />
          <span>Spin & Win Report</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            reportView === 'spin'
              ? isLight ? 'bg-black/20 text-white' : 'bg-amber-400/20 text-amber-200'
              : isLight ? 'bg-[#E8DCCB] text-[#493426]' : 'bg-slate-800 text-slate-300'
          }`}>
            {allSpinEntries.length}
          </span>
        </button>
      </div>

      {/* Export Action Banner */}
      <div className={`p-4 sm:p-5 rounded-2xl border text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm ${
        isLight
          ? reportView === 'spin' ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]' : 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426]'
          : reportView === 'spin' ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
      }`}>
        <div className="flex items-start gap-3">
          {reportView === 'spin' ? (
            <Gift className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-[#B45309]' : 'text-amber-400'}`} />
          ) : (
            <Info className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-[#76513D]' : 'text-cyan-400'}`} />
          )}
          <div>
            <h3 className={`font-bold text-sm mb-1 ${primaryText}`}>
              {reportView === 'spin'
                ? 'Spin & Win Rewards Audit & Export Center'
                : 'Official Session Reports & Export Center'}
            </h3>
            <p className={`leading-relaxed max-w-2xl ${labelColor}`}>
              {reportView === 'spin'
                ? 'Export verified player Spin & Win reward records with winning voucher name, coupon code, player code/ID, score, and timestamps in CSV, Excel, PDF, or JSON format.'
                : 'Export verified player records in CSV, Excel (.xlsx), PDF, and JSON formats. Formatted with audit columns: Player Name, Mobile Number, Date, Time, Total Score, Won Voucher, and Souvenir Photo.'}
            </p>
          </div>
        </div>

        {/* 4 Download Action Buttons: Excel (.xlsx), PDF, CSV, JSON */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-auto">
          {/* Download CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={exportingFormat !== null || isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
              isLight
                ? 'bg-[#76513D] hover:bg-[#5D3F2E] text-[#FDF9F3] shadow-[0_2px_8px_rgba(118,81,61,0.2)]'
                : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
            }`}
            title="Download CSV spreadsheet data with 6 standard columns"
          >
            {exportingFormat === 'csv' ? (
              <div className={`w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin ${
                isLight ? 'border-white' : 'border-slate-950'
              }`} />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{exportingFormat === 'csv' ? 'Generating CSV...' : 'Download CSV'}</span>
          </button>

          {/* Download Excel (.xlsx) with actual embedded player photos */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exportingFormat !== null || isLoading}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 border ${
              isLight
                ? 'bg-[#FAF4E8] hover:bg-[#F3E9DA] border-[#58734B] text-[#3B5031]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-emerald-500/40 hover:border-emerald-400 text-emerald-300 hover:text-emerald-200'
            }`}
            title="Download Excel (.xlsx) report with embedded player photos"
          >
            {exportingFormat === 'xlsx' ? (
              <div className={`w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin ${
                isLight ? 'border-[#58734B]' : 'border-emerald-400'
              }`} />
            ) : (
              <FileSpreadsheet className={`w-4 h-4 ${isLight ? 'text-[#58734B]' : 'text-emerald-400'}`} />
            )}
            <span>{exportingFormat === 'xlsx' ? 'Generating Excel...' : 'Download Excel (.xlsx)'}</span>
          </button>

          {/* Download PDF */}
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={exportingFormat !== null || isLoading}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 border ${
              isLight
                ? 'bg-[#FAF4E8] hover:bg-[#F3E9DA] border-[#B36D4E] text-[#B36D4E]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-cyan-200'
            }`}
            title="Download formatted printable PDF report"
          >
            {exportingFormat === 'pdf' ? (
              <div className={`w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin ${
                isLight ? 'border-[#B36D4E]' : 'border-cyan-400'
              }`} />
            ) : (
              <Printer className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
            )}
            <span>{exportingFormat === 'pdf' ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>

          {/* Download JSON */}
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={exportingFormat !== null || isLoading}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 border ${
              isLight
                ? 'bg-[#FAF4E8] hover:bg-[#F3E9DA] border-[#D8C7AE] text-[#806B58]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-amber-200'
            }`}
            title="Download structured JSON report data"
          >
            {exportingFormat === 'json' ? (
              <div className={`w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin ${
                isLight ? 'border-[#806B58]' : 'border-amber-400'
              }`} />
            ) : (
              <FileJson className={`w-4 h-4 ${isLight ? 'text-[#9C6721]' : 'text-amber-400'}`} />
            )}
            <span>{exportingFormat === 'json' ? 'Generating JSON...' : 'Download JSON'}</span>
          </button>
        </div>
      </div>

      {/* Success Status Banner */}
      {exportSuccess && (
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in ${
          isLight
            ? 'bg-[#58734B]/15 border-[#58734B]/40 text-[#3B5031]'
            : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#58734B]' : 'text-emerald-400'}`} />
            <span className="font-semibold">{exportSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportSuccess(null)}
            className="p-1 rounded cursor-pointer hover:opacity-75"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Status Banner */}
      {exportError && (
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in ${
          isLight
            ? 'bg-[#A74747]/15 border-[#A74747]/40 text-[#782828]'
            : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            <XCircle className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#A74747]' : 'text-rose-400'}`} />
            <span className="font-semibold">{exportError}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="p-1 rounded cursor-pointer hover:opacity-75"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {reportView === 'spin' ? (
        <>
          {/* Spin & Win Summary KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Spins */}
            <div className={`${cardBg} border p-3.5 rounded-2xl flex flex-col justify-between shadow-sm`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${labelColor}`}>Total Spins</span>
              <div className="flex items-baseline justify-between mt-1.5">
                <span className={`text-xl font-mono font-extrabold ${isLight ? 'text-[#B45309]' : 'text-amber-400'}`}>
                  {filteredSpinEntries.length}
                </span>
                <Gift className={`w-4 h-4 opacity-50 ${isLight ? 'text-[#B45309]' : 'text-amber-400'}`} />
              </div>
              <span className={`text-[10px] font-mono mt-1 ${labelColor}`}>
                {allSpinEntries.length !== filteredSpinEntries.length ? `${allSpinEntries.length} total recorded` : 'All records'}
              </span>
            </div>

            {/* Unique Players */}
            <div className={`${cardBg} border p-3.5 rounded-2xl flex flex-col justify-between shadow-sm`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${labelColor}`}>Unique Players</span>
              <div className="flex items-baseline justify-between mt-1.5">
                <span className={`text-xl font-mono font-extrabold ${isLight ? 'text-[#76513D]' : 'text-cyan-300'}`}>
                  {uniqueSpinPlayersCount}
                </span>
                <Users className={`w-4 h-4 opacity-50 ${isLight ? 'text-[#76513D]' : 'text-cyan-400'}`} />
              </div>
              <span className={`text-[10px] font-mono mt-1 ${labelColor}`}>Distinct participants</span>
            </div>

            {/* Voucher-wise Winning Breakdown */}
            {Object.entries(voucherWinningCounts).map(([vName, count]) => (
              <div key={vName} className={`${cardBg} border p-3.5 rounded-2xl flex flex-col justify-between shadow-sm`}>
                <span className={`text-[10px] font-bold truncate ${labelColor}`} title={vName}>
                  {vName}
                </span>
                <div className="flex items-baseline justify-between mt-1.5">
                  <span className={`text-xl font-mono font-extrabold ${isLight ? 'text-[#76513D]' : 'text-emerald-400'}`}>
                    {count}
                  </span>
                  <Trophy className={`w-4 h-4 opacity-50 ${isLight ? 'text-[#76513D]' : 'text-emerald-400'}`} />
                </div>
                <span className={`text-[10px] font-mono mt-1 ${labelColor}`}>
                  {filteredSpinEntries.length > 0 ? `${Math.round((count / filteredSpinEntries.length) * 100)}% of spins` : '—'}
                </span>
              </div>
            ))}
          </div>

          {/* Spin & Win Filter Toolbar */}
          <div className={`${cardBg} border p-3 sm:p-4 rounded-2xl flex flex-col gap-3 shadow-sm`}>
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Player search filter */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-[#B36D4E]' : 'text-slate-400'}`} />
                <input
                  type="text"
                  value={playerFilter}
                  onChange={(e) => {
                    setPlayerFilter(e.target.value);
                    setSpinCurrentPage(1);
                  }}
                  placeholder="Filter by player, code/ID, mobile, or session..."
                  className={`w-full pl-10 pr-9 py-2 rounded-xl text-xs outline-none transition-colors ${
                    isLight
                      ? 'bg-[#FAF4E8] border border-[#D8C7AE] text-[#493426] placeholder-[#806B58] focus:border-[#B36D4E]'
                      : 'bg-slate-950/80 border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-amber-500/60'
                  }`}
                />
                {playerFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerFilter('');
                      setSpinCurrentPage(1);
                    }}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer ${
                      isLight ? 'text-[#806B58] hover:text-[#493426]' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Voucher Filter Dropdown */}
              <div className="flex items-center gap-2">
                <Filter className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#806B58]' : 'text-slate-400'}`} />
                <select
                  value={voucherFilter}
                  onChange={(e) => {
                    setVoucherFilter(e.target.value);
                    setSpinCurrentPage(1);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs outline-none transition-colors border cursor-pointer ${
                    isLight
                      ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] focus:border-[#B36D4E]'
                      : 'bg-slate-950/80 border-slate-800 text-slate-200 focus:border-amber-500/60'
                  }`}
                >
                  <option value="ALL">All Vouchers ({allSpinEntries.length})</option>
                  {distinctVoucherNames.map((name) => (
                    <option key={name} value={name}>
                      {name} ({allSpinEntries.filter((e) => e.voucherName === name).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range: From & To */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Calendar className={`w-3.5 h-3.5 ${isLight ? 'text-[#806B58]' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-semibold ${labelColor}`}>From:</span>
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => {
                      setStartDateFilter(e.target.value);
                      setSpinCurrentPage(1);
                    }}
                    className={`py-1.5 px-2.5 rounded-xl text-xs outline-none border cursor-pointer ${
                      isLight
                        ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426]'
                        : 'bg-slate-950/80 border-slate-800 text-slate-200'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-semibold ${labelColor}`}>To:</span>
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => {
                      setEndDateFilter(e.target.value);
                      setSpinCurrentPage(1);
                    }}
                    className={`py-1.5 px-2.5 rounded-xl text-xs outline-none border cursor-pointer ${
                      isLight
                        ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426]'
                        : 'bg-slate-950/80 border-slate-800 text-slate-200'
                    }`}
                  />
                </div>

                {/* Reset Filters button */}
                {(voucherFilter !== 'ALL' || playerFilter || startDateFilter || endDateFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setVoucherFilter('ALL');
                      setPlayerFilter('');
                      setStartDateFilter('');
                      setEndDateFilter('');
                      setSpinCurrentPage(1);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#76513D] hover:bg-[#F3E9DA]'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="Reset all filters"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            <div className={`text-xs flex items-center justify-between font-mono pt-1 border-t ${
              isLight ? 'border-[#E8DCCB]' : 'border-slate-800/60'
            }`}>
              <span className={labelColor}>
                Showing <strong className={isLight ? 'text-[#B45309]' : 'text-amber-300'}>{filteredSpinEntries.length}</strong> of {allSpinEntries.length} spin records
              </span>
              {(voucherFilter !== 'ALL' || playerFilter || startDateFilter || endDateFilter) && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isLight
                    ? 'bg-[#B45309]/15 text-[#92400E] border-[#B45309]/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  Filtered Results
                </span>
              )}
            </div>
          </div>

          {/* Spin & Win Table Card */}
          <div className={`${cardBg} border rounded-2xl overflow-hidden shadow-xl`}>
            <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${
              isLight ? 'bg-[#F3E9DA] border-[#D8C7AE]' : 'bg-slate-950/60 border-amber-500/15'
            }`}>
              <div className="flex items-center gap-2.5">
                <Gift className={`w-5 h-5 ${isLight ? 'text-[#B45309]' : 'text-amber-400'}`} />
                <h2 className={`text-sm font-bold tracking-wide ${primaryText}`}>
                  Spin & Win Rewards Audit Report
                </h2>
              </div>
              <span className={`text-xs font-mono font-semibold ${labelColor}`}>
                {filteredSpinEntries.length} {filteredSpinEntries.length === 1 ? 'Record' : 'Records'}
              </span>
            </div>

            {isLoading ? (
              <div className={`p-8 text-center text-xs ${labelColor}`}>
                Loading Spin & Win records...
              </div>
            ) : filteredSpinEntries.length === 0 ? (
              <div className={`p-8 text-center text-xs space-y-3 ${labelColor}`}>
                <p>No Spin & Win records matching the selected criteria.</p>
                {(voucherFilter !== 'ALL' || playerFilter || startDateFilter || endDateFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setVoucherFilter('ALL');
                      setPlayerFilter('');
                      setStartDateFilter('');
                      setEndDateFilter('');
                      setSpinCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      isLight
                        ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#76513D] hover:bg-[#F3E9DA]'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear All Filters</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={`border-b uppercase tracking-wider text-[10px] ${
                        isLight
                          ? 'border-[#D8C7AE] text-[#493426] bg-[#F3E9DA]'
                          : 'border-slate-800 text-slate-400 bg-slate-950/40'
                      }`}>
                        <th className="py-3.5 px-4 font-bold text-center w-12">#</th>
                        <th className="py-3.5 px-4 font-bold text-left">Player Name</th>
                        <th className="py-3.5 px-4 font-bold text-left">Player Code/ID</th>
                        <th className="py-3.5 px-4 font-bold text-left">Game Session</th>
                        <th className="py-3.5 px-4 font-bold text-right">Total Score</th>
                        <th className="py-3.5 px-4 font-bold text-left">Winning Voucher</th>
                        <th className="py-3.5 px-4 font-bold text-right">Spin Date & Time</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? 'divide-[#E8DCCB]' : 'divide-slate-800/60'}`}>
                      {paginatedSpinEntries.map((entry, idx) => {
                        const serialNum = (spinCurrentPage - 1) * spinPageSize + idx + 1;
                        return (
                          <tr
                            key={entry.id}
                            className={`transition-colors ${isLight ? 'hover:bg-[#F5ECE0]' : 'hover:bg-slate-900/50'}`}
                          >
                            {/* Serial Number */}
                            <td className={`py-3.5 px-4 text-center font-mono ${labelColor}`}>
                              {serialNum}
                            </td>

                            {/* Player Name */}
                            <td className={`py-3.5 px-4 font-semibold ${primaryText}`}>
                              <div>{entry.playerName}</div>
                              {entry.mobileNumber && (
                                <div className={`text-[10px] font-mono mt-0.5 ${labelColor}`}>
                                  {entry.mobileNumber}
                                </div>
                              )}
                            </td>

                            {/* Player Code / ID */}
                            <td className={`py-3.5 px-4 font-mono font-bold ${
                              isLight ? 'text-[#76513D]' : 'text-amber-300'
                            }`}>
                              {entry.playerCodeOrId}
                            </td>

                            {/* Game Session ID */}
                            <td className="py-3.5 px-4 font-mono text-[11px]">
                              <span className={`px-2 py-0.5 rounded-md border truncate max-w-[140px] inline-block ${
                                isLight
                                  ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426]'
                                  : 'bg-slate-950/70 border-slate-800 text-slate-300'
                              }`} title={entry.sessionId}>
                                {entry.sessionId.length > 14 ? `${entry.sessionId.slice(0, 12)}...` : entry.sessionId}
                              </span>
                            </td>

                            {/* Total Score */}
                            <td className={`py-3.5 px-4 text-right font-mono font-bold text-sm ${
                              isLight ? 'text-[#76513D]' : 'text-cyan-300'
                            }`}>
                              {entry.score !== null ? `${entry.score.toLocaleString()} pts` : '—'}
                            </td>

                            {/* Winning Voucher */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-sm w-fit ${
                                  isLight
                                    ? 'bg-[#B36D4E]/15 text-[#76513D] border-[#B36D4E]/30'
                                    : 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                                }`}>
                                  <Gift className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span>{entry.voucherName}</span>
                                </span>
                                {entry.couponCode && (
                                  <span className={`text-[10px] font-mono px-1 truncate max-w-[160px] ${labelColor}`} title={`Coupon: ${entry.couponCode}`}>
                                    Code: <strong className="text-amber-400 font-mono">{entry.couponCode}</strong>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Spin Date & Time */}
                            <td className={`py-3.5 px-4 text-right font-mono whitespace-nowrap text-xs ${primaryText}`}>
                              {formatDateTime(entry.spinDateTime)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalSpinPages > 1 && (
                  <div className={`p-3.5 sm:p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 ${
                    isLight ? 'border-[#E8DCCB] bg-[#FBF5EA]' : 'border-slate-800 bg-slate-950/40'
                  }`}>
                    <div className={`text-xs font-mono ${labelColor}`}>
                      Showing <strong className={primaryText}>{(spinCurrentPage - 1) * spinPageSize + 1}</strong> to{' '}
                      <strong className={primaryText}>{Math.min(spinCurrentPage * spinPageSize, filteredSpinEntries.length)}</strong> of{' '}
                      <strong className={primaryText}>{filteredSpinEntries.length}</strong> records
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSpinCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={spinCurrentPage <= 1}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isLight
                            ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:bg-[#F3E9DA]'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Previous</span>
                      </button>

                      <span className={`text-xs font-mono px-2 ${labelColor}`}>
                        Page <strong className={primaryText}>{spinCurrentPage}</strong> of{' '}
                        <strong className={primaryText}>{totalSpinPages}</strong>
                      </span>

                      <button
                        type="button"
                        onClick={() => setSpinCurrentPage((p) => Math.min(totalSpinPages, p + 1))}
                        disabled={spinCurrentPage >= totalSpinPages}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isLight
                            ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:bg-[#F3E9DA]'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Search & Filter Toolbar */}
          <div className={`${cardBg} border p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3`}>
            <div className="relative flex-1 max-w-md">
              <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-[#B36D4E]' : 'text-slate-400'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter records by player name or mobile number..."
                className={`w-full pl-10 pr-9 py-2 rounded-xl text-xs outline-none transition-colors ${
                  isLight
                    ? 'bg-[#FAF4E8] border border-[#D8C7AE] text-[#493426] placeholder-[#806B58] focus:border-[#B36D4E]'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-cyan-500/60'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer ${
                    isLight ? 'text-[#806B58] hover:text-[#493426]' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className={`text-xs flex items-center gap-2 font-mono self-start sm:self-auto ${labelColor}`}>
              <span>
                Records: <strong className={isLight ? 'text-[#76513D]' : 'text-cyan-300'}>{exportData.length}</strong> of {completedSessions.length} completed
              </span>
              {searchQuery && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isLight
                    ? 'bg-[#B36D4E]/15 text-[#8B452B] border-[#B36D4E]/30'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                }`}>
                  Filtered
                </span>
              )}
            </div>
          </div>

          {/* Reports Table Card (Strictly 6 Columns: Player Name, Mobile Number, Date, Time, Total Score, Photo) */}
          <div className={`${cardBg} border rounded-2xl overflow-hidden shadow-xl`}>
            <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${
              isLight ? 'bg-[#F3E9DA] border-[#D8C7AE]' : 'bg-slate-950/60 border-cyan-500/15'
            }`}>
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className={`w-5 h-5 ${isLight ? 'text-[#76513D]' : 'text-cyan-400'}`} />
                <h2 className={`text-sm font-bold tracking-wide ${primaryText}`}>
                  {searchQuery ? 'Filtered Player Reports' : 'Official Player Reports'}
                </h2>
              </div>
              <span className={`text-xs font-mono font-semibold ${labelColor}`}>
                {displayedTableRows.length} {displayedTableRows.length === 1 ? 'Record' : 'Records'}
              </span>
            </div>

            {isLoading ? (
              <div className={`p-8 text-center text-xs ${labelColor}`}>
                Loading report records...
              </div>
            ) : displayedTableRows.length === 0 ? (
              <div className={`p-8 text-center text-xs ${labelColor}`}>
                {searchQuery
                  ? `No completed records matching "${searchQuery}".`
                  : 'No completed session records available.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`border-b uppercase tracking-wider text-[10px] ${
                      isLight
                        ? 'border-[#D8C7AE] text-[#493426] bg-[#F3E9DA]'
                        : 'border-slate-800 text-slate-400 bg-slate-950/40'
                    }`}>
                      <th className="py-3.5 px-4 font-bold text-left">Player Name</th>
                      <th className="py-3.5 px-4 font-bold text-left">Mobile Number</th>
                      <th className="py-3.5 px-4 font-bold text-left">Date</th>
                      <th className="py-3.5 px-4 font-bold text-left">Time</th>
                      <th className="py-3.5 px-4 font-bold text-right">Total Score</th>
                      <th className="py-3.5 px-4 font-bold text-left">Won Voucher</th>
                      <th className="py-3.5 px-4 font-bold text-center w-24">Photo</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-[#E8DCCB]' : 'divide-slate-800/60'}`}>
                    {displayedTableRows.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`transition-colors ${isLight ? 'hover:bg-[#F5ECE0]' : 'hover:bg-slate-900/50'}`}
                      >
                        {/* 1. Player Name */}
                        <td className={`py-3.5 px-4 font-semibold ${primaryText}`}>
                          {entry.playerName}
                        </td>

                        {/* 2. Mobile Number */}
                        <td className={`py-3.5 px-4 font-mono ${primaryText}`}>
                          {entry.mobileNumber || '—'}
                        </td>

                        {/* 3. Date */}
                        <td className={`py-3.5 px-4 whitespace-nowrap ${primaryText}`}>
                          {entry.date}
                        </td>

                        {/* 4. Time */}
                        <td className={`py-3.5 px-4 font-mono whitespace-nowrap ${labelColor}`}>
                          {entry.time}
                        </td>

                        {/* 5. Total Score */}
                        <td className={`py-3.5 px-4 text-right font-mono font-bold text-sm ${
                          isLight ? 'text-[#76513D]' : 'text-cyan-300'
                        }`}>
                          {entry.totalScore.toLocaleString()}
                        </td>

                        {/* 6. Won Voucher */}
                        <td className="py-3.5 px-4">
                          {(() => {
                            const v = entry.voucherInfo;
                            if (v.status === 'WON') {
                              return (
                                <div className="flex flex-col gap-0.5 min-w-[120px]">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-sm w-fit ${
                                    isLight
                                      ? 'bg-[#B36D4E]/15 text-[#76513D] border-[#B36D4E]/30'
                                      : 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                                  }`}>
                                    <Gift className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>{v.voucherName}</span>
                                  </span>
                                  {v.couponCode && (
                                    <span className={`text-[10px] font-mono px-1 truncate max-w-[130px] ${labelColor}`} title={`Coupon: ${v.couponCode}`}>
                                      Code: <strong className="text-amber-400/90 font-mono">{v.couponCode}</strong>
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            if (v.status === 'NO_REWARD') {
                              return (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border w-fit ${
                                  isLight
                                    ? 'bg-[#E8DCCB]/60 text-[#806B58] border-[#D8C7AE]'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                  No Reward
                                </span>
                              );
                            }

                            return (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border w-fit ${
                                isLight
                                  ? 'bg-[#F3E9DA]/50 text-[#806B58] border-[#D8C7AE]/60'
                                  : 'bg-slate-900/60 text-slate-500 border-slate-800'
                              }`}>
                                Not Spun
                              </span>
                            );
                          })()}
                        </td>

                        {/* 7. Photo Thumbnail */}
                        <td className="py-2.5 px-4 text-center">
                          {entry.photoUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPhoto({ url: entry.photoUrl!, playerName: entry.playerName })
                              }
                              className={`group relative inline-block rounded-xl overflow-hidden border transition-all cursor-pointer shadow-sm hover:scale-105 ${
                                isLight
                                  ? 'border-[#D8C7AE] hover:border-[#B36D4E]'
                                  : 'border-slate-700/80 hover:border-cyan-400'
                              }`}
                              title={`Click to view full photo of ${entry.playerName}`}
                            >
                              <img
                                src={entry.photoUrl}
                                alt={entry.playerName}
                                className="w-12 h-12 object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Camera className="w-4 h-4 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className={`w-12 h-12 rounded-xl border border-dashed flex flex-col items-center justify-center text-[10px] mx-auto select-none ${
                              isLight
                                ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#806B58]'
                                : 'bg-slate-900/80 border-slate-800 text-slate-500'
                            }`}>
                              <Camera className="w-3.5 h-3.5 mb-0.5 opacity-40" />
                              <span>No Photo</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Lightbox Modal for Photo Thumbnail Preview */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className={`rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl relative space-y-3 border ${
              isLight
                ? 'bg-[#FBF5EA] border-[#D8C7AE]'
                : 'bg-[#0F1B2E] border-cyan-500/40'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${
              isLight ? 'border-[#D8C7AE]' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Camera className={`w-4 h-4 ${isLight ? 'text-[#B36D4E]' : 'text-cyan-400'}`} />
                <h3 className={`font-bold text-sm ${primaryText}`}>
                  {selectedPhoto.playerName} — Souvenir Photo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isLight
                    ? 'text-[#806B58] hover:text-[#493426] hover:bg-[#F3E9DA]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`rounded-xl overflow-hidden flex items-center justify-center max-h-[70vh] ${
              isLight ? 'bg-[#FAF4E8]' : 'bg-black'
            }`}>
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.playerName}
                className="w-full h-auto max-h-[70vh] object-contain rounded-xl"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer transition-colors border ${
                  isLight
                    ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426] hover:bg-[#F3E9DA]'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
