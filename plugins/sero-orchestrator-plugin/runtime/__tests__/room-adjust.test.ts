import { describe, expect, it } from 'vitest';

import type { BlueprintMember, OperatingEnvelope, RoomBlueprint } from '../../shared/room-blueprint-types';
import type { RoomUserLocks } from '../../shared/room-locks';
import { computeProposalSummary, validateRoomBlueprint } from '../../shared/room-validation';
import { adjustRoom } from '../rooms/adjust';
import { parseRoomBlueprint } from '../rooms/blueprint-schema';
import { createFakeHost } from './fake-host';

const envelope: OperatingEnvelope = {
  maxMembers: 4,
  maxActiveTurns: 2,
  maxRosterRevisions: 5,
  maxMemberReplacements: 2,
  maxWallClockMs: 3_600_000,
  maxCostUsd: 5,
  maxCostUsdPerMember: 2,
  maxTokens: 1_000_000,
  maxTokensPerMember: 400_000,
  maxTurnsPerMember: 20,
  maxRetriesPerMember: 2,
  maxConsecutiveFailures: 3,
  allowedModels: ['sonnet', 'haiku'],
  allowedThinkingLevels: ['off', 'low', 'high'],
  allowedTools: ['read', 'write', 'bash', 'gh', 'sero-cli'],
  allowedSkills: ['sero-plugin'],
  workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
  allowedDeliveryDestinations: ['pr', 'chat-post'],
  allowNestedSubagents: false,
  maxIdleMs: 300_000,
};

function member(overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return {
    key: 'conductor',
    displayName: 'Conductor',
    role: 'Conductor',
    responsibility: 'Runs the Room.',
    mandate: 'Coordinate the work.',
    isConductor: true,
    model: 'sonnet',
    thinking: 'high',
    promptAdditions: [],
    tools: ['read', 'sero-cli'],
    skills: [],
    permissions: 'read-only',
    needsWorktree: false,
    reasonForInclusion: 'Someone must coordinate.',
    ...overrides,
  };
}

const implementer = member({
  key: 'impl',
  displayName: 'Implementer',
  role: 'Implementer',
  isConductor: false,
  tools: ['read', 'write', 'sero-cli'],
  permissions: 'edit-workspace',
  needsWorktree: true,
  responsibility: 'Writes the change.',
});

function blueprint(overrides: Partial<RoomBlueprint> = {}): RoomBlueprint {
  return {
    schemaVersion: 1,
    title: 'Fix the flaky test',
    approach: 'One implementer, one coordinator.',
    objective: 'Make the suite green.',
    successCriteria: ['The suite passes twice.'],
    roomInstructions: 'Stay inside the repo.',
    members: [member(), implementer],
    teamRationale: 'Two is enough.',
    collaborationStrategy: 'Ask before editing.',
    workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
    envelope,
    estimatedDurationMs: 600_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'pr',
    openAssumptions: [],
    ...overrides,
  };
}

const catalogue = {
  models: ['sonnet', 'haiku'],
  tools: ['read', 'write', 'bash', 'gh', 'sero-cli', 'kubectl'],
  skills: ['sero-plugin'],
};

function reply(value: unknown): { response: string } {
  return { response: JSON.stringify(value) };
}

