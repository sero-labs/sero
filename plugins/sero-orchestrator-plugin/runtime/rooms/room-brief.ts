/**
 * The authoritative Room brief (spec §15.1, FR-038).
 *
 * The COORDINATOR owns this, not the Conductor. It is computed from current
 * Room records after structural progress, never assembled from the transcript —
 * which is what makes it available without reading anything a member said, and
 * what stops a member's summary of events becoming the record of events.
 *
 * The Conductor may attach a short situation note. It is stored and rendered
 * separately and can never change a computed field.
 *
 * Each member receives only the PROJECTION relevant to its own work. Sending
 * the whole brief to everyone would recreate the context blow-up that member
 * sessions exist to avoid.
 */

import type {
  Room,
  RoomBrief,
  RoomMember,
} from '../../shared/room-types';
import type { RoomArtifact, WorkItem } from '../../shared/room-message-types';

export interface BriefSources {
  work: WorkItem[];
  artifacts: RoomArtifact[];
  /** Decisions recorded as artifacts of kind `decision`, newest last. */
  openQuestions: string[];
}

/** How many of each list the brief keeps. A brief that grows without bound is a transcript. */
const MAX_ITEMS = 8;

/**
 * Rebuilds the brief from current state. Called after structural progress — an
 * accepted revision, completed work, a decision, a changed blocker, a new
 * artifact — never on every message.
 */
export function buildRoomBrief(room: Room, sources: BriefSources, now: string): RoomBrief {
  const activeWork = sources.work
    .filter((item) => item.status !== 'done' && item.status !== 'cancelled')
    .slice(-MAX_ITEMS)
    .map((item) => describeWork(item, room));

  const blockers = room.members
    .filter((member) => member.status === 'blocked' || member.status === 'waiting')
    .map((member) => `${member.displayName}: ${member.statusDetail}`)
    .slice(0, MAX_ITEMS);

  const decisions = sources.artifacts
    .filter((artifact) => artifact.kind === 'decision')
    .slice(-MAX_ITEMS)
    .map((artifact) => artifact.title);

  return {
    objective: room.definition.blueprint.objective,
    successCriteria: room.definition.blueprint.successCriteria,
    decisions,
    activeWork,
    blockers,
    openQuestions: sources.openQuestions.slice(0, MAX_ITEMS),
    artifactRefs: sources.artifacts.slice(-MAX_ITEMS).map((artifact) => artifact.ref),
    updatedAt: now,
    // Preserved across rebuilds: the note is the Conductor's, and recomputing
    // the brief is not a reason to discard what it said.
    conductorNote: room.brief.conductorNote,
    conductorNoteAt: room.brief.conductorNoteAt,
  };
}

function describeWork(item: WorkItem, room: Room): string {
  const owner = room.members.find((member) => member.id === item.ownerMemberId);
  return owner ? `${item.title} — ${owner.displayName} (${item.status})` : `${item.title} (${item.status})`;
}

/**
 * Records a Conductor situation note. Deliberately separate from
 * `buildRoomBrief`: the note is authored, the rest is computed, and keeping the
 * two writes apart makes it impossible for a note to arrive as a brief field.
 */
export function setConductorNote(brief: RoomBrief, note: string, now: string): RoomBrief {
  const trimmed = note.trim().slice(0, 500);
  return {
    ...brief,
    conductorNote: trimmed.length > 0 ? trimmed : null,
    conductorNoteAt: trimmed.length > 0 ? now : null,
  };
}

export interface MemberBriefProjection {
  objective: string;
  successCriteria: string[];
  /** This member's own current mandate. */
  yourMandate: string;
  /** This member's own work, not everyone's. */
  yourWork: string[];
  /** Only the decisions and blockers that touch this member's work. */
  relevantDecisions: string[];
  relevantBlockers: string[];
  artifactRefs: string[];
  conductorNote: string | null;
}

/**
 * The slice of the brief one member sees.
 *
 * The Conductor is the exception: coordinating IS its work, so it receives the
 * whole brief. Every other member gets its own mandate, its own work, and only
 * the decisions and blockers that name it — which keeps a ten-member Room from
 * putting ten members' problems into each member's context.
 */
export function projectBriefForMember(
  brief: RoomBrief,
  member: RoomMember,
  work: WorkItem[],
): MemberBriefProjection {
  const yourWork = work
    .filter((item) => item.ownerMemberId === member.id)
    .map((item) => `${item.title} (${item.status})`);

  const mentionsMember = (text: string): boolean => text.includes(member.displayName);

  return {
    objective: brief.objective,
    successCriteria: brief.successCriteria,
    yourMandate: member.mandate.workingInstructions,
    yourWork,
    relevantDecisions: member.isConductor ? brief.decisions : brief.decisions.filter(mentionsMember),
    relevantBlockers: member.isConductor ? brief.blockers : brief.blockers.filter(mentionsMember),
    artifactRefs: brief.artifactRefs,
    conductorNote: brief.conductorNote,
  };
}

/**
 * Renders a projection as the Room context block prepended to a member's turn.
 * Plain prose rather than JSON: this is read by a model, and a model follows
 * instructions better than it follows a serialised object.
 */
export function renderMemberBrief(projection: MemberBriefProjection): string {
  const lines = [
    '## Room brief',
    `Objective: ${projection.objective}`,
  ];

  if (projection.successCriteria.length > 0) {
    lines.push('', 'Done when:', ...projection.successCriteria.map((criterion) => `- ${criterion}`));
  }
  lines.push('', '## Your mandate', projection.yourMandate);

  if (projection.yourWork.length > 0) {
    lines.push('', '## Your current work', ...projection.yourWork.map((item) => `- ${item}`));
  }
  if (projection.relevantDecisions.length > 0) {
    lines.push('', '## Decisions that affect you', ...projection.relevantDecisions.map((item) => `- ${item}`));
  }
  if (projection.relevantBlockers.length > 0) {
    lines.push('', '## Blocked', ...projection.relevantBlockers.map((item) => `- ${item}`));
  }
  if (projection.conductorNote) {
    // Attributed, so a member treats it as a colleague's view rather than as
    // Room policy — a note can be wrong, the computed fields cannot.
    lines.push('', `## Note from the Conductor`, projection.conductorNote);
  }

  return lines.join('\n');
}
