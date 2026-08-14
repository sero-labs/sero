/**
 * How an ACCEPTED revision changes the Room record (spec §13, FR-014/015).
 *
 * `room-revision-plan.ts` decides, `room-revisions.ts` records, and this applies.
 * It is the `mutate` hook `applyRoomRevision` calls, and it is reached ONLY for
 * a proposal the plan returned `apply` for — so every rule the plan enforces
 * (grant-bound changes, safe turn boundaries, self-replacement, envelope fit) is
 * already true here and is deliberately not re-checked.
 *
 * The rule the file keeps: a mandate change is INSTRUCTIONS ONLY (FR-041).
 * Nothing here may reach `configuration` from a mandate patch, because that is
 * the field the host grant is built from.
 */

import type { Room, RoomMember } from '../../shared/room-types';
import { toMemberRecord } from './member-grant';
import type { RoomRevisionProposal } from './room-revision-plan';

/** Handover text a replacement starts on. Long enough to matter, bounded on purpose. */
const MAX_HANDOVER_CHARS = 2000;

function mapMember(room: Room, memberId: string, apply: (member: RoomMember) => RoomMember): Room {
  return { ...room, members: room.members.map((member) => (member.id === memberId ? apply(member) : member)) };
}

/** A mandate write always bumps its revision, so a live session can see it is stale. */
function withMandate(member: RoomMember, patch: Partial<RoomMember['mandate']>, now: string): RoomMember {
  return {
    ...member,
    mandate: { ...member.mandate, ...patch, revision: member.mandate.revision + 1, updatedAt: now },
  };
}

/**
 * The workspace a new member's session belongs to, taken from the roster rather
 * than from the host: every member of a Room shares one workspace, and reading
 * it from a colleague keeps this function pure.
 */
function workspaceIdOf(room: Room): string {
  return room.members[0]?.session.workspaceId ?? '';
}

export function applyRevisionToRoom(room: Room, proposal: RoomRevisionProposal, now: string): Room {
  switch (proposal.kind) {
    case 'add-member': {
      // Only reachable while the Room is still a draft — a running Room's grant
      // fixes its subject set, and the plan refuses there. `offline` because a
      // drafted member holds no execution slot until the Room starts.
      const member = toMemberRecord(proposal.member, room.definition.id, now, workspaceIdOf(room));
      return {
        ...room,
        members: [...room.members, { ...member, status: 'offline', statusDetail: 'Waiting for the Room to start.' }],
      };
    }

    case 'update-mandate':
      return mapMember(room, proposal.memberId, (member) =>
        withMandate(
          member,
          {
            responsibilities: proposal.mandate.responsibilities ?? member.mandate.responsibilities,
            currentTask: proposal.mandate.currentTask ?? member.mandate.currentTask,
            priorities: proposal.mandate.priorities ?? member.mandate.priorities,
            workingInstructions: proposal.mandate.workingInstructions ?? member.mandate.workingInstructions,
          },
          now,
        ),
      );

    case 'assign-work':
      return mapMember(room, proposal.memberId, (member) =>
        withMandate(
          member,
          { currentTask: proposal.task.trim(), priorities: proposal.priorities ?? member.mandate.priorities },
          now,
        ),
      );

    case 'change-strategy':
      // How the Room works together is part of every member's SESSION prompt, so
      // a change here reaches a member when its session is next opened rather
      // than mid-turn. That is the safe boundary §13.2 asks for.
      return {
        ...room,
        definition: {
          ...room.definition,
          blueprint: { ...room.definition.blueprint, roomInstructions: proposal.strategy.trim() },
          updatedAt: now,
        },
      };

    case 'change-configuration':
      // The plan permits removals only, so this narrows a member's capability
      // list and never widens it. The grant still holds the wider set; the next
      // session request simply asks for less.
      return mapMember(room, proposal.memberId, (member) => ({
        ...member,
        configuration: {
          ...member.configuration,
          tools: proposal.configuration.tools ?? member.configuration.tools,
          skills: proposal.configuration.skills ?? member.configuration.skills,
          revision: member.configuration.revision + 1,
        },
      }));

    case 'suspend-member':
      return mapMember(room, proposal.memberId, (member) => ({
        ...member,
        status: 'suspended',
        statusDetail: 'Suspended by the Conductor.',
      }));

    case 'resume-member':
      return mapMember(room, proposal.memberId, (member) => ({
        ...member,
        status: 'idle',
        statusDetail: 'Working again.',
      }));

    case 'retire-member':
      return retire(room, proposal.memberId, null, now, 'Retired by the Conductor.');

    case 'replace-member': {
      const replacement = toMemberRecord(proposal.replacement, room.definition.id, now, workspaceIdOf(room));
      const retired = retire(room, proposal.memberId, replacement.id, now, 'Replaced.');
      return {
        ...retired,
        members: [
          ...retired.members,
          {
            ...replacement,
            status: 'idle',
            statusDetail: 'Taking over.',
            // The handover is the replacement's first task, so the work the
            // retired member left is carried by a record rather than by whatever
            // the Conductor remembers to say later (§13.3).
            mandate: { ...replacement.mandate, currentTask: proposal.handover.trim().slice(0, MAX_HANDOVER_CHARS) },
          },
        ],
      };
    }

    case 'lower-soft-limit':
      // The live ceiling moves; the BLUEPRINT's envelope does not. The blueprint
      // records what the user approved, and lowering a limit must never be able
      // to rewrite that record.
      return {
        ...room,
        definition: {
          ...room.definition,
          envelope: { ...room.definition.envelope, [proposal.field]: proposal.value },
          updatedAt: now,
        },
      };

    case 'request-expansion':
      // Unreachable: an expansion always needs the user, so the plan returns
      // `approval` and `mutate` is never called. Changing nothing is the only
      // safe answer if that ever stops being true.
      return room;
  }
}

function retire(
  room: Room,
  memberId: string,
  replacedByMemberId: string | null,
  now: string,
  detail: string,
): Room {
  return mapMember(room, memberId, (member) => ({
    ...member,
    status: 'retired',
    statusDetail: detail,
    // A retired member releases its wait, or the Room would keep counting it as
    // blocked on an answer nobody will ever give it.
    waitingOnQuestionId: null,
    replacedByMemberId,
    retiredAt: now,
  }));
}
