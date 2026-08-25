/**
 * Detection for Electron `safeStorage` backends that do not really protect data.
 *
 * On Linux, when no keyring is available, Chromium's OSCrypt selects the
 * `basic_text` backend. That backend still encrypts, so
 * `safeStorage.isEncryptionAvailable()` returns `true` — but the key is a
 * compile-time constant derived from a published password, identical on every
 * machine. Anyone who can read the file can decrypt it.
 *
 * `isEncryptionAvailable()` alone therefore cannot tell real protection from
 * none. Ask `hasRealEncryption()` instead before reporting to a caller, or to a
 * user, that a secret is stored securely.
 */

import { safeStorage } from 'electron';

/** Backends Chromium selects on Linux when no keyring is available. */
const UNPROTECTED_LINUX_BACKENDS = new Set(['basic_text']);

/**
 * True when `safeStorage` is backed by a store that offers no real protection.
 *
 * Linux only. `getSelectedStorageBackend()` is not implemented on other
 * platforms, so this returns `false` there — macOS Keychain and Windows DPAPI
 * are not affected.
 */
export function isUnprotectedBackend(): boolean {
  if (process.platform !== 'linux') return false;
  if (typeof safeStorage?.getSelectedStorageBackend !== 'function') return false;

  try {
    return UNPROTECTED_LINUX_BACKENDS.has(safeStorage.getSelectedStorageBackend());
  } catch {
    // Older Electron builds can throw instead of reporting a backend. Treat an
    // unknown backend as protected: this check only ever downgrades a claim, and
    // guessing "unprotected" here would break working keyring setups.
    return false;
  }
}

/**
 * True only when `safeStorage` both works and actually protects the data.
 *
 * Use this for any capability reported to a caller or shown to a user. Use the
 * raw `safeStorage.isEncryptionAvailable()` only to decide whether
 * `encryptString`/`decryptString` can be called at all.
 */
export function hasRealEncryption(): boolean {
  return safeStorage.isEncryptionAvailable() && !isUnprotectedBackend();
}

/**
 * What the user can actually do about it, or null when there is nothing to fix.
 *
 * Kept separate from the reason so the UI can show the explanation and the fix
 * with different weight, and so the reason stays true if the remedy changes.
 */
export function describeStorageRemedy(): string | null {
  if (process.platform !== 'linux') return null;
  if (hasRealEncryption()) return null;
  return 'Install gnome-keyring or KWallet, then restart Sero.';
}

/** Human-readable reason for a downgraded claim, or null when protection is real. */
export function describeStorageWeakness(): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return 'OS encryption is unavailable, so credentials cannot be encrypted at all.';
  }
  if (isUnprotectedBackend()) {
    return 'No Linux keyring is available. Chromium is encrypting with a constant, '
      + 'publicly known key that is identical on every machine, so anyone who can '
      + 'read the file can decrypt it. Install gnome-keyring or KWallet for real encryption.';
  }
  return null;
}
