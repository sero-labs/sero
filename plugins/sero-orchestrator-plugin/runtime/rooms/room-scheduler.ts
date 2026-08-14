/**
 * Room turn scheduling (spec §16).
 *
 * Pure selection: given a Room and the clock, decide who should take a turn
 * next. No I/O, no session handling — the coordinator applies the decision.
 * Keeping it pure is what makes fairness, the Conductor reserve and the
 * wake-priority rules directly testable without a live model.
 *
 * Two rules carry most of the weight:
 *
 *  - **Waiting members hold no slot.** A member that asked a question ended its
 *    turn; it is not "running slowly", it is not running at all (NFR-004). It
 *    becomes ready again only when its reply lands.
 *
 *  - **The Conductor keeps a reserved slot.** Without it a Room at its
 *    concurrency limit cannot make the decision that would unblock itself,
 *    which is a deadlock the user would experience as a hang.
 */

import type { Room, RoomMember } from '../../shared/room-types';
import { IDLE_MEMBER_STATUSES } from '../../shared/room-types';
import { checkMemberLimits, checkRoomLimits } from './room-limits';

/** Why a member is ready, highest priority first. */
export type WakeReason =
  | 'reply-received'
  | 'user-intervention'
  | 'direct-message'
  | 'assigned-work'
  | 'first-turn'
  /** Everyone went idle and the Room is not finished — the lead has to decide. */
  | 'room-quiet';

export interface ScheduledTurn {
  memberId: string;
  reason: WakeReason;
}

export interface SchedulerDecision {
  /** Members to start this pass, already within every limit. */
  start: ScheduledTurn[];
  /** Set when the Room cannot start anything and the user should be told why. */
  blocked: { reason: string; limit?: string } | null;
}

/** Wake priority. A reply outranks new work: someone is already blocked on it. */
const WAKE_PRIORITY: Record<WakeReason, number> = {
  'reply-received': 0,
  'user-intervention': 1,
  'direct-message': 2,
  'assigned-work': 3,
  'first-turn': 4,
  // Last: a Room with anything else to run does not need its lead prodded.
  'room-quiet': 5,
};

export interface ReadySignal {
  memberId: string;
  reason: WakeReason;
  /** When the signal arrived. Older signals win a priority tie, so nobody starves. */
  at: string;
}

function holdsSlot(member: RoomMember): boolean {
  return member.status === 'working' || member.status === 'starting';
}

function isSchedulable(member: RoomMember): boolean {
  // `waiting` is deliberately absent: a waiting member is only schedulable once
  // a reply produces a ready signal for it.
  return member.status === 'idle' || member.status === 'starting';
}

/**
 * Decides who runs next.
 *
 * `signals` are the ready signals the coordinator has collected since the last
 * pass — from persisted replies, user actions and new assignments. They are the
 * event path (spec §16): the periodic tick is recovery only, so a Room whose
 * only input is a reply must be schedulable from signals alone.
 */
export function scheduleRoomTurns(
  room: Room,
  signals: ReadySignal[],
  nowMs: number,
): SchedulerDecision {
  const roomLimit = checkRoomLimits(room, nowMs);
  if (!roomLimit.ok) {
    return { start: [], blocked: { reason: roomLimit.reason ?? 'A Room limit was reached.', limit: roomLimit.limit } };
  }

  const membersById = new Map(room.members.map((member) => [member.id, member]));
  const conductor = room.members.find((member) => member.isConductor && member.status !== 'retired');

  const inFlight = room.members.filter(holdsSlot).length;
  const conductorInFlight = Boolean(conductor && holdsSlot(conductor));

  // One slot is held back for the Conductor unless it is already using one.
  // Without the reserve, a full Room cannot make the decision that frees it.
  const reserved = conductor && !conductorInFlight ? 1 : 0;
  const generalCapacity = Math.max(0, room.definition.envelope.maxActiveTurns - inFlight - reserved);

  const ordered = [...signals]
    .filter((signal) => {
      const member = membersById.get(signal.memberId);
      return Boolean(member) && isSchedulable(member as RoomMember);
    })
    .sort((left, right) => {
      const byPriority = WAKE_PRIORITY[left.reason] - WAKE_PRIORITY[right.reason];
      // Oldest-first within a priority is what stops a busy member starving a
      // quiet one that has been ready longer.
      return byPriority !== 0 ? byPriority : Date.parse(left.at) - Date.parse(right.at);
    });

  const start: ScheduledTurn[] = [];
  const started = new Set<string>();
  let remaining = generalCapacity;

  for (const signal of ordered) {
    if (started.has(signal.memberId)) continue;
    const member = membersById.get(signal.memberId);
    if (!member) continue;

    // The Conductor draws on its reserved slot first, so a Room at capacity can
    // still coordinate.
    const usesReserve = member.isConductor && !conductorInFlight && !started.has(member.id);
    if (!usesReserve && remaining <= 0) continue;

    if (!checkMemberLimits(room, member).ok) continue;

    start.push({ memberId: member.id, reason: signal.reason });
    started.add(member.id);
    if (!usesReserve) remaining -= 1;
  }

  if (start.length > 0) return { start, blocked: null };

  return { start: [], blocked: describeStall(room, signals, inFlight) };
}

/**
 * Explains a pass that started nothing. "Nothing is running and nothing is
 * blocked" is a bug the user should see, not a silent idle.
 */
function describeStall(
  room: Room,
  signals: ReadySignal[],
  inFlight: number,
): SchedulerDecision['blocked'] {
  if (inFlight > 0) return null;

  const waiting = room.members.filter((member) => member.status === 'waiting');
  if (waiting.length > 0 && signals.length === 0) {
    const names = waiting.map((member) => member.displayName).join(', ');
    return { reason: `Waiting for a reply: ${names}.` };
  }

  const blocked = room.members.filter((member) => member.status === 'blocked');
  if (blocked.length > 0) {
    return { reason: `Blocked: ${blocked.map((member) => member.displayName).join(', ')}.` };
  }

  const live = room.members.filter((member) => !IDLE_MEMBER_STATUSES.includes(member.status));
  if (live.length === 0) return { reason: 'Every member has finished or stopped.' };

  return null;
}

/**
 * A dependency cycle among waiting members (FR-020).
 *
 * Each waiting member is blocked on a question; the edge runs from the asker to
 * whoever must answer. A cycle means nobody can proceed, so the Conductor is
 * told first and continued deadlock pauses the Room for the user.
 */
export function detectWaitCycles(
  waitEdges: { fromMemberId: string; toMemberId: string }[],
): string[][] {
  const outgoing = new Map<string, string[]>();
  for (const edge of waitEdges) {
    outgoing.set(edge.fromMemberId, [...(outgoing.get(edge.fromMemberId) ?? []), edge.toMemberId]);
  }

  const cycles: string[][] = [];
  const settled = new Set<string>();
  const onPath = new Set<string>();
  const path: string[] = [];

  const walk = (node: string): void => {
    if (onPath.has(node)) {
      // Report from the point the path re-entered, so the cycle is exactly the
      // members involved rather than the whole walk that reached it.
      const start = path.indexOf(node);
      if (start >= 0) cycles.push(path.slice(start));
      return;
    }
    if (settled.has(node)) return;

    onPath.add(node);
    path.push(node);
    for (const next of outgoing.get(node) ?? []) walk(next);
    path.pop();
    onPath.delete(node);
    settled.add(node);
  };

  for (const node of outgoing.keys()) walk(node);
  return cycles;
}
