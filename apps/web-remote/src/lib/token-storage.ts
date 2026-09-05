/**
 * Secure token persistence using Web Crypto API + IndexedDB.
 *
 * Stores the gateway auth token encrypted at rest using AES-GCM,
 * with a key derived from the gateway URL (domain binding).
 * This provides defense-in-depth against XSS token exfiltration.
 *
 * Every tab on the origin shares this one record, so a tab is only
 * allowed to delete the pairing it was itself refused for. Each record
 * carries the SHA-256 of its token to make that comparison possible
 * without decrypting, and so it can happen inside one transaction.
 */

import { openDb, dbGet, dbPut, dbDelete, dbDeleteIf, TOKEN_STORE } from './idb';

const TOKEN_KEY = 'gateway-token';
const SALT = new TextEncoder().encode('sero-web-remote-token-salt-v1');

// ── Crypto helpers ──────────────────────────────────────────────

async function deriveKey(gatewayUrl: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(gatewayUrl),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

interface EncryptedBlob {
  iv: number[];
  data: number[];
  /**
   * SHA-256 of the token, hex. Names the pairing without revealing it.
   * Absent on records written before this existed.
   */
  id?: string;
}

/** Name a token without storing anything that could be used as one. */
async function tokenId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** The id on a stored record, or null when it carries none. */
function storedId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

async function encrypt(token: string, key: CryptoKey): Promise<EncryptedBlob> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(token),
  );

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
}

async function decrypt(blob: EncryptedBlob, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(blob.iv);
  const data = new Uint8Array(blob.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );

  return new TextDecoder().decode(decrypted);
}

// ── Public API ──────────────────────────────────────────────────

/** Store an auth token encrypted in IndexedDB. */
export async function saveToken(token: string): Promise<void> {
  try {
    const gatewayUrl = window.location.origin;
    const key = await deriveKey(gatewayUrl);
    const blob = await encrypt(token, key);
    const id = await tokenId(token);
    const db = await openDb();
    await dbPut(db, TOKEN_STORE, TOKEN_KEY, { ...blob, id });
    db.close();
  } catch (err) {
    console.warn('[token-storage] Failed to save token:', err);
  }
}

/** Load the stored auth token, or null if not found / expired / invalid. */
export async function loadToken(): Promise<string | null> {
  try {
    const gatewayUrl = window.location.origin;
    const key = await deriveKey(gatewayUrl);
    const db = await openDb();
    const blob = (await dbGet(db, TOKEN_STORE, TOKEN_KEY)) as EncryptedBlob | undefined;
    db.close();
    if (!blob) return null;
    return await decrypt(blob, key);
  } catch {
    // Decryption failure (wrong key, corrupted data, etc.)
    return null;
  }
}

/**
 * Forget the stored pairing.
 *
 * `refused` names the pairing the caller is giving up on. Only that one
 * is deleted: a tab left open across a restart is refused for a token
 * the host no longer holds, and the pairing made in the meantime, in
 * another tab, has to survive that.
 *
 * Called with nothing, the pairing goes whatever it is. That is the
 * user asking to use a different token, which is about the device
 * rather than about one token.
 */
export async function clearToken(refused?: string): Promise<void> {
  try {
    const db = await openDb();
    if (refused === undefined) {
      await dbDelete(db, TOKEN_STORE, TOKEN_KEY);
    } else {
      const id = await tokenId(refused);
      // A record from before ids carries none, so it cannot be told
      // apart from a newer pairing and is left alone. The next sign-in
      // overwrites it with one that can.
      await dbDeleteIf(db, TOKEN_STORE, TOKEN_KEY, (value) => storedId(value) === id);
    }
    db.close();
  } catch {
    // Best-effort
  }
}
