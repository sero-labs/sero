/**
 * Pending-event FIFO (spec 15, FR-P3). Replaces the spec-12 latest-wins stash:
 * coalescing was right for debounced file batches but silently dropped
 * discrete per-PR events (CI fails on two PRs during one run → one vanished).
 * Fires now queue oldest-first; the engine consumes the HEAD of the queue at
 * run start, so every drained pass handles exactly one event in arrival order.
 */

import type { Loop, OrchestratorEvent } from '../shared/types';
import type { OrchestratorHost } from './host';

export const PENDING_EVENT_QUEUE_CAP = 10;

const OVERFLOW_CODE = 'event-queue-overflow';

/**
 * Appends an event to the loop's pending queue. Duplicates of an already
 * queued occurrence (same source + dedupeKey, or same event id) are ignored.
 * Beyond the cap the OLDEST event is dropped with a visible warning — the
 * queue bounds memory, never silently truncates.
 */
export function enqueuePendingEvent(host: OrchestratorHost, loop: Loop, event: OrchestratorEvent): Loop {
  const queue = loop.runtime.pendingEvents ?? [];
  const duplicate = queue.some(
    (queued) =>
      queued.id === event.id ||
      (event.dedupeKey !== undefined && queued.source === event.source && queued.dedupeKey === event.dedupeKey),
  );
  if (duplicate) return loop;

  const next = [...queue, event];
  if (next.length <= PENDING_EVENT_QUEUE_CAP) {
    return { ...loop, runtime: { ...loop.runtime, pendingEvents: next } };
  }

  const [dropped, ...kept] = next;
  return {
    ...loop,
    warnings: [
      ...loop.warnings.filter((w) => w.code !== OVERFLOW_CODE),
      {
        id: host.newId('warning'),
        code: OVERFLOW_CODE,
        message: `Dropped the oldest queued event ("${dropped.source}") — more than ${PENDING_EVENT_QUEUE_CAP} events fired while runs were in flight.`,
        createdAt: host.now(),
      },
    ],
    runtime: { ...loop.runtime, pendingEvents: kept },
  };
}

/**
 * Read-time migration for loops persisted before the queue existed: the old
 * single `pendingEvent` stash becomes a one-element queue.
 */
export function migrateLegacyPendingEvent(loop: Loop): Loop {
  const legacy = (loop.runtime as { pendingEvent?: OrchestratorEvent }).pendingEvent;
  if (!legacy) return loop;
  const runtime = { ...loop.runtime, pendingEvents: loop.runtime.pendingEvents ?? [legacy] };
  delete (runtime as { pendingEvent?: OrchestratorEvent }).pendingEvent;
  return { ...loop, runtime };
}
