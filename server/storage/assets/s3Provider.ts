/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { AssetStorageProvider, StoredObjectResult, ReadObjectResult, StorageProviderType } from './types';

export interface S3ProviderConfig {
  bucketName?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrlPrefix?: string;
  forcePathStyle?: boolean;
}

export class S3StorageProvider implements AssetStorageProvider {
  private client: S3Client | null = null;
  private bucketName: string;
  private publicUrlPrefix?: string;
  private endpoint?: string;
  private region: string;

  constructor(config?: S3ProviderConfig) {
    this.bucketName =
      config?.bucketName ||
      process.env.S3_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET ||
      process.env.R2_BUCKET_NAME ||
      '';

    this.region =
      config?.region ||
      process.env.S3_REGION ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      'auto';

    this.endpoint =
      config?.endpoint ||
      process.env.S3_ENDPOINT ||
      process.env.R2_ENDPOINT ||
      undefined;

    const accessKeyId =
      config?.accessKeyId ||
      process.env.S3_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.R2_ACCESS_KEY_ID;

    const secretAccessKey =
      config?.secretAccessKey ||
      process.env.S3_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.R2_SECRET_ACCESS_KEY;

    this.publicUrlPrefix =
      config?.publicUrlPrefix ||
      process.env.S3_PUBLIC_URL_PREFIX ||
      process.env.S3_CUSTOM_DOMAIN ||
      process.env.R2_PUBLIC_URL;

    const forcePathStyle =
      config?.forcePathStyle !== undefined
        ? config.forcePathStyle
        : process.env.S3_FORCE_PATH_STYLE === 'true' ||
          (this.endpoint ? this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1') : false);

    if (this.bucketName && accessKeyId && secretAccessKey) {
      try {
        this.client = new S3Client({
          region: this.region,
          endpoint: this.endpoint,
          credentials: {
            accessKeyId,
            secretAccessKey
          },
          forcePathStyle
        });
      } catch (err) {
        console.warn('[S3 Storage] Failed to initialize S3 client:', err);
      }
    }
  }

  public getType(): StorageProviderType {
    return 's3';
  }

  public isConfigured(): boolean {
    return Boolean(this.client && this.bucketName);
  }

  public getStatusDetails() {
    return {
      provider: 's3' as const,
      configured: this.isConfigured(),
      locationInfo: this.isConfigured()
        ? `S3 bucket: "${this.bucketName}" (${this.endpoint ? `Endpoint: ${this.endpoint}` : `Region: ${this.region}`})`
        : 'Unconfigured (Missing S3_BUCKET_NAME, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY)',
      isProductionReady: this.isConfigured()
    };
  }

  public async saveObject(key: string, data: Buffer, mimeType: string): Promise<StoredObjectResult> {
    if (!this.client || !this.bucketName) {
      throw new Error('S3 Storage is not configured. Please set S3 credentials and bucket name.');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: mimeType,
      CacheControl: 'public, max-age=86400, stale-while-revalidate=3600'
    });

    await this.client.send(command);

    return {
      key,
      size: data.length
    };
  }

  public async readObject(key: string): Promise<ReadObjectResult> {
    if (!this.client || !this.bucketName) {
      throw new Error('S3 Storage is not configured. Please set S3 credentials and bucket name.');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty response body from S3 for key: "${key}"`);
    }

    const chunks: Buffer[] = [];
    const stream = response.Body as any;
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      data: Buffer.concat(chunks),
      mimeType: response.ContentType || 'application/octet-stream'
    };
  }

  public async deleteObject(key: string): Promise<boolean> {
    if (!this.client || !this.bucketName) {
      return false;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  public getServingUrl(assetId: string, key: string): string {
    if (this.publicUrlPrefix) {
      return `${this.publicUrlPrefix.replace(/\/+$/, '')}/${key}`;
    }
    return `/api/assets/${assetId}/content`;
  }
}

