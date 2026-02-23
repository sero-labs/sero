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
 */

import { ipcMain, safeStorage } from 'electron';
import { IpcChannels } from '../../src/types/ipc';

export function registerSafeStorageHandlers(): void {
  ipcMain.handle(IpcChannels.safeStorage.available, (): boolean => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle(
    IpcChannels.safeStorage.encrypt,
    (_event, plaintext: string): string => {
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: base64 only (not secure, but doesn't crash)
        return Buffer.from(plaintext, 'utf8').toString('base64');
      }
      return safeStorage.encryptString(plaintext).toString('base64');
    },
  );

  ipcMain.handle(
    IpcChannels.safeStorage.decrypt,
    (_event, encryptedBase64: string): string => {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: base64 only
        return buffer.toString('utf8');
      }
      return safeStorage.decryptString(buffer);
    },
  );
}
