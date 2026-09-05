/**
 * Push subscriptions, one per browser that asked for notifications.
 *
 * A subscription belongs to the token that created it and carries that
 * token's workspace scope, so a push respects the same limits the socket
 * does. Revoking a token drops its subscriptions.
 *
 * The endpoint is the browser vendor's push service. It is a capability:
 * anyone holding it can send that browser a message, so the file is
 * written with the same permissions as the gateway token.
 */

import fs from 'fs';
import path from 'path';

/** Subscriptions kept at once. The oldest goes when the limit is hit. */
const MAX_SUBSCRIPTIONS = 50;

export interface PushSubscriptionRecord {
  /** Which token created it: a web token's id, or `master`. */
  tokenId: string;
  endpoint: string;
  /** Public key of the browser, for payload encryption. */
  p256dh: string;
  /** Shared secret of the browser, for payload encryption. */
  auth: string;
  /** The token's scope when it subscribed. Null means every workspace. */
  workspaceIds: string[] | null;
  createdAt: string;
}

function normalize(value: unknown): PushSubscriptionRecord[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;

  const strings = ['tokenId', 'endpoint', 'p256dh', 'auth', 'createdAt'] as const;
  for (const key of strings) {
    if (typeof record[key] !== 'string' || (record[key] as string).length === 0) return [];
  }

  const scope = record.workspaceIds;
  if (scope !== null && !Array.isArray(scope)) return [];
  if (Array.isArray(scope) && scope.some((id) => typeof id !== 'string')) return [];

  return [{
    tokenId: record.tokenId as string,
    endpoint: record.endpoint as string,
    p256dh: record.p256dh as string,
    auth: record.auth as string,
    workspaceIds: scope === null ? null : (scope as string[]),
    createdAt: record.createdAt as string,
  }];
}

export class PushSubscriptionStore {
  private subscriptions: PushSubscriptionRecord[] = [];
  private readonly filePath: string;

  constructor(configDir: string) {
    this.filePath = path.join(configDir, 'gateway-push-subscriptions.json');
    this.load();
  }

  /** Every subscription, newest last. */
  list(): PushSubscriptionRecord[] {
    return [...this.subscriptions];
  }

  /**
   * Record a subscription, replacing any earlier one for the same
   * endpoint. A browser re-subscribes after it rotates its keys, and
   * two records for one endpoint would send the message twice.
   */
  add(record: PushSubscriptionRecord): void {
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== record.endpoint);
    this.subscriptions.push(record);
    while (this.subscriptions.length > MAX_SUBSCRIPTIONS) this.subscriptions.shift();
    this.save();
  }

  /** Forget one subscription. True when it was there. */
  remove(endpoint: string): boolean {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== endpoint);
    if (this.subscriptions.length === before) return false;
    this.save();
    return true;
  }

  /** Forget every subscription a token created. Returns how many went. */
  removeForToken(tokenId: string): number {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter((s) => s.tokenId !== tokenId);
    const removed = before - this.subscriptions.length;
    if (removed > 0) this.save();
    return removed;
  }

  /** Keep only the tokens still in `tokenIds`, plus the master token. */
  pruneToTokens(tokenIds: Set<string>): void {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter(
      (s) => s.tokenId === 'master' || tokenIds.has(s.tokenId),
    );
    if (this.subscriptions.length !== before) this.save();
  }

  private load(): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
      this.subscriptions = Array.isArray(parsed) ? parsed.flatMap(normalize) : [];
    } catch {
      this.subscriptions = [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.subscriptions, null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      console.error('[push] Could not save subscriptions:', err);
    }
  }
}

/** True when this subscription's token may see this workspace. */
export function subscriptionReaches(
  subscription: PushSubscriptionRecord,
  workspaceId: string | undefined,
): boolean {
  // An entry with no workspace names nothing a scoped token can claim.
  if (!workspaceId) return subscription.workspaceIds === null;
  if (subscription.workspaceIds === null) return true;
  return subscription.workspaceIds.includes(workspaceId);
}
