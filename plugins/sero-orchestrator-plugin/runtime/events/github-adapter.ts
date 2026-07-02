/**
 * GitHub event source poller (`github:*`, spec 12 Phase 4).
 *
 * One poller per workspace repo, shared by every subscribing loop — N loops
 * cost one poll cycle. The anti-abuse envelope is enforced in code, not
 * configuration:
 *
 * - Demand-scoped: only endpoints implied by live subscriptions are queried,
 *   and no poller exists at all without a `github:*` subscription.
 * - Cadence floor: default 120s, minimum 60s — config can slow polling, never
 *   speed it past the floor.
 * - Conditional requests: stored ETags make steady state mostly 304s, which
 *   cost no rate limit.
 * - Rate-limit awareness: low `X-RateLimit-Remaining` doubles the interval
 *   (with jitter) until the window resets; failures (incl. 403/429) back off
 *   exponentially, capped.
 * - Restart-safe: per-kind cursors and ETags persist in `events/github.json`,
 *   so a relaunch neither replays old fires nor misses the gap.
 */

import type { OrchestratorHost } from '../host';
import type { EmitEvent, EventSourceAdapter, EventSubscription } from './types';
import { readAdapterState, writeAdapterState } from './adapter-state';
import { runGhApi } from './github-http';
import { demandedKinds, endpointsForKinds, extractOccurrences, type GithubKind } from './github-kinds';

export interface GithubAdapterState {
  /** Poll interval override in ms; floored at MIN_INTERVAL_MS in code. */
  intervalMs?: number;
  /** Conditional-request tag per endpoint id. */
  etags?: Record<string, string>;
  /** Newest-seen item timestamp per event kind (restart-safe cursor). */
  cursors?: Record<string, string>;
  /** Source-health facts the UI watches (GithubSourceHealth slice). */
  lastPolledAt?: string;
  throttledUntil?: string;
}

export const DEFAULT_INTERVAL_MS = 120_000;
export const MIN_INTERVAL_MS = 60_000;
/** Below this many remaining rate-limit calls, polling slows until the window resets. */
const RATE_LIMIT_THRESHOLD = 50;
const BACKOFF_CAP_MS = 30 * 60_000;
const FIRST_POLL_DELAY_MS = 1_000;

export function baseIntervalMs(configured: number | undefined): number {
  return Math.max(MIN_INTERVAL_MS, configured ?? DEFAULT_INTERVAL_MS);
}

/** Pure delay math: rate-limit doubling and exponential failure backoff, ±10% jitter. */
export function nextDelayMs(input: {
  baseMs: number;
  consecutiveFailures: number;
  rateLimitedUntilMs: number;
  nowMs: number;
  random: () => number;
}): number {
  const rateLimited = input.nowMs < input.rateLimitedUntilMs ? input.baseMs * 2 : input.baseMs;
  const backedOff =
    input.consecutiveFailures > 0
      ? Math.min(input.baseMs * 2 ** input.consecutiveFailures, BACKOFF_CAP_MS)
      : input.baseMs;
  return Math.round(Math.max(rateLimited, backedOff) * (0.9 + input.random() * 0.2));
}

export interface GithubAdapter extends EventSourceAdapter {
  /** One poll cycle; tests drive this directly, the timer path adds rescheduling. */
  pollOnce(): Promise<void>;
  /** Throttle-state introspection for tests and the source-health UI. */
  debug(): { consecutiveFailures: number; rateLimitedUntilMs: number };
}

