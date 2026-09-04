/**
 * Web Push, as one object the gateway holds.
 *
 * Push is optional. When the keys cannot be created, `publicKey` is null
 * and every call is a no-op, so the gateway runs exactly as before.
 */

import { onWebTokensGone } from '../bridge/web-tokens';
import { applyVapidKeys, loadVapidKeys } from './vapid';
import { PushSubscriptionStore, type PushSubscriptionRecord } from './subscriptions';
import { sendPush, type PushPayload } from './sender';

export interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class PushService {
  private readonly store: PushSubscriptionStore;
  /** Null when the key pair could not be created. Push is off then. */
  readonly publicKey: string | null;

  constructor(configDir: string) {
    this.store = new PushSubscriptionStore(configDir);
    const keys = loadVapidKeys(configDir);
    if (keys) applyVapidKeys(keys);
    this.publicKey = keys?.publicKey ?? null;

    // A revoked or expired token must stop reaching its phone.
    onWebTokensGone((tokenIds) => {
      for (const tokenId of tokenIds) this.forgetToken(tokenId);
    });
  }

  /** True when a browser can subscribe. */
  get enabled(): boolean {
    return this.publicKey !== null;
  }

  /** Record one browser's subscription under its token's scope. */
  subscribe(
    tokenId: string,
    workspaceIds: string[] | null,
    input: SubscribeInput,
  ): void {
    if (!this.enabled) return;

    const record: PushSubscriptionRecord = {
      tokenId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      workspaceIds,
      createdAt: new Date().toISOString(),
    };
    this.store.add(record);
  }

  /** Forget one browser's subscription. */
  unsubscribe(endpoint: string): boolean {
    return this.store.remove(endpoint);
  }

  /** Forget every subscription a revoked token created. */
  forgetToken(tokenId: string): number {
    return this.store.removeForToken(tokenId);
  }

  /** Drop subscriptions whose token is gone, at startup. */
  pruneToTokens(tokenIds: Set<string>): void {
    this.store.pruneToTokens(tokenIds);
  }

  /** How many subscriptions are held. Used by the desktop settings UI. */
  count(): number {
    return this.store.list().length;
  }

  /** Send one payload. Resolves with how many phones were reached. */
  async push(payload: PushPayload, connectedTokenIds: Set<string>): Promise<number> {
    if (!this.enabled) return 0;
    return sendPush(this.store, payload, connectedTokenIds);
  }
}

let service: PushService | null = null;
let serviceDir: string | null = null;

/**
 * The profile's push service. Created on first use.
 *
 * A different directory means a different profile, so the service is
 * rebuilt rather than reused: one profile's phones must never receive
 * another profile's notifications.
 */
export function getPushService(configDir: string): PushService {
  if (!service || serviceDir !== configDir) {
    service = new PushService(configDir);
    serviceDir = configDir;
  }
  return service;
}

/** The push service, when one was created. Null before the gateway starts. */
export function currentPushService(): PushService | null {
  return service;
}

/** Test seam. Forgets the service. */
export function resetPushService(): void {
  service = null;
  serviceDir = null;
}
