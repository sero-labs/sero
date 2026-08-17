/**
 * Room Planner tests (spec §9, §12; architecture.md §7).
 *
 * The load-bearing property of Phase 3 is that the planner writes PROSE ONLY.
 * Team size, maximum time, maximum spend and access are computed from the
 * VALIDATED blueprint, so a planner reply that states them — truthfully or not —
 * must move no computed field. "a lying summary moves no computed field" is the
 * test that pins that down. The adjustment half lives in room-adjust.test.ts.
 */

import type { ContextSkillInfo, ContextToolInfo, SharedAvailableModelGroup } from '@sero-ai/common';
import { modelKey } from '@sero-ai/common';
import { describe, expect, it } from 'vitest';

import type { BlueprintMember, OperatingEnvelope, RoomBlueprint } from '../../shared/room-blueprint-types';
import { BUILT_IN_ROOM_TEMPLATES, type RoomTemplate } from '../../shared/room-templates';
import { computeProposalSummary } from '../../shared/room-validation';
import type { RoomPresetSeed } from '../rooms/planner-prompt';
import type { RoomCatalogue, RoomPlanOutcome, RoomPlanRequest, RoomUserLimits } from '../rooms/planner';
import { planRoom, resolveRoomEnvelope } from '../rooms/planner';
import { createFakeHost, type FakeHost } from './fake-host';

const PROBLEM = 'Guest users cannot complete checkout on Safari.';
const PARENT_SESSION = 'orchestrator:ws-1:room-1';
const SONNET = modelKey('anthropic', 'sonnet');
const HAIKU = modelKey('anthropic', 'haiku');

/**
 * What the workspace can actually resolve. The planner reads this from the
 * HOST, never from the caller, so a member can only ever be given something
 * real. `ghost-model`, `phantom_tool` and `ghost-skill` are deliberately absent.
 */
const MODEL_GROUPS: SharedAvailableModelGroup[] = [{
  provider: 'anthropic',
  displayName: 'Anthropic',
  logo: '',
  models: [
    { provider: 'anthropic', modelId: 'sonnet', name: 'Sonnet', reasoning: true },
    { provider: 'anthropic', modelId: 'haiku', name: 'Haiku', reasoning: false },
  ],
}];

const TOOL_CATALOG: ContextToolInfo[] = [
  { name: 'read', description: 'Read a file' },
  { name: 'write', description: 'Write a file' },
  { name: 'bash', description: 'Run a command' },
  { name: 'gh', description: 'GitHub' },
  { name: 'sero-cli', description: 'Sero commands' },
];

const SKILLS: ContextSkillInfo[] = [{ name: 'sero-plugin', description: 'Plugin authoring' }];

const CATALOGUE: RoomCatalogue = {
  models: [{ id: SONNET, label: 'Sonnet' }, { id: HAIKU, label: 'Haiku' }],
  thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high'],
  tools: TOOL_CATALOG,
  skills: SKILLS,
};

/** The user's own choices. The planner works inside them; it never raises them. */
const LIMITS: RoomUserLimits = {
  maxCostUsd: 2,
  maxWallClockMs: 3_600_000,
  maxMembers: 4,
  access: 'edit-and-push',
  deliveryDestination: 'pr',
};

/** What the planner will build from those choices, for the reply fixtures. */
const APPROVED_ENVELOPE: OperatingEnvelope = resolveRoomEnvelope(CATALOGUE, LIMITS);

/** A host that can actually staff a Room. */
function roomHost(): FakeHost {
  const host = createFakeHost();
  host.availableModels = MODEL_GROUPS;
  host.toolCatalog = TOOL_CATALOG;
  host.skillCatalog = SKILLS;
  return host;
}

function member(overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return {
    key: 'conductor',
    displayName: 'Conductor',
    role: 'conductor',
    responsibility: 'Runs the Room and keeps the team on the objective.',
    mandate: 'Split the work, review each result, close the Room when the criteria pass.',
    reasonForInclusion: 'Someone has to coordinate the team.',
    isConductor: true,
    model: SONNET,
    thinking: 'high',
    promptAdditions: [],
    tools: ['read', 'sero-cli'],
    skills: [],
    permissions: 'read-only',
    needsWorktree: false,
    ...overrides,
  };
}

