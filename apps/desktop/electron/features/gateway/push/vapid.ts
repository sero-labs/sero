/**
 * VAPID keys for Web Push.
 *
 * A push service will only accept a message signed by the key pair the
 * browser subscribed with, so the pair must outlive a restart. It is
 * generated once and kept beside the gateway token, with the same file
 * permissions.
 */

import fs from 'fs';
import path from 'path';
import webpush from 'web-push';

/** The address a push service can complain to. Never contacted by us. */
const CONTACT = 'mailto:push@sero.local';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

function readKeys(filePath: string): VapidKeys | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const { publicKey, privateKey } = parsed as Record<string, unknown>;
    if (typeof publicKey !== 'string' || typeof privateKey !== 'string') return null;
    if (publicKey.length === 0 || privateKey.length === 0) return null;
    return { publicKey, privateKey };
  } catch {
    return null;
  }
}

/**
 * The profile's key pair, generated on first use.
 *
 * Returns null when the pair can neither be read nor written, which
 * turns push off rather than failing the gateway.
 */
export function loadVapidKeys(configDir: string): VapidKeys | null {
  const filePath = path.join(configDir, 'gateway-push-vapid.json');

  const existing = readKeys(filePath);
  if (existing) return existing;

  try {
    const generated = webpush.generateVAPIDKeys();
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(generated, null, 2), { mode: 0o600 });
    return { publicKey: generated.publicKey, privateKey: generated.privateKey };
  } catch (err) {
    console.error('[push] Could not create VAPID keys:', err);
    return null;
  }
}

/** Tell `web-push` which keys to sign with. */
export function applyVapidKeys(keys: VapidKeys): void {
  webpush.setVapidDetails(CONTACT, keys.publicKey, keys.privateKey);
}