describe('adjustRoom', () => {
  it('applies the change, recomputes the proposal and reports a member-level gain no tile shows', async () => {
    const previous = blueprint();
    const revised = blueprint({
      members: [member({ tools: ['read', 'write', 'sero-cli'] }), implementer],
      approach: 'The coordinator can now edit too.',
    });
    const host = createFakeHost();
    host.modelResponses = [reply(revised)];

    const result = await adjustRoom(host, {
      blueprint: previous,
      instruction: 'Let the coordinator edit files as well.',
      userLocks: {},
      parentSessionId: 'sess-1',
      catalogue,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blueprint.members[0].tools).toEqual(['read', 'write', 'sero-cli']);
    expect(result.proposal.approach).toBe('The coordinator can now edit too.');
    expect(result.proposal.teamSize).toBe(2);

    // The union tiles are identical — the Implementer already held `write` — but
    // the Conductor's own authority grew, so the diff must still report it.
    expect(computeProposalSummary(previous).access).toEqual(result.proposal.access);
    expect(result.diff.authorityUnchanged).toBe(false);
    expect(result.diff.memberChanges).toHaveLength(1);
    expect(result.diff.memberChanges[0].key).toBe('conductor');
    expect(result.diff.memberChanges[0].toolsAdded).toEqual(['write']);
    expect(result.clamps).toEqual([]);
  });

  it('re-imposes the user locks in code when the model ignores them', async () => {
    const previous = blueprint();
    const greedy: RoomBlueprint = {
      ...previous,
      envelope: { ...envelope, maxCostUsd: 50, maxMembers: 9, maxWallClockMs: 86_400_000 },
      deliveryDestination: 'chat-post',
      members: [
        member({ tools: ['read', 'kubectl', 'sero-cli'] }),
        { ...implementer, permissions: 'edit-and-push' },
        member({ key: 'extra', displayName: 'Extra', isConductor: false }),
      ],
    };
    const locks: RoomUserLocks = {
      maxCostUsd: 3,
      maxMembers: 2,
      deliveryDestination: 'pr',
      permissionCeiling: 'read-only',
    };
    const host = createFakeHost();
    host.modelResponses = [reply(greedy)];

    const result = await adjustRoom(host, {
      blueprint: previous,
      instruction: 'Give everyone more room to work.',
      userLocks: locks,
      parentSessionId: 'sess-1',
      catalogue,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blueprint.envelope.maxCostUsd).toBe(3);
    expect(result.blueprint.envelope.maxWallClockMs).toBe(envelope.maxWallClockMs);
    expect(result.blueprint.members).toHaveLength(2);
    expect(result.blueprint.members[0].tools).toEqual(['read', 'sero-cli']);
    expect(result.blueprint.members.every((entry) => entry.permissions === 'read-only')).toBe(true);
    expect(result.blueprint.deliveryDestination).toBe('pr');
    expect(validateRoomBlueprint(result.blueprint, catalogue)).toEqual({ ok: true });
    // Every reduction is reported — the user is never shown a quietly shrunk team.
    expect(result.clamps.map((clamp) => clamp.kind)).toEqual(
      expect.arrayContaining(['envelope-lowered', 'member-dropped', 'tools-removed', 'permissions-lowered', 'delivery-substituted']),
    );

    // The prompt states the locks as well; the code enforcement is the backstop.
    expect(host.modelCalls[0].task).toContain('$3');
    expect(host.modelCalls[0].task).toContain('Maximum team size: 2');
  });

  it('refuses a reply that authors the consent summary, and repairs once', async () => {
    const previous = blueprint();
    const withSummary = {
      ...previous,
      approach: 'Smaller team.',
      proposal: { teamSize: 1, maxCostUsd: 5, access: ['reads your workspace'] },
      changes: ['removed the implementer'],
    };
    const host = createFakeHost();
    host.modelResponses = [reply(withSummary), reply(blueprint({ approach: 'Smaller team.' }))];

    const result = await adjustRoom(host, {
      blueprint: previous,
      instruction: 'Say it more simply.',
      userLocks: {},
      parentSessionId: 'sess-1',
      catalogue,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(host.modelCalls).toHaveLength(2);
    expect(host.modelCalls[1].task).toContain('proposal');
    expect(host.modelCalls[1].task).toContain('computed');
    expect(result.proposal.approach).toBe('Smaller team.');
  });

  it('stops after one repair pass and reports why', async () => {
    const host = createFakeHost();
    host.modelResponses = [reply({ title: 'nope' }), { response: 'still not JSON' }];

    const result = await adjustRoom(host, {
      blueprint: blueprint(),
      instruction: 'Add a security reviewer.',
      userLocks: {},
      parentSessionId: 'sess-1',
      catalogue,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(host.modelCalls).toHaveLength(2);
    expect(result.modelResponses).toHaveLength(2);
    expect(result.errors.join(' ')).toContain('must be');
  });

  it('feeds precise validation errors back rather than coercing them', async () => {
    const previous = blueprint();
    const twoConductors = blueprint({ members: [member(), member({ key: 'second', displayName: 'Second' })] });
    const host = createFakeHost();
    host.modelResponses = [reply(twoConductors), reply(previous)];

    const result = await adjustRoom(host, {
      blueprint: previous,
      instruction: 'Add another coordinator.',
      userLocks: {},
      parentSessionId: 'sess-1',
      catalogue,
    });

    expect(result.ok).toBe(true);
    expect(host.modelCalls[1].task).toContain('exactly one Conductor');
  });

  it('does not call the model for an empty instruction', async () => {
    const host = createFakeHost();
    const result = await adjustRoom(host, {
      blueprint: blueprint(),
      instruction: '   ',
      userLocks: {},
      parentSessionId: 'sess-1',
      catalogue,
    });
    expect(result.ok).toBe(false);
    expect(host.modelCalls).toHaveLength(0);
  });
});

describe('parseRoomBlueprint', () => {
  it('keeps only the declared fields, so an invented one cannot reach the store', () => {
    const parsed = parseRoomBlueprint({ ...blueprint(), plannerNote: 'this team is cheap', roles: [] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.value)).not.toContain('plannerNote');
    expect(Object.keys(parsed.value)).not.toContain('roles');
  });

  it('names the exact field that is wrong', () => {
    const parsed = parseRoomBlueprint({ ...blueprint(), members: [{ ...member(), tools: 'read' }] });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual(['members[0].tools must be an array of strings (got "read")']);
  });

  it('reports missing containers once instead of every field beneath them', () => {
    const parsed = parseRoomBlueprint({ title: 'x' });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toHaveLength(3);
  });
});
