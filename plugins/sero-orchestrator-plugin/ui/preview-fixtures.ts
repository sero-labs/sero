/**
 * Fixture data for the throwaway preview harness (ux-refit-plan.md §7).
 * Removed with the rest of the harness before the final commit.
 */

import type { LoopSummary } from '../shared/types';
import type { MemberStatus, PersistedRoom, RoomMember, RoomSummary } from '../shared/room-types';
import type { RoomTimelineEvent } from '../shared/room-message-types';
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


// ── The live Room (phase 11, capture 8) ──────────────────────

const minsAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

function fixtureRoomMember(input: {
  id: string;
  name: string;
  isConductor?: boolean;
  status: MemberStatus;
  statusDetail: string;
  statusAgoMins?: number;
  costUsd: number;
  turns?: number;
}): RoomMember {
  return {
    id: input.id,
    roomId: 'room-live',
    displayName: input.name,
    isConductor: input.isConductor ?? false,
    responsibility: input.statusDetail,
    status: input.status,
    statusDetail: input.statusDetail,
    statusAt: minsAgo(input.statusAgoMins ?? 1),
    mandate: {
      role: input.name,
      responsibilities: input.statusDetail,
      currentTask: '',
      priorities: [],
      workingInstructions: '',
      revision: 1,
      updatedAt: T0,
    },
    configuration: {
      model: 'claude-opus-5',
      thinking: 'high',
      promptAdditions: [],
      tools: ['read', 'grep', 'bash'],
      skills: [],
      permissions: 'edit-workspace',
      needsWorktree: true,
      revision: 1,
    },
    session: {
      subject: input.id,
      sessionId: null,
      sessionPath: null,
      workspaceId: 'ws-1',
      liveHandleId: null,
      lastOpenedAt: T0,
      lastClosedAt: null,
      compactionCount: 0,
      lastCompactedAt: null,
    },
    usage: {
      costUsd: input.costUsd,
      inputTokens: 120_000,
      outputTokens: 18_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: input.turns ?? 6,
      retries: 0,
      consecutiveFailures: 0,
    },
    worktreePath: null,
    worktreeBranch: null,
    waitingOnQuestionId: null,
    replacedByMemberId: null,
    createdAt: T0,
    retiredAt: null,
  };
}

export const FIXTURE_LIVE_MEMBERS: RoomMember[] = [
  fixtureRoomMember({ id: 'conductor', name: 'Conductor', isConductor: true, status: 'working', statusDetail: 'Deciding what happens next', costUsd: 0.71, turns: 12 }),
  fixtureRoomMember({ id: 'security-reviewer', name: 'Security reviewer', status: 'completed', statusDetail: 'Finished · risk confirmed', costUsd: 0.94 }),
  fixtureRoomMember({ id: 'implementer-1', name: 'Implementer 1', status: 'working', statusDetail: 'Editing session handling', costUsd: 0.83 }),
  fixtureRoomMember({ id: 'implementer-2', name: 'Implementer 2', status: 'waiting', statusDetail: 'Waiting on a reply', statusAgoMins: 3, costUsd: 0.44 }),
  fixtureRoomMember({ id: 'tester', name: 'Tester', status: 'idle', statusDetail: 'Idle · nothing to test yet', costUsd: 0.26 }),
];

