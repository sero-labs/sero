/**
 * Fixtures for the history-and-comparison previews: the Room timeline with its
 * side panel, and a Workflow's attempt history. The values are the drawing's,
 * which are taken from the real records on 19 September.
 */

import type { PathClaim, RoomTimelineEvent } from '../../shared/room-message-types';
import type { PersistedRoom, RoomMember } from '../../shared/room-types';
import type { LoopRunSummary } from '../../shared/types';
import { AttemptHistory } from '../components/AttemptHistory';
import { RoomActivity } from '../components/RoomActivity';
import { RoomSidePanel } from '../components/RoomSidePanel';

/**
 * SAFETY: a preview fixture only needs the fields the Room surfaces read — the
 * id, the display name, the conductor flag, the workspace id and the worktree.
 * The rest of `RoomMember` is carried by the runtime, not by a preview.
 */
const member = (id: string, displayName: string, isConductor = false): RoomMember => ({
  id,
  displayName,
  isConductor,
  session: { workspaceId: 'ws-preview' },
  worktreePath: `/work/frogger/${id}`,
}) as unknown as RoomMember;

const PREVIEW_MEMBERS = new Map<string, RoomMember>([
  ['nova', member('nova', 'Nova — Product Conductor', true)],
  ['flux', member('flux', 'Flux — Canvas Engineering Analyst')],
  ['pulse', member('pulse', 'Pulse — Game and UX Critic')],
]);

const PREVIEW_NAMES = new Map([
  ['nova', 'Nova — Product Conductor'],
  ['flux', 'Flux — Canvas Engineering Analyst'],
  ['pulse', 'Pulse — Game and UX Critic'],
]);

const at = (hhmm: string): string => `2026-09-10T${hhmm}:00.000Z`;

const ROOM_EVENTS: RoomTimelineEvent[] = [
  { id: 'e20', roomId: 'room-1', at: at('23:13'), kind: 'room-status', memberId: null, summary: 'Delivered and independently reviewed the Signal Wake Crossing product/technical direction.', details: null },
  { id: 'e19', roomId: 'room-1', at: at('23:13'), kind: 'delivery', memberId: null, summary: 'Result delivered to workspace-files.', details: { destination: 'workspace-files' } },
  { id: 'e18', roomId: 'room-1', at: at('23:12'), kind: 'work', memberId: 'nova', summary: 'Synthesize and verify final product/technical direction (done).', details: null },
  { id: 'e17', roomId: 'room-1', at: at('23:12'), kind: 'message', memberId: 'pulse', summary: 'answered Nova — Product Conductor.', details: null },
  { id: 'e16', roomId: 'room-1', at: at('23:11'), kind: 'message', memberId: 'flux', summary: 'answered Nova — Product Conductor.', details: null },
  { id: 'e15', roomId: 'room-1', at: at('23:11'), kind: 'message', memberId: 'nova', summary: 'asked Pulse — Game and UX Critic a question.', details: null },
  { id: 'e14', roomId: 'room-1', at: at('23:11'), kind: 'artifact', memberId: 'nova', summary: 'Nova — Product Conductor published plan: Final proposal: Signal Wake Crossing', details: { ref: 'plans/final-proposal.md' } },
  { id: 'e13', roomId: 'room-1', at: at('23:09'), kind: 'work', memberId: 'nova', summary: 'Synthesize and verify final product/technical direction (in progress).', details: null },
  { id: 'e12', roomId: 'room-1', at: at('23:04'), kind: 'revision', memberId: 'nova', summary: 'Add Pulse — Game and UX Critic to the roster.', details: null },
  { id: 'e11', roomId: 'room-1', at: at('22:58'), kind: 'work', memberId: 'flux', summary: 'Audit workspace architecture and build constraints (completed).', details: null },
  { id: 'e10', roomId: 'room-1', at: at('22:41'), kind: 'work', memberId: 'flux', summary: 'Audit workspace architecture and build constraints (in progress).', details: null },
  { id: 'e09', roomId: 'room-1', at: at('22:30'), kind: 'work', memberId: 'flux', summary: 'Audit workspace architecture and build constraints (assigned).', details: null },
  { id: 'e08', roomId: 'room-1', at: at('22:24'), kind: 'artifact', memberId: 'flux', summary: 'Flux — Canvas Engineering Analyst published plan: Workspace audit findings', details: { ref: 'plans/workspace-audit.md' } },
  { id: 'e07', roomId: 'room-1', at: at('22:18'), kind: 'work', memberId: 'pulse', summary: 'Design and critique a scope-safe Neon Crossing hook (assigned).', details: null },
  { id: 'e06', roomId: 'room-1', at: at('22:12'), kind: 'artifact', memberId: 'nova', summary: 'Nova — Product Conductor published plan: Room kickoff plan', details: { ref: 'plans/kickoff.md' } },
  { id: 'e05', roomId: 'room-1', at: at('22:05'), kind: 'member-status', memberId: 'pulse', summary: 'Pulse — Game and UX Critic joined the Room.', details: { status: 'active' } },
  { id: 'e04', roomId: 'room-1', at: at('22:02'), kind: 'member-status', memberId: 'flux', summary: 'Flux — Canvas Engineering Analyst joined the Room.', details: { status: 'active' } },
  { id: 'e03', roomId: 'room-1', at: at('22:01'), kind: 'member-status', memberId: 'nova', summary: 'Nova — Product Conductor joined the Room.', details: { status: 'active' } },
  { id: 'e02', roomId: 'room-1', at: at('22:00'), kind: 'room-status', memberId: null, summary: 'The Room started.', details: null },
  { id: 'e01', roomId: 'room-1', at: at('22:00'), kind: 'session', memberId: null, summary: 'Session opened.', details: null },
];

