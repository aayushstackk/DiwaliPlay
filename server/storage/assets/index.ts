/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { AssetStorageProvider, StorageProviderType } from './types';
import { LocalStorageProvider, LOCAL_UPLOADS_DIR } from './localProvider';
import { GCSStorageProvider } from './gcsProvider';
import { S3StorageProvider } from './s3Provider';
import { GridFSStorageProvider } from './gridfsProvider';
import { getStorage } from '../index';

let activeAssetProvider: AssetStorageProvider | null = null;
const providerRegistry: Partial<Record<StorageProviderType, AssetStorageProvider>> = {};

/**
 * Gets a cached or new instance of a storage provider by its type.
 */
export function getStorageProviderByType(type: StorageProviderType): AssetStorageProvider {
  if (providerRegistry[type]) {
    return providerRegistry[type]!;
  }

  let provider: AssetStorageProvider;
  switch (type) {
    case 's3':
      provider = new S3StorageProvider();
      break;
    case 'gcs':
      provider = new GCSStorageProvider();
      break;
    case 'gridfs':
      provider = new GridFSStorageProvider();
      break;
    case 'local':
    default:
      provider = new LocalStorageProvider();
      break;
  }

  providerRegistry[type] = provider;
  return provider;
}

/**
 * Initializes and resolves the durable asset storage provider based on environment configuration.
 *
 * Provider Resolution Precedence:
 * 1. S3-compatible cloud storage (AWS S3, Cloudflare R2, MinIO, Backblaze) if S3_BUCKET_NAME is present.
 * 2. Google Cloud Storage (GCS) if GCS_BUCKET_NAME is present.
 * 3. MongoDB GridFS if MONGODB_URI is configured or active database is MongoDB.
 * 4. Local filesystem fallback for local offline development.
 */
export function getAssetStorageProvider(): AssetStorageProvider {
  if (activeAssetProvider) {
    return activeAssetProvider;
  }

  // 1. Check for S3-compatible cloud storage
  const s3Bucket = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.R2_BUCKET_NAME;
  const s3AccessKey = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  if (s3Bucket && s3AccessKey) {
    console.log(`[Asset Storage] Initializing S3-compatible object storage provider with bucket: "${s3Bucket}"`);
    activeAssetProvider = getStorageProviderByType('s3');
    return activeAssetProvider;
  }

  // 2. Check for Google Cloud Storage
  const gcsBucket = process.env.GCS_BUCKET_NAME;
  if (gcsBucket) {
    console.log(`[Asset Storage] Initializing Google Cloud Storage provider with bucket: "gs://${gcsBucket}"`);
    activeAssetProvider = getStorageProviderByType('gcs');
    return activeAssetProvider;
  }

  // 3. Check for MongoDB GridFS (durable cloud persistence for Render)
  const hasMongoUri = Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim());
  let isMongoActive = false;
  try {
    const mainStorage = getStorage();
    isMongoActive = mainStorage?.getType() === 'mongodb';
  } catch {
    // getStorage might not be initialized yet, but MONGODB_URI is present
    isMongoActive = hasMongoUri;
  }

  if (hasMongoUri || isMongoActive) {
    console.log('[Asset Storage] Initializing MongoDB GridFS durable storage provider (Persistent on Render).');
    activeAssetProvider = getStorageProviderByType('gridfs');
    return activeAssetProvider;
  }

  // 4. Local filesystem fallback (Offline development)
  const isCloudHost = Boolean(
    process.env.RENDER ||
    process.env.K_SERVICE ||
    process.env.VERCEL ||
    process.env.HEROKU
  );

  if (isCloudHost) {
    console.warn(
      '[Asset Storage] ⚠️ WARNING: Running on cloud container host without cloud storage or MongoDB configured. ' +
      'Files saved to local storage are ephemeral and will reset when containers scale or restart. ' +
      'Ensure MONGODB_URI or S3_BUCKET_NAME is set for durable persistent storage.'
    );
  } else {
    console.log('[Asset Storage] Initializing Local filesystem storage provider for offline development.');
  }

  activeAssetProvider = getStorageProviderByType('local');
  return activeAssetProvider;
}

/**
 * Injects or overrides the active storage provider (useful for testing).
 */
export function setAssetStorageProvider(provider: AssetStorageProvider | null): void {
  activeAssetProvider = provider;
}

/**
 * Scans for any assets that were saved to ephemeral local storage and safely
 * migrates their binaries to the persistent storage provider (GridFS or S3).
 */
export async function migrateLocalAssetsToPersistentStorage(): Promise<{
  migratedCount: number;
  skippedCount: number;
}> {
  const provider = getAssetStorageProvider();
  if (provider.getType() === 'local') {
    return { migratedCount: 0, skippedCount: 0 };
  }

  let migratedCount = 0;
  let skippedCount = 0;

  try {
    const mainStorage = getStorage();
    if (!mainStorage || typeof mainStorage.listAssets !== 'function') {
      return { migratedCount: 0, skippedCount: 0 };
    }

    const assets = await mainStorage.listAssets();
    for (const asset of assets) {
      // Only migrate assets marked as 'local' or whose binary is not yet in persistent storage
      if (asset.storageProvider === 'local') {
        const fullLocalPath = path.resolve(LOCAL_UPLOADS_DIR, asset.objectKey);
        if (fs.existsSync(fullLocalPath)) {
          try {
            const fileData = await fs.promises.readFile(fullLocalPath);
            await provider.saveObject(asset.objectKey, fileData, asset.mimeType);
            const newUrl = provider.getServingUrl(asset.id, asset.objectKey);

            await mainStorage.updateAsset(asset.id, {
              storageProvider: provider.getType(),
              url: newUrl
            });

            migratedCount++;
            console.log(
              `[Asset Storage] Migrated local asset "${asset.displayName || asset.id}" (${asset.objectKey}) to ${provider.getType()} persistent storage.`
            );
          } catch (migErr: any) {
            console.warn(
              `[Asset Storage] Failed to migrate local asset ${asset.id}:`,
              migErr?.message || migErr
            );
          }
        } else {
          skippedCount++;
        }
      }
    }
  } catch (err: any) {
    console.warn('[Asset Storage] Asset migration notice:', err?.message || err);
  }

  return { migratedCount, skippedCount };
}

export * from './types';
export * from './validation';
export * from './localProvider';
export * from './gcsProvider';
export * from './s3Provider';
export * from './gridfsProvider';
