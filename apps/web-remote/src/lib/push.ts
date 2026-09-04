/**
 * Web Push in the browser: register the worker, ask permission once,
 * and hand the subscription to the host.
 *
 * A service worker needs a secure origin. Over a tailnet that is the
 * HTTPS `*.ts.net` URL; on a developer machine `localhost` counts. On a
 * plain-HTTP LAN address none of this exists, and `pushSupported()`
 * answers false rather than failing later.
 */

/** What the host says about push on that machine. */
export interface PushStatus {
  enabled: boolean;
  publicKey: string | null;
}

/** The parts of a browser subscription the host stores. */
export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** True when this browser can register a worker and take a push. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && 'PushManager' in window
    && window.isSecureContext
  );
}

/** Register the service worker. Null when it cannot be registered. */
export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[push] Could not register the service worker', err);
    return null;
  }
}

/**
 * A VAPID key travels as base64url; the browser wants bytes.
 *
 * The buffer is built explicitly so the result is a plain `ArrayBuffer`,
 * which is what `applicationServerKey` accepts.
 */
export function decodeVapidKey(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/** The keys a subscription carries, or null when a key is missing. */
export function readKeys(subscription: PushSubscription): PushKeys | null {
  const raw = subscription.toJSON();
  const p256dh = raw.keys?.p256dh;
  const auth = raw.keys?.auth;
  if (!raw.endpoint || !p256dh || !auth) return null;

  return { endpoint: raw.endpoint, p256dh, auth };
}

/**
 * Subscribe this browser, asking permission if it was never asked.
 *
 * Returns null when the person said no, or when the browser refused.
 * `userVisibleOnly` is required: every push shows a notification.
 */
export async function subscribeBrowser(publicKey: string): Promise<PushKeys | null> {
  const registration = await registerWorker();
  if (!registration) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  try {
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(publicKey),
    });
    return readKeys(subscription);
  } catch (err) {
    console.warn('[push] Could not subscribe', err);
    return null;
  }
}

/** Drop this browser's subscription. Returns its endpoint, if it had one. */
export async function unsubscribeBrowser(): Promise<string | null> {
  if (!pushSupported()) return null;

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
