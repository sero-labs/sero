/**
 * Room fixtures for the member-session tests: a three-member roster with one
 * read-only Conductor, one worktree implementer and one read-only member that
 * holds a fetch tool — the three permission and reach shapes the grant proposal
 * has to keep apart.
 */

import type {
  BlueprintMember,
  OperatingEnvelope,
  RoomBlueprint,
} from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import { toMemberRecord } from '../rooms/member-grant';
import type { RoomRecord } from '../rooms/room-state';

export function envelopeWith(overrides: Partial<OperatingEnvelope> = {}): OperatingEnvelope {
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
    allowedModels: ['sonnet', 'haiku'],
    allowedThinkingLevels: ['off', 'medium'],
    allowedTools: ['read', 'write', 'bash', 'web_fetch'],
    allowedSkills: [],
    workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
    allowedDeliveryDestinations: ['saved-artifact'],
    allowNestedSubagents: false,
    maxIdleMs: 600_000,
    ...overrides,
  };
}

export function blueprintMember(overrides: Partial<BlueprintMember>): BlueprintMember {
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

export const MEMBERS: BlueprintMember[] = [
  blueprintMember({}),
  blueprintMember({
    key: 'impl',
    displayName: 'Implementer',
    role: 'Implementer',
    responsibility: 'Writes the fix.',
    mandate: 'Make the tests pass.',
    isConductor: false,
    tools: ['read', 'write', 'bash'],
    permissions: 'edit-workspace',
    needsWorktree: true,
  }),
  blueprintMember({
    key: 'scout',
    displayName: 'Scout',
    role: 'Researcher',
    responsibility: 'Reads the docs.',
    mandate: 'Find the upstream change.',
    isConductor: false,
    tools: ['read', 'web_fetch'],
    permissions: 'read-only',
    needsWorktree: false,
  }),
];

export function roomFixture(envelope: OperatingEnvelope, members: BlueprintMember[]): RoomRecord {
  const blueprint: RoomBlueprint = {
    schemaVersion: 1,
    title: 'Ship the fix',
    approach: 'Split the work.',
    objective: 'Fix the crash on start',
    successCriteria: ['the app starts'],
    roomInstructions: 'Use sero-cli to talk to the Room.',
    members,
    teamRationale: 'One decides, one builds, one reads.',
    collaborationStrategy: 'direct',
    workspacePolicy: envelope.workspacePolicy,
    envelope,
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'saved-artifact',
    openAssumptions: [],
  };
  const records = members.map((member) => toMemberRecord(member, 'room-a', 't0', 'ws-1'));
  const implementer = records.find((member) => member.id === 'impl');
  // Activation creates the worktree before it asks for the grant, so the
  // implementer's subject can be pinned to its own tree.
  if (implementer) implementer.worktreePath = '/workspaces/ws-1/.sero/worktrees/impl';

  return {
    definition: {
      id: 'room-a',
      title: 'Ship the fix',
      problemStatement: 'the app crashes',
      blueprint,
      proposal: computeProposalSummary(blueprint),
      envelope,
      workspacePolicy: envelope.workspacePolicy,
      grantId: null,
      createdAt: 't0',
      updatedAt: 't0',
    },
    runtime: {
      status: 'running',
      startedAt: 't0',
      endedAt: null,
      activeMemberIds: [],
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0, rosterRevisions: 0, memberReplacements: 0 },
      stopReason: null,
      messageSequence: 0,
      appliedCommandIds: [],
      lastProgressAt: null,
    },
    members: records,
    brief: {
      objective: 'Fix the crash on start',
      successCriteria: ['the app starts'],
      decisions: [],
      activeWork: [],
      blockers: [],
      openQuestions: [],
      artifactRefs: [],
      updatedAt: 't0',
      conductorNote: null,
      conductorNoteAt: null,
    },
    delivery: {
      destination: 'saved-artifact',
      params: {},
      originSessionId: null,
      originWorkspaceId: null,
      deliveredAt: null,
      deliveryRef: null,
    },
    archivedAt: null,
    revisions: [],
    readCursors: [],
    approvals: [],
  };
}
