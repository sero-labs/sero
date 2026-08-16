import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RoomMessageDraft } from '../rooms/room-messages';
import { createWaitIndex } from '../rooms/room-waits';
import type { RoomCoordinator } from '../rooms/room-coordinator';
import type { RoomStore } from '../rooms/room-store';
import type { FakeHost } from './fake-host';
import { MEMBERS, createRoomHarness, disposeHarness, draftRoomIn, envelopeWith } from './room-harness';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;

beforeEach(async () => {
  ({ dir, host, store, coordinator } = await createRoomHarness());
});

afterEach(() => disposeHarness(dir));

describe('durable Room waits', () => {
  it('finds an open question more than 500 messages behind the head after restart', async () => {
    const roomId = await draftRoomIn(coordinator, envelopeWith(), MEMBERS);
    const drafts: RoomMessageDraft[] = [{
      id: 'msg-question', kind: 'question', fromMemberId: 'impl', toMemberIds: ['lead'], body: 'Which key?',
      questionId: 'q-old', inReplyToQuestionId: null, wakeRecipients: true, commandId: 'cmd-question', createdAt: host.now(),
    }];
    for (let index = 0; index < 501; index += 1) {
      drafts.push({
        id: `msg-${index}`, kind: 'system', fromMemberId: null, toMemberIds: ['lead'], body: `Update ${index}`,
        questionId: null, inReplyToQuestionId: null, wakeRecipients: false, commandId: `cmd-${index}`, createdAt: host.now(),
      });
    }
    await store.appendMessages(roomId, drafts);
    const record = await store.readRoom(roomId);
    if (!record) throw new Error('no room');

    const found = await createWaitIndex(store).find(record, 'q-old');

    expect(found?.id).toBe('msg-question');
  });
});
