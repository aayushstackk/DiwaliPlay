/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { Readable, pipeline } from 'stream';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { db } from '../storage';
import { authenticateAdmin, requireRole } from '../auth/middleware';
import {
  getAssetStorageProvider,
  getStorageProviderByType,
  validateUploadedFile,
  generateSafeObjectKey,
  CATEGORY_RULES,
  AssetStorageProvider,
  ReadObjectResult,
  ReadStreamResult,
  StorageProviderType
} from '../storage/assets';
import { AssetCategory, AssetRecord } from '../../src/types/backend';

export const assetsRouter = Router();

// Configure multer with in-memory storage for stream/buffer inspection & magic bytes sniffing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024 // 40 MB hard ceiling (start background video); per-type caps enforced in validation
  }
});

// Runs multer and turns an over-limit upload into a clear 413 instead of a generic 500.
function uploadSingleFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: any) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: 'File is too large. The maximum is 40 MB (15 MB for images).'
      });
    }
    if (err) return next(err);
    next();
  });
}

// ============================================================================
// Public Safe Asset Content Delivery Helpers
// ============================================================================

// An object key never changes content, so these identify it without reading anything.
const assetEtag = (asset: AssetRecord) => `"${asset.id}-${asset.fileSize}"`;

function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((value) => {
    const candidate = value.trim();
    return candidate === '*' || candidate === etag || candidate === `W/${etag}`;
  });
}

function setDeliveryHeaders(res: Response, etag: string) {
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
}

/** Resolves on the first data or the end, rejects on a read error, so that failure can still be a JSON 404. */
function firstReadable(stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReadable = () => {
      stream.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      stream.off('readable', onReadable);
      reject(err);
    };
    stream.once('readable', onReadable);
    stream.once('error', onError);
  });
}

async function openFrom(provider: AssetStorageProvider, key: string): Promise<ReadStreamResult | ReadObjectResult> {
  if (!provider.openReadStream) return provider.readObject(key);
  const opened = await provider.openReadStream(key);
  try {
    await firstReadable(opened.stream);
    // GridFS ends quietly when a file record has lost its chunks.
    if (opened.size > 0 && opened.stream.readableLength === 0) {
      throw new Error(`No data for object "${key}"`);
    }
    return opened;
  } catch (err) {
    opened.stream.destroy();
    throw err;
  }
}

/** Resilient binary retrieval across providers; null when none has the object. */
async function openAssetObject(asset: AssetRecord): Promise<ReadStreamResult | ReadObjectResult | null> {
  // 1. Try designated provider
  const designatedProvider = asset.storageProvider ? getStorageProviderByType(asset.storageProvider) : null;
  if (designatedProvider) {
    try {
      return await openFrom(designatedProvider, asset.objectKey);
    } catch {
      // Fall through to fallback providers
    }
  }

  // 2. Try currently active provider
  const activeProvider = getAssetStorageProvider();
  if (activeProvider !== designatedProvider) {
    try {
      return await openFrom(activeProvider, asset.objectKey);
    } catch {
      // Fall through
    }
  }

  // 3. Fallback across all configured storage providers
  const candidateProviders: StorageProviderType[] = ['gridfs', 's3', 'gcs', 'local'];
  for (const provType of candidateProviders) {
    if (provType !== asset.storageProvider) {
      try {
        const provider = getStorageProviderByType(provType);
        if (provider.isConfigured()) {
          return await openFrom(provider, asset.objectKey);
        }
      } catch {
        // Continue search
      }
    }
  }

  return null;
}

