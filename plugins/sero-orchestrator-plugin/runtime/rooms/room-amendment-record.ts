/**
 * The records a grant amendment writes (pure; no store, no host calls).
 *
 * `room-amendment.ts` drives the steps; this says what each step leaves on the
 * Room. Every function takes a record and returns the next one, so each step
 * is one serialized write.
 */

import type { PersistentSessionExpansion, PersistentSessionSubjectPolicy } from '@sero-ai/common';
import type {
  MemberConfigurationChange,
  RoomChangeState,
  RoomChangeValue,
  RoomRevisionAmendment,
} from '../../shared/room-amendment-types';
import type { RoomRevision } from '../../shared/room-message-types';
import type { RoomRevisionProposal } from '../../shared/room-revision-types';
import type { RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { memberSubjectPolicy } from './member-grant';
import { describeConfigurationChange } from './room-amend-plan';
import { applyRevisionToRoom } from './room-revision-mutate';
import type { RoomRecord } from './room-state';

const OUTCOME_BY_STATE: Record<RoomChangeState, RoomRevision['outcome']> = {
  pending: 'pending',
  held: 'held',
  applied: 'applied',
  declined: 'declined',
};

/** The grant revision the Room last saw. A Room never amended has revision 0. */
export const grantRevisionOf = (record: RoomRecord): number => record.definition.grantRevision ?? 0;

/**
 * What the host is asked, and which members it touches. The policies come from
 * the Room AS IT WOULD BE after the change, so what the host stores is exactly
 * what the Room then runs. Throws when a policy cannot be built.
 */
export function buildAmendmentIntent(
  host: OrchestratorHost,
  record: RoomRecord,
  proposal: RoomRevisionProposal,
  commandId: string,
  grantId: string,
  now: string,
): RoomRevisionAmendment {
  const target = applyRevisionToRoom(record, proposal, now);
  const subjectIds: string[] = [];
  const retire: string[] = [];
  const memberIds: string[] = [];
  if (proposal.kind === 'change-configuration') {
    subjectIds.push(proposal.memberId);
    memberIds.push(proposal.memberId);
  } else if (proposal.kind === 'add-member') {
    subjectIds.push(proposal.member.key);
  } else if (proposal.kind === 'replace-member') {
    subjectIds.push(proposal.replacement.key);
    retire.push(proposal.memberId);
    memberIds.push(proposal.memberId);
  }
  const subjects: Record<string, PersistentSessionSubjectPolicy> = {};
  for (const id of subjectIds) {
    const member = target.members.find((candidate) => candidate.id === id);
    if (!member) throw new Error(`member ${id} is missing from the changed Room`);
    subjects[id] = memberSubjectPolicy(host, target, member);
  }
  return {
    amendmentId: commandId,
    grantId,
    expectedRevision: grantRevisionOf(record),
    attempted: false,
    phase: 'intent',
    state: 'pending',
    subjects,
    retire,
    memberIds,
    adds: [],
    reason: null,
    grantRevision: null,
  };
}

/** What each affected member shows while the change is pending. */
export function changeValuesFor(
  record: RoomRecord,
  proposal: RoomRevisionProposal,
): { memberId: string; fields: RoomChangeValue[] }[] {
  if (proposal.kind === 'change-configuration') {
    const member = record.members.find((candidate) => candidate.id === proposal.memberId);
    return member ? [{ memberId: member.id, fields: describeConfigurationChange(member, proposal.configuration) }] : [];
  }
  if (proposal.kind === 'replace-member') {
    return [{ memberId: proposal.memberId, fields: [{ field: 'member', value: proposal.replacement.displayName }] }];
  }
  return [];
}

export function pendingChange(revisionId: string, fields: RoomChangeValue[], now: string): MemberConfigurationChange {
  return { revisionId, state: 'pending', fields, adds: [], reason: null, grantRevision: null, workPaused: true, updatedAt: now };
}

/** The revision as recorded when its intent is saved. Nothing is effective yet. */
export function withPendingIntent(
  record: RoomRecord,
  revision: RoomRevision,
  changes: { memberId: string; fields: RoomChangeValue[] }[],
  now: string,
): RoomRecord {
  const byId = new Map(changes.map((change) => [change.memberId, change.fields]));
  return {
    ...record,
    revisions: [...record.revisions, revision],
    members: record.members.map((member) => byId.has(member.id)
      ? { ...member, configurationChange: pendingChange(revision.id, byId.get(member.id) ?? [], now) }
      : member),
  };
}

export function findAmendment(record: RoomRecord, revisionId: string): { revision: RoomRevision; amendment: RoomRevisionAmendment } | null {
  const revision = record.revisions.find((entry) => entry.id === revisionId);
  return revision?.amendment ? { revision, amendment: revision.amendment } : null;
}

/** Members whose change belongs to this revision: the changed member, the replaced one and the newcomer. */
function ownsChange(member: RoomMember, revisionId: string): boolean {
  return member.configurationChange?.revisionId === revisionId;
}

interface StateUpdate {
  state: RoomChangeState;
  reason?: string | null;
  adds?: PersistentSessionExpansion[];
  grantRevision?: number | null;
  /** Whether the affected members' work stays stopped. */
  workPaused: boolean;
  amendment?: Partial<RoomRevisionAmendment>;
  now: string;
}

/** One write that moves the revision and every member that shows it to the same state. */
export function withAmendmentState(record: RoomRecord, revisionId: string, update: StateUpdate): RoomRecord {
  return {
    ...record,
    revisions: record.revisions.map((revision) => {
      if (revision.id !== revisionId || !revision.amendment) return revision;
      return {
        ...revision,
        outcome: OUTCOME_BY_STATE[update.state],
        requiresApproval: revision.requiresApproval || (update.adds?.length ?? 0) > 0,
        rejectionReason: update.state === 'declined' ? update.reason ?? null : null,
        resolvedAt: update.state === 'applied' || update.state === 'declined' ? update.now : null,
        amendment: {
          ...revision.amendment,
          ...update.amendment,
          state: update.state,
          reason: update.reason ?? null,
          adds: update.adds ?? [],
          grantRevision: update.grantRevision ?? revision.amendment.grantRevision,
        },
      };
    }),
    members: record.members.map((member) => ownsChange(member, revisionId) && member.configurationChange
      ? {
          ...member,
          configurationChange: {
            ...member.configurationChange,
            state: update.state,
            reason: update.reason ?? null,
            adds: update.adds ?? [],
            grantRevision: update.grantRevision ?? member.configurationChange.grantRevision,
            workPaused: update.workPaused,
            updatedAt: update.now,
          },
        }
      : member),
  };
}
