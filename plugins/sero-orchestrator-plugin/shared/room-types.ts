/**
 * Room domain records (AD-028, spec §3, §16, §26).
 *
 * These are deliberately SEPARATE from the Workflow `Loop` records. Workflow is
 * plans, steps, activations and attempts; Room is blueprints, members, mandates,
 * messages and revisions. No shared interface may carry a field that only one
 * mode uses.
 *
 * The current record is the source of truth. The audit timeline explains
 * transitions for the UI and diagnostics; state is never rebuilt by replaying it
 * (FR-030).
 */

import type { OrchestratorBoardRoomView } from '@sero-ai/common';

import type { RoomAttention } from './attention-types';
import type {
  MemberReadCursor,
  PathClaim,
  RoomApprovalRequest,
  RoomArtifact,
  WorkItem,
} from './room-message-types';
import type {
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
  RoomProposalSummary,
  RoomWorkspacePolicy,
} from './room-blueprint-types';

export type RoomStatus =
  | 'draft'
  | 'adjusting'
  | 'starting'
  | 'ready'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'completing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MemberStatus =
  | 'starting'
  | 'idle'
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'suspended'
  | 'retiring'
  | 'retired'
  | 'completed'
  | 'failed'
  | 'offline';

/** Terminal Room states — no further turns start. */
export const TERMINAL_ROOM_STATUSES: readonly RoomStatus[] = ['completed', 'failed', 'cancelled'];

/**
 * Room states a turn may start in. Every other state — paused, pausing,
 * completing, or a terminal one — must leave the scheduler with nothing to do,
 * and the check is repeated inside the write that starts the turns, because a
 * pause or a cancel can land between the two.
 */
export const SCHEDULABLE_ROOM_STATUSES: readonly RoomStatus[] = ['running', 'ready'];

/** Member states that hold no execution slot (NFR-004). */
export const IDLE_MEMBER_STATUSES: readonly MemberStatus[] = [
  'idle', 'waiting', 'blocked', 'suspended', 'retired', 'completed', 'failed', 'offline',
];

/**
 * The mutable half of a member. Changing a mandate changes INSTRUCTIONS ONLY —
 * it can never add a model, tool, skill, permission, workspace or delivery
 * capability. Those travel through a validated configuration revision and the
 * host authority boundary (FR-041).
 */
export interface MemberMandate {
  role: string;
  responsibilities: string;
  currentTask: string;
  priorities: string[];
  workingInstructions: string;
  /** Bumped on every mandate change, so a session knows its mandate is stale. */
  revision: number;
  updatedAt: string;
}

/**
 * The stable half of a member: its identity and its authority. A fundamental
 * change here creates a REPLACEMENT member with a handover, rather than
 * mutating this one (FR-017).
 */
export interface MemberConfiguration {
  model: string;
  thinking: string;
  promptAdditions: string[];
  tools: string[];
  skills: string[];
  permissions: MemberPermissionLevel;
  needsWorktree: boolean;
  /** Bumped on every accepted configuration revision. */
  revision: number;
}

/** Reference to the member's Pi session. Never the transcript itself (NFR-002). */
export interface MemberSessionRef {
  /** Subject id handed to the persistent-session capability. Equals memberId. */
  subject: string;
  /**
   * The tools the host actually granted this subject, read back from the issued
   * grant. A session must ask for exactly these: the host clamps the proposal to
   * what the permission profile allows, and a request for anything it removed is
   * denied outright, which stops the member before its first turn.
   *
   * Null until the grant is installed, and on Rooms started by an older build.
   */
  grantedTools: string[] | null;
  sessionId: string | null;
  sessionPath: string | null;
  workspaceId: string;
  /** Host handle while live; null once disposed. Disposal keeps the file. */
  liveHandleId: string | null;
  lastOpenedAt: string | null;
  lastClosedAt: string | null;
  compactionCount: number;
  lastCompactedAt: string | null;
}

export interface MemberUsage {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
  retries: number;
  consecutiveFailures: number;
}

export interface RoomMember {
  id: string;
  roomId: string;
  displayName: string;
  isConductor: boolean;
  /** One line, user-facing. */
  responsibility: string;
  status: MemberStatus;
  /** Plain-English reason for the current status, shown in the UI. */
  statusDetail: string;
  /** When the member entered its current status — "Waiting 3m" reads from this. */
  statusAt: string;
  mandate: MemberMandate;
  configuration: MemberConfiguration;
  session: MemberSessionRef;
  usage: MemberUsage;
  /** Managed worktree path when this member edits in isolation. */
  worktreePath: string | null;
  worktreeBranch: string | null;
  /** Set while `waiting`: the question id this member is blocked on. */
  waitingOnQuestionId: string | null;
  /** The member that replaced this one, when retired by replacement. */
  replacedByMemberId: string | null;
  createdAt: string;
  retiredAt: string | null;
}

export interface RoomUsage {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  rosterRevisions: number;
  memberReplacements: number;
}

/** Why the Room stopped starting new turns. Never an empty string. */
export interface RoomStopReason {
  kind:
    | 'limit-reached'
    | 'no-progress'
    | 'deadlock'
    | 'conductor-failed'
    | 'awaiting-approval'
    /**
     * A member asked the user a question only the user can answer. The Room is
     * not stalled and has not failed: it is waiting on a person, and it says so
     * rather than spending its no-progress clock and pausing for the wrong
     * reason with the question buried in a member's status line.
     */
    | 'awaiting-user'
    | 'user-paused'
    | 'user-cancelled'
    | 'storage-failure';
  detail: string;
  at: string;
}

