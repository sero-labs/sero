/**
 * Shared IndexedDB access for web-remote.
 *
 * One database, one version, two stores: `tokens` (encrypted auth token,
 * see token-storage.ts) and `prefs` (plain renderer preferences such as
 * the theme mode). Every caller must open through here — two callers
 * opening the same database at different versions would fail.
 *
 * `localStorage` is not used anywhere in Sero.
 */

const DB_NAME = 'sero-web-remote';
const DB_VERSION = 2;

export const TOKEN_STORE = 'tokens';
export const PREFS_STORE = 'prefs';

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TOKEN_STORE)) {
        db.createObjectStore(TOKEN_STORE);
      }
      if (!db.objectStoreNames.contains(PREFS_STORE)) {
        db.createObjectStore(PREFS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function dbGet(
  db: IDBDatabase,
  storeName: string,
  key: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function dbPut(
  db: IDBDatabase,
  storeName: string,
  key: string,
  value: unknown,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a record, but only while it still matches.
 *
 * The read and the delete share one transaction, so a write from
 * another tab lands wholly before it or wholly after it. `matches` runs
 * inside that transaction and must not await: a transaction with
 * nothing left to do commits and closes.
 *
 * Resolves with whether the record was deleted.
 */
export function dbDeleteIf(
  db: IDBDatabase,
  storeName: string,
  key: string,
  matches: (value: unknown) => boolean,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const read = store.get(key);
    let deleted = false;

    read.onsuccess = () => {
      if (read.result === undefined || !matches(read.result)) return;
      store.delete(key).onsuccess = () => {
        deleted = true;
      };
    };
    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function dbDelete(
  db: IDBDatabase,
  storeName: string,
  key: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
