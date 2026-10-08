/**
 * What a revision means for a Room that already holds a host grant.
 *
 * On a running Room a change to a member's model, thinking level, tools or
 * skills, and a member joining or replacing another, are all amendments of the
 * Room's existing grant. This decides which of them may go ahead; the host,
 * not the Room record, decides whether any of it needs the user.
 *
 * Permissions and where a member works still cannot change while the Room
 * runs: both reshape what the member can reach, and neither is an amendment
 * this Room can ask for yet.
 */

import type { RoomChangeValue } from '../../shared/room-amendment-types';
import type { ConfigurationPatch, RoomRevisionProposal } from '../../shared/room-revision-types';
import type { RoomRevision } from '../../shared/room-message-types';
import type { Room, RoomMember } from '../../shared/room-types';
import { toMemberRecord } from './member-grant';
import { planRoomRevision, type RevisionPlan } from './room-revision-plan';

/** A Room record, which also carries the revisions saved on it. */
type RoomWithRevisions = Room & { revisions?: RoomRevision[] };

const refuse = (reason: string): RevisionPlan => ({ verdict: 'refuse', reason });

/** True while a member's setup is mid-change or waiting on someone. */
export function hasOpenChange(member: RoomMember): boolean {
  const state = member.configurationChange?.state;
  return state === 'pending' || state === 'held';
}

const sameSet = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((entry) => right.includes(entry));

/** The fields a configuration patch really changes, each with the value it moves to. */
export function describeConfigurationChange(member: RoomMember, patch: ConfigurationPatch): RoomChangeValue[] {
  const current = member.configuration;
  const changes: RoomChangeValue[] = [];
  if (patch.model !== undefined && patch.model !== current.model) changes.push({ field: 'model', value: patch.model });
  if (patch.thinking !== undefined && patch.thinking !== current.thinking) {
    changes.push({ field: 'thinking', value: patch.thinking });
  }
  if (patch.tools !== undefined && !sameSet(patch.tools, current.tools)) {
    changes.push({ field: 'tools', value: [...patch.tools] });
  }
  if (patch.skills !== undefined && !sameSet(patch.skills, current.skills)) {
    changes.push({ field: 'skills', value: [...patch.skills] });
  }
  return changes;
}

function planConfiguration(room: Room, memberId: string, patch: ConfigurationPatch): RevisionPlan {
  const member = room.members.find((candidate) => candidate.id === memberId);
  if (!member) return refuse(`There is no member ${memberId} in this Room.`);
  if (member.status === 'retired') return refuse(`${member.displayName} has retired, so its setup cannot change.`);
  if (hasOpenChange(member)) {
    return refuse(`${member.displayName} already has a setup change waiting. Settle that one first.`);
  }
  const current = member.configuration;
  if (
    (patch.permissions !== undefined && patch.permissions !== current.permissions)
    || (patch.needsWorktree !== undefined && patch.needsWorktree !== current.needsWorktree)
  ) {
    return refuse(`${member.displayName}'s permissions and where it works cannot change while the Room runs.`);
  }
  const changes = describeConfigurationChange(member, patch);
  if (changes.length === 0) return refuse(`${member.displayName}'s setup is already what you asked for.`);
  const names = changes.map((change) => change.field).join(', ');
  return { verdict: 'amend', summary: `${member.displayName}'s ${names} will change.` };
}

/**
 * The Room as it will be once the roster changes already waiting have landed, so
 * a second addition cannot take the place or the key a pending one already has.
 */
function withPendingRoster(room: RoomWithRevisions): Room {
  let members = room.members;
  for (const revision of room.revisions ?? []) {
    const proposal = revision.proposal;
    const state = revision.amendment?.state;
    if (!proposal || (state !== 'pending' && state !== 'held')) continue;
    if (proposal.kind !== 'add-member' && proposal.kind !== 'replace-member') continue;
    const joining = proposal.kind === 'add-member' ? proposal.member : proposal.replacement;
    if (proposal.kind === 'replace-member') {
      members = members.map((member) => member.id === proposal.memberId ? { ...member, status: 'retired' as const } : member);
    }
    if (!members.some((member) => member.id === joining.key)) {
      members = [...members, toMemberRecord(joining, room.definition.id, revision.createdAt, '')];
    }
  }
  return { ...room, members };
}

/**
 * Joining and replacing keep every rule the draft path has (safe key, one
 * Conductor, roster budget, a handover). Only the "the grant cannot grow"
 * refusal goes: the host now decides what the grant can hold.
 */
function planRoster(room: RoomWithRevisions, proposal: RoomRevisionProposal, actorMemberId: string): RevisionPlan {
  if (proposal.kind !== 'add-member' && proposal.kind !== 'replace-member') return refuse('Not a roster change.');
  const joining = proposal.kind === 'add-member' ? proposal.member : proposal.replacement;
  // The base rules are re-used on a copy with no grant, so none of them is written twice.
  const base = planRoomRevision({ ...withPendingRoster(room), definition: { ...room.definition, grantId: null } }, proposal, actorMemberId);
  if (base.verdict === 'refuse' || base.verdict === 'amend') return base;
  if (joining.needsWorktree) {
    return refuse(`${joining.displayName} needs its own checkout, which a running Room cannot create yet.`);
  }
  if (proposal.kind === 'replace-member') {
    const leaving = room.members.find((member) => member.id === proposal.memberId);
    if (leaving && hasOpenChange(leaving)) {
      return refuse(`${leaving.displayName} already has a setup change waiting. Settle that one first.`);
    }
    return { verdict: 'amend', summary: `${joining.displayName} replaced ${leaving?.displayName ?? proposal.memberId}.` };
  }
  return { verdict: 'amend', summary: `${joining.displayName} joined the Room as ${joining.role}.` };
}

/** `planRoomRevision`, except that a Room holding a grant routes setup and roster changes through it. */
export function planAmendableRevision(
  room: RoomWithRevisions,
  proposal: RoomRevisionProposal,
  actorMemberId: string,
): RevisionPlan {
  if (!room.definition.grantId) return planRoomRevision(room, proposal, actorMemberId);
  switch (proposal.kind) {
    case 'change-configuration':
      return planConfiguration(room, proposal.memberId, proposal.configuration);
    case 'add-member':
    case 'replace-member':
      return planRoster(room, proposal, actorMemberId);
    default:
      return planRoomRevision(room, proposal, actorMemberId);
  }
}
