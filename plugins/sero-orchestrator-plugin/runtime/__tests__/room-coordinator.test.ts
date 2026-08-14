/**
 * Room coordinator: lifecycle, the scheduling pass and the event wake path.
 * Restart recovery has its own suite in room-recovery.test.ts.
 *
 * Every test runs on a real store in a temp dir and the fake persistent-session
 * capability, so the properties under test are the real ones — one writer, one
 * turn per member, capacity honoured, and the grant released when the Room
 * finishes.
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

describe('starting a Room', () => {
  it('takes one grant with a subject per member, then gives the Conductor the first turn', async () => {
    const roomId = await draftRoom();
    const drafted = await store.readRoom(roomId);
    // A draft holds no authority and nothing that could run.
    expect(drafted?.definition.grantId).toBeNull();
    expect(drafted?.members.every((entry) => entry.status === 'offline')).toBe(true);

    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    const [proposal] = host.persistentSessions.proposals;
    expect(host.persistentSessions.proposals).toHaveLength(1);
    expect(Object.keys(proposal.subjects)).toEqual(['lead', 'impl', 'scout']);

    const record = await store.readRoom(roomId);
    expect(record?.definition.grantId).toBe('grant-1');
    expect(record?.runtime.status).toBe('running');
    // Only the Conductor ran: nobody else was signalled.
    expect(host.persistentSessions.sessions.has('lead')).toBe(true);
    expect(host.persistentSessions.sessions.has('impl')).toBe(false);
    expect(record?.runtime.activeMemberIds).toEqual([]);
    expect((await memberOf(roomId, 'lead')).status).toBe('idle');
    // Cumulative session usage is assigned, never accumulated.
    expect(record?.runtime.usage.costUsd).toBe(0.25);
  });

  it('loads the Room protocol with the session, and never repeats it in a turn', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // The protocol is a SESSION resource (spec §14.5). In a turn body the first
    // compaction would summarise it away, and the member could no longer name
    // the command that ends its own wait.
    const additions = host.persistentSessions.requests[0].systemPromptAdditions?.join('\n') ?? '';
    expect(additions).toContain('## Room protocol');
    expect(additions).toContain('finish-room');

    const first = String(host.persistentSessions.prompts[0].content);
    expect(first).toContain('## Room brief');
    expect(first).not.toContain('## Room protocol');

    await coordinator.wake(roomId, 'lead', 'user-intervention');
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 2, 'the second turn');
    expect(String(host.persistentSessions.prompts[1].content)).not.toContain('## Room protocol');
  });

  it('gives the lead a turn when the Room falls quiet with work still open', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // A member finished something and said nothing to anyone. Only the Conductor
    // can decide what that means for the Room, and nothing else would wake it —
    // this silence used to run out the no-progress clock and land on the user.
    await coordinator.noteStructuralProgress(roomId, 'Implementer finished the parser.');

    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 2, 'the lead deciding');
  });

  it('chases the answer when the member that owes it has gone idle', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // The lead asked and stopped to wait. The implementer read the question,
    // did the work and finished its turn without replying — so no reply event
    // is ever coming, and only the implementer can end the lead's wait.
    await coordinator.mailbox.ask(roomId, {
      fromMemberId: 'lead',
      toMemberIds: ['impl'],
      body: 'Which file holds the parser?',
      commandId: 'cmd-ask-1',
    });
    await waitFor(async () => (await memberOf(roomId, 'impl')).usage.turns === 1, 'the implementer turn');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'waiting', 'the lead waiting');

    await coordinator.noteStructuralProgress(roomId, 'Implementer finished the parser.');
    await waitFor(async () => (await memberOf(roomId, 'impl')).usage.turns === 2, 'the implementer chased');
    expect((await memberOf(roomId, 'lead')).status).toBe('waiting');
    const prompt = String(host.persistentSessions.prompts.at(-1)?.content);
    expect(prompt).toContain('Which file holds the parser?');
  });

  it('does not wake the lead twice for the same silence', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    await coordinator.noteStructuralProgress(roomId, 'Implementer finished the parser.');
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 2, 'the lead deciding');
    // The lead's own turn changed nothing, so the Room is quiet again for the
    // same reason. Waking it on that would spend the whole budget on one member
    // being asked the same question.
    await coordinator.advance(roomId);
    await coordinator.advance(roomId);

    expect((await memberOf(roomId, 'lead')).usage.turns).toBe(2);
  });

  it('pauses the Room when the Conductor cannot start', async () => {
    const roomId = await draftRoom();
    host.persistentSessions.refuseGrant = true;

    const result = await coordinator.startRoom(roomId);
    expect(result.ok).toBe(false);
    // The user has to know whether they refused, or were never asked.
    expect(result.ok ? '' : result.error).toContain('the user declined this Room');
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('draft');
    expect(record?.definition.grantId).toBeNull();
  });

  it('says WHY the Conductor could not start', async () => {
    const roomId = await draftRoom();
    // The state a misconfigured host lands in. Without the cause the user is
    // sent to a log file to find out that a model was unavailable.
    host.persistentSessions.failNextCreate = 'Model anthropic/claude-haiku-4-5 is not available on this machine.';

    const result = await coordinator.startRoom(roomId);
    expect(result.ok).toBe(false);

    const record = await store.readRoom(roomId);
    expect(record?.runtime.stopReason?.kind).toBe('conductor-failed');
    expect(record?.runtime.stopReason?.detail).toContain('not available on this machine');
    expect((await memberOf(roomId, 'lead')).statusDetail).toContain('not available on this machine');
  });
});

describe('the scheduling pass', () => {
  it('holds a slot back for the Conductor and runs the rest in wake order', async () => {
    const roomId = await draftRoom(envelopeWith({ maxActiveTurns: 2 }));
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'idle', 'the Conductor to finish');

    await coordinator.wake(roomId, 'impl', 'direct-message');
    await coordinator.wake(roomId, 'scout', 'direct-message');
    await waitFor(() => api.openTurns().includes('impl'), 'the Implementer turn');

    // Two active turns are allowed, but one is reserved for the Conductor, so
    // only one of the two woken members runs.
    expect(api.openTurns()).toEqual(['impl']);
    expect((await memberOf(roomId, 'scout')).status).toBe('idle');

    // The freed slot is an event: Scout starts without any tick.
    api.endTurn('impl');
    await waitFor(() => api.openTurns().includes('scout'), 'the Scout turn');
    api.endTurn('scout');
    await waitFor(async () => (await memberOf(roomId, 'scout')).usage.turns === 1, 'Scout to finish');
  });

  it('never runs two turns for one member, whatever wakes arrive', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    await coordinator.wake(roomId, 'lead', 'reply-received');
    await coordinator.wake(roomId, 'lead', 'user-intervention');
    expect(api.openTurns()).toEqual(['lead']);
    expect(api.prompts).toHaveLength(1);

    api.endTurn('lead');
    // The wakes it collected while running are still owed, so it runs again.
    await waitFor(() => api.prompts.length === 2, 'the second turn');
  });

  it('wakes a waiting member with its reply and clears the wait in the same step', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'idle', 'the Conductor to finish');

    await store.updateMember(roomId, 'impl', (current) => ({
      ...current,
      status: 'waiting',
      statusDetail: 'Asked the Conductor a question.',
      waitingOnQuestionId: 'q-1',
    }));
    // A waiting member is not schedulable, so a bare signal would be dropped.
    await coordinator.advance(roomId, [{ memberId: 'impl', reason: 'assigned-work', at: host.now() }]);
    expect(api.openTurns()).toEqual([]);

    await coordinator.wake(roomId, 'impl', 'reply-received');
    await waitFor(() => api.openTurns().includes('impl'), 'the reply turn');
    expect((await memberOf(roomId, 'impl')).waitingOnQuestionId).toBeNull();
  });

  it('gives a waiting member no execution slot', async () => {
    // Two active turns, one of them reserved for the Conductor: exactly one
    // general slot. If waiting held it, Scout could not run at all.
    const roomId = await draftRoom(envelopeWith({ maxActiveTurns: 2 }));
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'idle', 'the Conductor to finish');

    await store.updateMember(roomId, 'impl', (current) => ({
      ...current,
      status: 'waiting',
      statusDetail: 'Asked a question.',
      waitingOnQuestionId: 'q-1',
    }));

    await coordinator.wake(roomId, 'scout', 'direct-message');
    await waitFor(() => api.openTurns().includes('scout'), 'the Scout turn');
    // The waiting member is not running and is not counted as running.
    expect(api.openTurns()).toEqual(['scout']);
    expect((await store.readRoom(roomId))?.runtime.activeMemberIds).toEqual(['scout']);
    expect((await memberOf(roomId, 'impl')).status).toBe('waiting');
  });
});

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
});

describe('limits and the no-progress ladder', () => {
  it('tells the Conductor first, and pauses only when nothing changed', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // Nothing has progressed structurally since the Room started.
    await store.updateRoom(roomId, (record) => ({
      ...record,
      definition: { ...record.definition, envelope: { ...record.definition.envelope, maxIdleMs: 1 } },
    }));

    await coordinator.advance(roomId);
    const warned = await store.readRoom(roomId);
    expect(warned?.runtime.stopReason?.kind).toBe('no-progress');
    // Still running, and the Conductor was told.
    expect(warned?.runtime.status).toBe('running');
    const messages = await store.readMessages(roomId, 0, 10);
    expect(messages.at(-1)?.toMemberIds).toEqual(['lead']);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 2, 'the Conductor to be woken');

    await coordinator.advance(roomId);
    await waitFor(async () => (await store.readRoom(roomId))?.runtime.status === 'paused', 'the ladder to pause');
    expect((await store.readRoom(roomId))?.runtime.stopReason?.kind).toBe('no-progress');
  });

  it('pauses on a hard limit and stops starting turns', async () => {
    const roomId = await draftRoom(envelopeWith({ maxCostUsd: 0.2 }));
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    // The first turn cost more than the Room's ceiling, so the next pass stops.
    await waitFor(async () => (await store.readRoom(roomId))?.runtime.status === 'paused', 'the limit pause');
    const record = await store.readRoom(roomId);
    expect(record?.runtime.stopReason?.kind).toBe('limit-reached');
    await waitFor(() => host.notifications.some((entry) => entry.type === 'warning'), 'the limit warning');
  });

  it('rebuilds the brief only on structural progress', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');
    const afterTurn = await store.readRoom(roomId);
    expect(afterTurn?.runtime.lastProgressAt).toBeNull();

    await coordinator.noteStructuralProgress(roomId, 'The plan was agreed.');
    const afterProgress = await store.readRoom(roomId);
    expect(afterProgress?.runtime.lastProgressAt).not.toBeNull();
    expect(afterProgress?.brief.updatedAt).not.toBe(afterTurn?.brief.updatedAt);
  });
});