// ============================================================================
// Public Safe Asset Content Delivery Endpoint
// ============================================================================
assetsRouter.get('/assets/:id/content', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const asset = await db.getAssetById(id);

    if (!asset || !asset.isActive) {
      return res.status(404).json({
        success: false,
        error: 'ASSET_NOT_FOUND',
        message: 'The requested media asset was not found or is deactivated.'
      });
    }

    // If asset has a direct public cloud URL (e.g. S3 / CDN prefix), redirect directly
    if (asset.url && (asset.url.startsWith('http://') || asset.url.startsWith('https://'))) {
      return res.redirect(302, asset.url);
    }

    // Answered from metadata alone: a revalidation must not cost a read.
    const etag = assetEtag(asset);
    if (matchesEtag(req.headers['if-none-match'], etag)) {
      setDeliveryHeaders(res, etag);
      return res.status(304).end();
    }

    const source = await openAssetObject(asset);

    if (!source) {
      console.warn(
        `[Asset Delivery] Asset binary missing from storage: "${asset.id}" (key: "${asset.objectKey}", provider: "${asset.storageProvider}")`
      );
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(404).json({
        success: false,
        error: 'STORAGE_OBJECT_NOT_FOUND',
        message: 'The requested media asset binary was not found in storage.'
      });
    }

    // Strict security headers for content delivery
    res.setHeader('Content-Type', asset.mimeType || source.mimeType || 'application/octet-stream');
    setDeliveryHeaders(res, etag);

    if ('data' in source) {
      res.setHeader('Content-Length', source.data.length);
      return res.status(200).send(source.data);
    }

    res.setHeader('Content-Length', source.size);
    res.status(200);
    if (req.method === 'HEAD') {
      source.stream.destroy();
      return res.end();
    }

    // Holds backpressure, and a client that disconnects destroys the read stream. A read that fails from here on
    // cuts the response short of its Content-Length, which clients treat as a failed download.
    pipeline(source.stream, res, (err) => {
      if (err && (err as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        console.warn(`[Asset Delivery] Stream failed for asset ${asset.id}:`, err.message);
      }
    });
    return;
  } catch (err: any) {
    console.error(`[Asset Delivery] Error serving asset ${req.params.id}:`, err.message);
    if (res.headersSent) return res.destroy();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(404).json({
      success: false,
      error: 'READ_ERROR',
      message: 'Failed to retrieve asset from storage.'
    });
  }
});

// ============================================================================
// Protected Admin Asset Management Endpoints
// ============================================================================

/**
 * List assets with pagination and category filtering.
 */
assetsRouter.get('/admin/assets', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const category = req.query.category as AssetCategory | undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));

    const provider = getAssetStorageProvider();
    const status = provider.getStatusDetails();

    const allAssets = await db.listAssets(category ? { category } : undefined);
    const total = allAssets.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = allAssets.slice(startIndex, startIndex + pageSize);

    return res.json({
      success: true,
      assets: paginated,
      total,
      page,
      pageSize,
      storageProvider: status.provider,
      isProductionReady: status.isProductionReady,
      setupHelp: status.isProductionReady
        ? undefined
        : 'Persistent cloud storage not detected. Files are stored locally. Configure S3_BUCKET_NAME or MONGODB_URI for durable storage on Render.'
    });
  } catch (err: any) {
    console.error('[Admin Assets] List error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Upload a binary asset.
 */
assetsRouter.post(
  '/admin/assets/upload',
  authenticateAdmin,
  requireRole(['superadmin', 'operator']),
  uploadSingleFile,
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const category = req.body.category as AssetCategory;
      const displayName = (req.body.displayName || '').trim();
      const order = req.body.order !== undefined ? Number(req.body.order) : undefined;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_FILE',
          message: 'No file was uploaded. Please attach a file under the "file" form field.'
        });
      }

      if (!category || !CATEGORY_RULES[category]) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY',
          message: `Category must be one of: ${Object.keys(CATEGORY_RULES).join(', ')}.`
        });
      }

      // Security validation: size bounds, extensions, MIME type whitelist, and magic numbers signature
      const validation = validateUploadedFile(file, category);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'FILE_VALIDATION_FAILED',
          message: validation.error
        });
      }

      const provider = getAssetStorageProvider();
      const safeKey = generateSafeObjectKey(category, validation.sanitizedExt!);

      // Save binary to storage provider
      const stored = await provider.saveObject(safeKey, file.buffer, validation.normalizedMime!);

      // Save metadata to database
      const uploader = req.adminUser!;
      const createdRecord = await db.createAsset({
        category,
        originalFilename: path.basename(file.originalname).slice(0, 150),
        objectKey: safeKey,
        mimeType: validation.normalizedMime!,
        fileSize: stored.size,
        uploaderId: uploader.id,
        uploaderUsername: uploader.username,
        isActive: true,
        displayName: displayName || path.basename(file.originalname),
        order: !isNaN(Number(order)) ? Number(order) : undefined,
        url: '', // Assigned below with id
        storageProvider: provider.getType()
      });

      // Update URL with generated asset id
      const finalUrl = provider.getServingUrl(createdRecord.id, safeKey);
      const finalized = (await db.updateAsset(createdRecord.id, { url: finalUrl })) || createdRecord;

      // Audit log
      await db.recordAuditLog({
        adminId: uploader.id,
        username: uploader.username,
        action: 'ASSET_UPLOAD',
        target: finalized.id,
        details: {
          category,
          filename: finalized.originalFilename,
          size: finalized.fileSize,
          mimeType: finalized.mimeType
        },
        ip: req.ip
      });

      return res.status(201).json({
        success: true,
        asset: finalized,
        message: 'Asset uploaded and verified successfully.'
      });
    } catch (err: any) {
      console.error('[Admin Assets] Upload error:', err);
      return res.status(500).json({
        success: false,
        error: 'UPLOAD_FAILED',
        message: err.message || 'Failed to upload and persist asset.'
      });
    }
  }
);

