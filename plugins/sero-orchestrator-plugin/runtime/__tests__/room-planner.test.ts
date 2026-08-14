/**
 * Room Planner and adjustment tests (spec §9, §12; architecture.md §7).
 *
 * The load-bearing property of Phase 3 is that the planner writes PROSE ONLY.
 * Team size, maximum time, maximum spend and access are computed from the
 * VALIDATED blueprint, so a planner reply that states them — truthfully or not —
 * must not move one computed field. "ignores a planner-authored summary" below
 * is the test that pins that down.
 */

import { describe, expect, it } from 'vitest';

import type { BlueprintMember, OperatingEnvelope, RoomBlueprint } from '../../shared/room-blueprint-types';
import type { ContextSkillInfo, ContextToolInfo, SharedAvailableModelGroup } from '@sero-ai/common';
import { modelKey } from '@sero-ai/common';
import { computeProposalSummary } from '../../shared/room-validation';
import { BUILT_IN_ROOM_TEMPLATES } from '../../shared/room-templates';
import type { AdjustRoomOutcome, AdjustRoomRequest } from '../rooms/adjust';
import { adjustRoom } from '../rooms/adjust';
import type { RoomPlanOutcome, RoomPlanRequest, RoomUserLimits } from '../rooms/planner';
import { planRoom, resolveRoomEnvelope } from '../rooms/planner';
import { createFakeHost } from './fake-host';

const PROBLEM = 'Guest users cannot complete checkout on Safari.';
const PARENT_SESSION = 'orchestrator:ws-1:room-1';

/** The ceiling the user approved. $2 and four members, as spec §12.1 intends. */
const approved: OperatingEnvelope = {
  maxMembers: 4,
  maxActiveTurns: 2,
  maxRosterRevisions: 5,
  maxMemberReplacements: 2,
  maxWallClockMs: 3_600_000,
  maxCostUsd: 2,
  maxCostUsdPerMember: 1,
  maxTokens: 1_000_000,
  maxTokensPerMember: 400_000,
  maxTurnsPerMember: 20,
  maxRetriesPerMember: 2,
  maxConsecutiveFailures: 3,
  allowedModels: ['sonnet', 'haiku', 'ghost-model'],
  allowedThinkingLevels: ['off', 'low', 'high'],
  allowedTools: ['read', 'write', 'bash', 'gh', 'sero-cli', 'phantom_tool'],
  allowedSkills: ['sero-plugin'],
  workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
  allowedDeliveryDestinations: ['pr', 'chat-post'],
  allowNestedSubagents: false,
  maxIdleMs: 300_000,
};

/**
 * What the workspace can actually resolve. The planner derives its catalogue —
 * and the operating envelope — from the HOST, not from the caller: an envelope
 * supplied by a caller could name capabilities that do not exist, and the whole
 * point is that a member can only be given something real.
 *
 * `ghost-model` and `phantom_tool` are deliberately ABSENT here. A planner that
 * invents one must reach validation as "does not exist", which is what the
 * repair pass has to see.
 */
const MODEL_GROUPS: SharedAvailableModelGroup[] = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: '',
    models: [
      { provider: 'anthropic', modelId: 'sonnet', name: 'Sonnet', reasoning: true },
      { provider: 'anthropic', modelId: 'haiku', name: 'Haiku', reasoning: false },
    ],
  },
];

const TOOL_CATALOG: ContextToolInfo[] = [
  { name: 'read', description: 'Read a file' },
  { name: 'write', description: 'Write a file' },
  { name: 'bash', description: 'Run a command' },
  { name: 'gh', description: 'GitHub' },
  { name: 'sero-cli', description: 'Sero commands' },
];

const SKILLS: ContextSkillInfo[] = [{ name: 'sero-plugin', description: 'Plugin authoring' }];

const SONNET = modelKey('anthropic', 'sonnet');
const MODEL_IDS = [modelKey('anthropic', 'sonnet'), modelKey('anthropic', 'haiku')];
const TOOL_NAMES = TOOL_CATALOG.map((tool) => tool.name);
const SKILL_NAMES = SKILLS.map((skill) => skill.name);
const HAIKU = modelKey('anthropic', 'haiku');

