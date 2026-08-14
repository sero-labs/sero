/**
 * What a Room command answers with.
 *
 * Plain prose, not JSON: the reader is a model taking its next turn, and a
 * sentence it can act on beats a serialised object it has to decode. The same
 * reason `renderMemberBrief` is prose.
 *
 * Nothing here reads a transcript or a message body it was not given, so a
 * command's answer can never smuggle another member's context into a reply
 * (NFR-002).
 */

import type { PathClaim, RoomArtifact, WorkItem } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import type { RoomRecord } from './room-state';
import type { CommitCollection } from './room-workspace';

/** Lists are for reading, not for paging. A member that needs more asks. */
const MAX_LISTED = 20;

function nameOf(record: RoomRecord, memberId: string | null): string {
  if (!memberId) return 'the Room';
  return record.members.find((member) => member.id === memberId)?.displayName ?? memberId;
}

function memberLine(record: RoomRecord, member: RoomMember, caller: RoomMember): string {
  const marks = [member.isConductor ? 'Conductor' : member.mandate.role];
  if (member.id === caller.id) marks.push('you');
  const task = member.mandate.currentTask.trim();
  const claims = record.claims.filter((claim) => claim.status === 'active' && claim.memberId === member.id);
  const parts = [`- ${member.displayName} [${member.id}] (${marks.join(', ')}) — ${member.status}: ${member.statusDetail}`];
  if (task) parts.push(`  Task: ${task}`);
  if (claims.length > 0) parts.push(`  Holding: ${claims.map((claim) => claim.pattern).join(', ')}`);
  return parts.join('\n');
}

/**
 * The roster as one member sees it. Ids are shown because every other command
 * addresses a member by id — a roster that only gave display names would leave
 * a member unable to send anyone a message.
 */
export function renderRoster(record: RoomRecord, caller: RoomMember): string {
  const live = record.members.filter((member) => member.status !== 'retired');
  const retired = record.members.filter((member) => member.status === 'retired');
  const lines = [
    `Room "${record.definition.title}" — ${record.runtime.status}.`,
    '',
    'Members:',
    ...live.map((member) => memberLine(record, member, caller)),
  ];
  if (retired.length > 0) {
    lines.push('', `Retired: ${retired.map((member) => member.displayName).join(', ')}.`);
  }
  const open = record.work.filter((item) => item.status !== 'done' && item.status !== 'cancelled');
  if (open.length > 0) {
    lines.push('', 'Open work:', ...open.slice(-MAX_LISTED).map((item) => renderWorkLine(record, item)));
  }
  return lines.join('\n');
}

export function renderWorkLine(record: RoomRecord, item: WorkItem): string {
  const blocked = item.dependsOnWorkIds.length > 0 ? ` — waits on ${item.dependsOnWorkIds.join(', ')}` : '';
  return `- ${item.title} [${item.id}] — ${nameOf(record, item.ownerMemberId)} (${item.status})${blocked}`;
}

/**
 * One member's mandate. The mandate is the mutable half of a member, so its
 * revision number is shown: a member that read a mandate two revisions ago is
 * holding stale instructions and this is how it can tell.
 */
export function renderMandate(member: RoomMember): string {
  const lines = [
    `${member.displayName} — ${member.mandate.role} (mandate revision ${member.mandate.revision}).`,
    '',
    `Responsibilities: ${member.mandate.responsibilities}`,
  ];
  if (member.mandate.currentTask.trim()) lines.push(`Current task: ${member.mandate.currentTask}`);
  if (member.mandate.priorities.length > 0) {
    lines.push('Priorities:', ...member.mandate.priorities.map((priority) => `- ${priority}`));
  }
  if (member.mandate.workingInstructions.trim()) {
    lines.push('', 'How to work:', member.mandate.workingInstructions);
  }
  return lines.join('\n');
}

export function renderClaims(record: RoomRecord, claims: PathClaim[]): string {
  if (claims.length === 0) return 'Nothing was claimed.';
  return `Claimed ${claims.length} path(s): ${claims.map((claim) => claim.pattern).join(', ')}.`
    + ` They are advisory — ${nameOf(record, claims[0].memberId)} still has to agree changes with whoever edits nearby.`;
}

export function renderArtifact(artifact: RoomArtifact): string {
  return `Published ${artifact.kind} "${artifact.title}" [${artifact.id}] at ${artifact.ref}.`;
}

/**
 * What the Conductor gets back from collecting commits: one line per branch,
 * then the files more than one member changed. The conflicts are listed with
 * their owners because integrating them is the Conductor's next decision, and
 * a count alone would send it back to Git to find out who.
 */
export function renderCollection(collection: CommitCollection): string {
  const lines = [collection.summary];
  if (collection.branches.length > 0) {
    lines.push(
      '',
      'Branches:',
      ...collection.branches.map((branch) => {
        const state = branch.error ?? `${branch.changedFiles.length} changed file(s)`;
        return `- ${branch.displayName} [${branch.memberId}] — ${branch.branch ?? 'no branch'}: ${state}`;
      }),
    );
  }
  if (collection.conflicts.length > 0) {
    lines.push(
      '',
      'Changed by more than one member:',
      ...collection.conflicts
        .slice(0, MAX_LISTED)
        .map((conflict) => `- ${conflict.path} — ${conflict.memberIds.join(', ')}`),
    );
  }
  return lines.join('\n');
}
