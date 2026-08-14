/**
 * Applying a Room revision (spec §13, FR-014/015).
 *
 * `room-revision-plan.ts` decides; this applies. The split matters: deciding is
 * pure and exhaustively testable, while applying touches the store, the roster
 * and the mailbox. Mixing them is how "validate, then apply anyway" bugs get
 * written.
 *
 * Two rules the whole file exists to enforce:
 *
 *  - **One record decides and is written.** Planning, the authority check and
 *    the mutation all run inside a single `store.transact`, so a revision can
 *    never be planned against a Room that another revision has already moved.
 *    Deciding on a snapshot and writing to a later record is how a lowered
 *    limit gets silently restored by a change that predates the lowering.
 *
 *  - **A revision that would WIDEN authority is never applied and then
 *    approved.** It becomes an approval request and nothing changes until the
 *    user answers. Applying first and asking later would mean the user's
 *    approval decided whether to keep authority the Room had already been
 *    using.
 */

import type { RoomApprovalRequest, RoomRevision } from '../../shared/room-message-types';
import type { RoomRevisionProposal } from '../../shared/room-revision-types';
import type { Room, RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import type { RoomStore, RoomTransaction } from './room-store';
import { planRoomRevision } from './room-revision-plan';
import {
  affectedMembers,
  buildApproval,
  buildRevision,
  withApprovalResolved,
  withRevisionApplied,
  withRevisionClosed,
  type RevisionDraft,
} from './room-revision-record';
import type { RoomRecord } from './room-state';

export type RevisionResult =
  | { outcome: 'applied'; revision: RoomRevision }
  | { outcome: 'awaiting-approval'; revision: RoomRevision; approval: RoomApprovalRequest }
  | { outcome: 'refused'; reason: string }
  /** A duplicate commandId. The first application stands; this one is a no-op. */
  | { outcome: 'duplicate' };

export interface ApplyRevisionInput {
  roomId: string;
  proposal: RoomRevisionProposal;
  /** Member making the request. Authority is checked against THIS, never prose. */
  actorMemberId: string;
  reason: string;
  commandId: string;
}

export interface RevisionDeps {
  host: OrchestratorHost;
  store: RoomStore;
  /** Applies the accepted change to the record. Injected so this file stays about authority. */
  mutate(room: Room, proposal: RoomRevisionProposal, now: string): Room;
  /** Tells affected members what changed, through the durable mailbox. */
  notify?(roomId: string, memberIds: string[], summary: string): Promise<void>;
}

const refused = (reason: string): RoomTransaction<RevisionResult> => ({
  record: null,
  result: { outcome: 'refused', reason },
});

/**
 * The whole decision, against ONE record. Pure apart from the id and clock
 * helpers on `deps.host`, and never called outside the store's serialized turn.
 */
function decideRevision(
  deps: RevisionDeps,
  input: ApplyRevisionInput,
  record: RoomRecord,
  now: string,
): RoomTransaction<RevisionResult> {
  const actor = record.members.find((member) => member.id === input.actorMemberId);
  if (!actor) return refused('The requesting member is not in this Room.');

  // Authority is decided from the ROSTER, not from anything the caller said
  // about itself. A member that claims to be the Conductor in prose is still
  // whatever the roster says it is.
  if (!actor.isConductor) return refused('Only the Conductor can change the Room.');

  const plan = planRoomRevision(record, input.proposal, input.actorMemberId);
  if (plan.verdict === 'refuse') return refused(plan.reason);

  const draft: RevisionDraft = {
    roomId: input.roomId,
    proposal: input.proposal,
    actorMemberId: input.actorMemberId,
    reason: input.reason,
    summary: plan.summary,
    commandId: input.commandId,
    id: deps.host.newId('rev'),
    now,
  };

  if (plan.verdict === 'approval') {
    const approval = buildApproval(draft, plan.approval, deps.host.newId('appr'));
    const revision = buildRevision(draft, {
      outcome: 'awaiting-approval',
      requiresApproval: true,
      approvalId: approval.id,
    });
    // Recorded, NOT applied. The Room keeps running under the authority it
    // already had while the user decides.
    return {
      record: {
        ...record,
        revisions: [...record.revisions, revision],
        approvals: [...record.approvals, approval],
      },
      result: { outcome: 'awaiting-approval', revision, approval },
    };
  }

  const revision = buildRevision(draft, { outcome: 'applied', requiresApproval: false, approvalId: null });
  // `mutate` works on the Room half; the record's own fields (revisions,
  // cursors, approvals) are carried across by withRevisionApplied.
  const mutated = deps.mutate(record, input.proposal, now);
  return {
    record: withRevisionApplied(record, mutated, revision, now),
    result: { outcome: 'applied', revision },
  };
}

export async function applyRoomRevision(
  deps: RevisionDeps,
  input: ApplyRevisionInput,
): Promise<RevisionResult> {
  const record = await deps.store.readRoom(input.roomId);
  if (!record) return { outcome: 'refused', reason: `unknown room: ${input.roomId}` };

  const now = deps.host.now();
  const outcome = await deps.store.transact(input.roomId, input.commandId, (current) =>
    decideRevision(deps, input, current, now));
  if (outcome.duplicate) return { outcome: 'duplicate' };
  const result = outcome.result;

  if (result.outcome === 'awaiting-approval') {
    await deps.store.appendTimeline(input.roomId, [{
      id: deps.host.newId('tl'),
      roomId: input.roomId,
      at: now,
      kind: 'approval',
      memberId: input.actorMemberId,
      summary: result.approval.title,
      details: { kind: result.approval.kind },
    }]);
  }

  if (result.outcome === 'applied') {
    await announce(deps, input.roomId, input.actorMemberId, input.proposal, result.revision, now);
  }
  return result;
}

/** The audit line and the system message an applied revision produces. */
async function announce(
  deps: RevisionDeps,
  roomId: string,
  actorMemberId: string | null,
  proposal: RoomRevisionProposal,
  revision: RoomRevision,
  now: string,
): Promise<void> {
  await deps.store.appendTimeline(roomId, [{
    id: deps.host.newId('tl'),
    roomId,
    at: now,
    kind: 'revision',
    memberId: actorMemberId,
    summary: revision.summary,
    details: { kind: revision.kind },
  }]);
  const affected = affectedMembers(proposal);
  if (affected.length > 0) await deps.notify?.(roomId, affected, revision.summary);
}

/** What resolving an approval did. `ok` is false when nothing was applied. */
export interface ApprovalOutcome {
  ok: boolean;
  reason?: string;
}

interface ApprovalDecision {
  outcome: ApprovalOutcome;
  /** The audit line, so the timeline says what happened rather than what was asked. */
  summary: string;
  /** Who asked for it, for the audit line. */
  requestedByMemberId: string | null;
  /** Set when the change actually landed, so affected members are told. */
  applied: { proposal: RoomRevisionProposal; revision: RoomRevision } | null;
}

function decideApproval(
  deps: RevisionDeps,
  record: RoomRecord,
  approvalId: string,
  decision: 'approved' | 'rejected',
  now: string,
): RoomTransaction<ApprovalDecision> {
  const approval = record.approvals.find((entry) => entry.id === approvalId);
  const nothing = (reason: string): RoomTransaction<ApprovalDecision> => ({
    record: null,
    result: { outcome: { ok: false, reason }, summary: reason, requestedByMemberId: null, applied: null },
  });
  if (!approval) return nothing('unknown approval');
  // Answering twice is the natural retry here, and the second answer is refused
  // rather than re-applied — which is what makes this need no command key.
  if (approval.status !== 'pending') return nothing('already resolved');

  const answered = withApprovalResolved(record, approvalId, decision, now);
  const revision = record.revisions.find((entry) => entry.approvalId === approvalId);

  if (decision === 'rejected') {
    return {
      record: revision
        ? withRevisionClosed(answered, revision, 'rejected', 'The user did not approve it.', now)
        : answered,
      result: { outcome: { ok: true }, summary: `${approval.title} — rejected`, requestedByMemberId: approval.requestedByMemberId, applied: null },
    };
  }

  // A delivery approval carries no revision: approving it records the answer,
  // and the send itself is the delivery path's own step.
  if (!revision) {
    return {
      record: answered,
      result: { outcome: { ok: true }, summary: `${approval.title} — approved`, requestedByMemberId: approval.requestedByMemberId, applied: null },
    };
  }

  const proposal = revision.proposal;
  if (!proposal) {
    const reason = 'The change this request carried was not recorded, so nothing could be applied.';
    return {
      record: withRevisionClosed(answered, revision, 'refused', reason, now),
      result: {
        outcome: { ok: false, reason },
        summary: `${approval.title} — ${reason}`,
        requestedByMemberId: approval.requestedByMemberId,
        applied: null,
      },
    };
  }

  // Re-planned against the Room as it is NOW. The user was deciding while the
  // Room kept running, so an approval must never force through a change that
  // stopped being valid while they read it. A verdict of `approval` here means
  // the change still needs the user — and the user has just said yes.
  const plan = planRoomRevision(answered, proposal, revision.actorMemberId ?? '');
  if (plan.verdict === 'refuse') {
    return {
      record: withRevisionClosed(answered, revision, 'refused', plan.reason, now),
      result: {
        outcome: { ok: false, reason: plan.reason },
        summary: `${approval.title} — approved, but ${plan.reason}`,
        requestedByMemberId: approval.requestedByMemberId,
        applied: null,
      },
    };
  }

  const applied: RoomRevision = { ...revision, summary: plan.summary };
  return {
    record: withRevisionApplied(answered, deps.mutate(answered, proposal, now), applied, now),
    result: {
      outcome: { ok: true },
      summary: `${approval.title} — approved`,
      requestedByMemberId: approval.requestedByMemberId,
      applied: { proposal, revision: { ...applied, outcome: 'applied', resolvedAt: now } },
    },
  };
}

/**
 * Resolves a pending approval. The USER is the only caller: a member answering
 * its own request, or the Conductor answering for the user, would make the
 * approval a formality.
 *
 * Approving APPLIES the change, in the same serialized write that records the
 * answer. Marking a revision "applied" without applying it is the one outcome
 * this function must never produce.
 */
export async function resolveRoomApproval(
  deps: RevisionDeps,
  roomId: string,
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<ApprovalOutcome> {
  const record = await deps.store.readRoom(roomId);
  if (!record) return { ok: false, reason: 'unknown approval' };

  const now = deps.host.now();
  const outcome = await deps.store.transact(roomId, null, (current) =>
    decideApproval(deps, current, approvalId, decision, now));
  if (outcome.duplicate) return { ok: false, reason: 'already resolved' };
  const { outcome: answer, summary, requestedByMemberId, applied } = outcome.result;

  await deps.store.appendTimeline(roomId, [{
    id: deps.host.newId('tl'),
    roomId,
    at: now,
    kind: 'approval',
    memberId: requestedByMemberId,
    summary,
    details: { decision },
  }]);
  if (applied) {
    await announce(deps, roomId, applied.revision.actorMemberId, applied.proposal, applied.revision, now);
  }
  return answer;
}

/** Members that must be told about a change, for the caller's notify hook. */
export function membersToNotify(room: Room, proposal: RoomRevisionProposal): RoomMember[] {
  const ids = new Set(affectedMembers(proposal));
  return room.members.filter((member) => ids.has(member.id));
}
