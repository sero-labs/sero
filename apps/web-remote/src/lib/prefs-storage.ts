/**
 * Renderer preferences persisted in IndexedDB.
 *
 * Preferences are not secret, so they are stored in clear text in the
 * `prefs` store. Every read and write is best-effort: a browser with
 * IndexedDB blocked falls back to the in-memory default.
 */

import { openDb, dbGet, dbPut, PREFS_STORE } from './idb';

/** Read a preference, or null when it is missing or unreadable. */
export async function loadPref(key: string): Promise<unknown> {
  try {
    const db = await openDb();
    const value = await dbGet(db, PREFS_STORE, key);
    db.close();
    return value ?? null;
  } catch {
    return null;
  }
}

/** Write a preference. Failures are ignored. */
export async function savePref(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await dbPut(db, PREFS_STORE, key, value);
    db.close();
  } catch (err) {
    console.warn(`[prefs-storage] Failed to save ${key}:`, err);
  }
}