export interface RoomRuntimeState {
  status: RoomStatus;
  startedAt: string | null;
  endedAt: string | null;
  /** Members currently holding an execution slot. */
  activeMemberIds: string[];
  usage: RoomUsage;
  stopReason: RoomStopReason | null;
  /** Monotonic; the message cursor domain. */
  messageSequence: number;
  /**
   * Timeline events appended so far. It exists so a reader that watches
   * room.json learns that the timeline moved: a claim, a revision or a
   * compaction appends an event without touching anything else the panel
   * follows, and would otherwise go unseen until the next turn.
   */
  timelineSequence: number;
  /** Command idempotency keys already applied (NFR-003). Bounded. */
  appliedCommandIds: string[];
  lastProgressAt: string | null;
}

/**
 * Where a Room's result goes. `originSessionId` is set when the Room was
 * started from a chat, which is the contract the old collaboration engines had
 * (FR-029).
 */
export interface RoomDelivery {
  destination: string;
  params: Record<string, string | number | boolean>;
  originSessionId: string | null;
  originWorkspaceId: string | null;
  deliveredAt: string | null;
  deliveryRef: string | null;
  /** Return to the chat that invoked the Room, independent of its declared destination. */
  originReturnedAt: string | null;
  originReturnRef: string | null;
}

/**
 * The authoritative brief, computed by the coordinator from current Room
 * records after structural progress. Never assembled from the transcript, and
 * never sent whole to a member (§15.1).
 */
export interface RoomBrief {
  objective: string;
  successCriteria: string[];
  decisions: string[];
  activeWork: string[];
  blockers: string[];
  openQuestions: string[];
  artifactRefs: string[];
  updatedAt: string;
  /** Clearly Conductor-authored. Cannot change any computed field above. */
  conductorNote: string | null;
  conductorNoteAt: string | null;
}

export interface RoomDefinition {
  id: string;
  title: string;
  /** The user's original words. Kept verbatim for the audit trail. */
  problemStatement: string;
  blueprint: RoomBlueprint;
  /** Recomputed from the blueprint on every change. Never planner-authored. */
  proposal: RoomProposalSummary;
  envelope: OperatingEnvelope;
  workspacePolicy: RoomWorkspacePolicy;
  /** Host-issued grant backing every member session. Cleared on revocation. */
  grantId: string | null;
  /** Grant retained only so disposed session history remains readable. */
  historyGrantId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  definition: RoomDefinition;
  runtime: RoomRuntimeState;
  members: RoomMember[];
  brief: RoomBrief;
  delivery: RoomDelivery;
  archivedAt: string | null;
}

/** One roster entry as a list row draws it: a face and its tone. */
export interface RoomSummaryMember {
  /** Stable Room member id used by identity surfaces. */
  id?: string;
  name: string;
  isConductor: boolean;
  /** Joined after the Room started — drawn in the "new member" tone. */
  addedAfterStart?: boolean;
}

/**
 * Watched by the UI. Deliberately small — the list view reads only this.
 *
 * It extends the cross-surface board contract, so the shell's Agent Board reads
 * the same index this plugin writes and drifting from it fails typecheck here
 * rather than showing an empty card at runtime.
 */
export interface RoomSummary extends OrchestratorBoardRoomView {
  id: string;
  title: string;
  status: RoomStatus;
  memberCount: number;
  activeMemberCount: number;
  costUsd: number;
  maxCostUsd: number;
  startedAt: string | null;
  updatedAt: string;
  /** The user's problem, for list-row subtitles. */
  problemStatement?: string;
  /** Active roster, capped, for the list row's face stack. */
  members?: RoomSummaryMember[];
  /** Count of open approvals and attention items, for the home inbox badge. */
  attentionCount: number;
  /**
   * The pending approvals themselves, so the home inbox renders and resolves
   * them from the watched index alone — the same contract Workflow loops use
   * (`LoopSummary.attention`). Absent when nothing is pending.
   */
  attention?: RoomAttention;
}

/**
 * The bounded lists that live WITH a Room rather than in their own file: few of
 * them, read together with the Room, and each one capped (§19.1–§19.3). Only
 * messages page separately, because they are the one list that grows without
 * limit.
 */
export interface RoomLists {
  readCursors: MemberReadCursor[];
  approvals: RoomApprovalRequest[];
  work: WorkItem[];
  artifacts: RoomArtifact[];
  claims: PathClaim[];
}

/**
 * room.json: the Room and its lists, with the roster as ids — each member has
 * its own file. Shared because the Room panel reads this file directly, and a
 * second description of the same bytes would be free to drift from it.
 */
export type PersistedRoom = Omit<Room, 'members'> & RoomLists & { memberIds: string[] };

export interface RoomIndex {
  schemaVersion: number;
  rooms: RoomSummary[];
}

/**
 * Bumped whenever the persisted Room shape changes (see room-migrations.ts).
 * It lives with the shape it describes, so the renderer can state the version
 * of an empty index without importing runtime code.
 */
export const ROOM_SCHEMA_VERSION = 3;
