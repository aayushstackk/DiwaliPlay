/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Readable } from 'stream';
import { GridFSBucket, Db, ObjectId } from 'mongodb';
import {
  AssetStorageProvider,
  StoredObjectResult,
  ReadObjectResult,
  ReadStreamResult,
  StorageProviderType
} from './types';
import { getStorage } from '../index';

function* chunksOf(data: Buffer, size: number): Generator<Buffer> {
  for (let offset = 0; offset < data.length; offset += size) {
    yield data.subarray(offset, offset + size);
  }
}

export class GridFSStorageProvider implements AssetStorageProvider {
  private bucket: GridFSBucket | null = null;
  private db: Db | null = null;
  private bucketName: string;

  constructor(db?: Db, bucketName = 'asset_uploads') {
    this.bucketName = bucketName;
    if (db) {
      this.setDb(db);
    }
  }

  /**
   * Binds the GridFS bucket to an active MongoDB database instance.
   */
  public setDb(db: Db): void {
    this.db = db;
    this.bucket = new GridFSBucket(this.db, { bucketName: this.bucketName });
  }

  /**
   * Lazily resolves or binds the GridFS bucket if not already configured.
   */
  private resolveBucket(): GridFSBucket {
    if (this.bucket && this.db) {
      return this.bucket;
    }

    try {
      const storage = getStorage();
      if (storage && typeof (storage as any).getDb === 'function') {
        const mongoDb = (storage as any).getDb();
        if (mongoDb) {
          this.setDb(mongoDb);
          return this.bucket!;
        }
      }
    } catch {
      // Storage not initialized yet
    }

    throw new Error('GridFSStorageProvider: MongoDB database instance is not connected.');
  }

  public getType(): StorageProviderType {
    return 'gridfs';
  }

  public isConfigured(): boolean {
    if (this.bucket && this.db) return true;
    try {
      const storage = getStorage();
      return Boolean(storage && typeof (storage as any).getDb === 'function' && (storage as any).getDb());
    } catch {
      return false;
    }
  }

  public getStatusDetails() {
    const configured = this.isConfigured();
    let dbName = this.db?.databaseName;
    if (!dbName) {
      try {
        const storage = getStorage();
        if (storage && typeof (storage as any).getDb === 'function') {
          dbName = (storage as any).getDb()?.databaseName;
        }
      } catch {
        // Ignore
      }
    }

    return {
      provider: 'gridfs' as const,
      configured,
      locationInfo: configured
        ? `MongoDB GridFS bucket: "${this.bucketName}" (Database: ${dbName || 'diwali_fun_play'})`
        : 'MongoDB not yet connected',
      isProductionReady: true
    };
  }

  public async saveObject(key: string, data: Buffer, mimeType: string): Promise<StoredObjectResult> {
    const bucket = this.resolveBucket();

    // Remove any existing file with the same key to avoid duplicate entries
    await this.deleteObject(key).catch(() => {});

    return new Promise<StoredObjectResult>((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(key, {
        metadata: {
          mimeType,
          contentType: mimeType,
          originalKey: key,
          uploadedAt: new Date().toISOString()
        }
      });

      uploadStream.on('error', (err) => reject(err));
      uploadStream.on('finish', () => {
        resolve({
          key,
          size: data.length
        });
      });

      // One chunk at a time: handed the whole buffer, the driver inserts every chunk at once and holds them all.
      Readable.from(chunksOf(data, uploadStream.chunkSizeBytes)).pipe(uploadStream);
    });
  }

  /** The most recent file for a key, or null. */
  private async findFile(key: string) {
    const bucket = this.resolveBucket();

    // Query files collection by filename or metadata originalKey
    const files = await bucket
      .find({
        $or: [{ filename: key }, { 'metadata.originalKey': key }]
      })
      .toArray();

    if (!files || files.length === 0) {
      return null;
    }

    const fileDoc = files[files.length - 1];
    const mimeType =
      (fileDoc.metadata as any)?.mimeType || (fileDoc.metadata as any)?.contentType || 'application/octet-stream';
    return { fileDoc, mimeType };
  }

  public async openReadStream(key: string): Promise<ReadStreamResult> {
    const found = await this.findFile(key);
    if (!found) {
      throw new Error(`Object not found in GridFS: "${key}"`);
    }
    return {
      stream: this.resolveBucket().openDownloadStream(found.fileDoc._id),
      size: found.fileDoc.length,
      mimeType: found.mimeType
    };
  }

  public async readObject(key: string): Promise<ReadObjectResult> {
    const bucket = this.resolveBucket();
    const found = await this.findFile(key);
    if (!found) {
      throw new Error(`Object not found in GridFS: "${key}"`);
    }
    const { fileDoc, mimeType } = found;

    return new Promise<ReadObjectResult>((resolve, reject) => {
      const downloadStream = bucket.openDownloadStream(fileDoc._id);
      const chunks: Buffer[] = [];

      downloadStream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      downloadStream.on('error', (err) => reject(err));
      downloadStream.on('end', () => {
        resolve({
          data: Buffer.concat(chunks),
          mimeType
        });
      });
    });
  }

  public async deleteObject(key: string): Promise<boolean> {
    try {
      const bucket = this.resolveBucket();
      const files = await bucket
        .find({
          $or: [{ filename: key }, { 'metadata.originalKey': key }]
        })
        .toArray();

      if (!files || files.length === 0) {
        return false;
      }

      for (const file of files) {
        await bucket.delete(file._id).catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  public getServingUrl(assetId: string, _key: string): string {
    return `/api/assets/${assetId}/content`;
  }
}