function worker(key: string, overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return member({
    key,
    displayName: `Member ${key}`,
    role: 'implementer',
    responsibility: `Fixes the checkout flow, as member ${key}.`,
    isConductor: false,
    model: HAIKU,
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
    members: [member(), worker('impl')],
    teamRationale: 'Two members are enough for one reproducible bug.',
    collaborationStrategy: 'The implementer reports before each edit.',
    workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
    envelope: APPROVED_ENVELOPE,
    estimatedDurationMs: 900_000,
    estimatedCostUsd: 1.2,
    deliveryDestination: 'pr',
    openAssumptions: [],
    ...overrides,
  };
}

/** A scripted reply. `extra` carries fields the model is not allowed to own. */
function reply(value: RoomBlueprint, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...value, ...extra });
}

function planRequest(overrides: Partial<RoomPlanRequest> = {}): RoomPlanRequest {
  return { problem: PROBLEM, parentSessionId: PARENT_SESSION, limits: LIMITS, ...overrides };
}

/** A built-in template reaches the planner as a seed, never as a roster. */
function seedFrom(template: RoomTemplate): RoomPresetSeed {
  return {
    label: template.name,
    guidance: `${template.planningStrategy}\n${template.collaborationInstructions}`,
    exampleRoles: template.exampleRoles.map((role) => role.role),
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

describe('planRoom', () => {
  it('turns one problem description into a validated blueprint with exactly one Conductor', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: reply(blueprint()) });

    const outcome = planned(await planRoom(host, planRequest()));

    expect(outcome.blueprint.members.filter((each) => each.isConductor)).toHaveLength(1);
    expect(outcome.blueprint.members.map((each) => each.key)).toEqual(['conductor', 'impl']);
    expect(outcome.proposal.conductorCount).toBe(1);
    expect(outcome.proposal.teamSize).toBe(2);
    expect(outcome.clamps).toEqual([]);
    expect(host.modelCalls).toHaveLength(1);
    expect(host.modelCalls[0].platformTools).toBe('none');
    expect(host.modelCalls[0].parentSessionId).toBe(PARENT_SESSION);
  });

  it('gives the planner the problem and only capabilities that resolve', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: reply(blueprint()) });

    await planRoom(host, planRequest());

    const task = host.modelCalls[0].task;
    expect(task).toContain(PROBLEM);
    expect(task).toContain(SONNET);
    expect(task).toContain('sero-plugin');
  });

  it('holds every member to the model and effort level the machine pins', async () => {
    process.env.SERO_ROOM_MODELS = HAIKU;
    process.env.SERO_ROOM_THINKING = 'medium';
    try {
      const host = roomHost();
      // The planner only ever sees the pinned model, so it plans on it.
      host.modelResponses.push({ response: reply(blueprint({ members: [member({ model: HAIKU }), worker('impl')] })) });

      const outcome = planned(await planRoom(host, planRequest()));

      expect(outcome.blueprint.envelope.allowedModels).toEqual([HAIKU]);
      expect(outcome.blueprint.members.map((each) => each.model)).toEqual([HAIKU, HAIKU]);
      // Effort above the pin is lowered rather than left to spend.
      expect(outcome.blueprint.members.map((each) => each.thinking)).toEqual(['medium', 'medium']);
      // The planner is never offered what the pin took away.
      expect(host.modelCalls[0].task).not.toContain(SONNET);
    } finally {
      delete process.env.SERO_ROOM_MODELS;
      delete process.env.SERO_ROOM_THINKING;
    }
  });

  it('ignores a pin that matches nothing, so a Room can still be staffed', async () => {
    process.env.SERO_ROOM_MODELS = 'nothing/at-all';
    try {
      const host = roomHost();
      host.modelResponses.push({ response: reply(blueprint()) });

      const outcome = planned(await planRoom(host, planRequest()));

      expect(outcome.blueprint.envelope.allowedModels).toEqual([SONNET, HAIKU]);
      expect(host.logs.join('\n')).toContain('SERO_ROOM_MODELS');
    } finally {
      delete process.env.SERO_ROOM_MODELS;
    }
  });

  it('gives every member the Room surface, whether or not the planner asked for it', async () => {
    const host = roomHost();
    // A roster that can read and write, and cannot say a word to anybody.
    host.modelResponses.push({
      response: reply(blueprint({
        members: [member({ tools: ['read'] }), worker('impl', { tools: ['read', 'write'] })],
      })),
    });

    const outcome = planned(await planRoom(host, planRequest()));

    expect(outcome.blueprint.members.map((each) => each.tools)).toEqual([
      ['read', 'sero-cli'],
      ['read', 'write', 'sero-cli'],
    ]);
    // Allowed by the envelope even though no workspace catalogue lists it: the
    // host gives it to every member session, so it is always resolvable.
    expect(outcome.blueprint.envelope.allowedTools).toContain('sero-cli');
  });

  it('plans the built-in Software delivery Verifier with disclosed command authority', async () => {
    const template = BUILT_IN_ROOM_TEMPLATES.find((candidate) => candidate.name === 'Software delivery');
    if (!template) throw new Error('missing Software delivery template');
    const host = roomHost();
    host.modelResponses.push({
      response: reply(blueprint({
        members: [
          member(),
          worker('verifier', {
            displayName: 'Verifier',
            role: 'Verifier',
            responsibility: 'Runs the tests and the type check, and reports the result.',
            tools: ['read', 'bash', 'sero-cli'],
            permissions: 'edit-workspace',
            needsWorktree: true,
          }),
        ],
      })),
    });

    const outcome = planned(await planRoom(host, planRequest({ preset: seedFrom(template) })));

    expect(outcome.blueprint.members[1]).toMatchObject({
      key: 'verifier',
      permissions: 'edit-workspace',
      needsWorktree: true,
      tools: ['read', 'bash', 'sero-cli'],
    });
  });

  it('repairs a read-only command request before it can reach approval', async () => {
    const host = roomHost();
    host.modelResponses.push(
      { response: reply(blueprint({ members: [member({ tools: ['read', 'bash', 'sero-cli'] }), worker('impl')] })) },
      { response: reply(blueprint()) },
    );
    const outcome = planned(await planRoom(host, planRequest()));
    expect(host.modelCalls).toHaveLength(2);
    expect(host.modelCalls[1].task).toContain('read-only, so it cannot use the command tool bash');
    expect(outcome.blueprint.members[0]).toMatchObject({ permissions: 'read-only', tools: ['read', 'sero-cli'] });
    expect(outcome.proposal.access.map((entry) => entry.label)).not.toContain('run-commands');
  });
  it('refuses an invented model, tool or skill and names each one in the repair prompt', async () => {
    const host = roomHost();
    host.modelResponses.push({
      response: reply(blueprint({
        members: [
          member(),
          worker('impl', { model: 'ghost-model', tools: ['read', 'phantom_tool'], skills: ['ghost-skill'] }),
        ],
      })),
    });
    host.modelResponses.push({ response: reply(blueprint()) });

    const outcome = planned(await planRoom(host, planRequest()));

    // A name that does not exist is not a limit the user set — it is a mistake
    // only the model can fix, so it goes back with the exact name attached.
    // Substituting a different model, or dropping the tool a mandate depends
    // on, would hand the user a team nobody designed.
    expect(host.modelCalls).toHaveLength(2);
    const repair = host.modelCalls[1].task;
    expect(repair).toContain('ghost-model');
    expect(repair).toContain('phantom_tool');
    expect(repair).toContain('ghost-skill');
    expect(repair).toContain('members[1]');
    expect(outcome.blueprint.members[1].model).toBe(HAIKU);
    expect(outcome.blueprint.members[1].tools).toEqual(['read', 'write', 'sero-cli']);
  });

  it('fails cleanly after a failed repair, with no third model call', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: reply(blueprint({ members: [member(), member({ key: 'second' })] })) });
    host.modelResponses.push({ response: '{ not json' });

    const errors = rejected(await planRoom(host, planRequest()));

    expect(errors.length).toBeGreaterThan(0);
    expect(host.modelCalls).toHaveLength(2);
    // The first rejection carried its real reason into the repair prompt.
    expect(host.modelCalls[1].task).toContain('exactly one Conductor');
  });

  it('surfaces a model transport failure as errors, not an exception', async () => {
    const host = roomHost();
    host.modelResponses.push({ response: '', error: 'model exploded' });

    expect(rejected(await planRoom(host, planRequest())).join(' ')).toContain('model exploded');
  });

  it('refuses to plan when the workspace resolves no model', async () => {
    const host = roomHost();
    host.availableModels = [];

    expect(rejected(await planRoom(host, planRequest())).join(' ')).toContain('no models');
    expect(host.modelCalls).toHaveLength(0);
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

  it('ignores a planner-authored summary — a lying summary moves no computed field', async () => {
    // The same team, twice, under two contradictory planner summaries. The
    // computed proposal must be identical, because it reads neither one.
    const roster = blueprint({
      members: [
        member(),
        worker('impl'),
        worker('reviewer', {
          role: 'reviewer',
          responsibility: 'Reviews the change and opens the pull request.',
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

    const cleanHost = roomHost();
    cleanHost.modelResponses.push({ response: reply(roster) });
    const clean = planned(await planRoom(cleanHost, planRequest()));

    // The second reply is used only if the summary is refused and repaired.
    // Whether the extra fields are refused or simply never read, the Room the
    // user is shown may not differ by one field.
    const lowHost = roomHost();
    lowHost.modelResponses.push({ response: reply(roster, understatement) }, { response: reply(roster) });
    const low = planned(await planRoom(lowHost, planRequest()));

    const highHost = roomHost();
    highHost.modelResponses.push({ response: reply(roster, overstatement) }, { response: reply(roster) });
    const high = planned(await planRoom(highHost, planRequest()));

    expect(low.blueprint).toEqual(clean.blueprint);
    expect(high.blueprint).toEqual(clean.blueprint);
    expect(low.proposal).toEqual(high.proposal);
    expect(low.proposal).toEqual(computeProposalSummary(clean.blueprint));

    // Every authority-bearing field comes from the blueprint, not the prose.
    expect(low.proposal.teamSize).toBe(3);
    expect(low.proposal.maxCostUsd).toBe(2);
    expect(low.proposal.maxWallClockMs).toBe(3_600_000);
    expect(low.proposal.access.map((entry) => entry.label)).toEqual(['edit-workspace', 'github-write']);
    expect(low.proposal.warnings.join(' ')).toContain('push branches');

    // The prose fields are still the planner's.
    expect(low.proposal.title).toBe(roster.title);
    expect(low.proposal.approach).toBe(roster.approach);
    expect(low.proposal.teamRationale).toBe(roster.teamRationale);
    expect(low.proposal.roles.map((role) => role.responsibility)).toEqual(
      roster.members.map((each) => each.responsibility),
    );

    // The invented fields never reach the blueprint the runtime enforces.
    expect(Object.keys(low.blueprint)).not.toContain('proposal');
    expect(JSON.stringify(low.blueprint)).not.toContain('only reads files');
    expect(JSON.stringify(high.blueprint)).not.toContain('deploy anywhere');
  });

  it('lets the user limits override what the planner asks for', async () => {
    const host = roomHost();
    host.modelResponses.push({
      response: reply(blueprint({
        members: [member(), ...Array.from({ length: 9 }, (_, index) => worker(`w${index}`))],
        envelope: { ...APPROVED_ENVELOPE, maxCostUsd: 50, maxMembers: 10 },
        estimatedCostUsd: 50,
        estimatedDurationMs: 36_000_000,
      })),
    });

    const outcome = planned(await planRoom(host, planRequest()));

    // The limits are stated to the planner AND imposed in code — a prompt
    // instruction on its own is a request the model is free to ignore.
    expect(host.modelCalls[0].task).toContain('at most 4 members');
    expect(host.modelCalls[0].task).toContain('$2');

    expect(outcome.blueprint.members).toHaveLength(4);
    expect(outcome.blueprint.members.filter((each) => each.isConductor)).toHaveLength(1);
    expect(outcome.blueprint.envelope.maxCostUsd).toBe(2);
    expect(outcome.blueprint.envelope.maxMembers).toBe(4);
    expect(outcome.proposal.teamSize).toBe(4);
    expect(outcome.proposal.maxCostUsd).toBe(2);
    // A $50 estimate beside a $2 ceiling reads as a second, higher budget.
    expect(outcome.blueprint.estimatedCostUsd).toBe(2);
    expect(outcome.blueprint.estimatedDurationMs).toBe(3_600_000);

    // The clamp list names both what was lowered and every member the cap took
    // away — the user never sees a quietly shrunk team.
    const details = outcome.clamps.map((clamp) => clamp.detail).join(' ');
    expect(details).toContain('maxCostUsd lowered from 50 to 2');
    expect(details).toContain('maxMembers lowered from 10 to 4');
    const dropped = outcome.clamps.filter((clamp) => clamp.kind === 'member-dropped');
    expect(dropped.map((clamp) => clamp.memberKey)).toEqual(['w3', 'w4', 'w5', 'w6', 'w7', 'w8']);
  });

  it('seeds the planning prompt from the chosen preset without fixing the roster', async () => {
    const tasks: string[] = [];
    for (const template of BUILT_IN_ROOM_TEMPLATES) {
      const host = roomHost();
      host.modelResponses.push({ response: reply(blueprint()) });
      const outcome = planned(await planRoom(host, planRequest({ preset: seedFrom(template) })));

      const task = host.modelCalls[0].task;
      expect(task).toContain(template.name);
      expect(task).toContain(template.exampleRoles[0].role);
      tasks.push(task);
      // The preset guides the planning; the planner's own roster still wins.
      expect(outcome.blueprint.members.map((each) => each.key)).toEqual(['conductor', 'impl']);
    }

    expect(new Set(tasks).size).toBe(BUILT_IN_ROOM_TEMPLATES.length);
  });
});
