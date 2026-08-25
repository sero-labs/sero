/**
 * Safe Storage IPC handler.
 *
 * Exposes Electron's safeStorage API to renderer processes via IPC.
 * Uses the OS keychain (macOS Keychain / Windows DPAPI / Linux libsecret)
 * to encrypt/decrypt strings. The encryption key is tied to the OS user
 * account and the app — encrypted blobs can only be decrypted on the
 * same machine, by the same user, running this app.
 *
 * Used by Sero apps (e.g. Starling Bank) to securely store API tokens.
 *
 * Security note: the reported capability is deliberately stricter than the
 * mechanism used. `available` and `status` report insecure whenever storage
 * does not really protect the data — including the Linux `basic_text` backend,
 * where Chromium encrypts with a published constant key. Encrypt and decrypt
 * still call safeStorage whenever Electron can, so blobs written before this
 * check keep round-tripping. See shared/lib/safe-storage-backend.ts.
 */

import { ipcMain, safeStorage } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { SafeStorageStatus } from '@/types/ipc';
import {
  describeStorageRemedy,
  describeStorageWeakness,
  hasRealEncryption,
} from '@electron/shared/lib/safe-storage-backend';

let weakStorageWarned = false;

/** Log once when storage does not really protect credentials. */
function warnWeakStorage(): void {
  const reason = describeStorageWeakness();
  if (!reason || weakStorageWarned) return;
  weakStorageWarned = true;
  console.warn(`[security] WARNING: credentials are not stored securely. ${reason}`);
}

/** Current protection state, for the renderer to surface to the user. */
export function getSafeStorageStatus(): SafeStorageStatus {
  const reason = describeStorageWeakness();
  if (!reason) return { secure: true, reason: null, remedy: null };
  return { secure: false, reason, remedy: describeStorageRemedy() };
}

export function registerSafeStorageHandlers(): void {
  ipcMain.handle(IpcChannels.safeStorage.available, (): boolean => {
    const available = hasRealEncryption();
    if (!available) warnWeakStorage();
    return available;
  });

  ipcMain.handle(IpcChannels.safeStorage.status, (): SafeStorageStatus => {
    warnWeakStorage();
    return getSafeStorageStatus();
  });

  ipcMain.handle(
    IpcChannels.safeStorage.encrypt,
    (_event, plaintext: string): string => {
      warnWeakStorage();
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: base64 only (not secure, but doesn't crash)
        return Buffer.from(plaintext, 'utf8').toString('base64');
      }
      // Still encrypt under a weak backend. It is no less secure than the base64
      // fallback, and switching mechanisms would strand already-stored blobs.
      return safeStorage.encryptString(plaintext).toString('base64');
    },
  );

  ipcMain.handle(
    IpcChannels.safeStorage.decrypt,
    (_event, encryptedBase64: string): string => {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      warnWeakStorage();
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: base64 only
        return buffer.toString('utf8');
      }
      return safeStorage.decryptString(buffer);
    },
  );
}
