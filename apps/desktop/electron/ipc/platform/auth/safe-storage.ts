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
 * Security note: when OS encryption is unavailable (e.g., Linux without
 * libsecret), falls back to base64 encoding which is NOT secure. A
 * warning is logged and broadcast to the renderer via IPC.
 */

import { ipcMain, safeStorage, BrowserWindow } from 'electron';
import { IpcChannels } from '@/types/ipc';

let base64FallbackWarned = false;

/** Log and broadcast a warning when encryption is unavailable. */
function warnBase64Fallback(): void {
  if (base64FallbackWarned) return;
  base64FallbackWarned = true;

  console.warn(
    '[security] WARNING: OS encryption (safeStorage) is unavailable. ' +
    'Credentials will be stored with base64 encoding only, which is NOT secure. ' +
    'On Linux, install libsecret (gnome-keyring or KWallet) to enable encryption.',
  );

  // Notify all renderer windows so the UI can show a persistent warning
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sero:security-warning', {
      type: 'encryption-unavailable',
      message: 'OS keychain encryption is unavailable. Credentials are stored insecurely.',
    });
  }
}

export function registerSafeStorageHandlers(): void {
  ipcMain.handle(IpcChannels.safeStorage.available, (): boolean => {
    const available = safeStorage.isEncryptionAvailable();
    if (!available) warnBase64Fallback();
    return available;
  });

  ipcMain.handle(
    IpcChannels.safeStorage.encrypt,
    (_event, plaintext: string): string => {
      if (!safeStorage.isEncryptionAvailable()) {
        warnBase64Fallback();
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
        warnBase64Fallback();
        // Fallback: base64 only
        return buffer.toString('utf8');
      }
      return safeStorage.decryptString(buffer);
    },
  );
}
