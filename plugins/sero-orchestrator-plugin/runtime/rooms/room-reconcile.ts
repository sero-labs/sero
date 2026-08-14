/**
 * Restart recovery at the ROOM level (spec §26, §30).
 *
 * Follows the approach of runtime/reconcile.ts — reconcile what was in flight
 * BEFORE anything new is scheduled — with the member half delegated to
 * `reconcileMemberSessions`, which owns stale handles and interrupted turns.
 * This file decides only what the Room as a whole may do next.
 *
 * Two rules decide that:
 *
 *  - **An interrupted turn is uncertain, not failed.** It may have completed and
 *    written its result, so the member is not re-prompted. The Conductor is
 *    woken and re-assigns what still needs doing; re-running the member itself
 *    could repeat an external write (§30).
 *  - **Interrupted delivery is never repeated automatically.** A Room caught
 *    mid-`completing` stops for the user instead of guessing.
 *
 * Messages are the one thing that IS repeated. A batch leased to a turn that
 * never accepted its prompt left the read cursor where it was, so the member is
 * woken and handed the same batch again — arriving twice is recoverable, being
 * dropped is not (§17.1).
 *
 * Waits are re-derived rather than repeated. A wait that the log proves is over
 * is ended here, because the wake that would have ended it cannot come twice.
 */

import type { RoomTimelineEvent } from '../../shared/room-message-types';
import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { reconcileMemberSessions, type MemberSessionDeps } from './member-session';
import { timelineEvent, withMemberStatus, withRoomStatus } from './room-actions';
import { checkRoomLimits } from './room-limits';
import { MESSAGE_PAGE_SIZE, undeliveredFloor } from './room-messages';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

export interface RoomReconcileResult {
  /** The same reference when nothing changed, so no file is rewritten. */
  record: RoomRecord;
  /** True when the Room may keep running and its Conductor should be woken. */
  resume: boolean;
  /**
   * Members holding a message batch no turn ever accepted. They are woken with
   * the Room so the batch is delivered again. Empty unless the Room resumes: a
   * paused Room delivers it on the member's next turn instead.
   */
  replayMemberIds: string[];
  events: RoomTimelineEvent[];
}

/** Members whose leased batch is still outstanding (§17.1). */
function leasedMemberIds(record: RoomRecord): string[] {
  return record.readCursors.filter((cursor) => cursor.lease).map((cursor) => cursor.memberId);
}

/**
 * Decides what one Room does after a restart. Called AFTER its member sessions
 * have been reconciled, so the roster it reads holds no stale handle and no
 * member left mid-turn.
 */
export function reconcileRoomRecord(host: OrchestratorHost, record: RoomRecord): RoomReconcileResult {
  const now = host.now();
  const roomId = record.definition.id;
  const events: RoomTimelineEvent[] = [];

  if (record.runtime.status === 'pausing') {
    // Nothing survives a restart, so the pause this Room was waiting to finish
    // has finished.
    events.push(timelineEvent(host, roomId, 'room-status', null, 'Paused: the restart ended every turn in flight.'));
    return { record: withRoomStatus(record, 'paused', now), resume: false, replayMemberIds: [], events };
  }

  if (record.runtime.status === 'completing') {
    // Delivery may or may not have happened. Repeating it could send the result
    // twice, so the Room waits for the user instead of guessing.
    events.push(timelineEvent(host, roomId, 'recovery', null, 'A restart interrupted delivery. It needs your review.'));
    return {
      record: withRoomStatus(record, 'completing', now, {
        kind: 'awaiting-approval',
        detail: 'A restart interrupted delivery, so it was not repeated. Check whether the result was delivered.',
        at: now,
      }),
      resume: false,
      replayMemberIds: [],
      events,
    };
  }

  if (record.runtime.status !== 'running' || record.archivedAt) {
    return { record, resume: false, replayMemberIds: [], events };
  }

  const limit = checkRoomLimits(record, Date.parse(now));
  if (!limit.ok) {
    const detail = limit.reason ?? 'A Room limit was reached.';
    events.push(timelineEvent(host, roomId, 'limit', null, detail));
    return {
      record: withRoomStatus(record, 'paused', now, { kind: 'limit-reached', detail, at: now }),
      resume: false,
      replayMemberIds: [],
      events,
    };
  }

  events.push(timelineEvent(host, roomId, 'recovery', null, 'Sero restarted. The Room resumed from its current records.'));
  const replayMemberIds = leasedMemberIds(record);
  if (replayMemberIds.length > 0) {
    const summary = `${replayMemberIds.length} message batch(es) were never taken up. They are delivered again.`;
    events.push(timelineEvent(host, roomId, 'recovery', null, summary));
  }
  return { record: withRoomStatus(record, 'running', now, null), resume: true, replayMemberIds, events };
}

