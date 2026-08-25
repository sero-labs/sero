/**
 * Detection for Electron `safeStorage` backends that do not really protect data.
 *
 * On Linux, when no keyring is available, Chromium's OSCrypt selects the
 * `basic_text` backend. That backend encrypts with a compile-time constant
 * derived from a published password, identical on every machine. Anyone who can
 * read the file can decrypt it.
 *
 * Electron refuses that backend by default: `isEncryptionAvailable()` returns
 * `false` and every secret write fails, which locks keyring-less Linux users out
 * of anything that stores a credential. `enablePlainTextFallback()` accepts the
 * weak backend so those users can sign in, and from that point
 * `isEncryptionAvailable()` returns `true` while the data is not really
 * protected.
 *
 * `isEncryptionAvailable()` alone therefore cannot tell real protection from
 * none. Ask `hasRealEncryption()` instead before reporting to a caller, or to a
 * user, that a secret is stored securely.
 *
 * Verified on Electron 41.10.5 / Linux arm64: without the fallback the backend
 * is `basic_text` and encryption reports unavailable; with it, two separate
 * machines produce byte-identical ciphertext for the same plaintext.
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

/**
 * Accept the weak Linux backend so credentials can be stored at all.
 *
 * Call once, after `app.whenReady()` and before anything reads or writes a
 * secret. Without it, a Linux desktop with no keyring cannot sign in to GitHub
 * or store a plugin token, because every `encryptString` call throws.
 *
 * This is a deliberate trade: storage that is readable by anyone with the file,
 * plus a visible warning, beats a feature the user simply cannot use. The
 * warning is not optional — `hasRealEncryption()` stays `false` afterwards, so
 * the banner, the status bar and the sign-in dialog all keep reporting the
 * weakness.
 *
 * No-op unless Linux has already reported that real encryption is unavailable,
 * so a working keyring is never downgraded.
 */
export function enablePlainTextFallback(): boolean {
  if (process.platform !== 'linux') return false;
  if (typeof safeStorage?.setUsePlainTextEncryption !== 'function') return false;
  if (safeStorage.isEncryptionAvailable()) return false;

  try {
    safeStorage.setUsePlainTextEncryption(true);
  } catch (err) {
    console.warn('[safe-storage] Could not enable the plain-text fallback:', err);
    return false;
  }

  console.warn(
    '[safe-storage] WARNING: no Linux keyring. Credentials will be stored with a '
    + 'constant, publicly known key. Install gnome-keyring or KWallet for real encryption.',
  );
  return true;
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
