/**
 * The Room revision path: deciding and applying against the SAME record, and
 * what an approval actually does.
 *
 * Two failures these tests exist to catch, both of which look like success from
 * the outside:
 *
 *  - a revision planned against a Room that has already moved, so a change made
 *    before a limit was lowered silently puts the limit back;
 *  - an approval that marks a revision "applied" and changes nothing.
 *
 * Everything runs on a real store in a temp dir with the real planner and the
 * real mutation, so the property under test is the one the runtime has.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { RoomRevisionProposal } from '../../shared/room-revision-types';
import { applyRevisionToRoom } from '../rooms/room-revision-mutate';
import { applyRoomRevision, resolveRoomApproval, type RevisionDeps } from '../rooms/room-revisions';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createFakeHost, type FakeHost } from './fake-host';
import { blueprintMember, envelopeWith, MEMBERS, roomFixture } from './room-member-fixtures';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let deps: RevisionDeps;

const ROOM = 'room-a';

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

/** The Conductor proposing a change, which is the only actor with the authority. */
function propose(proposal: RoomRevisionProposal, commandId: string) {
  return applyRoomRevision(deps, {
    roomId: ROOM,
    proposal,
    actorMemberId: 'lead',
    reason: 'the Room needs it',
    commandId,
  });
}

const envelopeOf = async (): Promise<number> =>
  (await store.readRoom(ROOM))?.definition.envelope.maxCostUsd ?? -1;

const revisionsOf = () => store.readRevisions(ROOM);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-revisions-'));
  host = createFakeHost();
  store = createRoomStore(makeCtx());
  deps = { host, store, mutate: applyRevisionToRoom };
  await store.updateState((state) => ({ ...state, rooms: [roomFixture(envelopeWith(), MEMBERS)] }));
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('deciding against the record that is written', () => {
  it('will not let a revision planned before a lowering put the limit back', async () => {
    // Both are proposed against a Room whose ceiling is still 20. The first
    // lowers it to 5; the second was a lowering when it was proposed and is a
    // RAISE by the time it lands, which only the user may authorise.
    const [lowered, stale] = await Promise.all([
      propose({ kind: 'lower-soft-limit', field: 'maxCostUsd', value: 5 }, 'cmd-1'),
      propose({ kind: 'lower-soft-limit', field: 'maxCostUsd', value: 10 }, 'cmd-2'),
    ]);

    expect(lowered.outcome).toBe('applied');
    expect(stale.outcome).toBe('refused');
    expect(await envelopeOf()).toBe(5);
    // Nor may it slip through as a request the Room raises on its own.
    expect((await store.readRoom(ROOM))?.approvals).toHaveLength(0);
    expect(await revisionsOf()).toHaveLength(1);
  });

  it('applies a repeated command key once', async () => {
    const first = await propose({ kind: 'suspend-member', memberId: 'scout' }, 'cmd-1');
    const second = await propose({ kind: 'resume-member', memberId: 'scout' }, 'cmd-1');

    expect(first.outcome).toBe('applied');
    expect(second.outcome).toBe('duplicate');
    expect((await store.readMember(ROOM, 'scout'))?.status).toBe('suspended');
    expect(await revisionsOf()).toHaveLength(1);
  });

  it('does not burn the key on a refusal, so the real retry still works', async () => {
    const refused = await propose({ kind: 'lower-soft-limit', field: 'maxCostUsd', value: 999 }, 'cmd-1');
    expect(refused.outcome).toBe('refused');
    expect(await store.hasAppliedCommand(ROOM, 'cmd-1')).toBe(false);

    const retried = await propose({ kind: 'suspend-member', memberId: 'scout' }, 'cmd-1');
    expect(retried.outcome).toBe('applied');
  });
});

