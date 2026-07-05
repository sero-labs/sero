/**
 * Pending-event FIFO helpers (spec 15, FR-P3): bounded queue, dedupe, visible
 * overflow, and the read-time migration of the legacy single-event stash.
 */

import { describe, expect, it } from 'vitest';
import { enqueuePendingEvent, migrateLegacyPendingEvent, PENDING_EVENT_QUEUE_CAP } from '../event-queue';
import type { Loop, OrchestratorEvent } from '../../shared/types';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const NOW = '2026-07-03T10:00:00.000Z';

function event(id: string, overrides: Partial<OrchestratorEvent> = {}): OrchestratorEvent {
  return { id, source: 'github:ci-failed', payload: {}, occurredAt: NOW, ...overrides };
}

function seededLoop(): { loop: Loop; host: ReturnType<typeof createFakeHost> } {
  const host = createFakeHost();
  host.frozenNow = NOW;
  return { loop: seedActiveLoop(host, oneStepPlan().plan), host };
}

describe('enqueuePendingEvent', () => {
  it('appends in arrival order', () => {
    const { loop, host } = seededLoop();
    let next = enqueuePendingEvent(host, loop, event('a'));
    next = enqueuePendingEvent(host, next, event('b'));
    expect(next.runtime.pendingEvents?.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('ignores a duplicate id and a duplicate source+dedupeKey', () => {
    const { loop, host } = seededLoop();
    let next = enqueuePendingEvent(host, loop, event('a', { dedupeKey: 'k1' }));
    next = enqueuePendingEvent(host, next, event('a', { dedupeKey: 'other' })); // same id
    next = enqueuePendingEvent(host, next, event('b', { dedupeKey: 'k1' })); // same source+key
    next = enqueuePendingEvent(host, next, event('c', { source: 'fs:changed', dedupeKey: 'k1' })); // different source
    expect(next.runtime.pendingEvents?.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('drops the OLDEST beyond the cap, with a visible warning that replaces the prior one', () => {
    const { loop, host } = seededLoop();
    let next = loop;
    for (let i = 0; i < PENDING_EVENT_QUEUE_CAP + 2; i += 1) {
      next = enqueuePendingEvent(host, next, event(`e${i}`));
    }
    const queue = next.runtime.pendingEvents!;
    expect(queue).toHaveLength(PENDING_EVENT_QUEUE_CAP);
    expect(queue[0].id).toBe('e2'); // e0 and e1 dropped, oldest first
    expect(queue.at(-1)?.id).toBe(`e${PENDING_EVENT_QUEUE_CAP + 1}`);
    const overflows = next.warnings.filter((w) => w.code === 'event-queue-overflow');
    expect(overflows).toHaveLength(1); // replaced, not accumulated
  });
});

describe('migrateLegacyPendingEvent', () => {
  it('reads a persisted single pendingEvent as a one-element queue', () => {
    const { loop } = seededLoop();
    const legacy = { ...loop, runtime: { ...loop.runtime, pendingEvent: event('old') } } as Loop;
    const migrated = migrateLegacyPendingEvent(legacy);
    expect(migrated.runtime.pendingEvents?.map((e) => e.id)).toEqual(['old']);
    expect('pendingEvent' in migrated.runtime).toBe(false);
  });

  it('leaves a queue-era loop untouched', () => {
    const { loop } = seededLoop();
    expect(migrateLegacyPendingEvent(loop)).toBe(loop);
  });
});
