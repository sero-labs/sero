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
import type { RoomMessageDraft } from '../rooms/room-messages';
import type { RoomStore } from '../rooms/room-store';
import type { FakeHost } from './fake-host';
import {
  MEMBERS,
  createRoomHarness,
  disposeHarness,
  draftRoomIn,
  envelopeWith,
  member,
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

const message = (overrides: Partial<RoomMessageDraft>): RoomMessageDraft => ({
  id: 'msg', kind: 'direct', fromMemberId: null, toMemberIds: [], body: '', questionId: null,
  inReplyToQuestionId: null, wakeRecipients: true, commandId: 'cmd', createdAt: host.now(), ...overrides,
});

const question = (questionId: string, from: string, to: string): RoomMessageDraft =>
  message({ id: questionId, kind: 'question', fromMemberId: from, toMemberIds: [to],
    body: 'Which patch?', questionId, commandId: `cmd-${questionId}` });

const reply = (questionId: string, from: string, to: string): RoomMessageDraft =>
  message({ id: `a-${questionId}`, kind: 'reply', fromMemberId: from, toMemberIds: [to],
    body: 'The first one.', inReplyToQuestionId: questionId, commandId: `cmd-a-${questionId}` });

/** The durable half of a wait, as `blockOnQuestion` writes it. */
const waitOn = (roomId: string, memberId: string, questionId: string) =>
  store.updateMember(roomId, memberId, (current) => ({
    ...current, status: 'waiting', statusDetail: 'Waiting.', waitingOnQuestionId: questionId,
  }));

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

  it('re-delivers a batch the session never took, without waiting for a restart', async () => {
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

    // The Room hands it to the next turn itself: the cursor never claimed it,
    // and a member holding unread messages in a quiet Room is started.
    const cursorFor = async (id: string) =>
      (await store.readRoom(roomId))?.readCursors.find((entry) => entry.memberId === id);
    await waitFor(() => carries() >= 2, 'the redelivery');
    await waitFor(async () => (await cursorFor('impl'))?.lastReadSequence === 1, 'the cursor to move');

    // That turn took the batch, so a restart delivers nothing again.
    const delivered = carries();
    await restartCoordinator(host, store).reconcileRooms();
    expect((await cursorFor('impl'))?.lease).toBeNull();
    expect((await store.leaseMessagesFor(roomId, 'impl', 20)).messages).toEqual([]);
    expect(carries()).toBe(delivered);
  });

  it('hands over a batch a crash left leased to a turn that never ran', async () => {
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

    // The state a crash leaves: the batch is leased, and the process died before
    // any turn ran with it. Nothing in the Room can know whether it was seen.
    const leased = await store.leaseMessagesFor(roomId, 'impl', 20);
    expect(leased.messages).toHaveLength(1);

    const carries = (): number =>
      api.prompts.filter((entry) => String(entry.content).includes('REVIEW THE PATCH')).length;
    expect(carries()).toBe(0);

    const restarted = restartCoordinator(host, store);
    await restarted.reconcileRooms();
    await waitFor(() => carries() >= 1, 'the replay');
    await waitFor(async () => (await memberOf(roomId, 'impl')).usage.turns === 1, 'the replayed turn to finish');
    expect((await store.readRoom(roomId))?.readCursors.find((entry) => entry.memberId === 'impl')?.lease).toBeNull();
  });

  it('ends a wait the log shows is over, and leaves an open one alone', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // The crash window: the reply is persisted and its command key claimed, but
    // the process died before the waiter was released. The sender cannot retry —
    // the same commandId now reads as a duplicate.
    await store.appendMessages(roomId, [
      question('q-1', 'impl', 'lead'),
      reply('q-1', 'lead', 'impl'),
      question('q-2', 'scout', 'lead'),
    ]);
    await waitOn(roomId, 'impl', 'q-1');
    await waitOn(roomId, 'scout', 'q-2');

    await restartCoordinator(host, store).reconcileRooms();

    // The answer is on record, so the wait is over whether or not anyone woke it.
    const impl = await memberOf(roomId, 'impl');
    expect(impl.waitingOnQuestionId).toBeNull();
    expect(impl.status).not.toBe('waiting');
    // Nothing answers q-2, so that wait is real and stands.
    const scout = await memberOf(roomId, 'scout');
    expect(scout.status).toBe('waiting');
    expect(scout.waitingOnQuestionId).toBe('q-2');
  });

  it('settles a wait in a paused Room, which resumes by waking only the Conductor', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    await store.appendMessages(roomId, [question('q-1', 'impl', 'lead'), reply('q-1', 'lead', 'impl')]);
    await waitOn(roomId, 'impl', 'q-1');
    await store.updateRoom(roomId, (record) => ({
      ...record,
      runtime: { ...record.runtime, status: 'paused' },
    }));

    await restartCoordinator(host, store).reconcileRooms();

    // Recovery corrected the record rather than waking anyone, so the member is
    // schedulable the moment the Room resumes.
    const impl = await memberOf(roomId, 'impl');
    expect(impl.status).toBe('idle');
    expect(impl.waitingOnQuestionId).toBeNull();
    expect((await store.readRoom(roomId))?.runtime.status).toBe('paused');
  });

  it('finds the answer however far back it is', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    await store.appendMessages(roomId, [question('q-1', 'impl', 'lead'), reply('q-1', 'lead', 'impl')]);
    await waitOn(roomId, 'impl', 'q-1');
    // The Room stays busy while the waiter is stuck. A fixed-size window over
    // the newest messages would scroll straight past the answer.
    await store.appendMessages(
      roomId,
      Array.from({ length: 520 }, (_, index) =>
        message({ id: `noise-${index}`, fromMemberId: 'lead', toMemberIds: ['scout'], body: 'Carry on.',
          commandId: `cmd-noise-${index}` }),
      ),
    );

    await restartCoordinator(host, store).reconcileRooms();

    const impl = await memberOf(roomId, 'impl');
    expect(impl.waitingOnQuestionId).toBeNull();
    expect(impl.status).not.toBe('waiting');
  });

  it('does not repeat an interrupted delivery', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    await store.updateRoom(roomId, (record) => ({
      ...record,
      runtime: { ...record.runtime, status: 'completing' },
    }));

    await restartCoordinator(host, store).reconcileRooms();
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('completing');
    expect(record?.runtime.stopReason?.kind).toBe('awaiting-approval');
  });

  it('lets the user cancel a recovered completion without delivering it', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    await store.updateRoom(roomId, (record) => ({
      ...record,
      runtime: { ...record.runtime, status: 'completing' },
    }));
    const artifactsBefore = host.artifacts.size;

    const restarted = restartCoordinator(host, store);
    await restarted.reconcileRooms({ resume: false });
    const cancelled = await restarted.cancelRoom(roomId);

    const record = await store.readRoom(roomId);
    expect(cancelled.ok).toBe(true);
    expect(record?.runtime.status).toBe('cancelled');
    expect(record?.definition.grantId).toBeNull();
    expect(host.persistentSessions.revoked).toEqual(['grant-1']);
    expect(host.artifacts.size).toBe(artifactsBefore);
  });

  it('deletes a recovered completion after revoking its grant and releasing its worktree', async () => {
    const roomId = await draftRoomIn(
      coordinator,
      envelopeWith({ workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' } }),
      [member({ tools: ['read', 'write'], permissions: 'edit-workspace', needsWorktree: true })],
    );
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    await store.updateRoom(roomId, (record) => ({
      ...record,
      runtime: { ...record.runtime, status: 'completing' },
    }));
    const artifactsBefore = host.artifacts.size;

    const restarted = restartCoordinator(host, store);
    await restarted.reconcileRooms({ resume: false });
    const deleted = await restarted.deleteRoom(roomId);

    expect(deleted.ok).toBe(true);
    expect(host.persistentSessions.revoked).toContain('grant-1');
    expect(host.worktreesRemoved).toEqual([`room-${roomId}-lead`]);
    expect(host.artifacts.size).toBe(artifactsBefore);
    expect(await store.readRoom(roomId)).toBeNull();
  });
});
