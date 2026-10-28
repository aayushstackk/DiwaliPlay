/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { AdminOverviewStats, GameSession, User } from '../../types/backend';
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
  X
} from 'lucide-react';

interface ReportsSectionProps {
  stats: AdminOverviewStats | null;
  sessions: GameSession[];
  users: User[];
  isLoading: boolean;
}

// Helper to safely escape CSV values according to RFC 4180
function escapeCsvValue(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

// Helper to trigger browser download for text/blob content
function downloadBlob(content: string, mimeType: string, filename: string) {
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
function getExportFilename(format: 'csv' | 'json' | 'pdf'): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `diwaliplay-report-${year}-${month}-${day}.${format}`;
}

export const ReportsSection: React.FC<ReportsSectionProps> = ({
  stats,
  sessions,
  users,
  isLoading
}) => {
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'csv' | 'json' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Map users for fast lookup
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      if (u.id) map.set(u.id, u.name);
    });
    return map;
  }, [users]);

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

  // Real session export list sorted by score descending, reflecting active search filter
  const exportData = useMemo(() => {
    let list = [...completedSessions].sort((a, b) => (b.score || 0) - (a.score || 0));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const playerName = userMap.get(s.userId) || 'Player';
        return (
          playerName.toLowerCase().includes(q) ||
          (s.id && s.id.toLowerCase().includes(q)) ||
          (s.userId && s.userId.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [completedSessions, searchQuery, userMap]);

  // Handle Export PDF (Unchanged high-res printable commemorative document)
  const handleExportPDF = () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('pdf');

    try {
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

          return `
            <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
              <td style="padding: 10px 12px; text-align: center; font-weight: bold; font-family: monospace; color: #0284c7;">#${idx + 1}</td>
              <td style="padding: 10px 12px; text-align: center;">${photoHtml}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #0f172a;">${playerName}</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; font-family: monospace; color: #0369a1; font-size: 14px;">${s.score.toLocaleString()}</td>
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
                <th style="text-align: right;">Crackers Burst</th>
                <th style="text-align: right;">Date</th>
                <th style="text-align: right;">Time</th>
              </tr>
            </thead>
            <tbody>
              ${
                sessionRowsHtml ||
                `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #64748b;">No completed sessions available.</td></tr>`
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

  // Handle Export CSV
  const handleExportCSV = () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('csv');

    try {
      if (exportData.length === 0) {
        setExportError('No completed session records available to export.');
        setExportingFormat(null);
        return;
      }

      const headers = [
        'Rank',
        'Player Name',
        'Score',
        'Crackers Burst',
        'Combos',
        'Target Score',
        'Target Achieved',
        'Date',
        'Time',
        'Timestamp',
        'Session ID',
        'Photo URL'
      ];

      const csvRows = [headers.map(escapeCsvValue).join(',')];

      exportData.forEach((s, idx) => {
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

        const targetAchievedStr =
          typeof s.targetAchieved === 'boolean'
            ? s.targetAchieved
              ? 'Yes'
              : 'No'
            : '';

        const row = [
          idx + 1,
          playerName,
          s.score ?? 0,
          s.crackerCount ?? 0,
          s.combosCount ?? s.comboCount ?? 0,
          s.targetScore ?? '',
          targetAchievedStr,
          dateStr,
          timeStr,
          s.startTime || startDate.toISOString(),
          s.id || '',
          s.photoUrl || ''
        ];

        csvRows.push(row.map(escapeCsvValue).join(','));
      });

      // Prepend UTF-8 BOM so Microsoft Excel cleanly renders characters and accents
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

  // Handle Export JSON
  const handleExportJSON = () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('json');

    try {
      if (exportData.length === 0) {
        setExportError('No completed session records available to export.');
        setExportingFormat(null);
        return;
      }

      const generatedAt = new Date().toISOString();
      const records = exportData.map((s, idx) => {
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

        return {
          rank: idx + 1,
          sessionId: s.id || '',
          playerName,
          score: s.score ?? 0,
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

  // Table rows: show search matches when searching, otherwise leaderboard top 10
  const displayedTableRows = useMemo(() => {
    if (!searchQuery.trim()) {
      return (stats?.leaderboard || []).map((e) => ({
        rank: e.rank,
        playerName: e.userName,
        score: e.score,
        crackerCount: e.crackerCount,
        completedAt: e.completedAt,
        sessionId: e.sessionId,
      }));
    }
    return exportData.map((s, idx) => ({
      rank: idx + 1,
      playerName: userMap.get(s.userId) || 'Player',
      score: s.score,
      crackerCount: s.crackerCount || 0,
      completedAt: s.endTime || s.startTime || new Date().toISOString(),
      sessionId: s.id,
    }));
  }, [stats?.leaderboard, searchQuery, exportData, userMap]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Export Action Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm mb-1 text-slate-100">
              Live Session Telemetry & Reports Export
            </h3>
            <p className="text-cyan-300/80 leading-relaxed max-w-2xl">
              Export official gameplay audit reports in PDF, CSV, and JSON formats. Includes player names, verified scores, cracker bursts, dates, times, and souvenir photos.
            </p>
          </div>
        </div>

        {/* 3 Download Action Buttons: PDF, CSV, JSON */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-auto">
          {/* Download PDF */}
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={exportingFormat !== null || isLoading}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all cursor-pointer disabled:opacity-50"
            title="Download formatted printable PDF report"
          >
            {exportingFormat === 'pdf' ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>{exportingFormat === 'pdf' ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>

          {/* Download CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={exportingFormat !== null || isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 hover:text-emerald-200 text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="Download CSV spreadsheet data"
          >
            {exportingFormat === 'csv' ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            )}
            <span>Download CSV</span>
          </button>

          {/* Download JSON */}
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={exportingFormat !== null || isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-amber-200 text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="Download structured JSON report data"
          >
            {exportingFormat === 'json' ? (
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileJson className="w-4 h-4 text-amber-400" />
            )}
            <span>Download JSON</span>
          </button>
        </div>
      </div>

      {/* Success Status Banner */}
      {exportSuccess && (
        <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportSuccess(null)}
            className="text-emerald-400 hover:text-white p-1 rounded cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Status Banner */}
      {exportError && (
        <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{exportError}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-rose-400 hover:text-white p-1 rounded cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F1B2E]/90 border border-slate-800 p-3 sm:p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter records by player name or session ID..."
            className="w-full pl-10 pr-9 py-2 bg-slate-950/80 border border-slate-800 focus:border-cyan-500/60 rounded-xl text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2 font-mono self-start sm:self-auto">
          <span>
            Records: <strong className="text-cyan-300">{exportData.length}</strong> of {completedSessions.length} completed
          </span>
          {searchQuery && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              Filtered
            </span>
          )}
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-cyan-500/30 transition-colors rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium block mb-1">
            Overall Completion Rate
          </span>
          <div className="text-2xl font-black text-cyan-200 font-mono">
            {completionRate}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {completedSessions.length} completed vs {abandonedSessions.length} abandoned
          </div>
        </div>

        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-cyan-500/30 transition-colors rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium block mb-1">
            Total Mobile Registrations
          </span>
          <div className="text-2xl font-black text-slate-100 font-mono">
            {users.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {users.filter((u) => u.hasPlayed).length} participants played
          </div>
        </div>

        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-rose-500/30 transition-colors rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium block mb-1">
            Avg Crackers per Round
          </span>
          <div className="text-2xl font-black text-rose-300 font-mono">
            {avgCrackers}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Total burst count: {totalCrackers.toLocaleString()}
          </div>
        </div>

        <div className="bg-[#0F1B2E]/90 border border-slate-800 hover:border-amber-500/30 transition-colors rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium block mb-1">
            Top All-Time Score
          </span>
          <div className="text-2xl font-black text-amber-300 font-mono">
            {stats?.highestScore || 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Average: {stats?.averageScore || 0} pts
          </div>
        </div>
      </div>

      {/* Leaderboard Table Card (NO Max Velocity) */}
      <div className="bg-[#0F1B2E]/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-cyan-500/15 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100 tracking-wide">
              {searchQuery ? 'Filtered Leaderboard Results' : 'Official Leaderboard Rankings'}
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {searchQuery ? `${displayedTableRows.length} Matches` : 'Top 10 Performers'}
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Loading leaderboard data...
          </div>
        ) : displayedTableRows.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            {searchQuery
              ? `No completed matches matching "${searchQuery}".`
              : 'No completed matches available for ranking.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-semibold text-center w-16">Rank</th>
                  <th className="py-3 px-4 font-semibold">Player Name</th>
                  <th className="py-3 px-4 font-semibold text-right">Score</th>
                  <th className="py-3 px-4 font-semibold text-right">Crackers Burst</th>
                  <th className="py-3 px-4 font-semibold text-right">Date</th>
                  <th className="py-3 px-4 font-semibold text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayedTableRows.map((entry) => {
                  const entryDate = new Date(entry.completedAt);
                  return (
                    <tr key={entry.sessionId || entry.rank} className="hover:bg-slate-900/50">
                      <td className="py-3 px-4 text-center font-mono font-bold text-cyan-400">
                        #{entry.rank}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-100">
                        {entry.playerName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-cyan-200">
                        {entry.score.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {entry.crackerCount}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
                        {entryDate.toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono">
                        {entryDate.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
