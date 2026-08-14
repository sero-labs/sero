/**
 * Applying a Room revision (spec §13, FR-014/015).
 *
 * `room-revision-plan.ts` decides; this applies. The split matters: deciding is
 * pure and exhaustively testable, while applying touches the store, the roster
 * and the mailbox. Mixing them is how "validate, then apply anyway" bugs get
 * written.
 *
 * The rule the whole file exists to enforce: a revision that would WIDEN
 * authority is never applied and then approved. It becomes an approval request
 * and nothing changes until the user answers. Applying first and asking later
 * would mean the user's approval decided whether to keep authority the Room had
 * already been using.
 */

import type { RoomApprovalRequest, RoomRevision, RoomRevisionKind } from '../../shared/room-message-types';
import type { Room, RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import type { RoomStore } from './room-store';
import type { PlannedApproval, RoomRevisionProposal } from './room-revision-plan';
import { planRoomRevision } from './room-revision-plan';

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

const KIND_BY_PROPOSAL: Record<RoomRevisionProposal['kind'], RoomRevisionKind> = {
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
function affectedMembers(proposal: RoomRevisionProposal): string[] {
  return 'memberId' in proposal && typeof proposal.memberId === 'string' ? [proposal.memberId] : [];
}

export async function applyRoomRevision(
  deps: RevisionDeps,
  input: ApplyRevisionInput,
): Promise<RevisionResult> {
  const record = await deps.store.readRoom(input.roomId);
  if (!record) return { outcome: 'refused', reason: `unknown room: ${input.roomId}` };

  const actor = record.members.find((member) => member.id === input.actorMemberId);
  if (!actor) return { outcome: 'refused', reason: 'The requesting member is not in this Room.' };

  // Authority is decided from the ROSTER, not from anything the caller said
  // about itself. A member that claims to be the Conductor in prose is still
  // whatever the roster says it is.
  if (!actor.isConductor) {
    return { outcome: 'refused', reason: 'Only the Conductor can change the Room.' };
  }

  const plan = planRoomRevision(record, input.proposal, input.actorMemberId);
  if (plan.verdict === 'refuse') return { outcome: 'refused', reason: plan.reason };

  const now = deps.host.now();
  const kind = KIND_BY_PROPOSAL[input.proposal.kind];

  if (plan.verdict === 'approval') {
    const approval = buildApproval(deps, input, plan.approval, now);
    const revision = buildRevision(deps, input, kind, plan.summary, now, {
      outcome: 'awaiting-approval',
      requiresApproval: true,
      approvalId: approval.id,
    });

    // Recorded, NOT applied. The Room keeps running under the authority it
    // already had while the user decides.
    const wrote = await deps.store.applyCommand(input.roomId, input.commandId, (current) => ({
      ...current,
      revisions: [...current.revisions, revision],
      approvals: [...current.approvals, approval],
    }));
    if (!wrote) return { outcome: 'duplicate' };

    await deps.store.appendTimeline(input.roomId, [{
      id: deps.host.newId('tl'),
      roomId: input.roomId,
      at: now,
      kind: 'approval',
      memberId: input.actorMemberId,
      summary: approval.title,
      details: { kind: approval.kind },
    }]);

    return { outcome: 'awaiting-approval', revision, approval };
  }

  const revision = buildRevision(deps, input, kind, plan.summary, now, {
    outcome: 'applied',
    requiresApproval: false,
    approvalId: null,
  });

  const wrote = await deps.store.applyCommand(input.roomId, input.commandId, (current) => {
    // `mutate` works on the Room half; the record's own fields (revisions,
    // cursors, approvals) are carried across here rather than handed to it.
    const mutated = { ...current, ...deps.mutate(current, input.proposal, now) };
    return {
      ...mutated,
      revisions: [...mutated.revisions, revision],
      runtime: {
        ...mutated.runtime,
        usage: {
          ...mutated.runtime.usage,
          rosterRevisions: mutated.runtime.usage.rosterRevisions + (isRosterChange(kind) ? 1 : 0),
          memberReplacements:
            mutated.runtime.usage.memberReplacements + (kind === 'replace-member' ? 1 : 0),
        },
        // A revision IS structural progress — it is the Conductor adapting the
        // team, which is exactly what no-progress detection should not punish.
        lastProgressAt: now,
      },
    };
  });
  if (!wrote) return { outcome: 'duplicate' };

  await deps.store.appendTimeline(input.roomId, [{
    id: deps.host.newId('tl'),
    roomId: input.roomId,
    at: now,
    kind: 'revision',
    memberId: input.actorMemberId,
    summary: plan.summary,
    details: { kind },
  }]);

  const affected = affectedMembers(input.proposal);
  if (affected.length > 0) await deps.notify?.(input.roomId, affected, plan.summary);

  return { outcome: 'applied', revision };
}

function isRosterChange(kind: RoomRevisionKind): boolean {
  return kind === 'add-member' || kind === 'retire-member' || kind === 'replace-member';
}

function buildRevision(
  deps: RevisionDeps,
  input: ApplyRevisionInput,
  kind: RoomRevisionKind,
  summary: string,
  now: string,
  state: Pick<RoomRevision, 'outcome' | 'requiresApproval' | 'approvalId'>,
): RoomRevision {
  return {
    id: deps.host.newId('rev'),
    roomId: input.roomId,
    kind,
    actorMemberId: input.actorMemberId,
    reason: input.reason,
    // Computed by planRoomRevision from the change itself — never the actor's
    // own account of what it is doing.
    summary,
    previousValue: null,
    newValue: null,
    outcome: state.outcome,
    requiresApproval: state.requiresApproval,
    approvalId: state.approvalId,
    rejectionReason: null,
    commandId: input.commandId,
    createdAt: now,
    resolvedAt: state.outcome === 'applied' ? now : null,
  };
}

function buildApproval(
  deps: RevisionDeps,
  input: ApplyRevisionInput,
  planned: PlannedApproval,
  now: string,
): RoomApprovalRequest {
  return {
    id: deps.host.newId('appr'),
    roomId: input.roomId,
    requestedByMemberId: input.actorMemberId,
    title: planned.title,
    reason: input.reason,
    // From the same access mapping as the proposal tiles, so what the user is
    // told here and what they were told at Start cannot disagree.
    consequence: planned.consequence,
    affects: planned.affects,
    estimatedCostUsd: planned.estimatedCostUsd,
    kind: planned.kind,
    permissionsAfter: planned.permissionsAfter,
    status: 'pending',
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Resolves a pending approval. The USER is the only caller: a member answering
 * its own request, or the Conductor answering for the user, would make the
 * approval a formality.
 */
export async function resolveRoomApproval(
  deps: RevisionDeps,
  roomId: string,
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<{ ok: boolean; reason?: string }> {
  const record = await deps.store.readRoom(roomId);
  const approval = record?.approvals?.find((entry) => entry.id === approvalId);
  if (!record || !approval) return { ok: false, reason: 'unknown approval' };
  if (approval.status !== 'pending') return { ok: false, reason: 'already resolved' };

  const now = deps.host.now();
  await deps.store.updateRoom(roomId, (current) => ({
    ...current,
    approvals: current.approvals.map((entry) =>
      entry.id === approvalId ? { ...entry, status: decision, resolvedAt: now } : entry),
    revisions: current.revisions.map((revision) =>
      revision.approvalId === approvalId
        ? {
            ...revision,
            outcome: decision === 'approved' ? 'applied' : 'rejected',
            rejectionReason: decision === 'rejected' ? 'The user did not approve it.' : null,
            resolvedAt: now,
          }
        : revision),
  }));

  await deps.store.appendTimeline(roomId, [{
    id: deps.host.newId('tl'),
    roomId,
    at: now,
    kind: 'approval',
    memberId: approval.requestedByMemberId,
    summary: `${approval.title} — ${decision}`,
    details: { decision },
  }]);

  return { ok: true };
}

/** Members that must be told about a change, for the caller's notify hook. */
export function membersToNotify(room: Room, proposal: RoomRevisionProposal): RoomMember[] {
  const ids = new Set(affectedMembers(proposal));
  return room.members.filter((member) => ids.has(member.id));
}
