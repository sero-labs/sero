import { describe, expect, it } from 'vitest';

import type { BlueprintMember, OperatingEnvelope, RoomBlueprint } from '../room-blueprint-types';
import {
  ADVERSARIAL_ANALYSIS_TEMPLATE,
  BUILT_IN_ROOM_TEMPLATES,
  PARALLEL_ISSUES_TEMPLATE,
  SOFTWARE_DELIVERY_TEMPLATE,
  roomToTemplate,
  validateRoomTemplate,
} from '../room-templates';
import type { RoomTemplate, RoomTemplateConstraints, RoomTemplateLimits } from '../room-templates';

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
  allowedModels: ['sonnet'],
  allowedThinkingLevels: ['off', 'high'],
  allowedTools: ['read', 'write', 'bash', 'sero-cli'],
  allowedSkills: ['sero-plugin'],
  workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: true, claimPolicy: 'warn' },
  allowedDeliveryDestinations: ['pr'],
  allowNestedSubagents: false,
  maxIdleMs: 300_000,
};

function member(overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return {
    key: 'conductor',
    displayName: 'Conductor',
    role: 'Conductor',
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
    members: [
      member(),
      member({
        key: 'impl',
        displayName: 'Implementer',
        role: 'Implementer',
        isConductor: false,
        tools: ['read', 'write', 'sero-cli'],
        skills: ['sero-plugin'],
        permissions: 'edit-workspace',
        needsWorktree: true,
      }),
    ],
    teamRationale: 'Two is enough for a single test failure.',
    collaborationStrategy: 'The reviewer reads, the implementer edits.',
    workspacePolicy: { mode: 'shared-working-tree', sharedTreeApproved: true, claimPolicy: 'warn' },
    envelope,
    estimatedDurationMs: 600_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'pr',
    openAssumptions: [],
    ...overrides,
  };
}

describe('built-in presets', () => {
  it('are all valid seeds', () => {
    for (const template of BUILT_IN_ROOM_TEMPLATES) {
      expect(validateRoomTemplate(template), template.id).toEqual({ ok: true });
    }
  });

  it('differ in shape, not only in wording', () => {
    expect(SOFTWARE_DELIVERY_TEMPLATE.workspaceDefaults.mode).toBe('worktree-per-member');
    expect(SOFTWARE_DELIVERY_TEMPLATE.preferredConstraints.deliveryDestination).toBe('pr');

    // Adversarial analysis reads only and delivers a report.
    expect(ADVERSARIAL_ANALYSIS_TEMPLATE.workspaceDefaults.mode).toBe('read-only-shared');
    expect(ADVERSARIAL_ANALYSIS_TEMPLATE.preferredConstraints.permissionCeiling).toBe('read-only');
    expect(ADVERSARIAL_ANALYSIS_TEMPLATE.exampleRoles.every((role) => !role.editsWorkspace)).toBe(true);
    expect(ADVERSARIAL_ANALYSIS_TEMPLATE.preferredConstraints.deliveryDestination).toBe('saved-artifact');
    expect(ADVERSARIAL_ANALYSIS_TEMPLATE.collaborationInstructions).toMatch(/challenge/i);

    // Parallel issues sizes itself from the work and expects overlapping claims.
    expect(PARALLEL_ISSUES_TEMPLATE.limits.suggestedMaxMembers).toBeGreaterThan(SOFTWARE_DELIVERY_TEMPLATE.limits.suggestedMaxMembers);
    expect(PARALLEL_ISSUES_TEMPLATE.workspaceDefaults.claimPolicy).toBe('warn');
    expect(PARALLEL_ISSUES_TEMPLATE.collaborationInstructions).toMatch(/overlap/i);
  });

  it('seed the planning, never the roster', () => {
    // One role per issue: the roster size cannot come from exampleRoles.
    expect(PARALLEL_ISSUES_TEMPLATE.exampleRoles).toHaveLength(2);
    expect(PARALLEL_ISSUES_TEMPLATE.planningStrategy).toMatch(/one implementer for each issue/i);
  });
});

/** A user-saved template file can carry keys the type never declared. */
interface SavedTemplateFile extends RoomTemplate {
  roomId?: string;
  sessionId?: string;
  runtime?: { status: string; usage: { costUsd: number } };
  members?: unknown[];
  preferredConstraints: RoomTemplateConstraints & { apiKey?: string };
  limits: RoomTemplateLimits & { maxTokens?: number };
}

