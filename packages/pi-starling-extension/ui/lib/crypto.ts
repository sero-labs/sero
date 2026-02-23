/**
 * Crypto utilities for the Starling app.
 *
 * Token encryption uses Electron's safeStorage (OS keychain) via IPC.
 * The PIN is a UX-level lock only — its salted hash is stored for
 * quick verification, but the PIN is NOT the encryption key.
 */

// ── Token encryption (via Electron main process) ────────────

export async function encryptToken(token: string): Promise<string> {
  if (typeof window !== 'undefined' && window.sero?.safeStorage) {
    return window.sero.safeStorage.encrypt(token);
  }
  // Fallback: base64 only (insecure, for non-Electron contexts)
  return btoa(token);
}

export async function decryptToken(encryptedBase64: string): Promise<string> {
  if (typeof window !== 'undefined' && window.sero?.safeStorage) {
    return window.sero.safeStorage.decrypt(encryptedBase64);
  }
  // Fallback
  return atob(encryptedBase64);
}

// ── PIN hashing (salted SHA-256) ────────────────────────────

/** Generate a random salt for PIN hashing (base64). */
export function generatePinSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...salt));
}

/** Hash a PIN with a salt. Returns hex string. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
