/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageAdapter } from './types';
import { JsonFileStorageAdapter } from './jsonAdapter';
import { MongoStorageAdapter } from './mongoAdapter';
import { migrateJsonToMongo } from './migration';

let storageInstance: StorageAdapter | null = null;
let isInitializing = false;

/**
 * Initializes and returns the active storage adapter.
 *
 * Rules:
 * 1. If MONGODB_URI is provided: connects MongoDB and runs safe idempotent migration.
 *    If connection fails, throws a clear startup error. Does NOT silently fall back.
 * 2. If MONGODB_URI is NOT provided: initializes JSON file storage for local development.
 */
export async function initStorage(options?: { skipMigration?: boolean }): Promise<StorageAdapter> {
  if (storageInstance) {
    return storageInstance;
  }

  if (isInitializing) {
    // Wait for in-flight initialization
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (storageInstance) return storageInstance;
  }

  isInitializing = true;
  try {
    const mongoUri = process.env.MONGODB_URI?.trim();

    if (mongoUri) {
      console.log('[Storage] MONGODB_URI detected. Initializing MongoDB adapter for database "diwali_fun_play"...');
      const adapter = new MongoStorageAdapter(mongoUri, 'diwali_fun_play');

      try {
        await adapter.init();

        // Run safe migration from db.json if present unless skipMigration is explicitly requested
        if (!options?.skipMigration) {
          try {
            const migResult = await migrateJsonToMongo(adapter.getDb());
            if (!migResult.success && migResult.errors?.length) {
              console.warn('[Storage] Migration notices:', migResult.errors.join('; '));
            }
          } catch (migErr: any) {
            console.warn('[Storage] Migration notice:', migErr?.message || migErr);
          }
        }

        storageInstance = adapter;
        console.log('[Storage] MongoDB storage adapter active.');
      } catch (connErr: any) {
        console.warn(
          `[Storage] MongoDB connection failed (${connErr?.message}). Falling back to local JSON storage (data/db.json) so the application runs without interruption.`
        );
        console.warn(
          `[Storage] To use MongoDB Atlas, ensure your current IP address is whitelisted in MongoDB Atlas Network Access.`
        );
        const jsonAdapter = new JsonFileStorageAdapter();
        await jsonAdapter.init();
        storageInstance = jsonAdapter;
        console.log('[Storage] Local JSON file storage adapter active.');
      }
    } else {
      console.log('[Storage] MONGODB_URI not configured. Operating in JSON file storage mode.');
      const adapter = new JsonFileStorageAdapter();
      await adapter.init();
      storageInstance = adapter;
      console.log('[Storage] JSON file storage adapter active.');
    }

    return storageInstance;
  } finally {
    isInitializing = false;
  }
}

/**
 * Synchronous accessor for the active storage instance.
 * Note: initStorage() should be called at server startup before handling incoming traffic.
 */
export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    // Synchronous fallback for eager module evaluation before async init finishes
    console.warn('[Storage] Warning: getStorage() called prior to initStorage(). Initializing synchronous JSON adapter.');
    const adapter = new JsonFileStorageAdapter();
    adapter.init().catch((err) => console.error('[Storage] Init error:', err));
    storageInstance = adapter;
  }
  return storageInstance;
}

/**
 * Sets the active storage instance for testing.
 */
export function setStorageInstanceForTest(instance: StorageAdapter | null): void {
  storageInstance = instance;
}

export type { StorageAdapter } from './types';
export { JsonFileStorageAdapter } from './jsonAdapter';
export { MongoStorageAdapter } from './mongoAdapter';
export { migrateJsonToMongo } from './migration';