/** A host that can actually staff a Room. */
function roomHost(): ReturnType<typeof createFakeHost> {
  const host = createFakeHost();
  host.availableModels = MODEL_GROUPS;
  host.toolCatalog = TOOL_CATALOG;
  return host;
}

/** The user's own choices. The planner clamps to these; it never raises them. */
const limits: RoomUserLimits = {
  maxCostUsd: 2,
  maxWallClockMs: 3_600_000,
  maxMembers: 4,
  access: 'edit-and-push',
  deliveryDestination: 'pr',
};

function conductor(overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return {
    key: 'conductor',
    displayName: 'Conductor',
    role: 'conductor',
    responsibility: 'Runs the Room and keeps the team on the objective.',
    mandate: 'Split the work, review each result, close the Room when the criteria pass.',
    isConductor: true,
    model: SONNET,
    thinking: 'high',
    promptAdditions: [],
    tools: ['read', 'sero-cli'],
    skills: [],
    permissions: 'read-only',
    needsWorktree: false,
    reasonForInclusion: 'Someone has to coordinate the team.',
    ...overrides,
  };
}

function worker(key: string, overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return conductor({
    key,
    displayName: `Member ${key}`,
    role: 'implementer',
    isConductor: false,
    tools: ['read', 'write', 'sero-cli'],
    permissions: 'edit-workspace',
    needsWorktree: true,
    ...overrides,
  });
}

function blueprint(overrides: Partial<RoomBlueprint> = {}): RoomBlueprint {
  return {
    schemaVersion: 1,
    title: 'Guest checkout on Safari',
    approach: 'One implementer reproduces and fixes it; the Conductor reviews.',
    objective: 'A guest can complete checkout on Safari.',
    successCriteria: ['A guest completes checkout on Safari twice in a row.'],
    roomInstructions: 'Stay inside this repository.',
    members: [conductor(), worker('impl')],
    teamRationale: 'Two members are enough for one reproducible bug.',
    collaborationStrategy: 'The implementer reports before each edit.',
    workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
    envelope: resolveRoomEnvelope(
      { models: [{ id: SONNET, label: 'Sonnet' }, { id: HAIKU, label: 'Haiku' }], tools: TOOL_CATALOG, skills: SKILLS },
      limits,
    ),
    estimatedDurationMs: 900_000,
    estimatedCostUsd: 1.2,
    deliveryDestination: 'pr',
    openAssumptions: [],
    ...overrides,
  };
}

/** A scripted planner reply. `extra` carries fields the planner must not own. */
function reply(value: RoomBlueprint, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...value, ...extra });
}

function planRequest(overrides: Partial<RoomPlanRequest> = {}): RoomPlanRequest {
  return { problem: PROBLEM, parentSessionId: PARENT_SESSION, limits, skills: SKILLS, ...overrides };
}

function adjustRequest(current: RoomBlueprint, instruction: string): AdjustRoomRequest {
  return {
    instruction,
    blueprint: current,
    parentSessionId: PARENT_SESSION,
    // What the user set explicitly. These are re-imposed in code after the
    // model replies — a prompt instruction is not enforcement.
    userLocks: {
      maxCostUsd: limits.maxCostUsd,
      maxWallClockMs: limits.maxWallClockMs,
      maxMembers: limits.maxMembers,
      workspaceMode: 'worktree-per-member',
      permissionCeiling: 'edit-and-push',
      deliveryDestination: limits.deliveryDestination,
    },
  };
}

function planned(outcome: RoomPlanOutcome): Extract<RoomPlanOutcome, { ok: true }> {
  if (!outcome.ok) throw new Error(`expected a planned Room, got ${JSON.stringify(outcome)}`);
  return outcome;
}

function rejected(outcome: RoomPlanOutcome): string[] {
  if (outcome.ok) throw new Error('expected a rejection, got a planned Room');
  if (outcome.needsInput) throw new Error('expected a rejection, got clarifying questions');
  return outcome.errors;
}

