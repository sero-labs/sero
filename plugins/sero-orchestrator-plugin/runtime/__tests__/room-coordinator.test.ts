/**
 * Room coordinator: lifecycle, the scheduling pass, the event wake path and
 * restart recovery.
 *
 * Every test runs on a real store in a temp dir and the fake persistent-session
 * capability, so the properties under test are the real ones — one writer, one
 * turn per member, capacity honoured, and the grant released when the Room
 * finishes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type {
  BlueprintMember,
  OperatingEnvelope,
  RoomBlueprint,
} from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import { createMemberSessionPool } from '../rooms/member-session';
import { RoomCoordinator } from '../rooms/room-coordinator';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createFakeHost, type FakeHost } from './fake-host';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;

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

function envelopeWith(overrides: Partial<OperatingEnvelope> = {}): OperatingEnvelope {
  return {
    maxMembers: 4,
    maxActiveTurns: 2,
    maxRosterRevisions: 5,
    maxMemberReplacements: 2,
    maxWallClockMs: 3_600_000,
    maxCostUsd: 20,
    maxCostUsdPerMember: 10,
    maxTokens: 1_000_000,
    maxTokensPerMember: 500_000,
    maxTurnsPerMember: 20,
    maxRetriesPerMember: 3,
    maxConsecutiveFailures: 2,
    allowedModels: ['sonnet'],
    allowedThinkingLevels: ['medium'],
    allowedTools: ['read', 'write'],
    allowedSkills: [],
    workspacePolicy: { mode: 'read-only-shared', sharedTreeApproved: false, claimPolicy: 'warn' },
    allowedDeliveryDestinations: ['saved-artifact'],
    allowNestedSubagents: false,
    maxIdleMs: 600_000,
    ...overrides,
  };
}

function member(overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return {
    key: 'lead',
    displayName: 'Lead',
    role: 'Conductor',
    responsibility: 'Coordinates the Room.',
    mandate: 'Keep the team moving.',
    isConductor: true,
    model: 'sonnet',
    thinking: 'medium',
    promptAdditions: [],
    tools: ['read'],
    skills: [],
    permissions: 'read-only',
    needsWorktree: false,
    reasonForInclusion: 'Someone has to decide.',
    ...overrides,
  };
}

const MEMBERS: BlueprintMember[] = [
  member(),
  member({ key: 'impl', displayName: 'Implementer', role: 'Implementer', isConductor: false }),
  member({ key: 'scout', displayName: 'Scout', role: 'Researcher', isConductor: false }),
];

function blueprintWith(envelope: OperatingEnvelope, members: BlueprintMember[]): RoomBlueprint {
  return {
    schemaVersion: 1,
    title: 'Ship the fix',
    approach: 'Split the work.',
    objective: 'Fix the crash on start',
    successCriteria: ['the app starts'],
    roomInstructions: 'Use sero-cli to talk to the Room.',
    members,
    teamRationale: 'One decides, two work.',
    collaborationStrategy: 'direct',
    workspacePolicy: envelope.workspacePolicy,
    envelope,
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'saved-artifact',
    openAssumptions: [],
  };
}

async function draftRoom(envelope = envelopeWith(), members = MEMBERS): Promise<string> {
  const blueprint = blueprintWith(envelope, members);
  const result = await coordinator.createRoom({
    problemStatement: 'the app crashes',
    blueprint,
    proposal: computeProposalSummary(blueprint),
    workspaceId: 'ws-1',
  });
  if (!result.room) throw new Error(result.error ?? 'no room');
  return result.room.definition.id;
}

/** Turns are launched outside the Room lock, so tests wait on the store, not on a call. */
async function waitFor(predicate: () => boolean | Promise<boolean>, label = 'condition'): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const memberOf = async (roomId: string, memberId: string) => {
  const found = await store.readMember(roomId, memberId);
  if (!found) throw new Error(`no member ${memberId}`);
  return found;
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-coordinator-'));
  host = createFakeHost();
  store = createRoomStore(makeCtx());
  coordinator = new RoomCoordinator(host, { store, sessions: createMemberSessionPool({ host, store }) });
});

afterEach(async () => {
  // Turns run outside the Room lock, so a test can finish while one last write
  // is in flight. Let the queue drain before the directory goes.
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

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

  it('pauses the Room when the Conductor cannot start', async () => {
    const roomId = await draftRoom();
    host.persistentSessions.refuseGrant = true;

    const result = await coordinator.startRoom(roomId);
    expect(result.ok).toBe(false);
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('draft');
    expect(record?.definition.grantId).toBeNull();
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

describe('restart recovery', () => {
  it('frees an interrupted turn, keeps the session file, and wakes only the Conductor', async () => {
    const roomId = await draftRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'idle', 'the Conductor to finish');
    // Stand in for a dead process: the Implementer was mid-turn and its handle
    // is now a stale pointer.
    await store.updateRoom(roomId, (record) => ({
      ...record,
      members: record.members.map((entry) =>
        entry.id === 'impl'
          ? {
              ...entry,
              status: 'working',
              statusDetail: 'Working.',
              session: { ...entry.session, sessionId: 'session-impl', liveHandleId: 'handle-9' },
            }
          : entry,
      ),
      runtime: { ...record.runtime, activeMemberIds: ['impl'] },
    }));

    const restarted = new RoomCoordinator(host, { store, sessions: createMemberSessionPool({ host, store }) });
    await restarted.reconcileRooms();

    const impl = await memberOf(roomId, 'impl');
    // Idle, not failed: the turn may already have done its work, so it is not
    // re-prompted — the Conductor decides what still needs doing.
    expect(impl.status).toBe('idle');
    expect(impl.session.liveHandleId).toBeNull();
    expect(impl.session.sessionId).toBe('session-impl');
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('running');
    // Only the Conductor was resumed: the interrupted member's session was
    // never reopened, so its uncertain turn is not repeated.
    expect(record?.runtime.activeMemberIds).toEqual(['lead']);
    expect(api.requests.filter((request) => request.subject === 'impl')).toEqual([]);
    // Recovery reads current records only. Nothing replays a transcript: the
    // Room is rebuilt from state, never from what the members said (§26).
    expect(api.historyReads).toEqual([]);
    expect(api.prompts.filter((entry) => entry.handleId === 'handle-9')).toEqual([]);
  });

  it('does not repeat an interrupted delivery', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    await store.updateRoom(roomId, (record) => ({
      ...record,
      runtime: { ...record.runtime, status: 'completing' },
    }));

    await new RoomCoordinator(host, { store, sessions: createMemberSessionPool({ host, store }) }).reconcileRooms();
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('completing');
    expect(record?.runtime.stopReason?.kind).toBe('awaiting-approval');
  });
});
