/**
 * Demand-driven event source manager (Living Loops, spec 12).
 *
 * Derives the active subscriptions from loop state and re-syncs each adapter
 * whenever demand changes. Demand changes are pushed in-process — the runtime
 * wraps `host.updateState` so every persisted mutation notifies the manager
 * with the new state (no file watching, no timers, per the no-polling rule).
 * A source with no active matching trigger does zero background work.
 */

import type { OrchestratorState } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import type { EventSourceAdapter, EventSubscription } from './types';

/** Active event demand: enabled event/hybrid triggers of active loops. */
export function deriveSubscriptions(state: OrchestratorState): EventSubscription[] {
  const subscriptions: EventSubscription[] = [];
  for (const loop of state.loops) {
    if (loop.status !== 'active') continue;
    for (const trigger of loop.triggers) {
      if (trigger.disabled) continue;
      if (trigger.type !== 'event' && trigger.type !== 'hybrid') continue;
      // A trigger without a source matches any event at delivery time but
      // creates no adapter demand — only explicit sources drive background work.
      if (!trigger.eventSource) continue;
      subscriptions.push({ loopId: loop.id, eventSource: trigger.eventSource, eventFilter: trigger.eventFilter });
    }
  }
  // Stable order so the change signature doesn't flap on state reshuffles.
  return subscriptions.sort((a, b) =>
    a.eventSource === b.eventSource ? a.loopId.localeCompare(b.loopId) : a.eventSource.localeCompare(b.eventSource),
  );
}

export class EventSourceManager {
  private lastSignature = '';

  constructor(private readonly adapters: EventSourceAdapter[]) {}

  /** Re-syncs adapters when the state's derived demand changed. */
  notifyState(state: OrchestratorState): void {
    const subscriptions = deriveSubscriptions(state);
    const signature = JSON.stringify(subscriptions);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    for (const adapter of this.adapters) {
      adapter.sync(subscriptions.filter((s) => s.eventSource.startsWith(`${adapter.namespace}:`)));
    }
  }

  dispose(): void {
    for (const adapter of this.adapters) adapter.dispose();
  }
}

/**
 * Taps the host in place so every persisted state mutation pushes the new
 * state into the manager — the in-process demand signal. The tap captures the
 * updater's result inside the write, so no extra read happens. Patching in
 * place (rather than wrapping) keeps every other host method's binding intact.
 */
export function attachDemandSync(host: OrchestratorHost, manager: EventSourceManager): OrchestratorHost {
  const base = host.updateState.bind(host);
  host.updateState = async (updater) => {
    let next: OrchestratorState | undefined;
    await base((current) => {
      next = updater(current);
      return next;
    });
    if (next) manager.notifyState(next);
  };
  return host;
}
