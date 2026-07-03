/**
 * Event types (Living Loops, spec 12). An OrchestratorEvent is one occurrence
 * emitted by a source adapter, broadcast by the coordinator to every active
 * loop with a matching event/hybrid trigger.
 *
 * Split from types.ts (500-LOC limit) and re-exported there so existing
 * imports keep resolving. No dependency on ./types, so there is no import cycle.
 */

/** One occurrence emitted by an event source, broadcast to matching triggers. */
export interface OrchestratorEvent {
  id: string;
  /** Namespaced source id, e.g. "github:ci-failed", "loop:completed". */
  source: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  /** Optional one-line description from the emitter, shown as the run's "fired by". */
  summary?: string;
  /** Adapter-provided identity for restart-safe dedupe (e.g. a check-run id). */
  dedupeKey?: string;
  /**
   * Loop-event chain depth; incremented when a fire was itself caused by a
   * `loop:*` event. Guards against loop→loop trigger cycles.
   */
  chainDepth?: number;
  /** The loop that caused this event (`loop:*` sources) — it never fires its own triggers. */
  sourceLoopId?: string;
}

/** Compact record of the event that started a run. */
export interface EventFiredBy {
  source: string;
  occurredAt: string;
  summary: string;
  /**
   * Chain depth of the firing `loop:*` event, so events emitted by THIS run
   * carry depth + 1 (loop→loop cycle guard). Absent for non-loop sources.
   */
  chainDepth?: number;
}

/**
 * The slices of the adapter state files (`events/<namespace>.json` under the
 * orchestrator state dir) the UI watches for the source-health chips. The
 * files carry more (ETags, cursors, hook secrets) — the UI reads only these.
 */
export interface GithubSourceHealth {
  /** When the poller last completed a cycle. */
  lastPolledAt?: string;
  /** Set while rate-limit pressure or failures have polling slowed down. */
  throttledUntil?: string;
}

export interface WebhookSourceHealth {
  /** The local listener port — hooks POST to http://127.0.0.1:<port>/hooks/<name>. */
  port?: number;
}
