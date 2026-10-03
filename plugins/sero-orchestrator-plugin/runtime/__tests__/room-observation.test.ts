import { describe, expect, it } from 'vitest';
import { createFeedbackProjection, feedbackActivity, type PersistentSessionEvent, type PersistentSessionHistoryPage, type PersistentSessionLiveSnapshot, type WorkFeedback } from '@sero-ai/common';
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

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' , at: '2026-09-14T09:12:00.000Z' });
    h.push('h1', { type: 'text', text: 'thinking out loud' });
    h.push('h1', { type: 'tool_start', toolName: 'read', summary: 'src/parser.ts', callId: null, at: '2026-09-14T09:12:00.000Z'  });
    h.push('h1', { type: 'turn_end', turnId: 'turn-1', status: 'completed' , at: '2026-09-14T09:12:00.000Z' });

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

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' , at: '2026-09-14T09:12:00.000Z' });
    h.push('h1', { type: 'text', text: 'reading the parser' });
    h.push('h1', { type: 'tool_start', toolName: 'read', summary: 'src/parser.ts', callId: null, at: '2026-09-14T09:12:00.000Z'  });

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

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' , at: '2026-09-14T09:12:00.000Z' });
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

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' , at: '2026-09-14T09:12:00.000Z' });
    h.push('h1', { type: 'text', text: 'first turn' });
    h.push('h1', { type: 'turn_end', turnId: 'turn-1', status: 'completed' , at: '2026-09-14T09:12:00.000Z' });
    h.push('h1', { type: 'turn_start', turnId: 'turn-2' , at: '2026-09-14T09:12:00.000Z' });

    expect(observation.snapshotMember('m1')?.text).toBe('');
    expect(observation.snapshotMember('m1')?.turnId).toBe('turn-2');
  });

  it('drops text a compaction made meaningless', () => {
    const h = harness();
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.watchMember('m1', () => undefined);

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' , at: '2026-09-14T09:12:00.000Z' });
    h.push('h1', { type: 'text', text: 'before compaction' });
    h.push('h1', { type: 'compacted', at: '2026-09-14T09:12:00.000Z'  });

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

    h.push('h1', { type: 'turn_start', turnId: 'turn-1' , at: '2026-09-14T09:12:00.000Z' });
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

describe('a Watch view opened late', () => {
  const AT = '2026-09-14T09:12:00.000Z';
  /** The host's own record of the turn in flight, kept while nothing watched. */
  function withPartial(partial: PersistentSessionLiveSnapshot | null) {
    const h = harness();
    h.deps.sessions = { ...h.deps.sessions, liveSnapshot: () => partial };
    return h;
  }
  const partial = (over: Partial<PersistentSessionLiveSnapshot> = {}): PersistentSessionLiveSnapshot => ({
    turnId: 'turn-1', text: 'written before anyone watched', truncated: false, request: null, tool: null, revision: 5, updatedAt: AT, ...over,
  });

  it('starts from the text the turn already wrote, without waiting for the next token', () => {
    const h = withPartial(partial({ tool: { toolName: 'bash', summary: 'npm test', callId: 'c1', startedAt: AT } }));
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    h.push('h1', { type: 'turn_start', turnId: 'turn-1', at: AT });
    h.push('h1', { type: 'text', text: 'written before anyone watched' });
    expect(observation.snapshotMember('m1')?.text).toBe('');

    observation.watchRoom('room-a', () => undefined);

    const snapshot = observation.snapshotMember('m1');
    expect(snapshot).toMatchObject({ turnId: 'turn-1', text: 'written before anyone watched', watching: true });
    expect(snapshot?.toolInFlight).toMatchObject({ toolName: 'bash', summary: 'npm test' });
  });

  it('continues from that text when the next token arrives', () => {
    const h = withPartial(partial());
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    h.push('h1', { type: 'turn_start', turnId: 'turn-1', at: AT });
    observation.watchMember('m1', () => undefined);
    h.push('h1', { type: 'text', text: ', then more' });
    expect(observation.snapshotMember('m1')?.text).toBe('written before anyone watched, then more');
  });

  it('shows no earlier reply as current output when no turn is in flight', () => {
    const h = withPartial(partial({ turnId: null, text: '' }));
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.watchRoom('room-a', () => undefined);
    expect(observation.snapshotMember('m1')).toMatchObject({ turnId: null, text: '' });
  });

  it('gives every change a higher revision, across turns and members', () => {
    const h = withPartial(null);
    const observation = createRoomObservation(h.deps);
    observation.attach('room-a', 'm1', 'h1');
    observation.attach('room-a', 'm2', 'h2');
    observation.watchRoom('room-a', () => undefined);
    h.push('h1', { type: 'turn_start', turnId: 'turn-1', at: AT });
    const first = observation.snapshotMember('m1')!.revision;
    h.push('h2', { type: 'turn_start', turnId: 'turn-2', at: AT });
    h.push('h1', { type: 'turn_end', turnId: 'turn-1', status: 'completed', at: AT });
    h.push('h1', { type: 'turn_start', turnId: 'turn-3', at: AT });
    expect(observation.snapshotMember('m2')!.revision).toBeGreaterThan(first);
    expect(observation.snapshotMember('m1')!.revision).toBeGreaterThan(observation.snapshotMember('m2')!.revision);
  });
});

describe('member feedback without a Watch view', () => {
  const AT = '2026-09-14T09:12:00.000Z';
  const EPOCH = '2026-09-14T09:00:00.000Z';
  function observed() {
    const h = harness();
    const pushed: WorkFeedback[] = [];
    const projection = createFeedbackProjection(EPOCH, (snapshot) => pushed.push(snapshot));
    h.deps.feedback = { projection, scope: { appId: 'orchestrator', workspaceId: 'ws-1' } };
    const observation = createRoomObservation(h.deps);
    return { h, observation, projection, pushed };
  }

  it('reports each member and its tool before the turn ends, with no text and no arguments', () => {
    const { h, observation, projection, pushed } = observed();
    observation.attach('room-a', 'm1', 'h1', { label: 'Adversary' });
    observation.attach('room-a', 'm2', 'h2', { label: 'Conductor' });
    h.push('h1', { type: 'turn_start', turnId: 'turn-1', at: AT });
    h.push('h1', { type: 'text', text: 'SECRET ANSWER TEXT' });
    h.push('h1', { type: 'tool_start', toolName: 'bash', summary: 'cat .env', callId: 'c1', at: AT });
    h.push('h2', { type: 'turn_start', turnId: 'turn-2', at: AT });
    h.push('h2', { type: 'request_start', requestId: 'r1', model: 'p/m', at: AT });

    const [adversary, conductor] = projection.list();
    expect(adversary).toMatchObject({ owner: 'Adversary', wait: { kind: 'tool', toolName: 'bash' }, scope: { workId: 'room-a', memberId: 'm1', workspaceId: 'ws-1' } });
    expect(conductor).toMatchObject({ owner: 'Conductor', wait: { kind: 'request', model: 'p/m' } });
    expect(feedbackActivity(adversary, EPOCH)).toBe('working');
    // Each member reported on its own, and nothing waited for a turn to end.
    expect(new Set(pushed.map((entry) => entry.key)).size).toBe(2);
    expect(JSON.stringify(pushed)).not.toMatch(/SECRET|cat \.env/);
  });

  it('reads last known when a session goes away mid-turn', () => {
    const { h, observation, projection } = observed();
    observation.attach('room-a', 'm1', 'h1', { label: 'Adversary' });
    h.push('h1', { type: 'turn_start', turnId: 'turn-1', at: AT });
    observation.detach('m1');
    const [snapshot] = projection.list();
    expect(feedbackActivity(snapshot, EPOCH)).toBe('last-known');
    expect(snapshot.terminal).toBeNull();
  });
});
