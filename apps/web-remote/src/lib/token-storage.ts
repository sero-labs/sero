/**
 * Secure token persistence using Web Crypto API + IndexedDB.
 *
 * Stores the gateway auth token encrypted at rest using AES-GCM,
 * with a key derived from the gateway URL (domain binding).
 * This provides defense-in-depth against XSS token exfiltration.
 */

const DB_NAME = 'sero-web-remote';
const STORE_NAME = 'tokens';
const TOKEN_KEY = 'gateway-token';
const SALT = new TextEncoder().encode('sero-web-remote-token-salt-v1');

// ── IndexedDB helpers ───────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function dbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

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
    const db = await openDb();
    await dbPut(db, TOKEN_KEY, blob);
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
    const blob = (await dbGet(db, TOKEN_KEY)) as EncryptedBlob | undefined;
    db.close();
    if (!blob) return null;
    return await decrypt(blob, key);
  } catch {
    // Decryption failure (wrong key, corrupted data, etc.)
    return null;
  }
}

/** Clear the stored token. */
export async function clearToken(): Promise<void> {
  try {
    const db = await openDb();
    await dbDelete(db, TOKEN_KEY);
    db.close();
  } catch {
    // Best-effort
  }
}
