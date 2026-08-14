/**
 * Restart recovery for Rooms (spec §26, §30, §17.1).
 *
 * A restart is a second coordinator over the same store, which is exactly what
 * the runtime does on start. The suite holds the three rules apart: an
 * interrupted turn is uncertain and is not repeated, interrupted delivery waits
 * for the user, and a message batch no turn ever took IS handed over again.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomCoordinator } from '../rooms/room-coordinator';
import type { RoomStore } from '../rooms/room-store';
import type { FakeHost } from './fake-host';
import {
  MEMBERS,
  createRoomHarness,
  disposeHarness,
  draftRoomIn,
  envelopeWith,
  memberIn,
  restartCoordinator,
  waitFor,
} from './room-harness';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;

const draftRoom = () => draftRoomIn(coordinator, envelopeWith(), MEMBERS);
const memberOf = (roomId: string, memberId: string) => memberIn(store, roomId, memberId);

beforeEach(async () => {
  ({ dir, host, store, coordinator } = await createRoomHarness());
});

afterEach(() => disposeHarness(dir));

describe('restart recovery', () => {
  it('frees an interrupted turn, keeps the session file, and wakes only the Conductor', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'idle', 'the Conductor to finish');
    // Stand in for a dead process: the Implementer was mid-turn and its handle
    // is now a stale pointer.
    await store.updateRoom(roomId, (record) => ({
      ...record,
      members: record.members.map((entry) =>
        entry.id === 'impl'
          ? {
              ...entry,
              status: 'working',
              statusDetail: 'Working.',
              session: { ...entry.session, sessionId: 'session-impl', liveHandleId: 'handle-9' },
            }
          : entry,
      ),
      runtime: { ...record.runtime, activeMemberIds: ['impl'] },
    }));

    const restarted = restartCoordinator(host, store);
    await restarted.reconcileRooms();

    const impl = await memberOf(roomId, 'impl');
    // Idle, not failed: the turn may already have done its work, so it is not
    // re-prompted — the Conductor decides what still needs doing.
    expect(impl.status).toBe('idle');
    expect(impl.session.liveHandleId).toBeNull();
    expect(impl.session.sessionId).toBe('session-impl');
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('running');
    // Only the Conductor was resumed: the interrupted member's session was
    // never reopened, so its uncertain turn is not repeated.
    expect(record?.runtime.activeMemberIds).toEqual(['lead']);
    expect(api.requests.filter((request) => request.subject === 'impl')).toEqual([]);
    // Recovery reads current records only. Nothing replays a transcript: the
    // Room is rebuilt from state, never from what the members said (§26).
    expect(api.historyReads).toEqual([]);
    expect(api.prompts.filter((entry) => entry.handleId === 'handle-9')).toEqual([]);
  });

  it('hands over a batch no turn ever took, and stops once one has', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    await store.appendMessages(roomId, [
      {
        id: 'msg-1', kind: 'direct', fromMemberId: 'lead', toMemberIds: ['impl'], body: 'REVIEW THE PATCH',
        questionId: null, inReplyToQuestionId: null, wakeRecipients: true, commandId: 'cmd-1', createdAt: host.now(),
      },
    ]);

    // The session never takes the prompt, so the message was handed to nobody.
    api.failNextPrompt = 'the route is dead';
    const carries = (): number =>
      api.prompts.filter((entry) => String(entry.content).includes('REVIEW THE PATCH')).length;
    await coordinator.wake(roomId, 'impl', 'direct-message');
    await waitFor(() => carries() === 1, 'the first delivery');
    await waitFor(async () => (await memberOf(roomId, 'impl')).status === 'idle', 'the failed turn to settle');
    // The cursor must not claim a message that no session ever saw.
    const cursorFor = async (id: string) =>
      (await store.readRoom(roomId))?.readCursors.find((entry) => entry.memberId === id);
    expect((await cursorFor('impl'))?.lastReadSequence).toBe(0);

    const restarted = restartCoordinator(host, store);
    await restarted.reconcileRooms();
    await waitFor(() => carries() === 2, 'the replay');
    await waitFor(async () => (await memberOf(roomId, 'impl')).usage.turns === 1, 'the replayed turn to finish');

    // That turn took the batch, so a second restart delivers nothing again.
    await restartCoordinator(host, store).reconcileRooms();
    expect((await cursorFor('impl'))?.lease).toBeNull();
    expect((await store.leaseMessagesFor(roomId, 'impl', 20)).messages).toEqual([]);
    expect(carries()).toBe(2);
  });

  it('does not repeat an interrupted delivery', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await store.updateRoom(roomId, (record) => ({
      ...record,
      runtime: { ...record.runtime, status: 'completing' },
    }));

    await restartCoordinator(host, store).reconcileRooms();
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('completing');
    expect(record?.runtime.stopReason?.kind).toBe('awaiting-approval');
  });
});
