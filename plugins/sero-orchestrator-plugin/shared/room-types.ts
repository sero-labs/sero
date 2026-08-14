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

import type { RoomAttention } from './attention-types';
import type {
  MemberPermissionLevel,
  OperatingEnvelope,
  RoomBlueprint,
  RoomProposalSummary,
  RoomWorkspacePolicy,
} from './room-blueprint-types';

export type RoomStatus =
  | 'draft'
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

/** Watched by the UI. Deliberately small — the list view reads only this. */
export interface RoomSummary {
  id: string;
  title: string;
  status: RoomStatus;
  memberCount: number;
  activeMemberCount: number;
  costUsd: number;
  maxCostUsd: number;
  startedAt: string | null;
  updatedAt: string;
  /** Count of open approvals and attention items, for the home inbox badge. */
  attentionCount: number;
  /**
   * The pending approvals themselves, so the home inbox renders and resolves
   * them from the watched index alone — the same contract Workflow loops use
   * (`LoopSummary.attention`). Absent when nothing is pending.
   */
  attention?: RoomAttention;
}

export interface RoomIndex {
  schemaVersion: number;
  rooms: RoomSummary[];
}