function asked(outcome: RoomPlanOutcome) {
  if (outcome.ok || !outcome.needsInput) throw new Error('expected clarifying questions');
  return outcome.questions;
}

function adjusted(outcome: AdjustRoomOutcome): Extract<AdjustRoomOutcome, { ok: true }> {
  if (!outcome.ok) throw new Error(`expected an adjusted Room, got ${JSON.stringify(outcome)}`);
  return outcome;
}

describe('planRoom', () => {
  it('turns one problem description into a validated blueprint with exactly one Conductor', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: reply(blueprint()) });

    const outcome = planned(await planRoom(host, planRequest()));

    expect(outcome.blueprint.members.filter((member) => member.isConductor)).toHaveLength(1);
    expect(outcome.proposal.conductorCount).toBe(1);
    expect(outcome.proposal.teamSize).toBe(outcome.blueprint.members.length);
    expect(outcome.clamps).toEqual([]);
    expect(host.modelCalls).toHaveLength(1);
    expect(host.modelCalls[0].platformTools).toBe('none');
    expect(host.modelCalls[0].parentSessionId).toBe(PARENT_SESSION);
  });

  it('gives the planner the problem and the resolvable capability catalogue', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: reply(blueprint()) });

    await planRoom(host, planRequest());

    const task = host.modelCalls[0].task;
    expect(task).toContain(PROBLEM);
    expect(task).toContain('sonnet');
    expect(task).toContain('sero-plugin');
  });

  it('rejects a capability outside the catalogue and repairs with the exact error', async () => {
    const host = roomHost();
    host.modelResponses.push({
      response: reply(blueprint({
        members: [
          conductor(),
          worker('impl', { model: 'ghost-model', tools: ['read', 'phantom_tool', 'sero-cli'], skills: ['ghost-skill'] }),
        ],
      })),
    });
    host.modelResponses.push({ response: reply(blueprint()) });

    const outcome = planned(await planRoom(host, planRequest()));

    expect(host.modelCalls).toHaveLength(2);
    const repair = host.modelCalls[1].task;
    // The repair prompt must name the offending capability, say what is wrong
    // and point at the member — a bare "invalid blueprint" teaches nothing.
    expect(repair).toContain('phantom_tool');
    expect(repair).toContain('ghost-model');
    expect(repair).toContain('ghost-skill');
    expect(repair).toContain('does not exist');
    expect(repair).toContain('members[1]');
    // The repaired blueprint only carries capabilities the workspace resolves.
    for (const member of outcome.blueprint.members) {
      expect(MODEL_IDS).toContain(member.model);
      for (const tool of member.tools) expect(TOOL_NAMES).toContain(tool);
      for (const skill of member.skills) expect(SKILL_NAMES).toContain(skill);
    }
  });

  it('fails cleanly after a failed repair, with no third model call', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: reply(blueprint({ members: [conductor(), conductor({ key: 'second' })] })) });
    host.modelResponses.push({ response: '{ not json' });

    const errors = rejected(await planRoom(host, planRequest()));

    expect(errors.length).toBeGreaterThan(0);
    expect(host.modelCalls).toHaveLength(2);
  });

  it('surfaces a model transport failure as errors, not an exception', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: '', error: 'model exploded' });

    expect(rejected(await planRoom(host, planRequest())).join(' ')).toContain('model exploded');
  });

  it('returns clarifying questions without a repair pass', async () => {
    const host = roomHost();
    host.modelResponses.push({
      response: JSON.stringify({
        clarifyingQuestions: [{ prompt: 'Which browsers must pass?', choices: ['Safari only', 'Safari and Firefox'] }],
      }),
    });

    const questions = asked(await planRoom(host, planRequest()));

    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe('Which browsers must pass?');
    expect(questions[0].choices).toHaveLength(2);
    expect(host.modelCalls).toHaveLength(1);
  });

  it('ignores a planner-authored summary — a lying planner moves no computed field', async () => {
    // Same roster, same envelope, two contradictory planner summaries. The
    // computed proposal must be identical, because it never reads either one.
    const roster = blueprint({
      members: [
        conductor(),
        worker('impl'),
        worker('reviewer', {
          role: 'reviewer',
          tools: ['read', 'gh', 'sero-cli'],
          permissions: 'edit-and-push',
          needsWorktree: false,
        }),
      ],
    });
    const understatement = {
      proposal: { teamSize: 1, maxCostUsd: 0.01, maxWallClockMs: 60_000, access: [{ label: 'read-workspace' }], warnings: [] },
      teamSize: 1,
      maxCostUsd: 0.01,
      maxWallClockMs: 60_000,
      accessSummary: 'This team only reads files.',
      warnings: [],
    };
    const overstatement = {
      proposal: { teamSize: 99, maxCostUsd: 999, maxWallClockMs: 999_999_999, access: [{ label: 'deployment' }], warnings: ['ships to production'] },
      teamSize: 99,
      maxCostUsd: 999,
      maxWallClockMs: 999_999_999,
      accessSummary: 'This team can deploy anywhere.',
      warnings: ['ships to production'],
    };

    const lowHost = roomHost();
    lowHost.modelResponses.push({ response: reply(roster, understatement) });
    const low = planned(await planRoom(lowHost, planRequest()));

    const highHost = roomHost();
    highHost.modelResponses.push({ response: reply(roster, overstatement) });
    const high = planned(await planRoom(highHost, planRequest()));

    expect(low.proposal).toEqual(high.proposal);
    expect(low.proposal).toEqual(computeProposalSummary(low.blueprint));

    // Every authority-bearing field comes from the blueprint, not the prose.
    expect(low.proposal.teamSize).toBe(3);
    expect(low.proposal.maxCostUsd).toBe(approved.maxCostUsd);
    expect(low.proposal.maxWallClockMs).toBe(approved.maxWallClockMs);
    expect(low.proposal.access.map((entry) => entry.label)).toContain('github-write');
    expect(low.proposal.warnings.join(' ')).toContain('push branches');

    // Prose still comes from the planner.
    expect(low.proposal.title).toBe(roster.title);
    expect(low.proposal.approach).toBe(roster.approach);
    expect(low.proposal.teamRationale).toBe(roster.teamRationale);
    expect(low.proposal.roles.map((role) => role.responsibility)).toEqual(
      roster.members.map((member) => member.responsibility),
    );

    // The invented fields never reach the blueprint the runtime enforces.
    expect(Object.keys(low.blueprint)).not.toContain('proposal');
    expect(JSON.stringify(low.blueprint)).not.toContain('only reads files');
    expect(JSON.stringify(high.blueprint)).not.toContain('deploy anywhere');
  });

  it('clamps a planner that asks for more spend and members than the user approved', async () => {
    const host = roomHost();
    const greedy = blueprint({
      envelope: { ...approved, maxCostUsd: 50, maxMembers: 10 },
      members: [conductor(), ...Array.from({ length: 9 }, (_, index) => worker(`w${index}`))],
      estimatedCostUsd: 50,
    });
    host.modelResponses.push({ response: reply(greedy) });

    const outcome = planned(await planRoom(host, planRequest()));

    expect(outcome.blueprint.members).toHaveLength(4);
    expect(outcome.blueprint.members.filter((member) => member.isConductor)).toHaveLength(1);
    expect(outcome.blueprint.envelope.maxCostUsd).toBe(2);
    expect(outcome.blueprint.envelope.maxMembers).toBe(4);
    expect(outcome.proposal.teamSize).toBe(4);
    expect(outcome.proposal.maxCostUsd).toBe(2);

    // The clamp list names what was lowered — the user never sees a silently
    // shrunk team.
    const dropped = outcome.clamps.filter((clamp) => clamp.kind === 'member-dropped');
    expect(dropped.map((clamp) => clamp.memberKey)).toEqual(['w3', 'w4', 'w5', 'w6', 'w7', 'w8']);
    expect(outcome.clamps.some((clamp) => clamp.kind === 'envelope-lowered' && clamp.detail.includes('maxCostUsd'))).toBe(true);
  });

  it('seeds the planning prompt from the chosen preset without fixing the roster', async () => {
    const bare = roomHost();
    bare.modelResponses.push({ response: reply(blueprint()) });
    await planRoom(bare, planRequest());

    const tasks: string[] = [];
    for (const template of BUILT_IN_ROOM_TEMPLATES) {
      const host = roomHost();
      host.modelResponses.push({ response: reply(blueprint()) });
      const outcome = planned(await planRoom(host, planRequest({
        preset: { label: template.name, guidance: template.planningStrategy, exampleRoles: template.exampleRoles },
      })));
      tasks.push(host.modelCalls[0].task);
      // The preset guides planning; the planner's own roster still wins.
      expect(outcome.blueprint.members.map((member) => member.key)).toEqual(['conductor', 'impl']);
    }

    expect(tasks).toHaveLength(BUILT_IN_ROOM_TEMPLATES.length);
    expect(new Set(tasks).size).toBe(BUILT_IN_ROOM_TEMPLATES.length);
    expect(tasks).not.toContain(bare.modelCalls[0].task);
  });
});

