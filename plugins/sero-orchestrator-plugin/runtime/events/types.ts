/**
 * Event source adapter contract (Living Loops, spec 12).
 *
 * An adapter owns one source namespace (`fs`, `github`, `webhook`) and does
 * background work ONLY while at least one active loop subscribes to a source
 * in that namespace — the manager re-syncs it on every demand change, and an
 * empty subscription list means "stop all activity". Internal `loop:*` events
 * are not an adapter: the coordinator emits them directly.
 */

import type { OrchestratorEvent } from '../../shared/types';

/** One active trigger's demand, derived from loop state. */
export interface EventSubscription {
  loopId: string;
  /** Namespaced source id the trigger listens to, e.g. "github:ci-failed". */
  eventSource: string;
  /**
   * The trigger's structured filter — an adapter MAY use it to narrow its
   * watching (e.g. only poll the checks API when a ci-* subscription exists);
   * authoritative matching stays in the coordinator.
   */
  eventFilter?: Record<string, unknown>;
}

/** Delivers one occurrence into the coordinator's broadcast. */
export type EmitEvent = (event: OrchestratorEvent) => Promise<void>;

export interface EventSourceAdapter {
  /** The source namespace this adapter owns, e.g. "github". */
  readonly namespace: string;
  /**
   * Called with the current active subscriptions in this namespace whenever
   * demand changes (and once at startup). An empty list means stop all
   * background activity. Must be cheap and non-throwing.
   */
  sync(subscriptions: EventSubscription[]): void;
  /** Runtime shutdown: stop everything and release resources. */
  dispose(): void;
}
