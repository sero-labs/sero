/**
 * The critical flow, end to end: a chat asks for a Room, the user starts it, the
 * team works, the user steps in, the Conductor finishes, and the answer comes
 * back to the chat that asked for it (FR-029, phase 7 acceptance).
 *
 * Nothing here is seeded past the first record. Every step goes through the
 * surface a real caller would use — the user's `RoomAppActions`, the members'
 * AD-020 command router — so the flow under test is the wiring itself rather
 * than a sequence of store writes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { RoomBlueprint } from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import type { RoomIndex } from '../../shared/room-types';
import { createMemberSessionPool } from '../rooms/member-session';
import { createRoomAppActions, type RoomAppActions } from '../rooms/room-app-actions';
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
let app: RoomAppActions;
let roomId: string;

const sessionOf = (memberId: string): string => `/sessions/rooms/${memberId}.jsonl`;
const asLead = { sessionPath: sessionOf('lead'), cwd: '/workspaces/ws-1' };
const asImpl = { sessionPath: sessionOf('impl'), cwd: '/workspaces/ws-1' };

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

/** The Room a chat asked for: it knows which session to answer. */
async function roomFromChat(): Promise<void> {
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
    deliveryDestination: 'invoking-chat',
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
    originSessionId: 'sess-9',
  });
  if (!created.room) throw new Error(created.error ?? 'no room');
  roomId = created.room.definition.id;

  router = createRoomCommandRouter({
    host,
    store,
    mailbox: coordinator.mailbox,
    claims,
    work,
    applyRevision: (input) => applyRoomRevision({ host, store, mutate: applyRevisionToRoom }, input),
    workspaces: createRoomWorkspaces({ host, store }),
    requestDeliveryApproval: (request) => requestDeliveryApproval({ host, store }, request),
    completeRoom: (id, summary, receipt) => coordinator.completeRoom(id, summary, receipt),
    publishConductorNote: (id, note) => coordinator.publishConductorNote(id, note),
    noteStructuralProgress: (id, summary, recordEvent) =>
      coordinator.noteStructuralProgress(id, summary, recordEvent),
  });
  app = createRoomAppActions({ host, store, coordinator, workspaceId: 'ws-1' });
}

/** What activation writes: a session per member, everyone ready for a turn. */
async function activate(): Promise<void> {
  await store.updateRoom(roomId, (record) => ({
    ...record,
    // The grant is what a started Room runs on; without it nothing may resume.
    definition: { ...record.definition, grantId: 'grant-1' },
    runtime: { ...record.runtime, status: 'running', startedAt: host.now() },
    members: record.members.map((member) => ({
      ...member,
      status: 'idle' as const,
      statusDetail: 'Ready.',
      session: { ...member.session, sessionId: `s-${member.id}`, sessionPath: sessionOf(member.id) },
    })),
  }));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-flow-'));
  host = createFakeHost();
  store = createRoomStore(makeCtx());
  await roomFromChat();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('a Room from a chat, start to finish', () => {
  it('works the problem and returns one result to the chat that asked', async () => {
    await activate();

    // The team works: one member records what it is doing and publishes what it
    // produced, and both land on the Room record the panel reads.
    const workItem = await router.execute(asImpl, { command: 'update-work', title: 'Fix the start path' });
    expect(workItem.ok).toBe(true);
    const published = await router.execute(asImpl, {
      command: 'publish-artifact',
      artifactKind: 'report',
      title: 'What was wrong',
      body: 'The start path reused a stale handle.',
    });
    expect(published.ok).toBe(true);

    // The user steps in. It reaches the Room as the Room, not as a member.
    expect(await app.intervene(roomId, 'Check the migration before you finish.')).toEqual({ ok: true });
    const told = (await store.readMessages(roomId, 0, 50)).find((m) => m.body.includes('migration'));
    expect(told).toMatchObject({ kind: 'system', fromMemberId: null });

    // The Conductor finishes. Completion delivers, and delivery is what makes
    // the chat's answer real.
    const finished = await router.execute(asLead, { command: 'finish-room', summary: 'The crash is fixed.' });
    expect(finished.ok).toBe(true);

    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('completed');
    expect(record?.delivery.deliveredAt).not.toBeNull();
    expect(record?.delivery.deliveryRef).toBe('session:sess-9');

    // One message, to the session that asked, carrying the result and the proof.
    expect(host.sessionSends).toEqual([{ sessionId: 'sess-9', kind: 'context' }]);
    const sent = String(host.contextMessages[0].content);
    expect(sent).toContain('The crash is fixed.');
    expect(sent).toContain('What was wrong');

    // And the watched index says the same thing, because that is all the Rooms
    // list and the Agent Board ever read.
    const index: RoomIndex = JSON.parse(await readFile(path.join(dir, 'rooms', 'index.json'), 'utf8'));
    expect(index.rooms.find((room) => room.id === roomId)).toMatchObject({ status: 'completed', memberCount: 3 });
  });

  it('holds the Room while it is paused, and lets it finish once resumed', async () => {
    await activate();
    expect(await app.pause(roomId, 'Standing it down for a moment.')).toEqual({ ok: true });

    const paused = await store.readRoom(roomId);
    expect(paused?.runtime.status).toBe('paused');
    // A paused Room says why, and the panel shows that line rather than a guess.
    expect(paused?.runtime.stopReason).toMatchObject({ kind: 'user-paused' });

    expect(await app.resume(roomId)).toEqual({ ok: true });
    expect((await store.readRoom(roomId))?.runtime.stopReason).toBeNull();

    const finished = await router.execute(asLead, { command: 'finish-room', summary: 'Done after all.' });
    expect(finished.ok).toBe(true);
    expect(host.sessionSends).toHaveLength(1);
  });

  it('never delivers twice, however the Room is finished', async () => {
    await activate();
    await router.execute(asLead, { command: 'finish-room', summary: 'The crash is fixed.' });
    const second = await router.execute(asLead, { command: 'finish-room', summary: 'The crash is fixed again.' });

    expect(second.ok).toBe(false);
    expect(host.sessionSends).toHaveLength(1);
  });

  it('stops the Room on the user\'s word, and says so instead of delivering', async () => {
    await activate();
    expect(await app.cancel(roomId, 'Not needed after all.')).toEqual({ ok: true });

    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('cancelled');
    expect(record?.delivery.deliveredAt).toBeNull();
    expect(host.sessionSends).toEqual([]);
  });
});
