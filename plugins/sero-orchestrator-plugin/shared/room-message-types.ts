/**
 * Room messages, work, claims, artifacts and revisions (spec §13, §17, §19).
 *
 * Messages are durable and persisted BEFORE delivery, with a per-member read
 * cursor. This is a single-host mailbox — it needs no broker and no
 * event-sourcing model (§17.1).
 *
 * Split from room-types.ts to keep each file within the 500-line limit.
 */

import type { MemberPermissionLevel } from './room-blueprint-types';

export type RoomMessageKind =
  | 'direct'
  | 'broadcast'
  | 'question'
  | 'reply'
  | 'cancel'
  | 'acknowledgement'
  | 'system';

export interface RoomMessage {
  id: string;
  roomId: string;
  /** Monotonic within the Room. The read-cursor domain. */
  sequence: number;
  kind: RoomMessageKind;
  /** Member id, or null for a system notice. */
  fromMemberId: string | null;
  /** Member ids. Empty for a broadcast, which targets every active member. */
  toMemberIds: string[];
  body: string;
  /** Set on `question`; the id a waiting member blocks on. */
  questionId: string | null;
  /** Set on `reply`; the question it answers. */
  inReplyToQuestionId: string | null;
  /**
   * Whether delivery may wake an idle recipient. Broadcasts queue by default
   * and wake only when explicitly requested AND policy permits (FR-021).
   */
  wakeRecipients: boolean;
  /** Idempotency key. A duplicate never creates a second logical message. */
  commandId: string;
  createdAt: string;
}

/** Per-member read position. A member reads forward from here on its next turn. */
export interface MemberReadCursor {
  memberId: string;
  lastReadSequence: number;
  /** Messages persisted but not yet delivered into a turn. */
  pendingCount: number;
}

/** Deliberately small (§19.1). The runtime imposes no review methodology. */
export interface WorkItem {
  id: string;
  roomId: string;
  title: string;
  ownerMemberId: string | null;
  /** Free-form on purpose — no fixed state machine. */
  status: string;
  notes: string;
  dependsOnWorkIds: string[];
  artifactRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export type RoomArtifactKind =
  | 'plan'
  | 'decision'
  | 'branch'
  | 'commit'
  | 'patch'
  | 'test-result'
  | 'review'
  | 'report'
  | 'pull-request'
  | 'final-answer';

export interface RoomArtifact {
  id: string;
  roomId: string;
  kind: RoomArtifactKind;
  title: string;
  /** Reference returned by host.writeArtifact, or an external URL. */
  ref: string;
  producedByMemberId: string;
  relatedWorkId: string | null;
  createdAt: string;
}

/**
 * Advisory only. Worktrees and Git conflict handling are the real safety
 * boundary — a claim is coordination between members, never a lock (§19.3).
 */
export interface PathClaim {
  id: string;
  roomId: string;
  memberId: string;
  /** A path, directory or glob. */
  pattern: string;
  reason: string;
  status: 'active' | 'released';
  createdAt: string;
  releasedAt: string | null;
}

export interface PathClaimOverlap {
  pattern: string;
  memberIds: string[];
  /** Follows the Room's claim policy. */
  action: 'warn' | 'block';
}

export type RoomRevisionKind =
  | 'add-member'
  | 'update-mandate'
  | 'assign-work'
  | 'change-strategy'
  | 'change-configuration'
  | 'suspend-member'
  | 'resume-member'
  | 'retire-member'
  | 'replace-member'
  | 'lower-soft-limit'
  | 'request-expansion';

export type RevisionOutcome = 'applied' | 'awaiting-approval' | 'rejected' | 'withdrawn';

/**
 * A validated change to the Room. The Conductor never edits persisted records
 * directly — it proposes, the coordinator validates against the envelope, and
 * the result is recorded here with its authority decision (§13.2).
 */
export interface RoomRevision {
  id: string;
  roomId: string;
  kind: RoomRevisionKind;
  /** Member id of the actor, or null when the user made the change. */
  actorMemberId: string | null;
  reason: string;
  /** Human-readable, computed — never the actor's own claim about the change. */
  summary: string;
  previousValue: unknown;
  newValue: unknown;
  outcome: RevisionOutcome;
  /** Set when the revision needed the user because it widened authority. */
  requiresApproval: boolean;
  approvalId: string | null;
  /** Why it was rejected, when it was. */
  rejectionReason: string | null;
  commandId: string;
  createdAt: string;
  resolvedAt: string | null;
}

/** What a pending approval would change. Computed, not member-authored. */
export interface RoomApprovalRequest {
  id: string;
  roomId: string;
  requestedByMemberId: string;
  /** Short, user-facing. */
  title: string;
  reason: string;
  /** The computed consequence line, from the same mapping as the access tiles. */
  consequence: string;
  /** What the request touches — a workspace, an external service, a limit. */
  affects: string;
  estimatedCostUsd: number | null;
  kind: 'authority-expansion' | 'limit-change' | 'external-write' | 'shared-tree-write';
  permissionsAfter: MemberPermissionLevel | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Append-only timeline for the UI and diagnostics. State is NEVER rebuilt by
 * replaying these (FR-030) — they explain transitions, they do not define them.
 */
export interface RoomTimelineEvent {
  id: string;
  roomId: string;
  at: string;
  kind:
    | 'room-status'
    | 'member-status'
    | 'message'
    | 'revision'
    | 'approval'
    | 'artifact'
    | 'work'
    | 'claim'
    | 'session'
    | 'compaction'
    | 'limit'
    | 'delivery'
    | 'recovery';
  memberId: string | null;
  summary: string;
  /** Small, redacted. Never a transcript, prompt or credential. */
  details: Record<string, string | number | boolean> | null;
}