// SAFETY: a preview Room carries the fields its surfaces read — the title, the
// runtime usage, the brief, the bounded lists and the roster ids. The runtime
// fills the rest of `PersistedRoom` and no preview reads it.
const ROOM: PersistedRoom = {
  definition: {
    id: 'room-1',
    title: 'Frogger: Neon Crossing — Product and Technical Direction',
    envelope: { maxWallClockMs: 900_000, maxCostUsd: 5, maxActiveTurns: 6, maxTokens: 1e9, maxRosterRevisions: 5 },
  },
  runtime: {
    status: 'complete',
    startedAt: at('22:00'),
    endedAt: at('23:13'),
    activeMs: 5 * 60_000,
    activeSince: null,
    activeMemberIds: [],
    usage: { costUsd: 0.84, rosterRevisions: 1, memberReplacements: 0 },
    messageSequence: 7,
    timelineSequence: ROOM_EVENTS.length,
    appliedCommandIds: [],
    lastProgressAt: at('23:12'),
  },
  brief: {
    objective: 'Produce a concise, actionable product and implementation direction for Frogger: Neon Crossing without implementing it, including workspace findings, a distinctive scope-safe hook, effects and sound direction, controls, Canvas architecture, verification strategy, rejected alternatives, risks, unresolved decisions, and buildable milestone slices.',
    decisions: [{ title: 'Use a Canvas 2D renderer with a typed game loop' }],
    activeWork: [
      'Audit workspace architecture and build constraints — Flux — Canvas Engineering Analyst (completed)',
      'Design and critique scope-safe Neon Crossing hook — Pulse — Game and UX Critic (complete)',
    ],
    blockers: [],
    openQuestions: [],
    successCriteria: [
      'Workspace claims cite concrete files, scripts, dependencies, and relevant existing architecture.',
      'One recommended concept unifies gameplay, presentation, controls, accessibility, and technical design.',
      'The plan describes typed Canvas systems, game-loop boundaries, verification methods, risks, and milestone-sized slices.',
      'Rejected alternatives and unresolved user decisions are explicit and supported by concise reasoning.',
    ],
    updatedAt: at('23:13'),
  },
  work: Array.from({ length: 5 }, (_, index) => ({
    id: `work-${index}`,
    title: `Work item ${index + 1}`,
    status: 'completed',
    ownerMemberId: 'nova',
    notes: null,
  })),
  claims: [] as PathClaim[],
  artifacts: [
    { id: 'a1', title: 'Final proposal: Signal Wake Crossing', kind: 'plan', ref: 'plans/final-proposal.md', producedByMemberId: 'nova' },
    { id: 'a2', title: 'Workspace audit findings', kind: 'plan', ref: 'plans/workspace-audit.md', producedByMemberId: 'flux' },
    { id: 'a3', title: 'Room kickoff plan', kind: 'plan', ref: 'plans/kickoff.md', producedByMemberId: 'nova' },
  ],
  memberIds: ['nova', 'flux', 'pulse'],
  readCursors: [],
  approvals: [],
  delivery: {},
  archivedAt: null,
} as unknown as PersistedRoom;

/** The Room feed with its side panel, as the draw shows them together. */
export function RoomActivityPreview() {
  return (
    <div className="flex h-[760px] overflow-hidden border border-room-line bg-room-bg">
      <RoomActivity events={ROOM_EVENTS} members={PREVIEW_MEMBERS} savedEvents={ROOM_EVENTS.length} />
      <RoomSidePanel room={ROOM} names={PREVIEW_NAMES} members={PREVIEW_MEMBERS} />
    </div>
  );
}

const ATTEMPT_RUNS: LoopRunSummary[] = [
  {
    id: 'run_1',
    runNumber: 1,
    status: 'blocked',
    startedAt: '2026-09-10T12:54:00.000Z',
    endedAt: '2026-09-10T13:07:20.000Z',
    block: { kind: 'management-limit', reason: 'Stopped at the $3 spend limit', createdAt: '2026-09-10T13:07:20.000Z', limit: 'maxCostUsd' },
    steps: [
      { stepId: 'implement-title-search', title: 'Implement accessible composable title search', visitNumber: 1, attemptNumber: 1, executionType: 'background-agent', status: 'completed', outcomeStatus: 'succeeded' },
      { stepId: 'run-release-checks', title: 'Run release checks and rendered verification', visitNumber: 2, attemptNumber: 1, executionType: 'background-agent', status: 'completed', outcomeStatus: 'succeeded' },
    ],
    recoveries: [],
    usage: { totalTokens: 3_300_000, costUsd: 3.12 },
  },
  {
    id: 'run_2',
    runNumber: 2,
    status: 'completed',
    startedAt: '2026-09-10T13:09:00.000Z',
    endedAt: '2026-09-10T13:10:05.000Z',
    steps: [{ stepId: 'finalise', title: 'Finalise Milestone 6', visitNumber: 1, attemptNumber: 1, executionType: 'background-agent', status: 'completed', outcomeStatus: 'succeeded' }],
    recoveries: [],
    usage: { totalTokens: 122_300, costUsd: 0.013 },
  },
];

/** A Workflow's attempt history: two runs, one stopped at its spend limit. */
export function AttemptHistoryPreview() {
  return <AttemptHistory runs={ATTEMPT_RUNS} />;
}