export function createGithubAdapter(
  host: OrchestratorHost,
  emit: EmitEvent,
  options: { firstPollDelayMs?: number; random?: () => number } = {},
): GithubAdapter {
  const random = options.random ?? Math.random;
  const firstPollDelayMs = options.firstPollDelayMs ?? FIRST_POLL_DELAY_MS;
  let kinds = new Set<GithubKind>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  let consecutiveFailures = 0;
  let rateLimitedUntilMs = 0;
  let intervalMs = DEFAULT_INTERVAL_MS;

  const pollOnce = async (): Promise<void> => {
    if (polling || kinds.size === 0) return;
    polling = true;
    try {
      const state = (await readAdapterState<GithubAdapterState>(host, 'github')) ?? {};
      intervalMs = baseIntervalMs(state.intervalMs);
      const etags = { ...state.etags };
      let cursors = { ...state.cursors };
      let failed = false;
      for (const endpoint of endpointsForKinds(kinds)) {
        const response = await runGhApi(host, endpoint.path, etags[endpoint.id]);
        if (response.rateLimitRemaining !== undefined && response.rateLimitRemaining < RATE_LIMIT_THRESHOLD) {
          rateLimitedUntilMs = response.rateLimitResetMs ?? Date.parse(host.now()) + intervalMs * 2;
          host.log(`github adapter: rate limit low (${response.rateLimitRemaining} left) — slowing down`);
        }
        if (response.status === 304) continue; // unchanged; free against the rate limit
        if (response.status < 200 || response.status >= 300 || response.body === undefined) {
          failed = true;
          if ((response.status === 403 || response.status === 429) && response.rateLimitResetMs) {
            rateLimitedUntilMs = Math.max(rateLimitedUntilMs, response.rateLimitResetMs);
          }
          host.log(`github adapter: ${endpoint.id} poll failed (HTTP ${response.status})`);
          continue;
        }
        if (response.etag) etags[endpoint.id] = response.etag;
        const extracted = extractOccurrences(endpoint, response.body, kinds, cursors, host.now());
        cursors = extracted.cursors;
        for (const occurrence of extracted.occurrences) {
          await emit({
            id: host.newId('evt'),
            source: `github:${occurrence.kind}`,
            payload: occurrence.payload,
            occurredAt: occurrence.occurredAt,
            summary: occurrence.summary,
            dedupeKey: occurrence.dedupeKey,
          }).catch((error) => host.log(`github adapter: emit failed: ${error}`));
        }
      }
      const polledAt = host.now();
      await writeAdapterState<GithubAdapterState>(host, 'github', {
        ...state,
        etags,
        cursors,
        lastPolledAt: polledAt,
        throttledUntil:
          rateLimitedUntilMs > Date.parse(polledAt) ? new Date(rateLimitedUntilMs).toISOString() : undefined,
      });
      consecutiveFailures = failed ? consecutiveFailures + 1 : 0;
    } catch (error) {
      consecutiveFailures += 1;
      host.log(`github adapter: poll cycle failed: ${error}`);
    } finally {
      polling = false;
    }
  };

  const scheduleNext = (delayMs?: number): void => {
    if (timer || kinds.size === 0) return;
    const delay =
      delayMs ??
      nextDelayMs({ baseMs: intervalMs, consecutiveFailures, rateLimitedUntilMs, nowMs: Date.parse(host.now()), random });
    timer = setTimeout(() => {
      timer = undefined;
      void pollOnce().then(() => scheduleNext());
    }, delay);
  };

  const stop = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  return {
    namespace: 'github',
    sync(subscriptions: EventSubscription[]): void {
      const demand = demandedKinds(subscriptions);
      for (const source of demand.unknown) host.log(`github adapter: ignoring unknown source "${source}"`);
      const hadDemand = kinds.size > 0;
      kinds = demand.kinds;
      if (kinds.size === 0) {
        if (hadDemand) {
          stop();
          host.log('github adapter: stopped (no subscribers)');
        }
        return;
      }
      // A running schedule picks up kind changes on its next cycle; only a
      // fresh demand starts the (single, shared) poll loop.
      if (!timer && !polling) scheduleNext(firstPollDelayMs);
    },
    dispose: stop,
    pollOnce,
    debug: () => ({ consecutiveFailures, rateLimitedUntilMs }),
  };
}
