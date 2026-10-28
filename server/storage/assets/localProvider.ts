/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { AssetStorageProvider, StoredObjectResult, ReadObjectResult } from './types';

export const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');

export class LocalStorageProvider implements AssetStorageProvider {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || LOCAL_UPLOADS_DIR;
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public getType(): 'local' {
    return 'local';
  }

  public isConfigured(): boolean {
    return true;
  }

  public getStatusDetails() {
    return {
      provider: 'local' as const,
      configured: true,
      locationInfo: this.baseDir,
      isProductionReady: false // Flagged as development/local adapter
    };
  }

  public async saveObject(key: string, data: Buffer, _mimeType: string): Promise<StoredObjectResult> {
    const fullPath = path.resolve(this.baseDir, key);
    const parentDir = path.dirname(fullPath);

    // Prevent directory traversal escape
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error(`Path traversal attempt detected in key: "${key}"`);
    }

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, data);
    return {
      key,
      size: data.length
    };
  }

  public async readObject(key: string): Promise<ReadObjectResult> {
    const fullPath = path.resolve(this.baseDir, key);

    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error(`Path traversal attempt detected in key: "${key}"`);
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Object not found on local storage: "${key}"`);
    }

    const data = await fs.promises.readFile(fullPath);
    return {
      data,
      mimeType: 'application/octet-stream' // Inferred by metadata store
    };
  }

  public async deleteObject(key: string): Promise<boolean> {
    const fullPath = path.resolve(this.baseDir, key);

    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error(`Path traversal attempt detected in key: "${key}"`);
    }

    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }

  public getServingUrl(assetId: string, _key: string): string {
    return `/api/assets/${assetId}/content`;
  }
}
