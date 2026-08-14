import { describe, expect, it } from 'vitest';
import type { PersistentSessionEvent, PersistentSessionHistoryPage } from '@sero-ai/common';
import {
  createRoomObservation,
  MAX_LIVE_TEXT_CHARS,
  type RoomLiveEvent,
  type RoomObservationDeps,
} from '../rooms/room-observation';

interface Harness {
  deps: RoomObservationDeps;
  /** Pushes an event into a subscribed handle, as the host capability would. */
  push(handleId: string, event: PersistentSessionEvent): void;
  lifecycle: RoomLiveEvent[];
  subscriptions: string[];
  historyCalls: { grantId: string; subject: string }[];
  liveHandles(): string[];
}

function harness(): Harness {
  const listeners = new Map<string, (event: PersistentSessionEvent) => void>();
  const lifecycle: RoomLiveEvent[] = [];
  const subscriptions: string[] = [];
  const historyCalls: { grantId: string; subject: string }[] = [];
  let tick = 0;

  const page: PersistentSessionHistoryPage = {
    entries: [{ turnIndex: 1, timestamp: 't', role: 'assistant', text: 'earlier' }],
    olderCursor: null,
  };

  const deps: RoomObservationDeps = {
    sessions: {
      subscribe: (handleId, cb) => {
        subscriptions.push(handleId);
        listeners.set(handleId, cb);
        return () => listeners.delete(handleId);
      },
      readHistory: async (grantId, subject) => {
        historyCalls.push({ grantId, subject });
        return page;
      },
    },
    onLifecycle: (event) => lifecycle.push(event),
    now: () => `t${(tick += 1)}`,
  };

  return {
    deps,
    push: (handleId, event) => listeners.get(handleId)?.(event),
    lifecycle,
    subscriptions,
    historyCalls,
    liveHandles: () => [...listeners.keys()],
  };
}

describe('retention follows demand', () => {
  it('keeps turn lifecycle but no streamed text while nobody watches', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' });
    h.push('h1', { type: 'text', text: 'thinking out loud' });
    h.push('h1', { type: 'tool_start', toolName: 'read', summary: 'src/parser.ts' });
    h.push('h1', { type: 'turn_end', turnId: 'turn-1', status: 'completed' });

    const snapshot = observation.snapshotMember('m1');
    expect(snapshot?.text).toBe('');
    expect(snapshot?.toolInFlight).toBeNull();
    expect(snapshot?.watching).toBe(false);
    // The scheduler still needs turn completion, watcher or not.
    expect(h.lifecycle.map((event) => event.type)).toEqual(['turn_start', 'turn_end']);
    expect(snapshot?.lastTurnStatus).toBe('completed');
  });

  it('retains the current turn while watched and drops it when the watcher leaves', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');

    const seen: RoomLiveEvent[] = [];
    const unwatch = observation.watchMember('m1', (event) => seen.push(event));

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' });
    h.push('h1', { type: 'text', text: 'reading the parser' });
    h.push('h1', { type: 'tool_start', toolName: 'read', summary: 'src/parser.ts' });

    expect(observation.snapshotMember('m1')?.text).toBe('reading the parser');
    expect(observation.snapshotMember('m1')?.toolInFlight?.toolName).toBe('read');
    expect(seen.map((event) => event.type)).toEqual(['turn_start', 'text', 'tool_start']);
    expect(seen[0].roomId).toBe('room-a');

    unwatch();
    expect(observation.snapshotMember('m1')?.text).toBe('');
    expect(observation.snapshotMember('m1')?.watching).toBe(false);
    // The subscription stays up — only retention followed demand.
    expect(h.liveHandles()).toEqual(['h1']);
  });

  it('caps retained text and keeps the tail', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.watchMember('m1', () => undefined);

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' });
    h.push('h1', { type: 'text', text: 'x'.repeat(MAX_LIVE_TEXT_CHARS) });
    h.push('h1', { type: 'text', text: 'LATEST' });

    const snapshot = observation.snapshotMember('m1');
    expect(snapshot?.text).toHaveLength(MAX_LIVE_TEXT_CHARS);
    expect(snapshot?.text.endsWith('LATEST')).toBe(true);
    expect(snapshot?.truncated).toBe(true);
  });

  it('holds the current turn only', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.watchMember('m1', () => undefined);

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' });
    h.push('h1', { type: 'text', text: 'first turn' });
    h.push('h1', { type: 'turn_end', turnId: 'turn-1', status: 'completed' });
    h.push('h1', { type: 'turn_start', turnId: 'turn-2' });

    expect(observation.snapshotMember('m1')?.text).toBe('');
    expect(observation.snapshotMember('m1')?.turnId).toBe('turn-2');
  });

  it('drops text a compaction made meaningless', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.watchMember('m1', () => undefined);

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' });
    h.push('h1', { type: 'text', text: 'before compaction' });
    h.push('h1', { type: 'compacted' });

    expect(observation.snapshotMember('m1')?.text).toBe('');
    expect(h.lifecycle.map((event) => event.type)).toContain('compacted');
  });
});

describe('watching a Room', () => {
  it('delivers only its own members and retains while it watches', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.attach('room-b', 'm2', 'h2');

    const seen: RoomLiveEvent[] = [];
    const unwatch = observation.watchRoom('room-a', (event) => seen.push(event));

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' });
    h.push('h1', { type: 'text', text: 'mine' });
    h.push('h2', { type: 'text', text: 'not mine' });

    expect(seen.map((event) => event.memberId)).toEqual(['m1', 'm1']);
    expect(observation.snapshotMember('m1')?.text).toBe('mine');
    expect(observation.snapshotMember('m2')?.text).toBe('');
    expect(observation.snapshotRoom('room-a')).toHaveLength(1);

    unwatch();
    expect(observation.snapshotMember('m1')?.text).toBe('');
  });
});

describe('history', () => {
  it('reads a disposed member from the session file', async () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.detach('m1');

    expect(observation.snapshotMember('m1')).toBeNull();
    expect(h.liveHandles()).toEqual([]);

    // History outlives the live session: the read takes the grant and subject,
    // never a handle.
    const page = await observation.readMemberHistory('g1', 'm1', { limit: 10 });
    expect(page.entries[0].text).toBe('earlier');
    expect(h.historyCalls).toEqual([{ grantId: 'g1', subject: 'm1' }]);
  });

  it('replaces the subscription when a member reopens on a new handle', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.attach('room-a', 'm1', 'h1');
    expect(h.subscriptions).toEqual(['h1']);

    observation.attach('room-a', 'm1', 'h2');
    expect(h.liveHandles()).toEqual(['h2']);
  });
});
