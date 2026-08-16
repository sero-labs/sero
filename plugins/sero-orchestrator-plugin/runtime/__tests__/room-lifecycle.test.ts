/**
 * Stopping a Room: pause, resume, cancel and complete.
 *
 * Each of these transitions ends or suspends work the user is paying for, and
 * more than one can be in flight at once — a Conductor finishing while the user
 * cancels, two completions from a retried call. The suite therefore covers the
 * interleavings as well as the plain paths: a finished Room keeps the ending it
 * reached, and only one caller may deliver.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BlueprintMember, OperatingEnvelope } from '../../shared/room-blueprint-types';
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
  waitFor,
} from './room-harness';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;

const draftRoom = (envelope: OperatingEnvelope = envelopeWith(), members: BlueprintMember[] = MEMBERS) =>
  draftRoomIn(coordinator, envelope, members);
const memberOf = (roomId: string, memberId: string) => memberIn(store, roomId, memberId);

beforeEach(async () => {
  ({ dir, host, store, coordinator } = await createRoomHarness());
});

afterEach(() => disposeHarness(dir));

describe('stopping a Room', () => {
  it('lets a running turn finish, then pauses and closes the sessions', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    await coordinator.pauseRoom(roomId);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('pausing');
    expect(api.sessions.get('lead')?.disposed).toBe(false);

    api.endTurn('lead');
    await waitFor(async () => (await store.readRoom(roomId))?.runtime.status === 'paused', 'the pause to settle');
    expect(api.sessions.get('lead')?.disposed).toBe(true);
    // A paused Room keeps its grant: resuming must not need a second approval.
    expect((await store.readRoom(roomId))?.definition.grantId).toBe('grant-1');
    expect(api.revoked).toEqual([]);

    // Nothing new starts while paused.
    await coordinator.wake(roomId, 'impl', 'direct-message');
    expect(api.openTurns()).toEqual([]);

    await coordinator.resumeRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the resumed turn');
    // The same session file is reopened, not a new one.
    expect(api.requests.filter((request) => request.subject === 'lead').at(-1)?.operation).toBe('open');
    // The wake that arrived while the Room was paused is still owed to it.
    expect(api.openTurns()).toContain('impl');
  });

  it('revokes the grant when the Room completes', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    await coordinator.completeRoom(roomId, 'Done.');
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('completed');
    expect(record?.runtime.endedAt).not.toBeNull();
    expect(host.persistentSessions.revoked).toEqual(['grant-1']);
    expect(record?.definition.grantId).toBeNull();
    // The session files survive: a completed Room stays readable.
    expect(host.persistentSessions.sessions.get('lead')?.sessionPath).toBe('/sessions/rooms/lead.jsonl');
  });

  it('cancels an in-flight turn and gives up the grant', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    await coordinator.cancelRoom(roomId);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('cancelled');
    expect(api.revoked).toEqual(['grant-1']);
    expect(api.aborted).toEqual(['lead']);
  });

  it('starts nothing when the Room is stopped while a pass is deciding', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    // The record the pass will decide on: a live Room with a member ready.
    const live = await store.readRoom(roomId);
    if (!live) throw new Error('no room');
    const stale = {
      ...live,
      runtime: { ...live.runtime, status: 'running' as const },
      members: live.members.map((member) => ({ ...member, status: 'idle' as const })),
    };

    await coordinator.cancelRoom(roomId);
    api.endTurn('lead', 'aborted');

    // The race itself: the pass reads the Room as running, and the write that
    // marks the turns started sees the cancelled record. Without the re-check
    // inside that write, the Room would go back to running and spend again.
    const readRoom = store.readRoom.bind(store);
    let served = false;
    store.readRoom = async (id: string) => {
      if (id === roomId && !served) {
        served = true;
        return stale;
      }
      return readRoom(id);
    };
    await coordinator.advance(roomId, [{ memberId: 'impl', reason: 'user-intervention', at: host.now() }]);
    store.readRoom = readRoom;

    expect((await store.readRoom(roomId))?.runtime.status).toBe('cancelled');
    expect(api.openTurns()).toEqual([]);
  });

  it('refuses a completion that read the Room before it was cancelled', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // The record the completion will decide on: the Room as it was before the
    // cancel landed. This is the interleaving, not a sequential second call —
    // the completion's own guard reads this stale record and passes.
    const live = await store.readRoom(roomId);
    if (!live) throw new Error('no room');
    const stale = { ...live, runtime: { ...live.runtime, status: 'running' as const } };

    await coordinator.cancelRoom(roomId);
    const artifactsAfterCancel = host.artifacts.size;

    const readRoom = store.readRoom.bind(store);
    let served = false;
    store.readRoom = async (id: string) => {
      if (id === roomId && !served) {
        served = true;
        return stale;
      }
      return readRoom(id);
    };
    const finished = await coordinator.completeRoom(roomId, 'Done.');
    store.readRoom = readRoom;

    // Without the claim inside the write, this would replace `cancelled` with
    // `completed` and deliver the result of a Room the user had stopped.
    expect(finished.ok).toBe(false);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('cancelled');
    expect(host.artifacts.size).toBe(artifactsAfterCancel);
  });

  it('refuses a cancel and a pause once the Room has finished', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    await coordinator.completeRoom(roomId, 'Done.');

    // Both used to write their status unconditionally, so either could bring a
    // finished Room back to `cancelled` or `paused` after its result was sent.
    const cancelled = await coordinator.cancelRoom(roomId);
    const paused = await coordinator.pauseRoom(roomId);

    expect(cancelled.ok).toBe(false);
    expect(paused.ok).toBe(false);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('completed');
  });

  it('lets only one of two concurrent completions deliver', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    const [first, second] = await Promise.all([
      coordinator.completeRoom(roomId, 'Done.'),
      coordinator.completeRoom(roomId, 'Done again.'),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('completed');
  });
});
