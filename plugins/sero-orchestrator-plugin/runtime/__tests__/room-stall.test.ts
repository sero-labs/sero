import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemberStatus } from '../../shared/room-types';
import type { RoomMessageDraft } from '../rooms/room-messages';
import type { RoomCoordinator } from '../rooms/room-coordinator';
import type { RoomStore } from '../rooms/room-store';
import type { FakeHost } from './fake-host';
import { MEMBERS, createRoomHarness, disposeHarness, draftRoomIn, envelopeWith, waitFor } from './room-harness';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;

beforeEach(async () => {
  ({ dir, host, store, coordinator } = await createRoomHarness());
  host.persistentSessions.mode = 'manual';
});

afterEach(() => disposeHarness(dir));

async function waitingRoom(statuses: { impl: MemberStatus; scout: MemberStatus }): Promise<string> {
  const roomId = await draftRoomIn(coordinator, envelopeWith(), MEMBERS);
  const question: RoomMessageDraft = {
    id: 'msg-question', kind: 'question', fromMemberId: 'lead', toMemberIds: ['impl', 'scout'],
    body: 'Which parser should we use?', questionId: 'q-1', inReplyToQuestionId: null,
    wakeRecipients: true, commandId: 'cmd-question', createdAt: host.now(),
  };
  await store.appendMessages(roomId, [question]);
  await store.updateRoom(roomId, (room) => ({
    ...room,
    runtime: { ...room.runtime, status: 'running', lastProgressAt: host.now() },
    members: room.members.map((member) => {
      if (member.id === 'lead') return { ...member, status: 'waiting', waitingOnQuestionId: 'q-1' };
      return { ...member, status: statuses[member.id as 'impl' | 'scout'] };
    }),
  }));
  return roomId;
}

describe('Room question stalls', () => {
  it.each<MemberStatus>(['retired', 'suspended', 'blocked', 'failed'])(
    'releases the asker when all answerers are %s',
    async (status) => {
      const roomId = await waitingRoom({ impl: status, scout: status });

      await coordinator.tick();
      await waitFor(async () => (await store.readMember(roomId, 'lead'))?.waitingOnQuestionId === null);

      const messages = await store.readMessages(roomId, 0, 20);
      expect(messages.at(-1)).toMatchObject({ kind: 'system', toMemberIds: ['lead'], inReplyToQuestionId: 'q-1' });
      expect(messages.at(-1)?.body).toContain('did not answer');
    },
  );

  it('keeps waiting and reminds an idle answerer when another addressee is unavailable', async () => {
    const roomId = await waitingRoom({ impl: 'retired', scout: 'idle' });

    await coordinator.tick();

    expect((await store.readMember(roomId, 'lead'))?.waitingOnQuestionId).toBe('q-1');
    expect((await store.readMessages(roomId, 0, 20)).at(-1)).toMatchObject({
      kind: 'system', toMemberIds: ['scout'], inReplyToQuestionId: null,
    });
  });
});
