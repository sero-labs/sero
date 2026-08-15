/**
 * Fixture data for the throwaway preview harness (ux-refit-plan.md §7).
 * Removed with the rest of the harness before the final commit.
 */

import type { LoopSummary } from '../shared/types';
import type { RoomSummary } from '../shared/room-types';
import type { BlueprintMember, RoomBlueprint, RoomProposalSummary } from '../shared/room-blueprint-types';

export const T0 = new Date(Date.now() - 41 * 60_000).toISOString();
export const NOOP = () => {};

export const FIXTURE_ROOMS: RoomSummary[] = [
  {
    id: 'room-auth',
    title: 'Auth hardening',
    status: 'running',
    memberCount: 5,
    activeMemberCount: 3,
    costUsd: 3.18,
    maxCostUsd: 6,
    startedAt: T0,
    updatedAt: new Date().toISOString(),
    problemStatement: 'Find and fix the session-fixation risk before the release cut',
    members: [
      { name: 'Conductor', isConductor: true },
      { name: 'Security reviewer', isConductor: false },
      { name: 'Implementer 1', isConductor: false },
      { name: 'Implementer 2', isConductor: false },
      { name: 'Tester', isConductor: false },
    ],
    attentionCount: 2,
    attention: {
      approvals: [
        {
          approvalId: 'appr-1',
          memberId: 'impl-2',
          memberName: 'Implementer 2',
          title: 'Push branch room/auth-hardening/impl-2 to origin',
          reason: 'The cache reader updates are complete and ready to collect.',
          consequence: 'One branch leaves this machine. Nothing else changes.',
          affects: 'GitHub',
          kind: 'external-write',
          estimatedCostUsd: null,
          createdAt: T0,
        },
        {
          approvalId: 'appr-2',
          memberId: 'conductor',
          memberName: 'Conductor',
          title: 'Raise the spend limit from $6.00 to $9.00',
          reason: '$3.00 more, to finish the migration work and re-run the tests.',
          consequence: 'The Room may spend up to $9.00 in total.',
          affects: 'Spend limit',
          kind: 'limit-change',
          estimatedCostUsd: 3,
          createdAt: T0,
        },
      ],
    },
  },
  {
    id: 'room-pricing',
    title: 'Pricing page rewrite',
    status: 'completed',
    memberCount: 3,
    activeMemberCount: 0,
    costUsd: 0.94,
    maxCostUsd: 3,
    startedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 3600_000 - 38 * 60_000).toISOString(),
    problemStatement: 'Rewrite the pricing page copy for the launch',
    members: [
      { name: 'Conductor', isConductor: true },
      { name: 'Writer', isConductor: false },
      { name: 'Designer', isConductor: false },
    ],
    attentionCount: 0,
  },
];

export const FIXTURE_LOOPS: LoopSummary[] = [
  {
    id: 'loop-sweep',
    title: 'Nightly dependency sweep',
    status: 'active',
    summary: 'Sweeps dependencies nightly and opens a PR when something moves.',
    prompt: 'Sweep dependencies nightly.',
    progress: { running: true, done: 2, total: 6 },
    activeStepTitles: ['running verification'],
    schedules: [{ triggerId: 't1', type: 'cron', schedule: '0 2 * * *' }],
    usage: { costUsd: 0.31 },
    attention: {
      input: {
        requestId: 'req-1',
        source: 'planner',
        questions: [{ id: 'q1', prompt: 'Answer planner question about the target branch' }],
      },
    },
    createdAt: T0,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'loop-triage',
    title: 'Issue triage',
    status: 'draft',
    summary: 'Waiting for a GitHub issue event',
    prompt: 'Triage new GitHub issues.',
    createdAt: T0,
    updatedAt: new Date(Date.now() - 50 * 60_000).toISOString(),
  },
];

export const FIXTURE_PROPOSAL: RoomProposalSummary = {
  teamSize: 5,
  conductorCount: 1,
  maxWallClockMs: 2 * 3600_000,
  maxCostUsd: 6,
  access: [
    { label: 'read-workspace' },
    { label: 'edit-workspace' },
    {
      label: 'github-write',
      warning: 'This team can push branches and open pull requests. It cannot merge them, deploy, or reach anything outside this repository.',
    },
  ],
  warnings: [
    'This team can push branches and open pull requests. It cannot merge them, deploy, or reach anything outside this repository.',
  ],
  title: 'Session-fixation fix for the login flow',
  approach:
    'A reviewer confirms whether the risk is real, two implementers fix it in separate branches, and a tester proves the fix with a failing-then-passing test before the pull request goes up.',
  roles: [
    {
      displayName: 'Conductor',
      responsibility: 'Keeps the work moving, decides what happens next, and reports back when it is done.',
      isConductor: true,
      rationale: 'Someone has to decide when the reviewer’s finding is solid enough to act on, and when the fix is finished. That decision cannot sit with the agent doing the work.',
    },
    {
      displayName: 'Security reviewer',
      responsibility: 'Confirms whether the session-fixation risk is real and says exactly where it is.',
      isConductor: false,
      rationale: 'Confirms the risk is real before anyone changes code. If it is not real, the Room can stop early instead of spending the budget.',
    },
    {
      displayName: 'Implementer 1',
      responsibility: 'Fixes the session handling in the login path.',
      isConductor: false,
      rationale: 'The login path change is small but delicate. It gets its own branch so it can be reviewed on its own.',
    },
    {
      displayName: 'Implementer 2',
      responsibility: 'Updates everything that depends on the old session behaviour.',
      isConductor: false,
      rationale: 'The downstream updates are wide and mechanical. Splitting them off keeps the delicate change readable.',
    },
    {
      displayName: 'Tester',
      responsibility: 'Writes a test that fails on the old code and passes on the fix.',
      isConductor: false,
      rationale: 'You asked for a test that fails on the old code. Writing it separately from the fix stops it being shaped to match the fix.',
    },
  ],
  teamRationale:
    'Session fixation is cheap to misdiagnose and expensive to get wrong, so the first job is confirming it exists rather than assuming it. The fix itself touches two separate concerns — the login path and everything downstream that reads the old session — which is why the work splits across two implementers in separate branches instead of one agent making a wide change. A dedicated tester keeps the proof honest: the test has to fail on the current code before it is allowed to pass on the fix.',
};

