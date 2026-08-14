/**
 * The AD-020 Room command surface: who the caller is, what it is allowed to do,
 * and which module actually does it.
 *
 * The tests that matter here are the authority ones. A Room command is run by a
 * model, and a model can say anything about itself — so the caller is resolved
 * from the roster through the live session, and an argument that disagrees is
 * refused rather than believed.
 *
 * Everything runs on a real store, the real mailbox, the real claims and the
 * real revision engine, so "routed to the module that owns it" is a property of
 * the run rather than of a stub.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { RoomBlueprint } from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import { createMemberSessionPool } from '../rooms/member-session';
import { createRoomClaims } from '../rooms/room-claims';
import { createRoomCommandRouter, type RoomCommandRouter } from '../rooms/room-command-router';
import { RoomCoordinator } from '../rooms/room-coordinator';
import { requestDeliveryApproval } from '../rooms/room-delivery';
import { applyRevisionToRoom } from '../rooms/room-revision-mutate';
import { applyRoomRevision } from '../rooms/room-revisions';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createRoomWork } from '../rooms/room-work';
import { createRoomWorkspaces } from '../rooms/room-workspace';
import { createFakeHost, type FakeHost } from './fake-host';
import { envelopeWith, MEMBERS } from './room-member-fixtures';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;
let router: RoomCommandRouter;
let roomId: string;

/** Where the host would have put each member's session file. */
const sessionOf = (memberId: string): string => `/sessions/rooms/${memberId}.jsonl`;
const WORKTREE = '/workspaces/ws-1/.sero/worktrees/impl';

/** Fault injection for the crash-safety test below. No fault by default. */
let failWrite: (file: string) => boolean;

