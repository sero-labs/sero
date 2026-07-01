/**
 * Code-side event trigger matching (Living Loops, spec 12).
 *
 * The mechanical half of the split matching model: exact source, debounce, and
 * structured `eventFilter` predicates are matched here, in code. The
 * natural-language `eventCondition` is judged by a model call (event-condition.ts)
 * and only for triggers that pass this code match — code never parses natural
 * language, the model never re-implements exact matching.
 */

import type { LoopTrigger, Observation, OrchestratorEvent } from '../shared/types';

/** Fires caused by `loop:*` events beyond this chain depth are dropped (cycle guard). */
export const EVENT_CHAIN_DEPTH_LIMIT = 5;

/** Size of the persisted `recentEventKeys` dedupe ring. */
export const RECENT_EVENT_KEYS_LIMIT = 200;

/**
 * Flat field predicates against the payload's top-level fields. Strict equality
 * on primitives; an array value means "payload value is one of". Absent filter
 * matches everything.
 */
export function matchesEventFilter(
  filter: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, expected]) => {
    const actual = payload[key];
    if (Array.isArray(expected)) return expected.some((value) => value === actual);
    return expected === actual;
  });
}

export type EventTriggerMatch = 'no-match' | 'debounced' | 'match';

/**
 * The full code-side match for one trigger: enabled event/hybrid type, exact
 * source, filter predicates, then the debounce window. `debounced` is reported
 * separately so callers can distinguish "not interested" from "too soon".
 */
export function codeMatchEventTrigger(
  trigger: LoopTrigger,
  event: OrchestratorEvent,
  nowMs: number,
): EventTriggerMatch {
  if (trigger.disabled) return 'no-match';
  if (trigger.type !== 'event' && trigger.type !== 'hybrid') return 'no-match';
  if (trigger.eventSource && trigger.eventSource !== event.source) return 'no-match';
  if (!matchesEventFilter(trigger.eventFilter, event.payload)) return 'no-match';
  if (trigger.debounceMs && trigger.lastFireAt && nowMs - Date.parse(trigger.lastFireAt) < trigger.debounceMs) {
    return 'debounced';
  }
  return 'match';
}

/** Compact "fired by" summary for a run started by this event. */
export function describeEvent(event: OrchestratorEvent): string {
  return event.summary ?? event.source;
}

/** The firing event as a run observation: summary + full payload for step context. */
export function toEventObservation(event: OrchestratorEvent, id: string, createdAt: string): Observation {
  return {
    id,
    source: 'event',
    summary: `Fired by ${event.source}: ${event.summary ?? event.occurredAt}`,
    data: event.payload,
    createdAt,
  };
}