export const FIXTURE_LIVE_ROOM: PersistedRoom = {
  definition: {
    id: 'room-live',
    title: 'Auth hardening',
    problemStatement: 'Our login flow probably has a session-fixation problem. Find out whether it does, fix it properly, and give me a pull request with a test that fails on the old code.',
    blueprint: FIXTURE_BLUEPRINT,
    proposal: FIXTURE_PROPOSAL,
    envelope: FIXTURE_BLUEPRINT.envelope,
    workspacePolicy: FIXTURE_BLUEPRINT.workspacePolicy,
    grantId: 'grant-1',
    createdAt: T0,
    updatedAt: minsAgo(2),
  },
  runtime: {
    status: 'running',
    startedAt: T0,
    endedAt: null,
    activeMemberIds: ['conductor', 'implementer-1', 'tester'],
    usage: {
      costUsd: 3.18,
      inputTokens: 900_000,
      outputTokens: 120_000,
      turns: 34,
      rosterRevisions: 1,
      memberReplacements: 0,
    },
    stopReason: null,
    messageSequence: 42,
    timelineSequence: 6,
    appliedCommandIds: [],
    lastProgressAt: minsAgo(2),
  },
  brief: {
    objective: 'Confirm and fix session fixation in the login flow, and prove the fix with a test that fails on the old code.',
    successCriteria: FIXTURE_BLUEPRINT.successCriteria,
    decisions: ['The risk is real and sits at src/auth/session.ts:118. The fix rotates the identifier rather than replacing the session object.'],
    activeWork: ['Implementer 1 — login-path rotation.', 'Implementer 2 — downstream readers, blocked on a reply.'],
    blockers: ['One open question between the two implementers.'],
    openQuestions: [],
    artifactRefs: ['finding-1'],
    updatedAt: minsAgo(8),
    conductorNote: 'Keeping the tester idle until Implementer 1’s branch settles — writing the test against a moving target wastes turns.',
    conductorNoteAt: minsAgo(8),
  },
  delivery: {
    destination: 'workspace-files',
    params: {},
    originSessionId: null,
    originWorkspaceId: null,
    deliveredAt: null,
    deliveryRef: null,
  },
  archivedAt: null,
  memberIds: FIXTURE_LIVE_MEMBERS.map((member) => member.id),
  readCursors: [],
  approvals: [],
  work: [
    {
      id: 'work-1',
      roomId: 'room-live',
      title: 'Rotate the session identifier on login',
      ownerMemberId: 'implementer-1',
      status: 'in progress',
      notes: 'Rotation lands in the login path; the logout path is untouched.',
      dependsOnWorkIds: [],
      artifactRefs: [],
      createdAt: minsAgo(27),
      updatedAt: minsAgo(8),
    },
  ],
  artifacts: [
    {
      id: 'finding-1',
      roomId: 'room-live',
      kind: 'review',
      title: 'Session fixation is real',
      ref: 'src/auth/session.ts:118',
      producedByMemberId: 'security-reviewer',
      relatedWorkId: null,
      createdAt: minsAgo(30),
    },
  ],
  claims: [
    {
      id: 'claim-1',
      roomId: 'room-live',
      memberId: 'implementer-1',
      pattern: 'src/auth/**',
      reason: 'Login-path rotation.',
      status: 'active',
      createdAt: minsAgo(27),
      releasedAt: null,
    },
  ],
};

const liveEvent = (
  minsBack: number,
  kind: RoomTimelineEvent['kind'],
  memberId: string | null,
  summary: string,
  details: RoomTimelineEvent['details'] = null,
): RoomTimelineEvent => ({
  id: `ev-${minsBack}-${kind}`,
  roomId: 'room-live',
  at: minsAgo(minsBack),
  kind,
  memberId,
  summary,
  details,
});

export const FIXTURE_TIMELINE: RoomTimelineEvent[] = [
  liveEvent(39, 'message', 'conductor', 'Conductor asked the Security reviewer to confirm the risk before any code changes.'),
  liveEvent(30, 'artifact', 'security-reviewer', 'Security reviewer confirmed the risk: the pre-authentication session identifier survives the privilege change.', { ref: 'src/auth/session.ts:118' }),
  liveEvent(27, 'revision', 'conductor', 'Conductor split the fix across two branches and started both implementers.'),
  liveEvent(12, 'message', 'implementer-2', 'Implementer 2 asked Implementer 1 a question and is waiting.'),
  liveEvent(10, 'compaction', null, 'Sero compacted the Security reviewer’s session at a safe turn boundary.'),
  liveEvent(8, 'work', 'implementer-1', 'Implementer 1 published a checkpoint commit.', { ref: 'a41f0c2 · rotate the session identifier after a successful authentication' }),
];
