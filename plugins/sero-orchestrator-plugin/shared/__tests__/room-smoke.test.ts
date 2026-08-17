import { describe, expect, it } from 'vitest';

import type { BlueprintMember, OperatingEnvelope, RoomBlueprint } from '../room-blueprint-types';
import {
  clampBlueprintToEnvelope,
  computeProposalSummary,
  diffBlueprints,
  validateRoomBlueprint,
  validateRoomCommand,
} from '../room-validation';

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
  allowedTools: ['read', 'write', 'bash', 'gh', 'sero-cli', 'mystery_tool'],
  allowedSkills: ['sero-plugin'],
  workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
  allowedDeliveryDestinations: ['pr', 'chat-post'],
  allowNestedSubagents: false,
  maxIdleMs: 300_000,
};

function member(overrides: Partial<BlueprintMember>): BlueprintMember {
  return {
    key: 'conductor',
    displayName: 'Conductor',
    role: 'conductor',
    responsibility: 'Runs the Room.',
    mandate: 'Coordinate.',
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

function blueprint(overrides: Partial<RoomBlueprint> = {}): RoomBlueprint {
  return {
    schemaVersion: 1,
    title: 'Fix the flaky test',
    approach: 'One implementer, one reviewer.',
    objective: 'Make the suite green.',
    successCriteria: ['The suite passes twice.'],
    roomInstructions: 'Stay inside the repo.',
    members: [member({}), member({ key: 'impl', displayName: 'Implementer', isConductor: false, tools: ['read', 'write', 'sero-cli'], permissions: 'edit-workspace', needsWorktree: true })],
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
  tools: ['read', 'write', 'bash', 'gh', 'sero-cli', 'mystery_tool'],
  skills: ['sero-plugin'],
};

describe('validateRoomBlueprint', () => {
  it('accepts a legal blueprint', () => {
    expect(validateRoomBlueprint(blueprint(), catalogue)).toEqual({ ok: true });
  });

  it('rejects member keys that can alter paths or session subjects', () => {
    for (const key of ['../outside', 'team/member', String.raw`team\member`, 'team:member']) {
      const result = validateRoomBlueprint(blueprint({ members: [member({ key })] }), catalogue);
      expect(result).toMatchObject({
        ok: false,
        errors: [expect.objectContaining({ code: 'member-key-invalid', path: 'members[0].key' })],
      });
    }
  });

  it('rejects two conductors, duplicate keys and an over-cap roster', () => {
    const result = validateRoomBlueprint(
      blueprint({ members: [member({}), member({}), member({ key: 'a', isConductor: false }), member({ key: 'b', isConductor: false }), member({ key: 'c', isConductor: false })] }),
      catalogue,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['conductor-count', 'duplicate-member-key', 'too-many-members']),
    );
  });

  it('rejects a tool inside the catalogue but outside the envelope', () => {
    const result = validateRoomBlueprint(
      blueprint({ members: [member({ tools: ['kubectl'] })] }),
      { ...catalogue, tools: [...catalogue.tools, 'kubectl'] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain('tool-not-allowed');
    expect(result.errors.map((error) => error.code)).not.toContain('tool-unknown');
  });

  it('rejects a command tool for a read-only member', () => {
    const result = validateRoomBlueprint(
      blueprint({ members: [member({ tools: ['read', 'bash', 'sero-cli'] })] }),
      catalogue,
    );

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'read-only-command', path: 'members[0].tools' })],
    });
  });

  it('rejects a push-capable tool below the edit-and-push permission', () => {
    const result = validateRoomBlueprint(
      blueprint({ members: [member({ tools: ['read', 'gh', 'sero-cli'], permissions: 'edit-workspace' })] }),
      catalogue,
    );

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'push-tool-without-push-permission', path: 'members[0].tools' })],
    });
  });

  it('accepts the same tool once the member may push', () => {
    const result = validateRoomBlueprint(
      blueprint({ members: [member({ tools: ['read', 'gh', 'sero-cli'], permissions: 'edit-and-push' })] }),
      catalogue,
    );

    expect(result).toEqual({ ok: true });
  });

  it('rejects an unapproved shared working tree', () => {
    const result = validateRoomBlueprint(
      blueprint({ workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: true, claimPolicy: 'warn' } }),
      catalogue,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.filter((error) => error.code === 'shared-tree-not-approved')).toHaveLength(2);
  });
});

describe('computeProposalSummary', () => {
  it('computes team size, limits and access from the blueprint', () => {
    const summary = computeProposalSummary(blueprint());
    expect(summary.teamSize).toBe(2);
    expect(summary.conductorCount).toBe(1);
    expect(summary.maxCostUsd).toBe(5);
    expect(summary.access.map((entry) => entry.label)).toEqual(['edit-workspace']);
    expect(summary.warnings).toEqual([]);
  });

  it('warns for a shared working tree and for external delivery, and names the destination', () => {
    const approvedEnvelope: OperatingEnvelope = {
      ...envelope,
      workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: true, claimPolicy: 'warn' },
    };
    const summary = computeProposalSummary(blueprint({
      envelope: approvedEnvelope,
      workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: true, claimPolicy: 'warn' },
      deliveryDestination: 'chat-post',
      members: [member({}), member({ key: 'impl', isConductor: false, tools: ['write'], permissions: 'edit-workspace', needsWorktree: false })],
    }));
    expect(summary.access.map((entry) => entry.label)).toEqual(['edit-working-files-directly', 'send-outside-sero']);
    expect(summary.warnings.join(' ')).toContain('chat-post');
  });

  it('labels an unmapped capability rather than dropping it', () => {
    const summary = computeProposalSummary(blueprint({ members: [member({ tools: ['mystery_tool', 'sero-cli'] })] }));
    expect(summary.access.map((entry) => entry.label)).toContain('other-tools');
  });

  it('raises GitHub write from push permission, and from a push-capable tool alone', () => {
    const readOnly = computeProposalSummary(blueprint({ members: [member({ tools: ['octokit'] })] }));
    expect(readOnly.access.map((entry) => entry.label)).toContain('read-github');
    const pushes = computeProposalSummary(blueprint({ members: [member({ tools: ['octokit'], permissions: 'edit-and-push' })] }));
    expect(pushes.access.map((entry) => entry.label)).toContain('github-write');
    expect(pushes.access.map((entry) => entry.label)).not.toContain('read-github');
    // The host treats `gh` as push-capable, so the tile must say so even when
    // no member asks for push permission.
    const tool = computeProposalSummary(blueprint({ members: [member({ tools: ['gh'] })] }));
    expect(tool.access.map((entry) => entry.label)).toContain('github-write');
  });
});

