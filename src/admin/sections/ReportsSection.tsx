/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import ExcelJS from 'exceljs';
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
import { useAdminTheme } from '../AdminThemeContext';

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
  isLoading
}) => {
  const { isLight } = useAdminTheme();
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'csv' | 'json' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; playerName: string } | null>(null);

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
        const user = userObjMap.get(s.userId);
        const playerName = user?.name || userMap.get(s.userId) || (s as any).userName || 'Player';
        const mobileNumber = user?.mobileNumber || (s as any).mobileNumber || '';
        return (
          playerName.toLowerCase().includes(q) ||
          mobileNumber.toLowerCase().includes(q) ||
          (s.id && s.id.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [completedSessions, searchQuery, userMap, userObjMap]);

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

  // Handle Export CSV (Strict 6 columns in exact order, RFC 4180 with UTF-8 BOM)
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

      // Exactly these 6 columns in this exact order:
      // 1. Player Name
      // 2. Mobile Number
      // 3. Date
      // 4. Time
      // 5. Total Score
      // 6. Photo
      const headers = [
        'Player Name',
        'Mobile Number',
        'Date',
        'Time',
        'Total Score',
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

        const row = [
          playerName,
          mobileNumber,
          dateStr,
          timeStr,
          s.score ?? 0,
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

  // Handle Export Excel (.xlsx) with actual embedded player photos in cells
  const handleExportExcel = async () => {
    setExportError(null);
    setExportSuccess(null);
    setExportingFormat('xlsx');

    try {
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

      // Exactly the same 6 columns:
      // Player Name, Mobile Number, Date, Time, Total Score, Photo
      worksheet.columns = [
        { header: 'Player Name', key: 'playerName', width: 24 },
        { header: 'Mobile Number', key: 'mobileNumber', width: 18 },
        { header: 'Date', key: 'playedDate', width: 16 },
        { header: 'Time', key: 'playedTime', width: 14 },
        { header: 'Total Score', key: 'totalScore', width: 16 },
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

        const row = worksheet.addRow({
          playerName,
          mobileNumber: mobileNumber || '',
          playedDate,
          playedTime,
          totalScore,
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

              // Approximate dimensions of cell F{rowIndex} in px (col width 26 ≈ 195px, row height 80pt ≈ 106px)
              const colWidthPx = 195;
              const rowHeightPx = 106;
              const colOffset = Math.max(0, (colWidthPx - dispWidth) / (2 * colWidthPx));
              const rowOffset = Math.max(0, (rowHeightPx - dispHeight) / (2 * rowHeightPx));

              worksheet.addImage(imageId, {
                tl: { col: 5 + colOffset, row: (rowIndex - 1) + rowOffset },
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

        return {
          rank: idx + 1,
          sessionId: s.id || '',
          playerName,
          mobileNumber: mobileNumber || null,
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

  // Exactly 6 columns mapped for the Reports Table:
  // 1. Player Name, 2. Mobile Number, 3. Date, 4. Time, 5. Total Score, 6. Photo
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

      return {
        id: s.id,
        playerName,
        mobileNumber,
        date: dateStr,
        time: timeStr,
        totalScore: s.score ?? 0,
        photoUrl: s.photoUrl || null
      };
    });
  }, [exportData, userMap, userObjMap]);

  // Theme-aware styles
  const cardBg = isLight
    ? 'bg-[#FBF5EA] border-[#D8C7AE] shadow-[0_2px_8px_rgba(73,52,38,0.05)]'
    : 'bg-[#0F1B2E]/90 border-slate-800 shadow-sm';
  const labelColor = isLight ? 'text-[#806B58]' : 'text-slate-400';
  const primaryText = isLight ? 'text-[#493426]' : 'text-slate-100';

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Export Action Banner */}
      <div className={`p-4 sm:p-5 rounded-2xl border text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm ${
        isLight
          ? 'bg-[#FAF4E8] border-[#D8C7AE] text-[#493426]'
          : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
      }`}>
        <div className="flex items-start gap-3">
          <Info className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-[#76513D]' : 'text-cyan-400'}`} />
          <div>
            <h3 className={`font-bold text-sm mb-1 ${primaryText}`}>
              Official Session Reports & Export Center
            </h3>
            <p className={`leading-relaxed max-w-2xl ${labelColor}`}>
              Export verified player records in CSV, Excel (.xlsx), PDF, and JSON formats. Formatted with 6 exact audit columns: Player Name, Mobile Number, Date, Time, Total Score, and Souvenir Photo.
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

                    {/* 6. Photo Thumbnail */}
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
