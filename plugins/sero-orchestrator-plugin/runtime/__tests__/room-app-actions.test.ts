/**
 * The user's Room control surface (phase 7).
 *
 * The planner itself is covered by the planning suite; what matters here is the
 * boundary this surface owns — what the user may change and when, and that the
 * user's word reaches the Room as the ROOM rather than as one of its members.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoomAppActions, limitsForOrigin, type RoomAppActions } from '../rooms/room-app-actions';
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
let app: RoomAppActions;

const draftRoom = () => draftRoomIn(coordinator, envelopeWith(), MEMBERS);

beforeEach(async () => {
  ({ dir, host, store, coordinator } = await createRoomHarness());
  app = createRoomAppActions({ host, store, coordinator, workspaceId: 'ws-1' });
});

afterEach(() => disposeHarness(dir));

describe('the user Room surface', () => {
  it('will not plan an empty brief', async () => {
    const outcome = await app.prepare({ problem: '   ' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.needsInput) throw new Error('expected a refusal');
    expect(outcome.error).toContain('what the Room is for');
  });

  it('sends a Room a chat asked for back to that chat (FR-029)', () => {
    // The planner never chooses a destination, so a chat-origin Room used to
    // take the access default and answer the workspace instead of the chat.
    expect(limitsForOrigin({ problem: 'x', originSessionId: 'sess-9' })?.deliveryDestination).toBe('invoking-chat');
    // A destination the caller named is never overruled.
    expect(
      limitsForOrigin({ problem: 'x', originSessionId: 'sess-9', limits: { deliveryDestination: 'pr' } })
        ?.deliveryDestination,
    ).toBe('pr');
    // A Room started in the panel has no chat to answer.
    expect(limitsForOrigin({ problem: 'x' })).toBeUndefined();
  });

  it('refuses a preset it does not have rather than planning without one', async () => {
    const outcome = await app.prepare({ problem: 'ship the fix', presetId: 'not-a-preset' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.needsInput) throw new Error('expected a refusal');
    expect(outcome.error).toContain('not-a-preset');
  });

  it('refuses to re-plan a Room that has already started', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);

    const outcome = await app.adjust(roomId, 'drop the researcher');
    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.needsInput) throw new Error('expected a refusal');
    // Re-planning a running Room would rebuild the roster under the members'
    // feet. A running team changes through a revision instead.
    expect(outcome.error).toContain('revision');
  });

  it('tells the Room as the Room, and wakes who it reached', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberIn(store, roomId, 'lead')).usage.turns === 1, 'the first turn');

    const outcome = await app.intervene(roomId, 'Stop and check the migration first.', ['impl']);
    expect(outcome.ok).toBe(true);

    const messages = await store.readMessages(roomId, 0, 50);
    const told = messages.filter((message) => message.body.includes('migration'));
    expect(told).toHaveLength(1);
    // A system notice, not a peer message: it comes from outside the roster, so
    // no member can forge one and nothing about it can be argued with.
    expect(told[0].kind).toBe('system');
    expect(told[0].fromMemberId).toBeNull();
    expect(told[0].toMemberIds).toEqual(['impl']);
    // The user is waiting on it, so it never sits in a queue.
    expect(told[0].wakeRecipients).toBe(true);
  });

  it('addresses everyone still in the Room when no member is named', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    const outcome = await app.intervene(roomId, 'Wrap up what you have.');
    expect(outcome.ok).toBe(true);

    const messages = await store.readMessages(roomId, 0, 50);
    const told = messages.find((message) => message.body.includes('Wrap up'));
    expect(told?.toMemberIds).toEqual(MEMBERS.map((member) => member.key));
  });

  it('restarts a Room that stopped waiting for the user, and only that one', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberIn(store, roomId, 'lead')).usage.turns === 1, 'the first turn');
    await store.updateMember(roomId, 'impl', (member) => ({
      ...member,
      status: 'blocked',
      statusDetail: 'Needs the user: which database?',
    }));
    await store.updateRoom(roomId, (record) => ({
      ...record,
      runtime: {
        ...record.runtime,
        status: 'paused',
        stopReason: { kind: 'awaiting-user', detail: 'Implementer needs you: which database?', at: 't1' },
      },
    }));

    // The Room stopped for this answer. Delivering it and leaving the Room
    // stopped would answer the question and change nothing.
    expect((await app.intervene(roomId, 'Use Postgres.', ['impl'])).ok).toBe(true);
    await waitFor(async () => (await store.readRoom(roomId))?.runtime.status !== 'paused', 'the Room to carry on');
    expect((await memberIn(store, roomId, 'impl')).status).not.toBe('blocked');
  });

  it('leaves a Room the user paused paused, whatever else they say to it', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await coordinator.pauseRoom(roomId, 'Paused.');
    await waitFor(async () => (await store.readRoom(roomId))?.runtime.status === 'paused', 'the pause');

    expect((await app.intervene(roomId, 'A note for later.')).ok).toBe(true);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('paused');
  });

  it('answers for a waiting member, and the answer settles the wait', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await store.updateMember(roomId, 'impl', (member) => ({
      ...member,
      status: 'waiting',
      statusDetail: 'Waiting for an answer from the Conductor.',
      waitingOnQuestionId: 'q-1',
    }));

    const outcome = await app.answer(roomId, 'impl', 'It keys on the identifier.');
    expect(outcome.ok).toBe(true);

    const messages = await store.readMessages(roomId, 0, 50);
    const answer = messages.find((message) => message.body.includes('identifier'));
    // The question id is what settles the wait — after a restart the message is
    // all that is left to prove the answer arrived.
    expect(answer?.inReplyToQuestionId).toBe('q-1');
    expect(answer?.fromMemberId).toBeNull();
    expect(answer?.toMemberIds).toEqual(['impl']);
    await waitFor(async () => (await memberIn(store, roomId, 'impl')).waitingOnQuestionId === null, 'the wait to end');
  });

  it('releases a member from a question nobody will answer', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await store.updateMember(roomId, 'impl', (member) => ({
      ...member,
      status: 'waiting',
      waitingOnQuestionId: 'q-2',
    }));

    expect(await app.release(roomId, 'impl')).toEqual({ ok: true });
    const messages = await store.readMessages(roomId, 0, 50);
    const cancelled = messages.find((message) => message.kind === 'cancel');
    expect(cancelled?.questionId).toBe('q-2');
  });

  it('will not answer for a member that is not waiting', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    expect(await app.answer(roomId, 'impl', 'here you go')).toEqual({
      ok: false,
      error: 'Implementer is not waiting on a question.',
    });

    // A member that has already been woken carries its old question id until
    // its turn starts. Answering then would write a reply to a question nobody
    // is blocked on any more.
    await store.updateMember(roomId, 'impl', (member) => ({
      ...member,
      status: 'working',
      waitingOnQuestionId: 'q-old',
    }));
    expect(await app.answer(roomId, 'impl', 'here you go')).toEqual({
      ok: false,
      error: 'Implementer is not waiting on a question.',
    });
  });

  it('refuses to wake somebody who is not a member', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    const outcome = await app.wake(roomId, 'nobody');
    expect(outcome).toEqual({ ok: false, error: 'nobody is not a member this Room can put back to work.' });
  });

  it('will not claim a wake it cannot deliver', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await store.updateMember(roomId, 'impl', (member) => ({ ...member, status: 'suspended' }));

    // The Conductor suspended it; a wake does not resume it, so saying "awake"
    // would report something the scheduler will never do.
    expect(await app.wake(roomId, 'impl')).toEqual({
      ok: false,
      error: 'impl is not a member this Room can put back to work.',
    });

    await store.updateMember(roomId, 'impl', (member) => ({ ...member, status: 'idle' }));
    await app.pause(roomId, 'Standing it down.');
    expect(await app.wake(roomId, 'impl')).toEqual({
      ok: false,
      error: 'This Room is not running, so nobody can take a turn yet.',
    });
  });

  it('says nothing more reaches a Room that has finished', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await store.updateMember(roomId, 'impl', (member) => ({
      ...member,
      status: 'waiting',
      waitingOnQuestionId: 'q-3',
    }));
    await app.cancel(roomId, 'Not needed after all.');

    // Every one of these would otherwise report a send that reached nobody:
    // the member sessions are closed once the Room stops.
    const gone = { ok: false, error: 'This Room has finished. Nothing more reaches its members.' };
    expect(await app.intervene(roomId, 'one more thing')).toEqual(gone);
    expect(await app.wake(roomId, 'impl')).toEqual(gone);
    expect(await app.answer(roomId, 'impl', 'here you go')).toEqual(gone);
    expect(await app.release(roomId, 'impl')).toEqual(gone);
    expect(await store.readMessages(roomId, 0, 50)).toHaveLength(0);
  });

  it('answers a Room it cannot find without touching anything', async () => {
    expect(await app.start('room-nope')).toEqual({ ok: false, error: 'Room not found: room-nope' });
    expect(await app.intervene('room-nope', 'hello')).toEqual({ ok: false, error: 'Room not found: room-nope' });
  });
});