describe('answering an approval', () => {
  it('applies the change the user approved', async () => {
    const held = await propose({ kind: 'request-expansion', field: 'maxCostUsd', value: 100 }, 'cmd-1');
    if (held.outcome !== 'awaiting-approval') throw new Error(`expected an approval, got ${held.outcome}`);
    // Nothing moves while the user is deciding.
    expect(await envelopeOf()).toBe(20);

    const answer = await resolveRoomApproval(deps, ROOM, held.approval.id, 'approved');

    expect(answer.ok).toBe(true);
    expect(await envelopeOf()).toBe(100);
    const record = await store.readRoom(ROOM);
    expect(record?.approvals[0].status).toBe('approved');
    expect((await revisionsOf())[0]).toMatchObject({ outcome: 'applied', kind: 'request-expansion' });
    // An applied revision is structural progress whoever authorised it.
    expect(record?.runtime.lastProgressAt).not.toBeNull();
  });

  it('admits a member the envelope did not allow, and widens it to exactly that member', async () => {
    const joiner = blueprintMember({
      key: 'writer',
      displayName: 'Writer',
      role: 'Writer',
      isConductor: false,
      model: 'opus',
    });
    const held = await propose({ kind: 'add-member', member: joiner }, 'cmd-1');
    if (held.outcome !== 'awaiting-approval') throw new Error(`expected an approval, got ${held.outcome}`);
    expect((await store.readRoom(ROOM))?.members).toHaveLength(3);

    expect((await resolveRoomApproval(deps, ROOM, held.approval.id, 'approved')).ok).toBe(true);

    const record = await store.readRoom(ROOM);
    expect(record?.members.map((member) => member.id)).toContain('writer');
    expect(record?.definition.envelope.allowedModels).toContain('opus');
    // The capability lists move; the limits the user set do not.
    expect(record?.definition.envelope.maxCostUsd).toBe(20);
    expect(record?.runtime.usage.rosterRevisions).toBe(1);
  });

  it('refuses an approved change that no longer holds instead of forcing it through', async () => {
    const smaller = await propose({ kind: 'request-expansion', field: 'maxCostUsd', value: 100 }, 'cmd-1');
    const bigger = await propose({ kind: 'request-expansion', field: 'maxCostUsd', value: 200 }, 'cmd-2');
    if (smaller.outcome !== 'awaiting-approval' || bigger.outcome !== 'awaiting-approval') {
      throw new Error('expected two approvals');
    }
    // The user answers the bigger one first, so the smaller one is asking for a
    // ceiling the Room is already above by the time it is answered.
    expect((await resolveRoomApproval(deps, ROOM, bigger.approval.id, 'approved')).ok).toBe(true);
    expect(await envelopeOf()).toBe(200);

    const late = await resolveRoomApproval(deps, ROOM, smaller.approval.id, 'approved');

    expect(late.ok).toBe(false);
    expect(late.reason).toContain('already 200');
    expect(await envelopeOf()).toBe(200);
    const revision = (await revisionsOf()).find((entry) => entry.approvalId === smaller.approval.id);
    expect(revision?.outcome).toBe('refused');
    expect(revision?.rejectionReason).toContain('already 200');
  });

  it('applies nothing when the user says no', async () => {
    const held = await propose({ kind: 'request-expansion', field: 'maxCostUsd', value: 100 }, 'cmd-1');
    if (held.outcome !== 'awaiting-approval') throw new Error(`expected an approval, got ${held.outcome}`);

    const answer = await resolveRoomApproval(deps, ROOM, held.approval.id, 'rejected');

    expect(answer.ok).toBe(true);
    expect(await envelopeOf()).toBe(20);
    expect((await revisionsOf())[0]).toMatchObject({ outcome: 'rejected' });
    expect((await store.readRoom(ROOM))?.approvals[0].status).toBe('rejected');
  });

  it('answers a resolved approval once', async () => {
    const held = await propose({ kind: 'request-expansion', field: 'maxCostUsd', value: 100 }, 'cmd-1');
    if (held.outcome !== 'awaiting-approval') throw new Error(`expected an approval, got ${held.outcome}`);
    await resolveRoomApproval(deps, ROOM, held.approval.id, 'approved');

    const again = await resolveRoomApproval(deps, ROOM, held.approval.id, 'rejected');

    expect(again.ok).toBe(false);
    expect(again.reason).toBe('already resolved');
    expect(await envelopeOf()).toBe(100);
  });
});
