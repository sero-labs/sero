/**
 * Watch work: the owner's live turn goes out only while a view holds a lease,
 * and a Room is served only when the project's own record links it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY,
  type OrchestratorRoomMemberLive,
  type PersistentSessionLiveSnapshot,
} from '@sero-ai/common';

import type { OwnerLiveNotice } from '../../shared/feedback';
import type { ProjectRecord } from '../../shared/record';
import { createWorkWatch, linkedRoomIds, WATCH_LEASE_MS } from '../work-watch';
import { buildingProject, fakeSessionsApi, milestone, roomHandle, T0 } from './helpers';

const PROJECT = 'proj_1';

function live(text: string, revision = 1): PersistentSessionLiveSnapshot {
  return { turnId: 'turn-1', text, truncated: false, request: null, tool: null, revision, updatedAt: T0 };
}

/** A watch over a fake session API, with a clock and a count of open subscriptions. */
function setup(record: ProjectRecord | null = buildingProject()) {
  const sessions = fakeSessionsApi();
  let subscriptions = 0;
  const subscribe = sessions.subscribe;
  sessions.subscribe = (handleId, cb) => {
    subscriptions += 1;
    const off = subscribe(handleId, cb);
    return () => { subscriptions -= 1; off(); };
  };
  const clock = { now: 1_000_000 };
  const emitted: OwnerLiveNotice[] = [];
  const handles = new Map<string, string>();
  const watch = createWorkWatch({
    sessions: () => sessions,
    ownerHandle: (projectId) => handles.get(projectId),
    read: async () => record,
    emit: (notice) => emitted.push(notice),
    now: () => clock.now,
  });
  return { sessions, watch, clock, emitted, handles, subscriptions: () => subscriptions };
}

beforeEach(() => { vi.useFakeTimers(); });

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY);
});

describe('watching the owner', () => {
  it('returns the open session live turn, and null when no session is open', () => {
    const { sessions, watch, handles } = setup();
    expect(watch.watchOwner(PROJECT, 'view-1')).toEqual({ projectId: PROJECT, live: null });

    handles.set(PROJECT, 'h1');
    sessions.partials.set('h1', live('Planning the grid.'));
    expect(watch.watchOwner(PROJECT, 'view-1')).toEqual({ projectId: PROJECT, live: live('Planning the grid.') });
    watch.dispose();
  });

  it('sends the turn after a session event, and stops when the last observer leaves', async () => {
    const { sessions, watch, handles, emitted, subscriptions } = setup();
    handles.set(PROJECT, 'h1');
    sessions.partials.set('h1', live('one'));
    watch.watchOwner(PROJECT, 'view-1');
    watch.watchOwner(PROJECT, 'view-2');
    expect(subscriptions()).toBe(1);

    sessions.partials.set('h1', live('two', 2));
    sessions.emit('h1', { type: 'turn_start', turnId: 'turn-1', at: T0 });
    sessions.emit('h1', { type: 'turn_start', turnId: 'turn-1', at: T0 });
    expect(emitted).toEqual([]);
    await vi.advanceTimersByTimeAsync(250);
    // Two events inside one interval make one push, carrying the latest text.
    expect(emitted).toEqual([{ projectId: PROJECT, live: live('two', 2) }]);

    watch.unwatchOwner(PROJECT, 'view-1');
    expect(subscriptions()).toBe(1);
    watch.unwatchOwner(PROJECT, 'view-2');
    expect(subscriptions()).toBe(0);
    sessions.emit('h1', { type: 'turn_start', turnId: 'turn-1', at: T0 });
    await vi.advanceTimersByTimeAsync(500);
    expect(emitted).toHaveLength(1);
  });

  it('stops sending to a view whose lease ran out without renewal', async () => {
    const { sessions, watch, handles, emitted, clock, subscriptions } = setup();
    handles.set(PROJECT, 'h1');
    sessions.partials.set('h1', live('one'));
    watch.watchOwner(PROJECT, 'view-1');

    clock.now += WATCH_LEASE_MS + 1;
    sessions.emit('h1', { type: 'turn_start', turnId: 'turn-1', at: T0 });
    await vi.advanceTimersByTimeAsync(500);
    expect(emitted).toEqual([]);
    expect(subscriptions()).toBe(0);
  });

  it('follows the owner session to a new handle and tells the view at once', async () => {
    const { sessions, watch, handles, emitted, subscriptions } = setup();
    handles.set(PROJECT, 'h1');
    watch.watchOwner(PROJECT, 'view-1');

    handles.set(PROJECT, 'h2');
    sessions.partials.set('h2', live('fresh session'));
    watch.ownerChanged(PROJECT);
    expect(emitted).toEqual([{ projectId: PROJECT, live: live('fresh session') }]);
    expect(subscriptions()).toBe(1);

    // The old handle no longer reaches the view; the new one does.
    sessions.emit('h1', { type: 'turn_start', turnId: 'turn-1', at: T0 });
    await vi.advanceTimersByTimeAsync(300);
    expect(emitted).toHaveLength(1);
    sessions.emit('h2', { type: 'turn_start', turnId: 'turn-2', at: T0 });
    await vi.advanceTimersByTimeAsync(300);
    expect(emitted).toHaveLength(2);
    watch.dispose();
  });
});

