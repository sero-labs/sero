/**
 * Workspace placement, work records and advisory claims (spec §19, §20).
 *
 * Every test runs on a real store in a temp dir, so what is asserted is what
 * would be persisted. The four properties that matter most here — two editors
 * never share a tree, a claim is advice and not a lock, a claim dies with its
 * member, and cancelling never destroys uncommitted work — each have their own
 * test, because each of them is a promise made to the user.
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
import { createRoomClaims, type RoomClaims } from '../rooms/room-claims';
import { RoomCoordinator } from '../rooms/room-coordinator';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createRoomWork, type RoomWork } from '../rooms/room-work';
import { createRoomWorkspaces, type RoomWorkspaces } from '../rooms/room-workspace';
import { createFakeHost, type FakeHost } from './fake-host';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;
let workspaces: RoomWorkspaces;
let work: RoomWork;
let claims: RoomClaims;

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
    maxMembers: 6,
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
    workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
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

const EDITORS: BlueprintMember[] = [
  member(),
  member({
    key: 'api', displayName: 'API', role: 'Implementer', isConductor: false,
    permissions: 'edit-workspace', needsWorktree: true, tools: ['read', 'write'],
  }),
  member({
    key: 'ui', displayName: 'UI', role: 'Implementer', isConductor: false,
    permissions: 'edit-workspace', needsWorktree: true, tools: ['read', 'write'],
  }),
];

async function draftRoom(envelope = envelopeWith(), members = EDITORS): Promise<string> {
  const blueprint: RoomBlueprint = {
    schemaVersion: 1,
    title: 'Ship the fix',
    approach: 'Split the work.',
    objective: 'Fix the crash on start',
    successCriteria: ['the app starts'],
    roomInstructions: 'Use sero-cli to talk to the Room.',
    members,
    teamRationale: 'One decides, two build.',
    collaborationStrategy: 'direct',
    workspacePolicy: envelope.workspacePolicy,
    envelope,
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'saved-artifact',
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

const memberOf = async (roomId: string, memberId: string) => {
  const found = await store.readMember(roomId, memberId);
  if (!found) throw new Error(`no member ${memberId}`);
  return found;
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-workspace-'));
  host = createFakeHost();
  store = createRoomStore(makeCtx());
  coordinator = new RoomCoordinator(host, { store, sessions: createMemberSessionPool({ host, store }) });
  workspaces = createRoomWorkspaces({ host, store });
  work = createRoomWork({ host, store });
  claims = createRoomClaims({ host, store });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('workspace placement', () => {
  it('gives two editing members separate worktrees and leaves readers on the shared tree', async () => {
    const roomId = await draftRoom();
    const placements = await workspaces.prepare(roomId);

    const api = placements.find((placement) => placement.memberId === 'api');
    const ui = placements.find((placement) => placement.memberId === 'ui');
    const lead = placements.find((placement) => placement.memberId === 'lead');
    expect(api?.kind).toBe('own-worktree');
    expect(ui?.kind).toBe('own-worktree');
    expect(api?.cwd).not.toBe(ui?.cwd);
    expect(api?.cwd).not.toBe(host.workspacePath);
    expect(host.worktreesCreated).toEqual([`room-${roomId}-api`, `room-${roomId}-ui`]);

    // The reader shares the workspace and cannot change it.
    expect(lead).toMatchObject({ kind: 'read-only-shared', cwd: host.workspacePath, writable: false });

    const stored = await Promise.all([memberOf(roomId, 'api'), memberOf(roomId, 'ui')]);
    expect(stored[0].worktreePath).toBe(api?.cwd);
    expect(stored[1].worktreePath).toBe(ui?.cwd);
    expect(stored[0].worktreePath).not.toBe(stored[1].worktreePath);
  });

  it('reuses a checkout instead of minting a second branch for the same member', async () => {
    const roomId = await draftRoom();
    await workspaces.prepare(roomId);
    await workspaces.prepare(roomId);
    expect(host.worktreesCreated).toEqual([`room-${roomId}-api`, `room-${roomId}-ui`]);
  });

  it('refuses shared-tree editing until the user approves it', async () => {
    const roomId = await draftRoom(
      envelopeWith({ workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: false, claimPolicy: 'warn' } }),
    );
    const placements = await workspaces.prepare(roomId);
    // Unapproved, so the editors are isolated rather than let into the root.
    expect(placements.filter((placement) => placement.kind === 'own-worktree')).toHaveLength(2);
    expect(placements.every((placement) => placement.cwd !== host.workspacePath || !placement.writable)).toBe(true);
  });

  it('lets members edit the shared tree once the user has approved it', async () => {
    const roomId = await draftRoom(
      envelopeWith({ workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: true, claimPolicy: 'warn' } }),
    );
    const placements = await workspaces.prepare(roomId);
    const api = placements.find((placement) => placement.memberId === 'api');
    expect(api).toMatchObject({ kind: 'shared-tree', cwd: host.workspacePath, writable: true });
    expect(host.worktreesCreated).toEqual([]);
    expect((await memberOf(roomId, 'api')).worktreePath).toBeNull();
  });
});

describe('advisory path claims', () => {
  it('warns about an overlapping claim but still records it', async () => {
    const roomId = await draftRoom();
    const first = await claims.claim(roomId, 'api', ['src/server/app.ts'], 'fixing the crash');
    expect(first.ok).toBe(true);

    const second = await claims.claim(roomId, 'ui', ['src/server'], 'moving the handler');
    if (!second.ok) throw new Error(second.message);
    expect(second.claims).toHaveLength(1);
    expect(second.warning).toContain('API');
    expect(second.overlaps[0].memberIds).toEqual(['api']);
    expect((await claims.active(roomId)).map((claim) => claim.memberId).sort()).toEqual(['api', 'ui']);
  });

  it('refuses the whole claim under a blocking policy', async () => {
    const roomId = await draftRoom(
      envelopeWith({ workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'block' } }),
    );
    await claims.claim(roomId, 'api', ['src/server/app.ts'], 'fixing the crash');

    const blocked = await claims.claim(roomId, 'ui', ['src/server', 'docs/readme.md'], 'moving the handler');
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error('expected a refusal');
    expect(blocked.code).toBe('blocked-by-claim');
    expect(blocked.message).toContain('API');
    // Nothing partial: the unblocked path in the same request is not recorded.
    expect((await claims.active(roomId)).map((claim) => claim.memberId)).toEqual(['api']);
  });

  it('releases a member\'s claims when it retires', async () => {
    const roomId = await draftRoom();
    await claims.claim(roomId, 'api', ['src/server/app.ts', 'src/server/routes.ts'], 'fixing the crash');
    await claims.claim(roomId, 'ui', ['src/ui/app.tsx'], 'the button');

    await store.updateMember(roomId, 'api', (current) => ({ ...current, status: 'retired', retiredAt: host.now() }));

    // Retirement alone is enough: every claim read re-checks the roster, so a
    // missed release call cannot leave a retired member holding a path.
    const active = await claims.active(roomId);
    expect(active.map((claim) => claim.memberId)).toEqual(['ui']);
    const record = await store.readRoom(roomId);
    expect(record?.claims.filter((claim) => claim.memberId === 'api').every((claim) => claim.status === 'released')).toBe(true);
  });

  it('releases every claim when the Room ends', async () => {
    const roomId = await draftRoom();
    await claims.claim(roomId, 'api', ['src/server/app.ts'], 'fixing the crash');
    await claims.releaseAll(roomId, 'The Room finished.');
    expect(await claims.active(roomId)).toEqual([]);
  });
});

describe('work records and artifacts', () => {
  it('keeps status free-form and updates in place', async () => {
    const roomId = await draftRoom();
    const created = await work.update(roomId, 'api', { title: 'Fix the crash', status: 'looking at it' });
    if (!created.ok) throw new Error(created.message);
    expect(created.created).toBe(true);
    expect(created.item.status).toBe('looking at it');
    expect(created.item.ownerMemberId).toBe('api');

    const updated = await work.update(roomId, 'api', { workId: created.item.id, status: 'waiting on review' });
    if (!updated.ok) throw new Error(updated.message);
    expect(updated.created).toBe(false);
    expect(updated.item.status).toBe('waiting on review');
    expect(await work.list(roomId)).toHaveLength(1);
  });

  it('lets only the Conductor put work on someone else', async () => {
    const roomId = await draftRoom();
    const refused = await work.update(roomId, 'api', { title: 'Write the UI', ownerMemberId: 'ui' });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('expected a refusal');
    expect(refused.code).toBe('not-conductor');

    const assigned = await work.update(roomId, 'lead', { title: 'Write the UI', ownerMemberId: 'ui' });
    if (!assigned.ok) throw new Error(assigned.message);
    expect(assigned.item.ownerMemberId).toBe('ui');
  });

  it('stamps an artifact with its producer and links it to the work', async () => {
    const roomId = await draftRoom();
    const item = await work.update(roomId, 'api', { title: 'Fix the crash' });
    if (!item.ok) throw new Error(item.message);

    const published = await work.publishArtifact(roomId, 'api', {
      kind: 'report',
      title: 'What broke',
      content: 'The handler threw on an empty body.',
      relatedWorkId: item.item.id,
    });
    if (!published.ok) throw new Error(published.message);
    expect(published.artifact.producedByMemberId).toBe('api');
    expect(published.artifact.relatedWorkId).toBe(item.item.id);
    expect(await host.readArtifact(published.artifact.ref)).toContain('empty body');
    const stored = (await work.list(roomId)).find((entry) => entry.id === item.item.id);
    expect(stored?.artifactRefs).toEqual([published.artifact.ref]);
  });
});

describe('preserving uncommitted work', () => {
  it('leaves uncommitted work in place when the Room is cancelled', async () => {
    const roomId = await draftRoom();
    const placements = await workspaces.prepare(roomId);
    const apiTree = placements.find((placement) => placement.memberId === 'api')?.cwd ?? '';

    const cancelled = await coordinator.cancelRoom(roomId, 'You cancelled this Room.');
    expect(cancelled.ok).toBe(true);
    // The guarantee: cancelling reaches no removal at all.
    expect(host.worktreesRemoved).toEqual([]);
    expect((await memberOf(roomId, 'api')).worktreePath).toBe(apiTree);

    // And the work in those checkouts can still be made durable afterwards.
    const preserved = await workspaces.preserveRoom(roomId, 'cancelled');
    expect(preserved.map((entry) => entry.memberId).sort()).toEqual(['api', 'ui']);
    expect(preserved.every((entry) => entry.commit && !entry.error)).toBe(true);
    expect(host.checkpoints.map((checkpoint) => checkpoint.worktreePath)).toContain(apiTree);
  });

  it('keeps naming a checkout after the member stops needing one', async () => {
    const roomId = await draftRoom();
    const placements = await workspaces.prepare(roomId);
    const apiTree = placements.find((placement) => placement.memberId === 'api')?.cwd ?? '';

    // A revision lowers the member to read-only. Its edits are still in that tree.
    await store.updateMember(roomId, 'api', (current) => ({
      ...current,
      configuration: { ...current.configuration, permissions: 'read-only' },
    }));
    const placement = await workspaces.prepareMember(roomId, 'api');

    expect(placement?.kind).toBe('read-only-shared');
    expect((await memberOf(roomId, 'api')).worktreePath).toBe(apiTree);
    expect((await memberOf(roomId, 'api')).configuration.needsWorktree).toBe(false);
    expect(host.worktreesRemoved).toEqual([]);
  });

  it('keeps a checkout that could not be committed', async () => {
    const roomId = await draftRoom();
    const placements = await workspaces.prepare(roomId);
    const apiTree = placements.find((placement) => placement.memberId === 'api')?.cwd ?? '';
    host.checkpointFailures.set(apiTree, 'the index is locked');

    const result = await workspaces.releaseMember(roomId, 'api', 'retired');
    expect(result.removed).toBe(false);
    expect(result.preserved?.error).toBe('the index is locked');
    expect(host.worktreesRemoved).toEqual([]);
    expect((await memberOf(roomId, 'api')).worktreePath).toBe(apiTree);
  });

  it('commits before it removes, and never deletes an unmerged branch', async () => {
    const roomId = await draftRoom();
    await workspaces.prepare(roomId);

    const result = await workspaces.releaseMember(roomId, 'api', 'retired');
    expect(result.removed).toBe(true);
    expect(result.preserved?.commit).toBeTruthy();
    expect(host.worktreesRemoved).toEqual([`room-${roomId}-api`]);
    expect(host.worktreeRemovals[0]).toMatchObject({ deleteMergedBranch: true });
    expect(host.worktreeRemovals[0].deleteBranch).toBeUndefined();
    expect((await memberOf(roomId, 'api')).worktreePath).toBeNull();
  });
});

describe('collecting commits', () => {
  it('is the Conductor\'s alone', async () => {
    const roomId = await draftRoom();
    await workspaces.prepare(roomId);
    const denied = await workspaces.collectCommits(roomId, 'api');
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error('expected a refusal');
    expect(denied.code).toBe('not-conductor');
  });

  it('reports the files two members both changed', async () => {
    const roomId = await draftRoom();
    const placements = await workspaces.prepare(roomId);
    const apiTree = placements.find((placement) => placement.memberId === 'api')?.cwd ?? '';
    const uiTree = placements.find((placement) => placement.memberId === 'ui')?.cwd ?? '';
    host.diffSummaries.set(apiTree, 'M\tsrc/server/app.ts\nA\tsrc/server/routes.ts');
    host.diffSummaries.set(uiTree, 'M\tsrc/server/app.ts\nR100\tsrc/ui/old.tsx\tsrc/ui/new.tsx');

    const collected = await workspaces.collectCommits(roomId, 'lead');
    if (!collected.ok) throw new Error(collected.message);
    expect(collected.branches.map((branch) => branch.memberId)).toEqual(['api', 'ui']);
    expect(collected.branches[1].changedFiles).toContain('src/ui/new.tsx');
    expect(collected.conflicts).toEqual([{ path: 'src/server/app.ts', memberIds: ['api', 'ui'] }]);
    expect(collected.summary).toContain('src/server/app.ts');
    // Collection makes in-progress edits durable before it reads Git.
    expect(host.checkpoints).toHaveLength(2);
  });
});
