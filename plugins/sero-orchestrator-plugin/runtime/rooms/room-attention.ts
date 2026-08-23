/**
 * What one Room puts in the user's inbox (agent-rooms spec §22, FR-026).
 *
 * Three different things need the user, and all three land in the same queue: a
 * member asking for authority it does not have, a member asking the user a
 * plain question, and a Room that stopped and cannot start itself. The home
 * inbox reads this payload and nothing else — anything missing here is a Room
 * waiting for somebody who was never told.
 *
 * Pure, so `toRoomSummary` embeds it in the watched index without a store read.
 */

import type {
  RoomAttention,
  RoomAttentionApproval,
  RoomAttentionPause,
  RoomAttentionRequest,
} from '../../shared/attention-types';
import type { RoomApprovalRequest } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import type { RoomRecord } from './room-state';

/**
 * The pending approvals of ONE Room, as the home inbox renders them. Pure, so
 * `toRoomSummary` can embed it in the watched index without a store read.
 *
 * It lives here rather than in `room-state.ts` because this file owns what an
 * inbox entry says; the summary just carries it.
 */
export function toRoomAttention(record: RoomRecord): RoomAttention | undefined {
  const approvals = record.approvals
    .filter((approval) => approval.status === 'pending')
    .map((approval) => toApprovalEntry(record, approval));
  // A member that asked the user, and a Room that stopped waiting for one, need
  // the user exactly as much as an approval does. Left out of here they appear
  // nowhere the user looks: the home inbox reads this payload and nothing else,
  // so a Room stopped for a question said "you're all caught up".
  const requests = record.members
    .filter((member) => member.status === 'blocked')
    .map((member) => toRequestEntry(member));
  const pause = toPauseEntry(record);
  if (approvals.length === 0 && requests.length === 0 && !pause) return undefined;
  return {
    approvals,
    ...(requests.length > 0 ? { requests } : {}),
    ...(pause ? { pause } : {}),
  };
}

function toRequestEntry(member: RoomMember): RoomAttentionRequest {
  return {
    memberId: member.id,
    memberName: member.displayName,
    // The member wrote this line when it stopped; the prefix is the runtime's.
    question: member.statusDetail.replace(/^Needs the user:\s*/i, '').trim() || 'It did not say what it needs.',
  };
}

/**
 * A Room the user must decide about. A Room the USER stopped is not one of
 * those — it is doing exactly what they asked — so the inbox stays quiet for it.
 */
function toPauseEntry(record: RoomRecord): RoomAttentionPause | undefined {
  const reason = record.runtime.stopReason;
  if (record.runtime.status !== 'paused' || !reason) return undefined;
  if (reason.kind === 'user-paused' || reason.kind === 'user-cancelled') return undefined;
  // An approval is already in the inbox on its own card, with the decision on
  // it. A second card for the same wait would ask the user twice.
  if (reason.kind === 'awaiting-approval') return undefined;
  return { kind: reason.kind, detail: reason.detail, at: reason.at };
}

function toApprovalEntry(record: RoomRecord, approval: RoomApprovalRequest): RoomAttentionApproval {
  const member = record.members.find((candidate) => candidate.id === approval.requestedByMemberId);
  return {
    approvalId: approval.id,
    memberId: approval.requestedByMemberId,
    // A retired member's record can be pruned before the user answers; the id
    // is still true, so the entry names it rather than pretending it is gone.
    memberName: member?.displayName ?? approval.requestedByMemberId,
    title: approval.title,
    reason: approval.reason,
    consequence: approval.consequence,
    affects: approval.affects,
    kind: approval.kind,
    estimatedCostUsd: approval.estimatedCostUsd,
    // The bound payload, so the user answers on the text itself rather than on
    // a member's description of it.
    ...(approval.delivery ? { payload: approval.delivery.content } : {}),
    createdAt: approval.createdAt,
  };
}
