/**
 * Activation ordering: a member that edits gets its worktree BEFORE the Room
 * asks for its grant.
 *
 * This is the seam the unit tests could not see. `room-workspace.test.ts`
 * exercises `prepare()` directly, and every lifecycle fixture hand-sets
 * `worktreePath` to stand in for activation. Both pass whether or not anything
 * in the runtime actually creates the tree, so the property they appear to
 * cover — an editing member works in its own worktree — was never tested on the
 * path a user takes.
 *
 * `memberCwdRoots` throws for a member that needs a worktree and has none,
 * because pinning it to the shared tree is the reach the worktree exists to
 * prevent. So a Room with an editing member cannot start at all unless
 * activation prepares the workspace first.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { BlueprintMember, OperatingEnvelope, RoomBlueprint } from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import { createMemberSessionPool } from '../rooms/member-session';
import { RoomCoordinator } from '../rooms/room-coordinator';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createRoomWorkspaces } from '../rooms/room-workspace';
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

function envelope(): OperatingEnvelope {
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
    // The spec default for code work: a separate worktree for each editing member.
    workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
    allowedDeliveryDestinations: ['saved-artifact'],
    allowNestedSubagents: false,
    maxIdleMs: 600_000,
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

/** One read-only Conductor and two members that change files — the §20 default. */
const MEMBERS: BlueprintMember[] = [
  member(),
  member({
    key: 'impl',
    displayName: 'Implementer',
    role: 'Implementer',
    isConductor: false,
    tools: ['read', 'write'],
    permissions: 'edit-workspace',
    needsWorktree: true,
  }),
  member({
    key: 'fixer',
    displayName: 'Fixer',
    role: 'Fixer',
    isConductor: false,
    tools: ['read', 'write'],
    permissions: 'edit-workspace',
    needsWorktree: true,
  }),
];

async function draftRoom(deliveryDestination = 'saved-artifact'): Promise<string> {
  const env = envelope();
  const blueprint: RoomBlueprint = {
    schemaVersion: 1,
    title: 'Ship the fix',
    approach: 'Split the work.',
    objective: 'Fix the crash on start',
    successCriteria: ['the app starts'],
    roomInstructions: 'Use sero-cli to talk to the Room.',
    members: MEMBERS,
    teamRationale: 'One decides, two build.',
    collaborationStrategy: 'direct',
    workspacePolicy: env.workspacePolicy,
    envelope: env,
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 1,
    deliveryDestination,
    openAssumptions: [],
  };
  const result = await coordinator.createRoom({
    problemStatement: 'the app crashes',
    blueprint,
    proposal: computeProposalSummary(blueprint),
    workspaceId: 'ws-1',
  });
  if (!result.room) throw new Error(result.error ?? 'no room');
  return result.room.definition.id;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-activation-'));
  host = createFakeHost();
  store = createRoomStore(makeCtx());
  coordinator = new RoomCoordinator(host, {
    store,
    sessions: createMemberSessionPool({ host, store }),
    workspaces: createRoomWorkspaces({ host, store }),
  });
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('starting a Room whose members edit', () => {
  it('creates each editing member a worktree before the grant, and starts', async () => {
    const roomId = await draftRoom();

    const result = await coordinator.startRoom(roomId);

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    // One worktree per editing member, and none for the read-only Conductor.
    expect(host.worktreesCreated).toHaveLength(2);

    const record = await store.readRoom(roomId);
    const impl = record?.members.find((entry) => entry.id === 'impl');
    const fixer = record?.members.find((entry) => entry.id === 'fixer');
    const lead = record?.members.find((entry) => entry.id === 'lead');

    expect(impl?.worktreePath).toBeTruthy();
    expect(fixer?.worktreePath).toBeTruthy();
    expect(lead?.worktreePath).toBeNull();
    // Two editing members work in SEPARATE trees (§20, the Phase 6 criterion).
    expect(impl?.worktreePath).not.toBe(fixer?.worktreePath);
  });

  it('commits uncommitted member work and releases its worktrees when the Room is cancelled', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    const started = await store.readRoom(roomId);
    const implTree = started?.members.find((entry) => entry.id === 'impl')?.worktreePath ?? '';
    const fixerTree = started?.members.find((entry) => entry.id === 'fixer')?.worktreePath ?? '';

    await coordinator.cancelRoom(roomId, 'You cancelled this Room.');

    // Cancelling is the last moment a member's edits can be saved: after it the
    // grant is gone and no session can ever commit them.
    expect(host.checkpoints.map((entry) => entry.worktreePath).sort()).toEqual([implTree, fixerTree].sort());
    expect(host.worktreesRemoved.sort()).toEqual([`room-${roomId}-fixer`, `room-${roomId}-impl`]);
    expect((await store.readRoom(roomId))?.members.every((entry) => entry.worktreePath === null)).toBe(true);
  });

  it('commits uncommitted member work and releases its worktrees when the Room completes normally', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);
    const started = await store.readRoom(roomId);
    const implTree = started?.members.find((entry) => entry.id === 'impl')?.worktreePath ?? '';
    const fixerTree = started?.members.find((entry) => entry.id === 'fixer')?.worktreePath ?? '';

    await coordinator.completeRoom(roomId, 'The Room finished its work.');

    // Finishing is the ordinary ending, so it strands work more often than
    // cancelling does. Releasing the grant closes every session, and after that
    // nothing in the Room can commit what a member left behind.
    expect(host.checkpoints.map((entry) => entry.worktreePath).sort()).toEqual([implTree, fixerTree].sort());
    expect(host.worktreesRemoved.sort()).toEqual([`room-${roomId}-fixer`, `room-${roomId}-impl`]);
    expect((await store.readRoom(roomId))?.members.every((entry) => entry.worktreePath === null)).toBe(true);
  });

  it('pins each editing subject to its own tree, never to the shared workspace', async () => {
    const roomId = await draftRoom();
    await coordinator.startRoom(roomId);

    const [proposal] = host.persistentSessions.proposals;
    const record = await store.readRoom(roomId);
    const impl = record?.members.find((entry) => entry.id === 'impl');

    // The grant is the real boundary: the subject may only work in its own tree.
    expect(proposal.subjects.impl.allowedCwds).toEqual([impl?.worktreePath]);
    expect(proposal.subjects.impl.allowedCwds).not.toContain(host.workspacePath);
    expect(proposal.subjects.lead.allowedCwds).toEqual([host.workspacePath]);
  });

  it('does not start a Room that delivers to a chat when no chat started it', async () => {
    const roomId = await draftRoom('invoking-chat');

    const result = await coordinator.startRoom(roomId);

    // Refused BEFORE the work, not after paying for it: the old behaviour ran
    // the whole Room and then had nowhere to put the result.
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no chat started it');
    expect(host.persistentSessions.proposals).toEqual([]);
    const record = await store.readRoom(roomId);
    expect(record?.runtime.status).toBe('draft');
  });
});
