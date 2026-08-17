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
import { withRoomStatus } from '../rooms/room-actions';
import type { FakeHost } from './fake-host';
import {
  MEMBERS,
  createRoomHarness,
  disposeHarness,
  draftRoomIn,
  envelopeWith,
  member,
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
  it('lets only one concurrent Start obtain a grant', async () => {
    const roomId = await draftRoom();

    const [first, second] = await Promise.all([
      coordinator.startRoom(roomId),
      coordinator.startRoom(roomId),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(host.persistentSessions.proposals).toHaveLength(1);
    expect((await store.readRoom(roomId))?.definition.grantId).toBe('grant-1');
  });

  it('asks for the tools the grant gave, not the ones the proposal asked for', async () => {
    // The host removes a tool the member's permission level does not allow. A
    // session that keeps asking for it is denied, and the Room pauses with no
    // turns taken — so the granted set is what the request must carry.
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    const requestGrant = api.requestGrant.bind(api);
    api.requestGrant = async (proposal) => requestGrant({
      ...proposal,
      subjects: Object.fromEntries(Object.entries(proposal.subjects).map(([subject, policy]) => [
        subject,
        { ...policy, allowedTools: policy.allowedTools.filter((tool) => tool !== 'read') },
      ])),
    });

    expect((await coordinator.startRoom(roomId)).ok).toBe(true);
    const opened = api.requests.filter((request) => request.subject === 'lead');
    expect(opened.length).toBeGreaterThan(0);
    expect(opened[0].tools).not.toContain('read');
    expect(opened[0].tools).toContain('sero-cli');
  });

  it('revokes a grant approved after Delete invalidated Start', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    const requestGrant = api.requestGrant.bind(api);
    let entered = (): void => undefined;
    let finish = (): void => undefined;
    const approvalEntered = new Promise<void>((resolve) => { entered = resolve; });
    const approvalGate = new Promise<void>((resolve) => { finish = resolve; });
    api.requestGrant = async (proposal) => {
      entered();
      await approvalGate;
      return requestGrant(proposal);
    };

    const starting = coordinator.startRoom(roomId);
    await approvalEntered;
    await coordinator.deleteRoom(roomId);
    finish();

    expect((await starting).ok).toBe(false);
    expect(api.revoked).toContain('grant-1');
    expect(await store.readRoom(roomId)).toBeNull();
  });

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

  it('preserves live work and deletes grant history when the Room is deleted', async () => {
    const roomId = await draftRoom(
      envelopeWith({
        workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
      }),
      [member(), member({
        key: 'impl', displayName: 'Implementer', role: 'Implementer', isConductor: false,
        tools: ['read', 'write'], permissions: 'edit-workspace', needsWorktree: true,
      })],
    );
    await coordinator.startRoom(roomId);
    await coordinator.deleteRoom(roomId);

    expect(host.checkpoints.length).toBeGreaterThan(0);
    expect(host.persistentSessions.deleted).toEqual(['grant-1']);
    expect(await store.readRoom(roomId)).toBeNull();
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

  it('stays "completing" until the result is out and the grant is gone', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // Revocation is the last thing completion does before it clears the marker,
    // and it runs after delivery. Marking the Room `completed` any earlier would
    // make a crash in here indistinguishable from a Room that finished cleanly,
    // and recovery would never know the result had not gone out.
    const api = host.persistentSessions;
    let statusAtRevoke: string | null = null;
    const revokeGrant = api.revokeGrant.bind(api);
    api.revokeGrant = async (grantId: string) => {
      statusAtRevoke ??= (await store.readRoom(roomId))?.runtime.status ?? null;
      return revokeGrant(grantId);
    };

    await coordinator.completeRoom(roomId, 'Done.');
    api.revokeGrant = revokeGrant;

    expect(statusAtRevoke).toBe('completing');
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('completed');
    // The marker is only cleared once the grant has gone too.
    expect(record?.definition.grantId).toBeNull();
    expect(host.persistentSessions.revoked).toEqual(['grant-1']);
    // Ending the work is what stamps the clock, not clearing the marker.
    expect(record?.runtime.endedAt).not.toBeNull();
  });

  it('does not abort or checkpoint when the cancel loses the race', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    // A turn is left running, so there is something for a losing cancel to
    // wrongly abort. Without one the test could not tell the two orders apart.
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    // A completion that has claimed the Room and is still finishing — the state
    // a cancel can actually lose to while the Room is still live.
    await store.updateRoom(roomId, (current) => withRoomStatus(current, 'completing', host.now(), null));

    const abortedBefore = [...api.aborted];
    const checkpointsBefore = host.checkpoints.length;

    // A refused cancel must be a no-op. Aborting turns and running a second
    // checkpoint pass across the same worktrees would interrupt the completion
    // that won and race its own preservation.
    const cancelled = await coordinator.cancelRoom(roomId);

    expect(cancelled.ok).toBe(false);
    expect(api.aborted).toEqual(abortedBefore);
    expect(host.checkpoints).toHaveLength(checkpointsBefore);
  });

  it('settles a pause even when the turn that ended read a stale Room', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    // The pause lands while the turn is still running, so it records `pausing`
    // and waits for that turn to settle it.
    await coordinator.pauseRoom(roomId);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('pausing');

    // The record the ending turn will read: the Room as it was BEFORE the pause.
    // Deciding the settle on this, the turn sees `running`, does nothing, and
    // the Room is left in `pausing` with nothing left to move it.
    const live = await store.readRoom(roomId);
    if (!live) throw new Error('no room');
    const stale = { ...live, runtime: { ...live.runtime, status: 'running' as const } };
    const readRoom = store.readRoom.bind(store);
    let served = false;
    store.readRoom = async (id: string) => {
      if (id === roomId && !served) {
        served = true;
        return stale;
      }
      return readRoom(id);
    };

    api.endTurn('lead');
    await waitFor(async () => (await readRoom(roomId))?.runtime.status === 'paused', 'the pause to settle');
    store.readRoom = readRoom;

    expect((await store.readRoom(roomId))?.runtime.status).toBe('paused');
  });

  it('settles a pause when the last turn ends during the pause write', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    // The invariant, not one interleaving: however a pause and the end of the
    // last turn overlap, the Room must not be left in `pausing` with nothing
    // able to move it. The turn is ended as soon as the pause has sampled it.
    //
    // The store updates its cache only after the write reaches disk, so a reader
    // inside that window still sees `running`. `settlePause` re-checks once its
    // own write is durable to cover that; this test does not isolate that window
    // on its own, and guards the surrounding behaviour instead.
    const transact = store.transact.bind(store);
    let armed = true;
    store.transact = (id, commandId, decide) =>
      transact(id, commandId, (current) => {
        const decision = decide(current);
        if (id === roomId && armed) {
          armed = false;
          api.endTurn('lead');
        }
        return decision;
      });
    await coordinator.pauseRoom(roomId);
    store.transact = transact;

    await waitFor(async () => (await store.readRoom(roomId))?.runtime.status === 'paused', 'the pause to settle');
    expect((await store.readRoom(roomId))?.runtime.status).toBe('paused');
  });

  it('finishes cleanup a restart interrupted after a cancel', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // A crash between claiming `cancelled` and finishing the cleanup: the Room
    // reads as terminal, but its work was never checkpointed and its grant is
    // still live. Holding a grant is what says the cleanup never finished.
    await store.updateRoom(roomId, (current) =>
      withRoomStatus({ ...current, definition: { ...current.definition, grantId: 'grant-1' } }, 'cancelled', host.now()));
    api.revoked.length = 0;

    await coordinator.reconcileRooms({ resume: false });

    const record = await store.readRoom(roomId);
    expect(record?.definition.grantId).toBeNull();
    expect(api.revoked).toEqual(['grant-1']);
  });

  it('revokes authority and returns an interrupted Start to draft on restart', async () => {
    const roomId = await draftRoom();
    await store.updateRoom(roomId, (current) => ({
      ...withRoomStatus(current, 'starting', host.now(), null),
      definition: { ...current.definition, grantId: 'grant-1', historyGrantId: 'grant-1' },
    }));

    await coordinator.reconcileRooms({ resume: false });

    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('draft');
    expect(record?.definition.grantId).toBeNull();
    expect(host.persistentSessions.revoked).toEqual(['grant-1']);
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
