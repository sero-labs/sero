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
 */

import type { RoomTimelineEvent } from '../../shared/room-message-types';
import type { OrchestratorHost } from '../host';
import { reconcileMemberSessions, type MemberSessionDeps } from './member-session';
import { timelineEvent, withRoomStatus } from './room-actions';
import { checkRoomLimits } from './room-limits';
import type { RoomRecord } from './room-state';

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

/** A Room that may resume, and who it owes a wake to. */
export interface RoomResumption {
  roomId: string;
  replayMemberIds: string[];
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
    if (result.record !== current) await deps.store.updateRoom(roomId, () => result.record);
    if (result.events.length > 0) await deps.store.appendTimeline(roomId, result.events);
    if (result.resume) resumable.push({ roomId, replayMemberIds: result.replayMemberIds });
  }
  return resumable;
}
