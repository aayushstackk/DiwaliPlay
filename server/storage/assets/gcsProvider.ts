/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage, Bucket } from '@google-cloud/storage';
import { AssetStorageProvider, StoredObjectResult, ReadObjectResult } from './types';

export class GCSStorageProvider implements AssetStorageProvider {
  private storage: Storage | null = null;
  private bucket: Bucket | null = null;
  private bucketName: string;

  constructor(bucketName?: string) {
    this.bucketName = bucketName || process.env.GCS_BUCKET_NAME || '';
    if (this.bucketName) {
      try {
        this.storage = new Storage();
        this.bucket = this.storage.bucket(this.bucketName);
      } catch (err) {
        console.warn('[GCS Storage] Failed to initialize Google Cloud Storage client:', err);
      }
    }
  }

  public getType(): 'gcs' {
    return 'gcs';
  }

  public isConfigured(): boolean {
    return Boolean(this.bucketName && this.bucket);
  }

  public getStatusDetails() {
    return {
      provider: 'gcs' as const,
      configured: this.isConfigured(),
      locationInfo: this.bucketName ? `gs://${this.bucketName}` : 'Unconfigured (Missing GCS_BUCKET_NAME)',
      isProductionReady: this.isConfigured()
    };
  }

  public async saveObject(key: string, data: Buffer, mimeType: string): Promise<StoredObjectResult> {
    if (!this.bucket) {
      throw new Error('Google Cloud Storage is not configured. Please set GCS_BUCKET_NAME environment variable.');
    }

    const file = this.bucket.file(key);
    await file.save(data, {
      contentType: mimeType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=86400, stale-while-revalidate=3600'
      }
    });

    return {
      key,
      size: data.length
    };
  }

  public async readObject(key: string): Promise<ReadObjectResult> {
    if (!this.bucket) {
      throw new Error('Google Cloud Storage is not configured. Please set GCS_BUCKET_NAME environment variable.');
    }

    const file = this.bucket.file(key);
    const [data] = await file.download();
    const [metadata] = await file.getMetadata().catch(() => [{}]);

    return {
      data,
      mimeType: (metadata as any)?.contentType || 'application/octet-stream'
    };
  }

  public async deleteObject(key: string): Promise<boolean> {
    if (!this.bucket) {
      throw new Error('Google Cloud Storage is not configured. Please set GCS_BUCKET_NAME environment variable.');
    }

    const file = this.bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) {
      return false;
    }

    await file.delete({ ignoreNotFound: true });
    return true;
  }

  public getServingUrl(assetId: string, _key: string): string {
    return `/api/assets/${assetId}/content`;
  }
}
