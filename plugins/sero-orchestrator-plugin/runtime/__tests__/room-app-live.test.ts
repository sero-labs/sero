/**
 * Watching a Room and reading a member's session (phase 7).
 *
 * Two boundaries matter here. Streamed text is retained only while somebody is
 * watching, so the panel's demand must be registered once, released when the
 * view closes, and dropped when a renderer goes away without releasing it —
 * otherwise a Room nobody is looking at keeps buffering for good.
 *
 * The second is identity: history is read with the ROOM's grant, so the surface
 * must refuse a subject that is not a member of the Room being asked about.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PersistentSessionContextUsage } from '@sero-ai/common';
import { createRoomAppActions, type RoomAppActions } from '../rooms/room-app-actions';
import type { RoomCoordinator } from '../rooms/room-coordinator';
import type { RoomObservation } from '../rooms/room-observation';
import type { RoomStore } from '../rooms/room-store';
import type { FakeHost } from './fake-host';
import { MEMBERS, createRoomHarness, disposeHarness, draftRoomIn, envelopeWith } from './room-harness';

interface StubObservation {
  observation: RoomObservation;
  /** Rooms a retention demand was registered for, in order. */
  watched: string[];
  /** Rooms whose demand was released, in order. */
  released: string[];
  historyReads: { grantId: string; memberId: string }[];
  /** Sends a member event to the Room's lease, as the observation would. */
  memberEvent(roomId: string): void;
}

function stubObservation(): StubObservation {
  const listeners = new Map<string, () => void>();
  const stub: StubObservation = {
    memberEvent: (roomId) => listeners.get(roomId)?.(),
    watched: [],
    released: [],
    historyReads: [],
    observation: {
      attach: () => () => undefined,
      detach: () => undefined,
      watchMember: () => () => undefined,
      watchRoom(roomId, listener) {
        stub.watched.push(roomId);
        listeners.set(roomId, () => listener({ type: 'text', text: 'x', roomId, memberId: 'lead' }));
        return () => { listeners.delete(roomId); stub.released.push(roomId); };
      },
      snapshotMember: () => null,
      snapshotRoom: (roomId) => [
        {
          roomId,
          memberId: 'lead',
          turnId: 'turn-1',
          text: 'thinking',
          truncated: false,
          toolInFlight: null,
          lastTurnStatus: null,
          watching: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
          revision: 1,
        },
      ],
      async readMemberHistory(grantId, memberId) {
        stub.historyReads.push({ grantId, memberId });
        return { entries: [], olderCursor: 'older-1' };
      },
      dispose: () => undefined,
    },
  };
  return stub;
}

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;
let stub: StubObservation;
let app: RoomAppActions;
let usage: PersistentSessionContextUsage;

beforeEach(async () => {
  ({ dir, host, store, coordinator } = await createRoomHarness());
  stub = stubObservation();
  usage = { usedTokens: 94_000, maxTokens: 200_000 };
  app = createRoomAppActions({
    host,
    store,
    coordinator,
    workspaceId: 'ws-1',
    observation: stub.observation,
    sessions: { getContextUsage: async () => usage },
  });
});

afterEach(() => disposeHarness(dir));

/** A Room with a grant, which is what a member session is issued against. */
async function grantedRoom(): Promise<string> {
  const roomId = await draftRoomIn(coordinator, envelopeWith(), MEMBERS);
  await store.updateRoom(roomId, (current) => ({
    ...current,
    definition: { ...current.definition, grantId: 'grant-1' },
  }));
  return roomId;
}