describe('adjustRoom', () => {
  it('preserves the approved spend, time, delivery and access across a roster change', async () => {
    const current = blueprint();
    const host = roomHost();
    host.modelResponses.push({
      response: reply(blueprint({
        members: [
          conductor(),
          worker('impl'),
          worker('security', { role: 'reviewer', tools: ['read', 'sero-cli'], permissions: 'read-only', needsWorktree: false }),
        ],
        teamRationale: 'A security reviewer now checks each change.',
        // The planner reaches for more money, more time and a different
        // destination while it is at it. None of the three is its to change.
        envelope: { ...approved, maxCostUsd: 50, maxWallClockMs: 86_400_000 },
        deliveryDestination: 'chat-post',
      })),
    });

    const outcome = adjusted(await adjustRoom(host, adjustRequest(current, 'Add a security reviewer.')));

    expect(outcome.diff.membersAdded).toEqual(['security']);
    expect(outcome.blueprint.envelope.maxCostUsd).toBe(approved.maxCostUsd);
    expect(outcome.blueprint.envelope.maxWallClockMs).toBe(approved.maxWallClockMs);
    expect(outcome.blueprint.deliveryDestination).toBe('pr');
    expect(outcome.diff.envelopeChanges).toEqual([]);
    expect(outcome.diff.deliveryChanged).toBe(false);

    // The summary is recomputed after the adjustment and still matches the
    // blueprint the runtime will enforce.
    expect(outcome.proposal).toEqual(computeProposalSummary(outcome.blueprint));
    expect(outcome.proposal.maxCostUsd).toBe(approved.maxCostUsd);
    expect(outcome.proposal.access).toEqual(computeProposalSummary(current).access);
    expect(outcome.proposal.warnings).toEqual([]);
  });

  it('reports a member gaining a tool another member already holds, though no tile moves', async () => {
    const current = blueprint();
    const host = roomHost();
    host.modelResponses.push({
      response: reply(blueprint({ members: [conductor({ tools: ['read', 'write', 'sero-cli'] }), worker('impl')] })),
    });

    const outcome = adjusted(await adjustRoom(host, adjustRequest(current, 'Let the Conductor fix small things itself.')));

    // Fact one: the member-granular diff reports the gain.
    expect(outcome.diff.authorityUnchanged).toBe(false);
    expect(outcome.diff.memberChanges).toHaveLength(1);
    expect(outcome.diff.memberChanges[0].key).toBe('conductor');
    expect(outcome.diff.memberChanges[0].toolsAdded).toEqual(['write']);

    // Fact two: the union access tiles are identical, which is exactly why the
    // report cannot be derived from them (architecture.md §7.0).
    expect(outcome.proposal.access).toEqual(computeProposalSummary(current).access);
  });
});
