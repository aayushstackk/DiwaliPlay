/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetCategory, StorageProviderType } from '../../../src/types/backend';

export type { StorageProviderType };

export interface StoredObjectResult {
  key: string;
  size: number;
}

export interface ReadObjectResult {
  data: Buffer;
  mimeType: string;
}

export interface AssetStorageProvider {
  /**
   * Returns provider identifier ('local', 'gcs', 's3', 'gridfs').
   */
  getType(): StorageProviderType;

  /**
   * Indicates whether this provider has all required production configuration.
   */
  isConfigured(): boolean;

  /**
   * Diagnostic summary or help text for this provider configuration.
   */
  getStatusDetails(): {
    provider: StorageProviderType;
    configured: boolean;
    locationInfo: string;
    isProductionReady: boolean;
  };

  /**
   * Persists a binary buffer to object storage.
   */
  saveObject(key: string, data: Buffer, mimeType: string): Promise<StoredObjectResult>;

  /**
   * Reads a binary buffer from object storage.
   */
  readObject(key: string): Promise<ReadObjectResult>;

  /**
   * Deletes a binary object from storage.
   */
  deleteObject(key: string): Promise<boolean>;

  /**
   * Generates public or proxy content URL.
   */
  getServingUrl(assetId: string, key: string): string;
}

export interface CategoryValidationRules {
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxSizeBytes: number;
  /** Optional per-MIME caps that tighten maxSizeBytes for specific types. */
  maxSizeBytesByMime?: Record<string, number>;
  readableLimit: string;
}
