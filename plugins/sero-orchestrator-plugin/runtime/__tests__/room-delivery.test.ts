/**
 * The Room approval inbox and the return to the invoking chat.
 *
 * Every test runs on the real store in a temp dir, so what the home inbox would
 * read is the file the runtime actually wrote — and the two authority rules
 * (only the user resolves an approval; nothing external ships without an
 * approved token) are exercised through the same door the runtime uses.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { RoomApprovalRequest } from '../../shared/room-message-types';
import type { RoomIndex } from '../../shared/room-types';
import {
  deliverRoomResult,
  formatRoomResult,
  receiptProblems,
  requestDeliveryApproval,
  resolveApprovalForUser,
  toRoomAttention,
} from '../rooms/room-delivery';
import { buildDeliveryBinding } from '../rooms/room-delivery-binding';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import type { RoomRecord } from '../rooms/room-state';
import { createFakeHost, type FakeHost } from './fake-host';
import { MEMBERS, envelopeWith, roomFixture } from './room-member-fixtures';

let dir: string;
let host: FakeHost;
let store: RoomStore;

function makeCtx(): AppRuntimeContext {
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

function approval(overrides: Partial<RoomApprovalRequest> = {}): RoomApprovalRequest {
  return {
    id: 'appr-1',
    roomId: 'room-a',
    requestedByMemberId: 'impl',
    title: 'Raise the spend limit to $40',
    reason: 'The review needs two more passes.',
    consequence: 'This lets the Room spend more than you approved.',
    affects: 'maxCostUsd',
    estimatedCostUsd: 20,
    kind: 'limit-change',
    permissionsAfter: null,
    status: 'pending',
    delivery: null,
    consumedAt: null,
    createdAt: 't1',
    resolvedAt: null,
    ...overrides,
  };
}

/** Seeds one Room, with whatever the test needs changed on the record. */
async function seedRoom(mutate: (record: RoomRecord) => RoomRecord = (record) => record): Promise<RoomRecord> {
  const record = mutate(roomFixture(envelopeWith(), MEMBERS));
  await store.updateState((state) => ({ ...state, rooms: [record] }));
  return record;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sero-room-delivery-'));
  host = createFakeHost();
  store = createRoomStore(makeCtx());
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('the Room approval inbox', () => {
  it('names the member, the request, its reason and the computed consequence', async () => {
    const record = await seedRoom((room) => ({ ...room, approvals: [approval()] }));
    const attention = toRoomAttention(record);
    expect(attention?.approvals).toEqual([
      {
        approvalId: 'appr-1',
        memberId: 'impl',
        memberName: 'Implementer',
        title: 'Raise the spend limit to $40',
        reason: 'The review needs two more passes.',
        consequence: 'This lets the Room spend more than you approved.',
        affects: 'maxCostUsd',
        kind: 'limit-change',
        estimatedCostUsd: 20,
        createdAt: 't1',
      },
    ]);
  });

  it('reaches the home inbox through the watched index, and leaves it out when nothing is pending', async () => {
    await seedRoom((room) => ({ ...room, approvals: [approval()] }));
    const withPending = JSON.parse(await readFile(store.indexFile, 'utf8')) as RoomIndex;
    expect(withPending.rooms[0].attention?.approvals).toHaveLength(1);
    expect(withPending.rooms[0].attentionCount).toBe(1);

    await store.updateRoom('room-a', (room) => ({
      ...room,
      approvals: [approval({ status: 'approved', resolvedAt: 't2' })],
    }));
    const resolved = JSON.parse(await readFile(store.indexFile, 'utf8')) as RoomIndex;
    expect(resolved.rooms[0].attention).toBeUndefined();
    expect(resolved.rooms[0].attentionCount).toBe(0);
  });

  it('refuses a member — including the Conductor — and keeps the request open', async () => {
    await seedRoom((room) => ({ ...room, approvals: [approval()] }));
    const refused = await resolveApprovalForUser({ host, store }, 'room-a', 'appr-1', 'approved', {
      kind: 'member',
      memberId: 'lead',
    });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('Only you can');
    const stillPending = await store.readRoom('room-a');
    expect(stillPending?.approvals[0].status).toBe('pending');
  });

  it('resolves for the user', async () => {
    await seedRoom((room) => ({ ...room, approvals: [approval()] }));
    const resolved = await resolveApprovalForUser({ host, store }, 'room-a', 'appr-1', 'rejected', { kind: 'user' });
    expect(resolved.ok).toBe(true);
    const record = await store.readRoom('room-a');
    expect(record?.approvals[0].status).toBe('rejected');
  });
});

describe('delivery to the invoking chat', () => {
  const chatRoom = (record: RoomRecord): RoomRecord => ({
    ...record,
    runtime: { ...record.runtime, status: 'completed', endedAt: 't0', usage: { ...record.runtime.usage, costUsd: 1.5, turns: 7 } },
    brief: { ...record.brief, activeWork: ['Port the parser — Implementer (in progress)'], openQuestions: ['Which release?'] },
    artifacts: [
      { id: 'art-1', roomId: 'room-a', kind: 'report', title: 'Findings', ref: 'artifacts/findings.md', producedByMemberId: 'scout', relatedWorkId: null, createdAt: 't0' },
    ],
    delivery: { ...record.delivery, destination: 'invoking-chat', originSessionId: 'sess-9', originWorkspaceId: 'ws-1' },
  });

  it('returns the result, artifacts, unresolved items, duration and cost — with no approval token', async () => {
    await seedRoom(chatRoom);
    const outcome = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: 'The crash is fixed.' });

    expect(outcome).toMatchObject({ ok: true, problems: [], returnedToChat: true, ref: 'session:sess-9' });
    expect(host.sessionSends).toEqual([{ sessionId: 'sess-9', kind: 'context' }]);
    const sent = String(host.contextMessages[0].content);
    expect(sent).toContain('The crash is fixed.');
    expect(sent).toContain('Findings (report): artifacts/findings.md');
    expect(sent).toContain('Which release?');
    expect(sent).toContain('7 turns');
    expect(sent).toContain('$1.50');
    expect(sent).toContain('room-a');
  });

  it('records the delivery once and never sends twice', async () => {
    await seedRoom(chatRoom);
    await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: 'Done.' });
    const delivered = await store.readRoom('room-a');
    expect(delivered?.delivery.deliveredAt).toMatch(/^2026-/);
    expect(delivered?.delivery.deliveryRef).toBe('session:sess-9');

    const again = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: 'Done.' });
    expect(again.returnedToChat).toBe(false);
    expect(host.sessionSends).toHaveLength(1);
  });

  it('releases the claim when the send fails, so the result is not lost to a false record', async () => {
    await seedRoom(chatRoom);
    host.failNextContextSend = 'the chat is gone';
    const failed = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: 'Done.' });
    expect(failed).toMatchObject({ ok: true, returnedToChat: false, ref: null });
    // Nothing landed, so nothing may be recorded as delivered — otherwise the
    // claim alone would close the Room over a result the user never saw.
    const after = await store.readRoom('room-a');
    expect(after?.delivery.deliveredAt).toBeNull();
    expect(after?.delivery.deliveryRef).toBeNull();

    const retried = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: 'Done.' });
    expect(retried).toMatchObject({ ok: true, returnedToChat: true, ref: 'session:sess-9' });
    expect(host.sessionSends).toHaveLength(1);
  });

  it('does not call a claim with no ref a delivery', async () => {
    await seedRoom((record) => ({
      ...chatRoom(record),
      // What a crash between the claim and the send leaves behind.
      delivery: { ...chatRoom(record).delivery, deliveredAt: 't1', deliveryRef: null },
    }));
    const outcome = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: 'Done.' });
    expect(outcome.ok).toBe(false);
    expect(outcome.problems[0]).toContain('did not complete it');
    expect(host.sessionSends).toEqual([]);
  });

  it('refuses when the Room was never started from a chat', async () => {
    await seedRoom((record) => ({ ...record, delivery: { ...record.delivery, destination: 'invoking-chat' } }));
    const outcome = await deliverRoomResult({ host, store }, { roomId: 'room-a', finalResult: 'Done.' });
    expect(outcome.ok).toBe(false);
    expect(outcome.problems[0]).toContain('not started from a chat');
    expect((await store.readRoom('room-a'))?.delivery.deliveredAt).toBeNull();
  });

  it('states the completion honestly when the Room stopped instead of finishing', async () => {
    const record = await seedRoom((room) => ({
      ...room,
      runtime: { ...room.runtime, status: 'paused', stopReason: { kind: 'no-progress', detail: 'Nothing progressed.', at: 't1' } },
    }));
    expect(formatRoomResult(record, 'Partial work.')).toContain('stopped — Nothing progressed.');
  });
});