describe('watching a Room', () => {
  it('registers the demand once, however often the panel asks', async () => {
    const roomId = await grantedRoom();
    await app.watch(roomId);
    await app.watch(roomId);
    const snapshots = await app.watch(roomId);

    expect(stub.watched).toEqual([roomId]);
    expect(snapshots[0].text).toBe('thinking');
  });

  it('drops the demand when the view closes, and takes it again when it reopens', async () => {
    const roomId = await grantedRoom();
    await app.watch(roomId);
    await app.unwatch(roomId);
    expect(stub.released).toEqual([roomId]);

    await app.watch(roomId);
    expect(stub.watched).toEqual([roomId, roomId]);
  });

  it('drops a Watch view that went quiet, which a reloaded renderer cannot release itself', async () => {
    const first = await grantedRoom();
    const second = await grantedRoom();
    await app.watch(first);

    // The renderer went away without releasing. Nothing has read since.
    host.clockMs += 10 * 60_000;
    await app.watch(second);

    expect(stub.released).toEqual([first]);
    expect(stub.watched).toEqual([first, second]);
  });

  it('keeps a Room watched for the second view when the first one closes', async () => {
    const roomId = await grantedRoom();
    await app.watch(roomId, 'view-a');
    await app.watch(roomId, 'view-b');
    expect(stub.watched).toEqual([roomId]);

    await app.unwatch(roomId, 'view-a');
    expect(stub.released).toEqual([]);

    await app.unwatch(roomId, 'view-b');
    expect(stub.released).toEqual([roomId]);
  });

  it('drops an abandoned view when its Room next reports, with no other read', async () => {
    const roomId = await grantedRoom();
    await app.watch(roomId, 'view-a');

    host.clockMs += 4 * 60_000;
    stub.memberEvent(roomId);
    expect(stub.released).toEqual([]);

    host.clockMs += 2 * 60_000;
    stub.memberEvent(roomId);
    expect(stub.released).toEqual([roomId]);
  });

  it('keeps a view that renews and drops only the one that stopped', async () => {
    const roomId = await grantedRoom();
    await app.watch(roomId, 'abandoned');
    await app.watch(roomId, 'open');

    host.clockMs += 4 * 60_000;
    await app.watch(roomId, 'open');
    host.clockMs += 2 * 60_000;
    stub.memberEvent(roomId);
    expect(stub.released).toEqual([]);

    // Only the renewing view is left, so its close releases the Room.
    await app.unwatch(roomId, 'open');
    expect(stub.released).toEqual([roomId]);
  });

  it('answers with nothing rather than failing when the host cannot observe', async () => {
    const roomId = await grantedRoom();
    const blind = createRoomAppActions({ host, store, coordinator, workspaceId: 'ws-1' });
    expect(await blind.watch(roomId)).toEqual([]);
    expect(await blind.context(roomId, 'lead')).toBeNull();
  });
});

describe('reading a member session', () => {
  it('reads history with the Room\'s own grant', async () => {
    const roomId = await grantedRoom();
    const page = await app.history(roomId, 'lead');

    expect(stub.historyReads).toEqual([{ grantId: 'grant-1', memberId: 'lead' }]);
    expect(page.olderCursor).toBe('older-1');
  });

  it('reads history after the active grant is revoked', async () => {
    const roomId = await grantedRoom();
    await store.updateRoom(roomId, (current) => ({
      ...current,
      definition: { ...current.definition, grantId: null, historyGrantId: 'grant-1' },
    }));

    await app.history(roomId, 'lead');

    expect(stub.historyReads).toEqual([{ grantId: 'grant-1', memberId: 'lead' }]);
  });

  it('will not read a session that is not a member of this Room', async () => {
    const roomId = await grantedRoom();
    const page = await app.history(roomId, 'somebody-else');

    // The grant is the Room's, so asking for a foreign subject with it would
    // read another Room's session through this Room's authority.
    expect(stub.historyReads).toEqual([]);
    expect(page).toEqual({ entries: [], olderCursor: null });
  });

  it('reports no context window for a member with no live session', async () => {
    const roomId = await grantedRoom();
    expect(await app.context(roomId, 'lead')).toBeNull();
  });

  it('reports context pressure once the member is live', async () => {
    const roomId = await grantedRoom();
    await store.updateMember(roomId, 'lead', (member) => ({
      ...member,
      session: { ...member.session, liveHandleId: 'handle-1' },
    }));
    expect(await app.context(roomId, 'lead')).toEqual(usage);
  });
});
