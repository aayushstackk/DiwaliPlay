/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetCategory } from '../../../src/types/backend';

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
   * Returns provider identifier ('local' or 'gcs').
   */
  getType(): 'local' | 'gcs';

  /**
   * Indicates whether this provider has all required production configuration.
   */
  isConfigured(): boolean;

  /**
   * Diagnostic summary or help text for this provider configuration.
   */
  getStatusDetails(): {
    provider: 'local' | 'gcs';
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
  readableLimit: string;
}