/**
 * Members left waiting on a question the durable log shows was already answered
 * or withdrawn.
 *
 * A reply is persisted before its waiter is released, so a restart between the
 * two leaves a durable wait with no wake coming: the sender's retry is refused
 * as a duplicate, and the waiter holds its slot for good. Recovery ends the wait
 * from the log instead.
 *
 * The scan starts at the undelivered floor and runs to the head. Retention may
 * not prune below that floor, so every message a waiting member has yet to read
 * is still on disk — and the answer it never heard is one of them. A fixed-size
 * window would miss it once the Room got busy, which is the case the waiter has
 * no other way out of.
 *
 * Only a wait that can be SHOWN to be over is ended, so a member is never
 * released from a wait it is genuinely still owed.
 */
async function settledWaits(store: RoomStore, record: RoomRecord): Promise<string[]> {
  const waiting = record.members.flatMap((member) =>
    member.status === 'waiting' && member.waitingOnQuestionId
      ? [{ memberId: member.id, questionId: member.waitingOnQuestionId }]
      : [],
  );
  if (waiting.length === 0) return [];

  const roomId = record.definition.id;
  const latest = record.runtime.messageSequence;
  const settled = new Set<string>();
  let after = undeliveredFloor(record, latest);
  while (after < latest) {
    const batch = await store.readMessages(roomId, after, MESSAGE_PAGE_SIZE);
    // Empty means the rest was pruned or never written; either way there is no
    // more evidence to find.
    if (batch.length === 0) break;
    for (const message of batch) {
      if (message.inReplyToQuestionId) settled.add(message.inReplyToQuestionId);
      else if (message.kind === 'cancel' && message.questionId) settled.add(message.questionId);
    }
    after = batch[batch.length - 1].sequence;
  }
  return waiting.filter((wait) => settled.has(wait.questionId)).map((wait) => wait.memberId);
}

/** Ends the waits recovery settled. A released member is schedulable again. */
function withReleasedWaits(record: RoomRecord, memberIds: string[]): RoomRecord {
  if (memberIds.length === 0) return record;
  return {
    ...record,
    members: record.members.map((member) =>
      memberIds.includes(member.id)
        ? { ...withMemberStatus(member, 'idle', 'Ready.'), waitingOnQuestionId: null }
        : member,
    ),
  };
}

/** A Room that may resume, and who it owes a wake to. */
export interface RoomResumption {
  roomId: string;
  replayMemberIds: string[];
  /** Waits the log settled while nobody was there to end them. */
  settledWaitMemberIds: string[];
}

/**
 * Reconciles every Room, then returns the ones that may resume — reconciliation
 * itself starts nothing, so the caller decides who to wake.
 */
export async function reconcileAllRooms(deps: MemberSessionDeps): Promise<RoomResumption[]> {
  const state = await deps.store.readState();
  const resumable: RoomResumption[] = [];
  for (const room of state.rooms) {
    const roomId = room.definition.id;
    await reconcileMemberSessions(deps, roomId);
    const current = await deps.store.readRoom(roomId);
    if (!current) continue;
    const result = reconcileRoomRecord(deps.host, current);
    // Every live Room settles its waits, not only a resuming one: a Room that
    // restarts paused resumes later through `resumeRoom`, which wakes the
    // Conductor alone. Correcting the RECORD here is what frees the waiter,
    // whenever the Room next runs. Waking is only how a running Room gets on
    // with it sooner.
    const settledWaitMemberIds =
      current.archivedAt || TERMINAL_ROOM_STATUSES.includes(current.runtime.status)
        ? []
        : await settledWaits(deps.store, current);
    const events = [...result.events];
    if (settledWaitMemberIds.length > 0) {
      const summary = `${settledWaitMemberIds.length} member(s) waited for an answer that had already arrived. They were released.`;
      events.push(timelineEvent(deps.host, roomId, 'recovery', null, summary));
    }
    const next = withReleasedWaits(result.record, settledWaitMemberIds);
    if (next !== current) await deps.store.updateRoom(roomId, () => next);
    if (events.length > 0) await deps.store.appendTimeline(roomId, events);
    if (result.resume) resumable.push({ roomId, replayMemberIds: result.replayMemberIds, settledWaitMemberIds });
  }
  return resumable;
}
