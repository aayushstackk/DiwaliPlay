/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetStorageProvider } from './types';
import { LocalStorageProvider } from './localProvider';
import { GCSStorageProvider } from './gcsProvider';

let activeAssetProvider: AssetStorageProvider | null = null;

/**
 * Initializes and resolves the durable asset storage provider based on environment configuration.
 */
export function getAssetStorageProvider(): AssetStorageProvider {
  if (activeAssetProvider) {
    return activeAssetProvider;
  }

  const gcsBucket = process.env.GCS_BUCKET_NAME;

  if (gcsBucket) {
    console.log(`[Asset Storage] Initializing Google Cloud Storage provider with bucket: "gs://${gcsBucket}"`);
    activeAssetProvider = new GCSStorageProvider(gcsBucket);
  } else {
    const isCloudRun = Boolean(process.env.K_SERVICE || process.env.K_CONFIGURATION);
    if (isCloudRun) {
      console.warn(
        '[Asset Storage] ⚠️ WARNING: Running on Google Cloud Run without GCS_BUCKET_NAME configured. ' +
        'Files saved to local storage are ephemeral and will reset when containers scale or restart. ' +
        'Set GCS_BUCKET_NAME in your environment variables for durable cloud storage.'
      );
    } else {
      console.log('[Asset Storage] Initializing Local filesystem storage provider for development.');
    }
    activeAssetProvider = new LocalStorageProvider();
  }

  return activeAssetProvider;
}

/**
 * For testing and test runner injection.
 */
export function setAssetStorageProvider(provider: AssetStorageProvider | null): void {
  activeAssetProvider = provider;
}

export * from './types';
export * from './validation';
export * from './localProvider';
export * from './gcsProvider';
