/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  initStorage,
  getStorage,
  type StorageAdapter,
  JsonFileStorageAdapter,
  MongoStorageAdapter,
  migrateJsonToMongo
} from './storage/index';

export {
  initStorage,
  getStorage,
  type StorageAdapter,
  JsonFileStorageAdapter,
  MongoStorageAdapter,
  migrateJsonToMongo
};

// Aliased for backward compatibility
export { JsonFileStorageAdapter as DatabaseStore };

/**
 * Proxy object delegating to the active StorageAdapter (MongoDB or JSON).
 */
export const db = new Proxy({} as StorageAdapter, {
  get(_target, prop: string | symbol) {
    const active = getStorage();
    const val = (active as any)[prop];
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  }
});
