/**
 * The RECORDS a Room revision leaves behind (spec §13, FR-014/015).
 *
 * `room-revision-plan.ts` decides, `room-revision-mutate.ts` changes the Room,
 * and this writes down what happened. Split out so `room-revisions.ts` stays
 * about the one thing that matters there: deciding and applying against the
 * same record, inside one serialized write.
 *
 * Everything here is pure, so what a revision records is testable without a
 * store.
 */

import type { RevisionOutcome, RoomApprovalRequest, RoomRevision, RoomRevisionKind } from '../../shared/room-message-types';
import type { RoomRevisionProposal } from '../../shared/room-revision-types';
import type { Room } from '../../shared/room-types';
import type { PlannedApproval } from './room-revision-plan';
import { isRosterRevision } from './room-revision-plan';
import type { RoomRecord } from './room-state';

export const KIND_BY_PROPOSAL: Record<RoomRevisionProposal['kind'], RoomRevisionKind> = {
  'add-member': 'add-member',
  'update-mandate': 'update-mandate',
  'assign-work': 'assign-work',
  'change-strategy': 'change-strategy',
  'change-configuration': 'change-configuration',
  'suspend-member': 'suspend-member',
  'resume-member': 'resume-member',
  'retire-member': 'retire-member',
  'replace-member': 'replace-member',
  'lower-soft-limit': 'lower-soft-limit',
  'request-expansion': 'request-expansion',
};

/** Members the change is about, so only they are told. */
export function affectedMembers(proposal: RoomRevisionProposal): string[] {
  return 'memberId' in proposal && typeof proposal.memberId === 'string' ? [proposal.memberId] : [];
}

export interface RevisionDraft {
  roomId: string;
  proposal: RoomRevisionProposal;
  actorMemberId: string;
  reason: string;
  summary: string;
  commandId: string;
  id: string;
  now: string;
}

export function buildRevision(
  draft: RevisionDraft,
  state: Pick<RoomRevision, 'outcome' | 'requiresApproval' | 'approvalId'>,
): RoomRevision {
  return {
    id: draft.id,
    roomId: draft.roomId,
    kind: KIND_BY_PROPOSAL[draft.proposal.kind],
    actorMemberId: draft.actorMemberId,
    reason: draft.reason,
    // Computed by planRoomRevision from the change itself — never the actor's
    // own account of what it is doing.
    summary: draft.summary,
    previousValue: null,
    newValue: null,
    // Kept so an approval the user answers minutes later still has the change
    // to re-plan and apply. Without it, "approved" could only ever be a label.
    proposal: draft.proposal,
    outcome: state.outcome,
    requiresApproval: state.requiresApproval,
    approvalId: state.approvalId,
    rejectionReason: null,
    commandId: draft.commandId,
    createdAt: draft.now,
    resolvedAt: state.outcome === 'applied' ? draft.now : null,
  };
}

export function buildApproval(
  draft: RevisionDraft,
  planned: PlannedApproval,
  id: string,
): RoomApprovalRequest {
  return {
    id,
    roomId: draft.roomId,
    requestedByMemberId: draft.actorMemberId,
    title: planned.title,
    reason: draft.reason,
    // From the same access mapping as the proposal tiles, so what the user is
    // told here and what they were told at Start cannot disagree.
    consequence: planned.consequence,
    affects: planned.affects,
    estimatedCostUsd: planned.estimatedCostUsd,
    kind: planned.kind,
    permissionsAfter: planned.permissionsAfter,
    status: 'pending',
    // A revision approval changes the Room; it never sends anything out of it,
    // so there is no payload to bind and nothing for a delivery to spend.
    delivery: null,
    consumedAt: null,
    createdAt: draft.now,
    resolvedAt: null,
  };
}

/** Upserts a revision: appended when it is new, replaced when it is being resolved. */
function withRevision(record: RoomRecord, revision: RoomRevision): RoomRevision[] {
  return record.revisions.some((entry) => entry.id === revision.id)
    ? record.revisions.map((entry) => (entry.id === revision.id ? revision : entry))
    : [...record.revisions, revision];
}

/**
 * The Room after an accepted revision: the mutated half, the revision recorded
 * as applied, and the budgets it spent. Used by BOTH the direct path and the
 * approval path, so a change the user approved counts against exactly the same
 * limits as one the Conductor made on its own authority.
 */
export function withRevisionApplied(
  record: RoomRecord,
  mutated: Room,
  revision: RoomRevision,
  now: string,
): RoomRecord {
  const applied: RoomRevision = { ...revision, outcome: 'applied', rejectionReason: null, resolvedAt: now };
  const next = { ...record, ...mutated };
  return {
    ...next,
    revisions: withRevision(next, applied),
    runtime: {
      ...next.runtime,
      usage: {
        ...next.runtime.usage,
        rosterRevisions: next.runtime.usage.rosterRevisions + (isRosterRevision(applied.kind) ? 1 : 0),
        memberReplacements: next.runtime.usage.memberReplacements + (applied.kind === 'replace-member' ? 1 : 0),
      },
      // A revision IS structural progress — it is the Conductor adapting the
      // team, which is exactly what no-progress detection should not punish.
      lastProgressAt: now,
    },
  };
}

/** The Room after a revision that will never be applied. Nothing else moves. */
export function withRevisionClosed(
  record: RoomRecord,
  revision: RoomRevision,
  outcome: Exclude<RevisionOutcome, 'applied' | 'awaiting-approval'>,
  reason: string,
  now: string,
): RoomRecord {
  const closed: RoomRevision = { ...revision, outcome, rejectionReason: reason, resolvedAt: now };
  return { ...record, revisions: withRevision(record, closed) };
}

/** Marks an approval answered. The answer is the user's, so nothing derives it. */
export function withApprovalResolved(
  record: RoomRecord,
  approvalId: string,
  status: 'approved' | 'rejected',
  now: string,
): RoomRecord {
  return {
    ...record,
    approvals: record.approvals.map((entry) =>
      entry.id === approvalId ? { ...entry, status, resolvedAt: now } : entry),
  };
}