describe('validateRoomTemplate', () => {
  it('refuses a template carrying run-specific state, at any depth', () => {
    const saved: SavedTemplateFile = {
      ...SOFTWARE_DELIVERY_TEMPLATE,
      roomId: 'room_1',
      preferredConstraints: { ...SOFTWARE_DELIVERY_TEMPLATE.preferredConstraints, apiKey: 'sk-live-1' },
    };
    const result = validateRoomTemplate(saved);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['roomId', 'preferredConstraints.apiKey']),
    );
  });

  it('refuses a session id and accumulated runtime state', () => {
    const saved: SavedTemplateFile = {
      ...SOFTWARE_DELIVERY_TEMPLATE,
      sessionId: 'sess_1',
      runtime: { status: 'running', usage: { costUsd: 3.77 } },
      members: [],
    };
    const result = validateRoomTemplate(saved);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['sessionId', 'runtime', 'runtime.status', 'runtime.usage', 'members']),
    );
  });

  it('leaves lookalike field names alone', () => {
    const withTokens: SavedTemplateFile = {
      ...SOFTWARE_DELIVERY_TEMPLATE,
      limits: { ...SOFTWARE_DELIVERY_TEMPLATE.limits, maxTokens: 500 },
    };
    expect(validateRoomTemplate(withTokens)).toEqual({ ok: true });
  });

  it('refuses a shared-working-tree default, an unknown destination and an empty seed', () => {
    const bad: RoomTemplate = {
      ...SOFTWARE_DELIVERY_TEMPLATE,
      id: 'Not A Slug',
      planningStrategy: '   ',
      exampleRoles: [],
      workspaceDefaults: { mode: 'shared-working-tree', claimPolicy: 'warn' },
      preferredConstraints: { ...SOFTWARE_DELIVERY_TEMPLATE.preferredConstraints, deliveryDestination: 'carrier-pigeon' },
      limits: { ...SOFTWARE_DELIVERY_TEMPLATE.limits, suggestedMaxCostUsd: 0 },
    };
    const result = validateRoomTemplate(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        'id-invalid', 'planning-strategy-empty', 'no-example-roles',
        'shared-tree-default', 'delivery-unknown', 'limit-not-positive',
      ]),
    );
  });
});

describe('roomToTemplate', () => {
  it('keeps the seed and drops everything run-specific', () => {
    const template = roomToTemplate(blueprint());
    expect(validateRoomTemplate(template)).toEqual({ ok: true });
    expect(template.id).toBe('fix-the-flaky-test');
    expect(template.exampleRoles.map((role) => role.role)).toEqual(['Conductor', 'Implementer']);
    expect(template.exampleRoles[1].editsWorkspace).toBe(true);
    expect(template.preferredConstraints.permissionCeiling).toBe('edit-workspace');
    // sero-cli is Room mechanics, not reach — it never seeds a capability list.
    expect(template.preferredConstraints.preferredTools).toEqual(['read', 'write']);
    expect(template.limits.suggestedMaxCostUsd).toBe(5);
  });

  it('drops member configuration and the context of the run it was saved from', () => {
    const template = roomToTemplate(blueprint({
      members: [
        member({ key: 'k-9f3a-conductor', promptAdditions: ['Continue the work started in run 9f3a.'] }),
        member({ key: 'k-9f3a-builder', displayName: 'Implementer', role: 'Implementer', isConductor: false, permissions: 'edit-workspace', needsWorktree: true }),
      ],
    }));
    const serialized = JSON.stringify(template);

    // Reuse re-plans the team, so nothing that identifies THIS roster travels:
    // no member keys, no model or thinking choice, no run context in a prompt.
    expect(serialized).not.toContain('9f3a');
    expect(serialized).not.toContain('sonnet');
    expect(Object.keys(template.exampleRoles[0]).sort()).toEqual([
      'editsWorkspace', 'isConductor', 'responsibility', 'role',
    ]);
  });

  it('never carries a shared-working-tree approval into a saved template', () => {
    const template = roomToTemplate(blueprint());
    expect(template.workspaceDefaults).toEqual({ mode: 'worktree-per-member', claimPolicy: 'warn' });
    expect(JSON.stringify(template)).not.toContain('sharedTreeApproved');
  });

  it('takes an id and a name from the user when given', () => {
    const template = roomToTemplate(blueprint(), { id: 'my-team', name: 'My team' });
    expect(template.id).toBe('my-team');
    expect(template.name).toBe('My team');
  });
});
