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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { RoomRevision } from '../../shared/room-message-types';
import type { RoomRevisionProposal } from '../../shared/room-revision-types';
import { requestRoomGrant } from '../rooms/member-grant';
import { createMemberSessionPool, type MemberSessionPool } from '../rooms/member-session';
import { createRoomAmendments, type RoomAmendments } from '../rooms/room-amendment';
import type { FakePersistentSessions } from './fake-persistent-sessions';
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
  deps = { host, store, mutate: applyRevisionToRoom, releaseMemberSession: async () => undefined };
  await store.updateState((state) => ({ ...state, rooms: [roomFixture(envelopeWith(), MEMBERS)] }));
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('deciding against the record that is written', () => {
  it('refuses an unsafe key when a roster revision adds a member', async () => {
    const result = await propose({
      kind: 'add-member',
      member: blueprintMember({ key: '../outside', displayName: 'Outside', isConductor: false }),
    }, 'cmd-unsafe-member');

    expect(result).toMatchObject({ outcome: 'refused', reason: '../outside is not a safe member key.' });
    expect((await store.readRoom(ROOM))?.members).toHaveLength(MEMBERS.length);
    expect(await revisionsOf()).toHaveLength(0);
  });

  it('closes a live member session before it reports a narrower configuration', async () => {
    await store.updateMember(ROOM, 'scout', (member) => ({ ...member, status: 'idle', statusDetail: 'Ready.' }));
    let statusAtRelease: string | null = null;
    deps.releaseMemberSession = async (_roomId, memberId) => {
      statusAtRelease = (await store.readMember(ROOM, memberId))?.status ?? null;
    };

    const result = await propose({
      kind: 'change-configuration',
      memberId: 'scout',
      configuration: { tools: [] },
    }, 'cmd-config');

    expect(result.outcome).toBe('applied');
    expect(statusAtRelease).toBe('suspended');
    expect((await store.readMember(ROOM, 'scout'))?.configuration.tools).toEqual([]);
    expect((await store.readMember(ROOM, 'scout'))?.status).toBe('idle');
  });

  it('does not apply a narrower configuration when the live session cannot close', async () => {
    await store.updateMember(ROOM, 'scout', (member) => ({ ...member, status: 'idle', statusDetail: 'Ready.' }));
    deps.releaseMemberSession = async () => { throw new Error('dispose failed'); };

    const result = await propose({
      kind: 'change-configuration',
      memberId: 'scout',
      configuration: { tools: [] },
    }, 'cmd-config-failed');

    expect(result.outcome).toBe('refused');
    expect((await store.readMember(ROOM, 'scout'))?.configuration.tools).toEqual(['read', 'web_fetch']);
    expect((await store.readMember(ROOM, 'scout'))?.status).toBe('idle');
    expect(await revisionsOf()).toHaveLength(0);
  });

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

describe('amending the grant of a running Room', () => {
  let amendments: RoomAmendments;
  let pool: MemberSessionPool;
  let sessions: FakePersistentSessions;

  const revisionOf = async (id: string) => (await revisionsOf()).find((entry) => entry.id === id);

  function runnerFor(overrides: Partial<Pick<MemberSessionPool, 'settled'>> = {}): RoomAmendments {
    return createRoomAmendments({ host, store, sessions: { ...pool, ...overrides, ensure: pool.ensure, release: pool.release } });
  }

  async function proposeAmended(proposal: RoomRevisionProposal, commandId: string): Promise<RoomRevision> {
    const result = await applyRoomRevision({ ...deps, amendments }, {
      roomId: ROOM, proposal, actorMemberId: 'lead', reason: 'the Room needs it', commandId,
    });
    if (result.outcome !== 'pending') throw new Error(`expected a pending revision, got ${result.outcome}`);
    return result.revision;
  }

  const dropWebFetch: RoomRevisionProposal = {
    kind: 'change-configuration', memberId: 'scout', configuration: { tools: ['read'] },
  };
  const replaceScout: RoomRevisionProposal = {
    kind: 'replace-member',
    memberId: 'scout',
    replacement: blueprintMember({
      key: 'scout-2', displayName: 'Scout Two', role: 'Researcher', isConductor: false, tools: ['read'], model: 'anthropic/sonnet',
    }),
    handover: 'Carry on with the docs survey.',
  };

  beforeEach(async () => {
    sessions = host.persistentSessions;
    host.availableModels = [{
      provider: 'anthropic', displayName: 'Anthropic', logo: '',
      models: ['sonnet', 'opus'].map((modelId) => ({ provider: 'anthropic', modelId, name: modelId, reasoning: true })),
    }];
    host.toolCatalog = ['read', 'write', 'web_fetch', 'bash'].map((name) => ({ name }));
    const room = roomFixture(envelopeWith(), MEMBERS);
    const grant = await requestRoomGrant(host, room);
    await store.updateState((state) => ({
      ...state,
      rooms: [{
        ...room,
        definition: { ...room.definition, grantId: grant.grantId, grantRevision: 0 },
        members: room.members.map((member) => ({ ...member, status: 'idle' as const })),
      }],
    }));
    pool = createMemberSessionPool({ host, store });
    amendments = runnerFor();
    // The scout already has a session, so a change has a session to preserve.
    const record = await store.readRoom(ROOM);
    const scout = record?.members.find((member) => member.id === 'scout');
    if (!record || !scout) throw new Error('fixture');
    await pool.ensure(record, scout);
  });

  it('keeps the same session and reports applied only after the reopen', async () => {
    const proposals = sessions.proposals.length;
    const sessionBefore = (await store.readMember(ROOM, 'scout'))?.session.sessionId;

    const revision = await proposeAmended(dropWebFetch, 'cmd-drop');
    // Saved first: nothing is effective, and the member starts nothing meanwhile.
    expect(revision.outcome).toBe('pending');
    expect((await store.readMember(ROOM, 'scout'))?.configurationChange)
      .toMatchObject({ state: 'pending', workPaused: true, fields: [{ field: 'tools', value: ['read'] }] });

    await amendments.settled(ROOM);

    const scout = await store.readMember(ROOM, 'scout');
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'applied' });
    expect(scout?.configuration.tools).toEqual(['read']);
    expect(scout?.configurationChange).toMatchObject({ state: 'applied', grantRevision: 1, workPaused: false });
    expect((await store.readRoom(ROOM))?.definition.grantRevision).toBe(1);
    expect(scout?.session.sessionId).toBe(sessionBefore);
    // The reopened session carries the new setup, on the same grant.
    const reopen = sessions.requests.at(-1);
    expect(reopen).toMatchObject({ operation: 'open', subject: 'scout', grantId: 'grant-1' });
    expect(reopen?.tools).not.toContain('web_fetch');
    expect(sessions.proposals).toHaveLength(proposals);
    expect(sessions.amendments.map((entry) => entry.approval)).toEqual(['hold']);
  });

  it('waits for a running turn to end and never aborts it', async () => {
    sessions.mode = 'manual';
    const record = await store.readRoom(ROOM);
    const scout = record?.members.find((member) => member.id === 'scout');
    if (!record || !scout) throw new Error('fixture');
    const turn = pool.runTurn(record, scout, { prompt: 'survey the docs' });
    await vi.waitFor(() => expect(sessions.openTurns()).toContain('scout'));

    await proposeAmended(dropWebFetch, 'cmd-mid-turn');
    await Promise.resolve();
    expect(sessions.amendments).toHaveLength(0);

    sessions.endTurn('scout');
    await turn;
    await amendments.settled(ROOM);

    expect(sessions.aborted).toEqual([]);
    expect(sessions.amendments).toHaveLength(1);
    expect((await store.readMember(ROOM, 'scout'))?.configurationChange?.state).toBe('applied');
  });

  it('holds what adds access, then applies the same revision once approved', async () => {
    const revision = await proposeAmended(replaceScout, 'cmd-replace');
    await amendments.settled(ROOM);

    // Held: a new subject is new authority, nobody was asked, and nothing moved.
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'held' });
    const held = await store.readMember(ROOM, 'scout');
    expect(held?.configurationChange).toMatchObject({ state: 'held', adds: [{ subject: 'scout-2', field: 'subject' }] });
    expect(held?.status).toBe('idle');
    expect((await store.readRoom(ROOM))?.members.map((member) => member.id)).not.toContain('scout-2');
    expect(sessions.grantState.get('grant-1')?.revision).toBe(0);

    expect(await amendments.approve(ROOM, revision.id)).toEqual({ ok: true });

    const record = await store.readRoom(ROOM);
    const old = record?.members.find((member) => member.id === 'scout');
    const next = record?.members.find((member) => member.id === 'scout-2');
    expect(sessions.amendments.map((entry) => [entry.amendmentId, entry.approval]))
      .toEqual([['cmd-replace', 'hold'], ['cmd-replace', 'ask']]);
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'applied' });
    // A distinct subject: the retired member keeps its session and history.
    expect(old).toMatchObject({ status: 'retired', replacedByMemberId: 'scout-2' });
    expect(old?.session.sessionId).toBe('session-scout');
    expect(next).toMatchObject({ replacedFromMemberId: 'scout', status: 'idle' });
    expect(next?.session.subject).toBe('scout-2');
    expect(next?.mandate.currentTask).toBe('Carry on with the docs survey.');
    expect(sessions.grantState.get('grant-1')?.retired).toEqual(['scout']);
    expect(record?.definition.grantRevision).toBe(1);
    expect(record?.runtime.usage.memberReplacements).toBe(1);
  });

  it('keeps the old configuration when the held change is declined', async () => {
    const revision = await proposeAmended(replaceScout, 'cmd-decline');
    await amendments.settled(ROOM);

    expect(await amendments.decline(ROOM, revision.id)).toEqual({ ok: true });

    const record = await store.readRoom(ROOM);
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'declined' });
    expect(record?.members.find((member) => member.id === 'scout')).toMatchObject({
      status: 'idle',
      configurationChange: { state: 'declined', workPaused: false },
    });
    expect(record?.members).toHaveLength(MEMBERS.length);
    expect(sessions.amendments).toHaveLength(1);
  });

  it('records a decline the user gives the host dialog as declined', async () => {
    const revision = await proposeAmended(replaceScout, 'cmd-host-decline');
    await amendments.settled(ROOM);
    sessions.askAnswer = 'decline';

    await amendments.approve(ROOM, revision.id);

    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'declined' });
    expect((await store.readRoom(ROOM))?.members).toHaveLength(MEMBERS.length);
  });

  it('holds on a stale revision without changing anything, and takes the host\'s number', async () => {
    sessions.nextAmendment = 'stale';
    const revision = await proposeAmended(dropWebFetch, 'cmd-stale');
    await amendments.settled(ROOM);

    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'held' });
    expect((await store.readMember(ROOM, 'scout'))?.configuration.tools).toEqual(['read', 'web_fetch']);
    expect(sessions.proposals).toHaveLength(1);
  });

  it('holds when the host answer is lost, then finishes the same revision on retry', async () => {
    sessions.nextAmendment = 'throw';
    const revision = await proposeAmended(dropWebFetch, 'cmd-lost');
    await amendments.settled(ROOM);
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'held' });
    expect((await store.readMember(ROOM, 'scout'))?.configuration.tools).toEqual(['read', 'web_fetch']);

    expect(await amendments.approve(ROOM, revision.id)).toEqual({ ok: true });

    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'applied' });
    expect(sessions.grantState.get('grant-1')?.revision).toBe(1);
  });

  it('holds work and offers a retry when the session cannot be reopened', async () => {
    sessions.failNextOpen = 'the model is unavailable';
    const revision = await proposeAmended(dropWebFetch, 'cmd-reopen');
    await amendments.settled(ROOM);

    // The host has the change, so the member stays stopped until it is confirmed.
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'held' });
    expect((await store.readMember(ROOM, 'scout'))?.configurationChange)
      .toMatchObject({ state: 'held', workPaused: true });
    expect(await amendments.decline(ROOM, revision.id)).toMatchObject({ ok: false });

    expect(await amendments.approve(ROOM, revision.id)).toEqual({ ok: true });

    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'applied' });
    expect(sessions.amendments).toHaveLength(1);
    expect((await store.readMember(ROOM, 'scout'))?.configurationChange?.workPaused).toBe(false);
  });

  it('finishes the same revision after a restart that lost the Room save', async () => {
    // The first runtime never gets past waiting for a safe point, so the host
    // commit below is the one it would have made just before the crash.
    const stuck = runnerFor({ settled: () => new Promise<void>(() => undefined) });
    const result = await applyRoomRevision({ ...deps, amendments: stuck }, {
      roomId: ROOM, proposal: replaceScout, actorMemberId: 'lead', reason: 'the Room needs it', commandId: 'cmd-crash',
    });
    if (result.outcome !== 'pending') throw new Error('expected pending');
    const intent = result.revision.amendment;
    if (!intent) throw new Error('intent was not saved');
    await sessions.amendGrant({
      grantId: intent.grantId,
      amendmentId: intent.amendmentId,
      expectedRevision: intent.expectedRevision,
      subjects: intent.subjects,
      retire: intent.retire,
      approval: 'ask',
      reason: 'the user approved it',
    });
    expect(sessions.consumed.get('grant-1')).toBe(1);
    expect((await store.readRoom(ROOM))?.members.map((member) => member.id)).not.toContain('scout-2');

    await runnerFor().reconcile();

    const record = await store.readRoom(ROOM);
    expect(await revisionOf(result.revision.id)).toMatchObject({ outcome: 'applied' });
    expect(record?.members.map((member) => member.id)).toContain('scout-2');
    expect(record?.definition.grantRevision).toBe(1);
    // One grant, one amendment, one session slot used: the repeat changed nothing.
    expect(sessions.proposals).toHaveLength(1);
    expect(sessions.grantState.get('grant-1')?.revision).toBe(1);
    expect(sessions.consumed.get('grant-1')).toBe(1);
    expect(record?.runtime.usage.memberReplacements).toBe(1);
  });

  it('declines a model the host does not have before it asks the host anything', async () => {
    const revision = await proposeAmended({
      kind: 'change-configuration', memberId: 'scout', configuration: { model: 'ghost/none' },
    }, 'cmd-ghost');
    await amendments.settled(ROOM);

    expect(sessions.amendments).toHaveLength(0);
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'declined', rejectionReason: expect.stringContaining('ghost/none') });
    expect((await store.readMember(ROOM, 'scout'))?.configurationChange).toMatchObject({ state: 'declined', workPaused: false });
    expect((await store.readRoom(ROOM))?.definition.grantRevision).toBe(0);
  });

  it('applies the tools the host granted and says which one it did not', async () => {
    sessions.clampSubject = (policy) => ({ ...policy, allowedTools: policy.allowedTools.filter((tool) => tool !== 'bash') });
    const revision = await proposeAmended({
      kind: 'change-configuration', memberId: 'scout', configuration: { tools: ['read', 'bash'] },
    }, 'cmd-bash');
    await amendments.settled(ROOM);
    expect(await amendments.approve(ROOM, revision.id)).toEqual({ ok: true });

    const scout = await store.readMember(ROOM, 'scout');
    expect(scout?.configuration.tools).toEqual(['read']);
    expect(sessions.requests.at(-1)?.tools).not.toContain('bash');
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'applied', amendment: { reason: expect.stringContaining('bash') } });
  });

  it('keeps a member stopped, and refuses a local decline, when the host committed a model the Room cannot use', async () => {
    sessions.clampSubject = (policy) => ({ ...policy, allowedModels: [] });
    const revision = await proposeAmended({
      kind: 'change-configuration', memberId: 'scout', configuration: { model: 'anthropic/opus' },
    }, 'cmd-opus');
    await amendments.settled(ROOM);
    await amendments.approve(ROOM, revision.id);

    const scout = await store.readMember(ROOM, 'scout');
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'held' });
    expect(scout?.configurationChange).toMatchObject({ state: 'held', workPaused: true });
    expect(scout?.configuration.model).toBe('sonnet');
    expect(await amendments.decline(ROOM, revision.id)).toMatchObject({ ok: false });
    expect(await revisionOf(revision.id)).toMatchObject({ outcome: 'held' });
  });

  describe('roster additions that are still waiting', () => {
    const join = (key: string): RoomRevisionProposal => ({
      kind: 'add-member',
      member: blueprintMember({ key, displayName: key, role: 'Researcher', isConductor: false, tools: ['read'], model: 'anthropic/sonnet' }),
    });
    const proposeJoin = (key: string, commandId: string) => applyRoomRevision({ ...deps, amendments }, {
      roomId: ROOM, proposal: join(key), actorMemberId: 'lead', reason: 'the Room needs it', commandId,
    });

    it('does not let a second pending addition take the last place, or the same key', async () => {
      expect(await proposeJoin('extra-1', 'cmd-j1')).toMatchObject({ outcome: 'pending' });
      expect(await proposeJoin('extra-2', 'cmd-j2')).toMatchObject({ outcome: 'refused', reason: expect.stringContaining('maximum') });
      await store.updateRoom(ROOM, (record) => ({
        ...record, definition: { ...record.definition, envelope: { ...record.definition.envelope, maxMembers: 6 } },
      }));
      expect(await proposeJoin('extra-1', 'cmd-j3')).toMatchObject({ outcome: 'refused', reason: expect.stringContaining('already a member') });
    });

    it('declines a waiting change that no longer fits when the host is about to be asked', async () => {
      const stuck = runnerFor({ settled: () => new Promise<void>(() => undefined) });
      const result = await applyRoomRevision({ ...deps, amendments: stuck }, {
        roomId: ROOM, proposal: replaceScout, actorMemberId: 'lead', reason: 'the Room needs it', commandId: 'cmd-j4',
      });
      if (result.outcome !== 'pending') throw new Error('expected pending');
      // The Room's replacement budget is lowered while the change waits.
      await store.updateRoom(ROOM, (record) => ({
        ...record, definition: { ...record.definition, envelope: { ...record.definition.envelope, maxMemberReplacements: 0 } },
      }));

      await runnerFor().reconcile();

      expect(sessions.amendments).toHaveLength(0);
      expect(await revisionOf(result.revision.id)).toMatchObject({ outcome: 'declined', rejectionReason: expect.stringContaining('replacements') });
    });
  });
});
