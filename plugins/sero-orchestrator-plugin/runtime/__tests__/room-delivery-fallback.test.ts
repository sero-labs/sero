import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomApprovalRequest } from '../../shared/room-message-types';
import { buildDeliveryBinding } from '../rooms/room-delivery-binding';
import { deliverRoomResult } from '../rooms/room-delivery';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import type { RoomRecord } from '../rooms/room-state';
import { createFakeHost, type FakeHost } from './fake-host';
import { MEMBERS, envelopeWith, roomFixture } from './room-member-fixtures';

const SENT = 'The team shipped it.';
const receipt = {
  destination: 'chat-post' as const,
  ref: 'https://chat.test/p/1',
  summary: 'Posted the result.',
  deliveredAt: '2026-01-01T00:00:00.000Z',
  approvalId: 'appr-x',
};

let dir: string;
let host: FakeHost;
let store: RoomStore;

function makeContext(): AppRuntimeContext {
  const appState = {
    read: async (file: string) => (existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null),
    update: async (file: string, updater: (current: unknown) => unknown) => {
      const current = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
  };
  return { stateFilePath: path.join(dir, 'state.json'), host: { appState } } as unknown as AppRuntimeContext;
}

function approvedDelivery(): RoomApprovalRequest {
  return {
    id: 'appr-x',
    roomId: 'room-a',
    requestedByMemberId: 'impl',
    title: 'Post the result',
    reason: 'The team needs it.',
    consequence: 'The result leaves Sero.',
    affects: 'Chat post',
    estimatedCostUsd: null,
    kind: 'external-write',
    permissionsAfter: null,
    status: 'approved',
    delivery: buildDeliveryBinding('chat-post', { channel: '#team' }, SENT),
    consumedAt: null,
    createdAt: 't1',
    resolvedAt: 't2',
  };
}

async function seed(approved = false): Promise<void> {
  const fixture = roomFixture(envelopeWith(), MEMBERS);
  const record: RoomRecord = {
    ...fixture,
    approvals: approved ? [approvedDelivery()] : [],
    delivery: {
      ...fixture.delivery,
      destination: 'chat-post',
      params: { channel: '#team' },
      originSessionId: 'sess-9',
      originWorkspaceId: 'ws-1',
    },
  };
  await store.updateState((state) => ({ ...state, rooms: [record] }));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sero-room-delivery-fallback-'));
  host = createFakeHost();
  store = createRoomStore(makeContext());
});

afterEach(async () => rm(dir, { recursive: true, force: true }));

describe('external delivery with an invoking-chat return', () => {
  it('does not record a refused external destination as delivered when the chat return succeeds', async () => {
    await seed();

    const outcome = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: SENT });

    expect(outcome).toMatchObject({ ok: false, returnedToChat: true, ref: 'session:sess-9' });
    const record = await store.readRoom('room-a');
    expect(record?.delivery).toMatchObject({
      deliveredAt: null,
      deliveryRef: null,
      originReturnRef: 'session:sess-9',
    });
    const timeline = await store.readTimeline('room-a', 10);
    expect(timeline.at(-1)).toMatchObject({
      summary: 'Result delivered to invoking-chat.',
      details: { ref: 'session:sess-9' },
    });
  });

  it('records the declared destination ref on success and keeps the chat return separate', async () => {
    await seed(true);

    const outcome = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: SENT, receipt });

    expect(outcome).toMatchObject({ ok: true, returnedToChat: true, ref: receipt.ref });
    const record = await store.readRoom('room-a');
    expect(record?.delivery).toMatchObject({
      deliveryRef: receipt.ref,
      originReturnRef: 'session:sess-9',
    });
    const timeline = await store.readTimeline('room-a', 10);
    expect(timeline.at(-1)).toMatchObject({
      summary: 'Result delivered to chat-post.',
      details: { ref: receipt.ref },
    });
  });

  it('retries a failed chat return without marking the refused destination or sending twice after success', async () => {
    await seed();
    host.failNextContextSend = 'session is busy';

    const failed = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: SENT });
    expect(failed).toMatchObject({ ok: false, returnedToChat: false, ref: null });
    expect((await store.readRoom('room-a'))?.delivery).toMatchObject({
      deliveredAt: null,
      deliveryRef: null,
      originReturnedAt: null,
      originReturnRef: null,
    });

    const retried = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: SENT });
    expect(retried).toMatchObject({ ok: false, returnedToChat: true, ref: 'session:sess-9' });
    const duplicate = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: SENT });
    expect(duplicate).toMatchObject({ ok: false, returnedToChat: false, ref: null });
    expect(host.sessionSends).toHaveLength(1);
  });
});