/**
 * Get asset metadata by ID.
 */
assetsRouter.get('/admin/assets/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const asset = await db.getAssetById(req.params.id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Asset not found.'
      });
    }

    return res.json({
      success: true,
      asset
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Update asset metadata (display name, order, active status).
 */
assetsRouter.patch(
  '/admin/assets/:id',
  authenticateAdmin,
  requireRole(['superadmin', 'operator']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { displayName, order, isActive } = req.body;

      const existing = await db.getAssetById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Asset not found.'
        });
      }

      const updates: Partial<AssetRecord> = {};
      if (displayName !== undefined) updates.displayName = String(displayName).trim().slice(0, 150);
      if (order !== undefined) updates.order = Number(order);
      if (isActive !== undefined) updates.isActive = Boolean(isActive);

      const updated = await db.updateAsset(id, updates);

      await db.recordAuditLog({
        adminId: req.adminUser!.id,
        username: req.adminUser!.username,
        action: 'ASSET_UPDATE',
        target: id,
        details: updates,
        ip: req.ip
      });

      return res.json({
        success: true,
        asset: updated
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

/**
 * Delete an asset safely with in-use protection.
 */
assetsRouter.delete(
  '/admin/assets/:id',
  authenticateAdmin,
  requireRole(['superadmin', 'operator']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const asset = await db.getAssetById(id);

      if (!asset) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Asset not found.'
        });
      }

      // In-Use Protection Check
      const settings = await db.getSettings();
      const isUsedAsLogo =
        settings.brandLogoUrl &&
        (settings.brandLogoUrl === asset.url || settings.brandLogoUrl.includes(asset.id));
      const isUsedAsWallpaper =
        settings.wallpaperUrl &&
        (settings.wallpaperUrl === asset.url || settings.wallpaperUrl.includes(asset.id));

      const isUsedAsStartBackground =
        settings.startBackgroundUrl &&
        (settings.startBackgroundUrl === asset.url || settings.startBackgroundUrl.includes(asset.id));

      if (isUsedAsLogo || isUsedAsWallpaper || isUsedAsStartBackground) {
        return res.status(409).json({
          success: false,
          error: 'ASSET_IN_USE',
          message: `Cannot delete asset "${asset.displayName || asset.id}" because it is currently assigned as the active ${
            isUsedAsLogo ? 'Brand Logo' : isUsedAsWallpaper ? 'Wallpaper' : 'Start Screen Background'
          }. Please reassign or clear it in Branding / Settings first.`
        });
      }

      // Delete binary from object storage via designated provider or active fallback
      try {
        const specificProvider = asset.storageProvider ? getStorageProviderByType(asset.storageProvider) : null;
        if (specificProvider && specificProvider.isConfigured()) {
          await specificProvider.deleteObject(asset.objectKey);
        } else {
          const provider = getAssetStorageProvider();
          await provider.deleteObject(asset.objectKey);
        }
      } catch (storageErr) {
        console.warn(`[Asset Storage] Failed to delete object binary ${asset.objectKey}:`, storageErr);
      }

      // Delete metadata from database
      await db.deleteAsset(id);

      // Audit log
      await db.recordAuditLog({
        adminId: req.adminUser!.id,
        username: req.adminUser!.username,
        action: 'ASSET_DELETE',
        target: id,
        details: {
          category: asset.category,
          objectKey: asset.objectKey,
          filename: asset.originalFilename
        },
        ip: req.ip
      });

      return res.json({
        success: true,
        message: `Asset "${asset.displayName || asset.id}" deleted successfully.`
      });
    } catch (err: any) {
      console.error('[Admin Assets] Delete error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);