describe('watching a Room', () => {
  const members: OrchestratorRoomMemberLive[] = [{
    roomId: 'room-1', memberId: 'writer', turnId: 't1', text: 'drafting', truncated: false, toolInFlight: null,
    lastTurnStatus: null, watching: true, updatedAt: T0, revision: 1,
  }];

  function register(workspaceId: string) {
    const watchRoom = vi.fn(async () => members);
    const unwatchRoom = vi.fn(async () => undefined);
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([[workspaceId, { handle: roomHandle({ watch: watchRoom, unwatch: unwatchRoom }) }]]);
    return { watchRoom, unwatchRoom };
  }

  const linkedRecord = () => buildingProject({
    milestones: [
      milestone('m1', { dispatch: { kind: 'room', id: 'room-m', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } }),
      milestone('m2', { dispatch: { kind: 'workflow', id: 'flow-1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } }),
    ],
    pendingResearch: [{ id: 'p1', question: 'q', stoppingCondition: 's', startedAt: T0, roomId: 'room-pending' }],
    research: [{ id: 'r1', question: 'q', stoppingCondition: 's', result: 'r', costUsd: 0, completedAt: T0, roomId: 'room-done' }],
  });

  it('links the Rooms a milestone, a pending question and a finished question started, and no Workflow', () => {
    expect([...linkedRoomIds(linkedRecord())].sort()).toEqual(['room-done', 'room-m', 'room-pending']);
  });

  it('serves a linked Room and refuses one the record does not link, without calling the Room', async () => {
    const { watch } = setup(linkedRecord());
    const { watchRoom, unwatchRoom } = register('ws-1');

    expect(await watch.watchRoom(PROJECT, 'room-m', 'view-1')).toEqual(members);
    expect(watchRoom).toHaveBeenCalledWith('room-m', `architect:${PROJECT}:view-1`);

    for (const roomId of ['room-other', 'flow-1']) {
      expect(await watch.watchRoom(PROJECT, roomId, 'view-1')).toBeNull();
      await watch.unwatchRoom(PROJECT, roomId, 'view-1');
    }
    expect(watchRoom).toHaveBeenCalledTimes(1);
    expect(unwatchRoom).not.toHaveBeenCalled();
  });

  it('returns null when the project is unknown', async () => {
    const { watch } = setup(null);
    const { watchRoom } = register('ws-1');
    expect(await watch.watchRoom(PROJECT, 'room-m', 'view-1')).toBeNull();
    expect(watchRoom).not.toHaveBeenCalled();
  });
});