describe('external delivery', () => {
  const external = (record: RoomRecord): RoomRecord => ({
    ...record,
    delivery: { ...record.delivery, destination: 'chat-post', params: { channel: '#team' } },
  });
  const receipt = {
    destination: 'chat-post' as const,
    ref: 'https://chat.test/p/1',
    summary: 'Posted the result.',
    deliveredAt: '2026-01-01T00:00:00.000Z',
  };
  /** The exact text the user approves, and the text every accepted send carries. */
  const SENT = 'The team shipped it.';
  /** Bound the way the runtime binds it, so the test cannot approve what production would not. */
  const approved = (id: string, content = SENT): RoomApprovalRequest =>
    approval({
      id,
      kind: 'external-write',
      status: 'approved',
      delivery: buildDeliveryBinding('chat-post', { channel: '#team' }, content),
    });

  it('refuses a send the user never approved', async () => {
    const record = await seedRoom(external);
    expect(receiptProblems(record, receipt, SENT)).toEqual([
      '"chat-post" sends the result outside Sero, and you have not approved that send',
    ]);
  });

  it('refuses a receipt that names no approval, and one that names an unapproved id', async () => {
    const record = await seedRoom((room) => external({ ...room, approvals: [approved('appr-x')] }));
    expect(receiptProblems(record, receipt, SENT)[0]).toContain('does not name the approval');
    expect(receiptProblems(record, { ...receipt, approvalId: 'appr-other' }, SENT)[0]).toContain('no approved record of');
    expect(receiptProblems(record, { ...receipt, approvalId: 'appr-x' }, SENT)).toEqual([]);
  });

  it('refuses the approved id carrying text the user never saw', async () => {
    const record = await seedRoom((room) => external({ ...room, approvals: [approved('appr-x')] }));
    // The swap the binding exists to stop: right approval, different payload.
    expect(receiptProblems(record, { ...receipt, approvalId: 'appr-x' }, 'Something else entirely.')[0])
      .toContain('not the text approval');
  });

  it('refuses an approval granted for another destination', async () => {
    const record = await seedRoom((room) =>
      external({
        ...room,
        approvals: [approval({
          id: 'appr-x',
          kind: 'external-write',
          status: 'approved',
          delivery: buildDeliveryBinding('webhook-post', {}, SENT),
        })],
      }));
    expect(receiptProblems(record, { ...receipt, approvalId: 'appr-x' }, SENT)[0]).toContain('was granted for a send to');
  });

  it('accepts the receipt the approval authorised and records its ref', async () => {
    await seedRoom((room) => external({ ...room, approvals: [approved('appr-x')] }));
    const outcome = await deliverRoomResult(
      { host, store },
      { roomId: 'room-a', finalResult: SENT, receipt: { ...receipt, approvalId: 'appr-x' } },
    );
    expect(outcome).toMatchObject({ ok: true, problems: [], ref: 'https://chat.test/p/1' });
    expect((await store.readRoom('room-a'))?.delivery.deliveryRef).toBe('https://chat.test/p/1');
  });

  it('spends the approval, so it cannot authorise a second send', async () => {
    await seedRoom((room) => external({ ...room, approvals: [approved('appr-x')] }));
    await deliverRoomResult(
      { host, store },
      { roomId: 'room-a', finalResult: SENT, receipt: { ...receipt, approvalId: 'appr-x' } },
    );
    const spent = await store.readRoom('room-a');
    expect(receiptProblems(spent!, { ...receipt, approvalId: 'appr-x' }, SENT)[0]).toContain('already used');
  });

  it('lets only one of two concurrent finishes spend the approval', async () => {
    await seedRoom((room) => external({ ...room, approvals: [approved('appr-x')] }));
    const send = () =>
      deliverRoomResult(
        { host, store },
        { roomId: 'room-a', finalResult: SENT, receipt: { ...receipt, approvalId: 'appr-x' } },
      );

    // Both read a Room with no delivery and the same usable approval. Deciding
    // outside the write let both accept it — one approval, two sends.
    const [first, second] = await Promise.all([send(), send()]);

    // Both callers succeed — the loser is told the delivery already happened,
    // which is the honest answer. What must not happen is the approval being
    // spent twice, or two different sends being accepted.
    const record = await store.readRoom('room-a');
    expect(record?.approvals.filter((entry) => entry.consumedAt !== null)).toHaveLength(1);
    expect(first.ref).toBe(second.ref);
    expect(record?.delivery.deliveryRef).toBe('https://chat.test/p/1');
  });

  it('refuses a claimed send with no receipt at all', async () => {
    const record = await seedRoom(external);
    expect(receiptProblems(record, undefined, SENT)).toEqual([
      'the Room finished without proof that its result was delivered',
    ]);
  });

  it('raises its approval into the same inbox, and only for a destination that leaves Sero', async () => {
    await seedRoom(external);
    const asked = await requestDeliveryApproval({ host, store }, {
      roomId: 'room-a',
      requestedByMemberId: 'lead',
      reason: 'The team wants it in #team.',
      content: SENT,
      commandId: 'cmd-1',
    });
    expect(asked.ok).toBe(true);
    expect(asked.approval).toMatchObject({ kind: 'external-write', status: 'pending', affects: 'Chat post' });
    // The approval carries the text, so the inbox can show what is being sent.
    expect(asked.approval?.delivery?.content).toBe(SENT);

    const record = await store.readRoom('room-a');
    expect(toRoomAttention(record!)?.approvals[0].consequence).toContain('send results outside Sero');

    // A duplicate command id is the same request, not a second one.
    const repeat = await requestDeliveryApproval({ host, store }, {
      roomId: 'room-a',
      requestedByMemberId: 'lead',
      reason: 'Again.',
      content: SENT,
      commandId: 'cmd-1',
    });
    expect(repeat.ok).toBe(false);
  });

  it('refuses to ask for an approval with nothing in it', async () => {
    await seedRoom(external);
    const asked = await requestDeliveryApproval({ host, store }, {
      roomId: 'room-a',
      requestedByMemberId: 'lead',
      reason: 'Trust me.',
      content: '   ',
      commandId: 'cmd-3',
    });
    expect(asked.ok).toBe(false);
    expect(asked.error).toContain('authorises nothing');
  });

  it('never asks for an approval a destination inside Sero does not need', async () => {
    await seedRoom((record) => ({ ...record, delivery: { ...record.delivery, destination: 'saved-artifact' } }));
    const asked = await requestDeliveryApproval({ host, store }, {
      roomId: 'room-a',
      requestedByMemberId: 'lead',
      reason: 'Just in case.',
      content: SENT,
      commandId: 'cmd-2',
    });
    expect(asked.ok).toBe(false);
    expect(asked.error).toContain('stays inside Sero');
  });
});