describe('diffBlueprints', () => {
  it('reports a member gaining a tool another member already holds', () => {
    const previous = blueprint();
    const next = blueprint({
      members: [member({ tools: ['read', 'write', 'sero-cli'] }), previous.members[1]],
    });
    const diff = diffBlueprints(previous, next);
    expect(diff.authorityUnchanged).toBe(false);
    expect(diff.memberChanges).toHaveLength(1);
    expect(diff.memberChanges[0].toolsAdded).toEqual(['write']);
    expect(computeProposalSummary(previous).access).toEqual(computeProposalSummary(next).access);
  });

  it('is unchanged for prose-only edits', () => {
    const diff = diffBlueprints(blueprint(), blueprint({ teamRationale: 'Different words.' }));
    expect(diff.authorityUnchanged).toBe(true);
  });

  it('reports envelope and delivery moves', () => {
    const diff = diffBlueprints(blueprint(), blueprint({
      envelope: { ...envelope, maxCostUsd: 10 },
      deliveryDestination: 'chat-post',
    }));
    expect(diff.envelopeChanges).toEqual([{ field: 'maxCostUsd', from: 5, to: 10 }]);
    expect(diff.deliveryChanged).toBe(true);
  });
});

describe('clampBlueprintToEnvelope', () => {
  it('lowers limits, drops capabilities and never raises', () => {
    const greedy = blueprint({
      envelope: { ...envelope, maxCostUsd: 500, maxMembers: 9, allowedTools: [...envelope.allowedTools, 'kubectl'] },
      members: [
        member({ tools: ['read', 'kubectl'], model: 'opus', thinking: 'max' }),
        member({ key: 'a', isConductor: false }),
        member({ key: 'b', isConductor: false }),
        member({ key: 'c', isConductor: false }),
        member({ key: 'd', isConductor: false }),
      ],
      deliveryDestination: 'webhook-post',
    });
    const { blueprint: clamped, clamps } = clampBlueprintToEnvelope(greedy, envelope);
    expect(clamped.envelope.maxCostUsd).toBe(5);
    expect(clamped.envelope.allowedTools).not.toContain('kubectl');
    expect(clamped.members).toHaveLength(4);
    expect(clamped.members[0].isConductor).toBe(true);
    expect(clamped.members[0].tools).toEqual(['read']);
    expect(clamped.members[0].model).toBe('sonnet');
    expect(clamped.members[0].thinking).toBe('high');
    expect(clamped.deliveryDestination).toBe('pr');
    expect(clamps.length).toBeGreaterThan(0);
    expect(validateRoomBlueprint(clamped, catalogue)).toEqual({ ok: true });
  });

  it('lowers an unapproved shared tree to a worktree', () => {
    const { blueprint: clamped } = clampBlueprintToEnvelope(
      blueprint({ workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: true, claimPolicy: 'warn' } }),
      envelope,
    );
    expect(clamped.workspacePolicy).toEqual({ mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' });
  });

  it('leaves a compliant blueprint untouched', () => {
    const { blueprint: clamped, clamps } = clampBlueprintToEnvelope(blueprint(), envelope);
    expect(clamps).toEqual([]);
    expect(clamped).toEqual(blueprint());
  });
});

describe('validateRoomCommand', () => {
  const conductor = { memberId: 'm1', isConductor: true };
  const worker = { memberId: 'm2', isConductor: false };

  it('accepts a known command with an idempotency key', () => {
    expect(validateRoomCommand({ command: 'ask', commandId: 'c1', actorMemberId: 'm2' }, worker).ok).toBe(true);
  });

  it('refuses an unknown command, a missing key, a forged actor and a Conductor-only command', () => {
    expect(validateRoomCommand({ command: 'nuke', commandId: 'c1', actorMemberId: 'm2' }, worker)).toMatchObject({ code: 'unknown-command' });
    expect(validateRoomCommand({ command: 'ask', commandId: '  ', actorMemberId: 'm2' }, worker)).toMatchObject({ code: 'missing-idempotency-key' });
    expect(validateRoomCommand({ command: 'ask', commandId: 'c1', actorMemberId: 'm1' }, worker)).toMatchObject({ code: 'actor-mismatch' });
    expect(validateRoomCommand({ command: 'finish-room', commandId: 'c1', actorMemberId: 'm2' }, worker)).toMatchObject({ code: 'conductor-only' });
    expect(validateRoomCommand({ command: 'finish-room', commandId: 'c1', actorMemberId: 'm1' }, conductor).ok).toBe(true);
  });
});