function fixtureMember(overrides: Partial<BlueprintMember> & Pick<BlueprintMember, 'key' | 'displayName' | 'role'>): BlueprintMember {
  return {
    responsibility: '',
    mandate: '',
    isConductor: false,
    model: 'claude-opus-5',
    thinking: 'high',
    promptAdditions: [],
    tools: ['read', 'grep', 'bash'],
    skills: [],
    permissions: 'read-only',
    needsWorktree: false,
    reasonForInclusion: '',
    ...overrides,
  };
}

export const FIXTURE_BLUEPRINT: RoomBlueprint = {
  schemaVersion: 1,
  title: 'Session-fixation fix for the login flow',
  approach: FIXTURE_PROPOSAL.approach,
  objective: 'Confirm and fix session fixation in the login flow, and prove the fix with a test that fails on the old code.',
  successCriteria: [
    'The session identifier rotates after a successful authentication.',
    'A regression test fails on the old code and passes on the fix.',
    'A pull request is open with the fix and the test.',
  ],
  roomInstructions: 'Work in your own branch. Hand findings to the Conductor rather than acting on another member’s conclusions directly. Say plainly when something cannot be confirmed from the code.',
  members: [
    fixtureMember({ key: 'conductor', displayName: 'Conductor', role: 'Coordinator', isConductor: true, mandate: 'Keep the work moving, decide what happens next, and report back when it is done.', tools: ['read', 'grep', 'sero-cli'] }),
    fixtureMember({
      key: 'security-reviewer',
      displayName: 'Security reviewer',
      role: 'Reviewer',
      mandate: 'Confirm whether the login flow is vulnerable to session fixation. Read the session lifecycle end to end before concluding. State the exact file and line where the session identifier survives authentication, or state clearly that it does not. Do not propose or write a fix — hand your finding to the Conductor and stop.',
      tools: ['read', 'grep', 'bash', 'sero-cli'],
      skills: ['security-review'],
      promptAdditions: ['Prefer reading the code over reasoning about it. If you cannot find the vulnerability in the code itself, say so — do not infer it from the framework’s reputation.'],
    }),
    fixtureMember({ key: 'implementer-1', displayName: 'Implementer 1', role: 'Implementer', permissions: 'edit-and-push', needsWorktree: true, tools: ['read', 'grep', 'bash', 'write', 'edit', 'gh'], mandate: 'Fix the session handling in the login path.' }),
    fixtureMember({ key: 'implementer-2', displayName: 'Implementer 2', role: 'Implementer', permissions: 'edit-workspace', needsWorktree: true, tools: ['read', 'grep', 'bash', 'write', 'edit'], mandate: 'Update everything that depends on the old session behaviour.' }),
    fixtureMember({ key: 'tester', displayName: 'Tester', role: 'Tester', permissions: 'edit-workspace', needsWorktree: true, tools: ['read', 'grep', 'bash', 'write', 'edit'], mandate: 'Write a test that fails on the old code and passes on the fix.' }),
  ],
  teamRationale: FIXTURE_PROPOSAL.teamRationale,
  collaborationStrategy: 'The reviewer reports to the Conductor, the implementers work in parallel branches and ask each other direct questions, and the tester starts from the finding rather than either branch.',
  workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
  envelope: {
    maxMembers: 8,
    maxActiveTurns: 4,
    maxRosterRevisions: 4,
    maxMemberReplacements: 2,
    maxWallClockMs: 2 * 3600_000,
    maxCostUsd: 6,
    maxCostUsdPerMember: 1.5,
    maxTokens: 4_000_000,
    maxTokensPerMember: 1_000_000,
    maxTurnsPerMember: 12,
    maxRetriesPerMember: 3,
    maxConsecutiveFailures: 3,
    allowedModels: ['claude-opus-5', 'claude-sonnet-5'],
    allowedThinkingLevels: ['low', 'medium', 'high'],
    allowedTools: ['read', 'grep', 'bash', 'write', 'edit', 'gh', 'browser', 'sero-cli'],
    allowedSkills: ['security-review', 'pi-docs', 'react-doctor'],
    workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' },
    allowedDeliveryDestinations: ['workspace-files'],
    allowNestedSubagents: false,
    maxIdleMs: 15 * 60_000,
  },
  estimatedDurationMs: 34 * 60_000,
  estimatedCostUsd: 3.4,
  deliveryDestination: 'workspace-files',
  openAssumptions: [],
};

/** The revised proposal after the screen-5 fixture instruction. */
export const FIXTURE_PROPOSAL_REVISED: RoomProposalSummary = {
  ...FIXTURE_PROPOSAL,
  teamSize: 4,
  maxCostUsd: 2,
  access: [{ label: 'read-workspace' }, { label: 'edit-workspace' }],
  warnings: [],
  roles: FIXTURE_PROPOSAL.roles.filter((role) => role.displayName !== 'Implementer 2'),
};

