/**
 * The user's Room control surface (phase 7).
 *
 * The planner itself is covered by the planning suite; what matters here is the
 * boundary this surface owns — what the user may change and when, and that the
 * user's word reaches the Room as the ROOM rather than as one of its members.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoomAppActions, type RoomAppActions } from '../rooms/room-app-actions';
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

  it('refuses to wake somebody who is not a member', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    const outcome = await app.wake(roomId, 'nobody');
    expect(outcome).toEqual({ ok: false, error: 'nobody is not an active member of this Room.' });
  });

  it('answers a Room it cannot find without touching anything', async () => {
    expect(await app.start('room-nope')).toEqual({ ok: false, error: 'Room not found: room-nope' });
    expect(await app.intervene('room-nope', 'hello')).toEqual({ ok: false, error: 'Room not found: room-nope' });
  });
});