function makeCtx(): AppRuntimeContext {
  const appState = {
    read: async (file: string) => (existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null),
    update: async (file: string, updater: (current: unknown) => unknown) => {
      if (failWrite(file)) throw new Error(`the disk went away: ${file}`);
      const current = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
  };
  return { stateFilePath: path.join(dir, 'state.json'), host: { appState } } as unknown as AppRuntimeContext;
}

/**
 * A Room whose members are addressable but whose scheduler never runs: the
 * command surface is what is under test, and a live turn would race every
 * assertion about the record it writes.
 */
async function makeRoom(): Promise<void> {
  const envelope = envelopeWith();
  const blueprint: RoomBlueprint = {
    schemaVersion: 1,
    title: 'Ship the fix',
    approach: 'Split the work.',
    objective: 'Fix the crash on start',
    successCriteria: ['the app starts'],
    roomInstructions: 'Use sero-cli to talk to the Room.',
    members: MEMBERS,
    teamRationale: 'One decides, two work.',
    collaborationStrategy: 'direct',
    workspacePolicy: envelope.workspacePolicy,
    envelope,
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'saved-artifact',
    openAssumptions: [],
  };
  const work = createRoomWork({ host, store });
  const claims = createRoomClaims({ host, store });
  coordinator = new RoomCoordinator(host, {
    store,
    sessions: createMemberSessionPool({ host, store }),
    briefSources: (id) => work.briefSources(id),
  });
  const created = await coordinator.createRoom({
    problemStatement: 'the app crashes',
    blueprint,
    proposal: computeProposalSummary(blueprint),
    workspaceId: 'ws-1',
  });
  if (!created.room) throw new Error(created.error ?? 'no room');
  roomId = created.room.definition.id;

  // What activation would have written: an open session per member, the
  // implementer pinned to its own worktree, everyone ready for a turn.
  await store.updateRoom(roomId, (record) => ({
    ...record,
    runtime: { ...record.runtime, status: 'running' },
    members: record.members.map((member) => ({
      ...member,
      status: 'idle' as const,
      statusDetail: 'Ready.',
      worktreePath: member.id === 'impl' ? WORKTREE : null,
      session: { ...member.session, sessionId: `s-${member.id}`, sessionPath: sessionOf(member.id) },
    })),
  }));

  router = createRoomCommandRouter({
    host,
    store,
    mailbox: coordinator.mailbox,
    claims,
    work,
    applyRevision: (input) =>
      applyRoomRevision({ host, store, mutate: applyRevisionToRoom }, input),
    workspaces: createRoomWorkspaces({ host, store }),
    requestDeliveryApproval: (request) => requestDeliveryApproval({ host, store }, request),
    completeRoom: (id, summary, receipt) => coordinator.completeRoom(id, summary, receipt),
    publishConductorNote: (id, note) => coordinator.publishConductorNote(id, note),
    noteStructuralProgress: (id, summary) => coordinator.noteStructuralProgress(id, summary),
  });
}

const asLead = { sessionPath: sessionOf('lead'), cwd: '/workspaces/ws-1' };
const asImpl = { sessionPath: sessionOf('impl'), cwd: WORKTREE };

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-commands-'));
  host = createFakeHost();
  failWrite = () => false;
  store = createRoomStore(makeCtx());
  await makeRoom();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('who is calling', () => {
  it('resolves the caller from its session file and marks it on the roster', async () => {
    const result = await router.execute(asImpl, { command: 'show-roster' });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('Implementer [impl] (Implementer, you)');
    expect(result.text).toContain('Lead [lead] (Conductor)');
  });

  it('falls back to the worktree when no session path is available', async () => {
    const result = await router.execute({ cwd: WORKTREE }, { command: 'show-mandate' });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('Implementer — Implementer');
  });

  it('refuses a session that is not a Room member', async () => {
    const result = await router.execute(
      { sessionPath: '/sessions/chat.jsonl', cwd: '/workspaces/ws-1' },
      { command: 'show-roster' },
    );
    expect(result.ok).toBe(false);
    expect(result.text).toContain('not one');
  });

  it('refuses an unknown command instead of treating it as a no-op', async () => {
    const result = await router.execute(asLead, { command: 'delete-everything' });
    expect(result.ok).toBe(false);
    expect(result.text).toContain('is not a Room command');
  });
});

describe('authority', () => {
  it('refuses a Conductor-only command from an ordinary member', async () => {
    const result = await router.execute(asImpl, { command: 'finish-room', summary: 'done' });
    expect(result.ok).toBe(false);
    expect(result.details.code).toBe('conductor-only');
    expect((await store.readRoom(roomId))?.runtime.status).toBe('running');
  });

  it('refuses a member that names itself as the Conductor', async () => {
    const result = await router.execute(asImpl, {
      command: 'propose-revision',
      as: 'lead',
      proposal: { kind: 'suspend-member', memberId: 'scout' },
    });
    expect(result.ok).toBe(false);
    expect(result.details.code).toBe('actor-mismatch');
    expect((await store.readMember(roomId, 'scout'))?.status).toBe('idle');
  });

  it('refuses a Room change proposed by a peer', async () => {
    const result = await router.execute(asImpl, {
      command: 'propose-revision',
      proposal: { kind: 'suspend-member', memberId: 'scout' },
    });
    expect(result.ok).toBe(false);
    expect(result.details.code).toBe('conductor-only');
  });

  it('applies a revision the Conductor proposes and records it', async () => {
    const result = await router.execute(asLead, {
      command: 'propose-revision',
      reason: 'the scout is done',
      proposal: { kind: 'suspend-member', memberId: 'scout' },
    });
    expect(result.ok).toBe(true);
    expect((await store.readMember(roomId, 'scout'))?.status).toBe('suspended');
    expect((await store.readRevisions(roomId))[0]).toMatchObject({ kind: 'suspend-member', outcome: 'applied' });
  });

  it('holds an authority expansion for the user instead of applying it', async () => {
    const result = await router.execute(asLead, {
      command: 'propose-revision',
      reason: 'we need more room to spend',
      proposal: { kind: 'request-expansion', field: 'maxCostUsd', value: 100 },
    });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('has to approve');
    const record = await store.readRoom(roomId);
    expect(record?.definition.envelope.maxCostUsd).toBe(20);
    expect(record?.approvals[0]).toMatchObject({ status: 'pending', kind: 'limit-change' });
  });
});

describe('routing', () => {
  it('sends a question through the mailbox and stops the asker', async () => {
    const result = await router.execute(asImpl, {
      command: 'ask',
      to: ['scout'],
      body: 'which upstream commit broke it?',
    });
    expect(result.ok).toBe(true);
    const messages = await store.readMessages(roomId, 0, 10);
    expect(messages[0]).toMatchObject({ kind: 'question', fromMemberId: 'impl', toMemberIds: ['scout'] });
    expect((await store.readMember(roomId, 'impl'))?.status).toBe('waiting');
  });

  it('records an advisory claim and warns the second member off it', async () => {
    const first = await router.execute(asImpl, {
      command: 'claim-paths',
      paths: ['src/parser'],
      reason: 'rewriting the tokenizer',
    });
    expect(first.ok).toBe(true);
    expect((await store.readRoom(roomId))?.claims).toHaveLength(1);

    const second = await router.execute(
      { sessionPath: sessionOf('scout'), cwd: '/workspaces/ws-1' },
      { command: 'claim-paths', paths: ['src/parser/lexer.ts'], reason: 'reading it' },
    );
    expect(second.ok).toBe(true);
    expect(second.text).toContain('already claimed');
    expect(second.text).toContain('advisory');
  });

  it('releases only the paths the caller holds', async () => {
    await router.execute(asImpl, { command: 'claim-paths', paths: ['src/a', 'src/b'], reason: 'mine' });
    const released = await router.execute(asImpl, { command: 'release-paths', paths: ['src/a'] });
    expect(released.text).toContain('src/a');
    const active = (await store.readRoom(roomId))?.claims.filter((claim) => claim.status === 'active') ?? [];
    expect(active.map((claim) => claim.pattern)).toEqual(['src/b']);
  });

  it('creates work and counts it as structural progress', async () => {
    const result = await router.execute(asImpl, {
      command: 'update-work',
      title: 'Rewrite the tokenizer',
      status: 'in progress',
    });
    expect(result.ok).toBe(true);
    const record = await store.readRoom(roomId);
    expect(record?.work[0]).toMatchObject({ title: 'Rewrite the tokenizer', ownerMemberId: 'impl' });
    // The brief is rebuilt only on structural progress, so this is what proves
    // the coordinator was told rather than the record merely written.
    expect(record?.runtime.lastProgressAt).not.toBeNull();
    expect(record?.brief.activeWork[0]).toContain('Rewrite the tokenizer');
  });

  it('will not let a member put work on someone else', async () => {
    const result = await router.execute(asImpl, {
      command: 'update-work',
      title: 'Read the docs',
      memberId: 'scout',
    });
    expect(result.ok).toBe(false);
    expect(result.details.code).toBe('not-conductor');
  });

  it('publishes an artifact stamped with the caller as its producer', async () => {
    const result = await router.execute(asImpl, {
      command: 'publish-artifact',
      artifactKind: 'decision',
      title: 'Use a hand-written lexer',
      body: 'Generated parsers cost more than they save here.',
    });
    expect(result.ok).toBe(true);
    const record = await store.readRoom(roomId);
    expect(record?.artifacts[0]).toMatchObject({ kind: 'decision', producedByMemberId: 'impl' });
    expect(record?.brief.decisions).toContain('Use a hand-written lexer');
  });

  it('records a status line without calling it progress', async () => {
    const before = (await store.readRoom(roomId))?.runtime.lastProgressAt ?? null;
    const result = await router.execute(asImpl, { command: 'report-status', body: 'still reading the parser' });
    expect(result.ok).toBe(true);
    const record = await store.readRoom(roomId);
    expect(record?.members.find((member) => member.id === 'impl')?.statusDetail).toBe('still reading the parser');
    // §21: talking is not progress. A Room that only reports must still reach
    // the no-progress ladder.
    expect(record?.runtime.lastProgressAt).toBe(before);
  });

  it('stops a member that needs the user, and holds no execution slot for it', async () => {
    const result = await router.execute(asImpl, {
      command: 'request-attention',
      body: 'the fix needs a database password',
    });
    expect(result.ok).toBe(true);
    const record = await store.readRoom(roomId);
    expect(record?.members.find((member) => member.id === 'impl')?.status).toBe('blocked');
    expect(record?.runtime.activeMemberIds).not.toContain('impl');
  });

  it('publishes the Conductor note apart from every computed brief field', async () => {
    await router.execute(asLead, { command: 'publish-note', body: 'we are behind on the parser' });
    const record = await store.readRoom(roomId);
    expect(record?.brief.conductorNote).toBe('we are behind on the parser');
    expect(record?.brief.objective).toBe('Fix the crash on start');
  });

  it('finishes the Room when the Conductor says so', async () => {
    const result = await router.execute(asLead, { command: 'finish-room', summary: 'the crash is fixed' });
    expect(result.ok).toBe(true);
    expect((await store.readRoom(roomId))?.runtime.status).toBe('completed');
  });
});

describe('idempotency', () => {
  it('applies a repeated command id once', async () => {
    const first = await router.execute(asImpl, {
      command: 'update-work',
      commandId: 'cmd-7',
      title: 'Rewrite the tokenizer',
    });
    const second = await router.execute(asImpl, {
      command: 'update-work',
      commandId: 'cmd-7',
      title: 'Rewrite the tokenizer',
    });
    expect(first.ok).toBe(true);
    expect(second.details.duplicate).toBe(true);
    expect((await store.readRoom(roomId))?.work).toHaveLength(1);
  });

  it('treats a call without a key as a new action', async () => {
    await router.execute(asImpl, { command: 'update-work', title: 'One' });
    await router.execute(asImpl, { command: 'update-work', title: 'Two' });
    expect((await store.readRoom(roomId))?.work).toHaveLength(2);
  });

  it('publishes an artifact once for a repeated key', async () => {
    const publish = () =>
      router.execute(asImpl, {
        command: 'publish-artifact',
        commandId: 'cmd-8',
        artifactKind: 'report',
        title: 'What broke',
        body: 'The tokenizer drops the last token.',
      });
    expect((await publish()).ok).toBe(true);
    expect((await publish()).details.duplicate).toBe(true);
    expect((await store.readRoom(roomId))?.artifacts).toHaveLength(1);
  });

  it('never records a command key without the work item it guards', async () => {
    const add = () =>
      router.execute(asImpl, { command: 'update-work', commandId: 'cmd-9', title: 'Rewrite the tokenizer' });

    // The Room record is written once and then the disk goes away, which is what
    // a crash looks like to the next start: a second write never happens.
    let writes = 0;
    failWrite = (file) => file.endsWith('room.json') && (writes += 1) > 1;
    await add().catch(() => undefined);
    failWrite = () => false;

    // Whatever landed, the key and the work item landed together — so the retry
    // either finds the item and adds nothing, or finds neither and adds one.
    const restarted = createRoomStore(makeCtx());
    const stored = await restarted.readRoom(roomId);
    expect(await restarted.hasAppliedCommand(roomId, 'cmd-9')).toBe(stored?.work.length === 1);

    await add();
    expect((await createRoomStore(makeCtx()).readRoom(roomId))?.work).toHaveLength(1);
  });
});

describe('asking without stopping', () => {
  it('keeps the asker working when it says so, and still delivers the question', async () => {
    const result = await router.execute(asLead, {
      command: 'ask',
      to: ['impl', 'scout'],
      body: 'how long do you each need?',
      keepWorking: true,
    });
    expect(result.ok).toBe(true);
    expect((await store.readMember(roomId, 'lead'))?.status).toBe('idle');
    expect((await store.readMessages(roomId, 0, 10))[0]).toMatchObject({ kind: 'question' });
  });
});
