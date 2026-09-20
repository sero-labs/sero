/**
 * The stamps every Room write shares, applied at the one commit seam so no
 * write site can forget them.
 *
 * `statusAt` records when a member entered its current status. `liveRun`
 * records that THIS session saw the Room working: a saved `running` status
 * survives a crash, a mark does not, so a row can only say "Working" about a
 * Room this session watched start.
 */

import { WORKING_ROOM_STATUSES } from '../../shared/room-types';
import type { RoomRecord, RoomState } from './room-state';

/**
 * A member entering a new status gets stamped here. Staying in a status keeps
 * the stamp; new members keep what their creation site set.
 */
export function withStatusStamps(room: RoomRecord, prev: RoomState): RoomRecord {
  const prevRoom = prev.rooms.find((candidate) => candidate.definition.id === room.definition.id);
  if (!prevRoom || prevRoom.members === room.members) return room;
  const before = new Map(prevRoom.members.map((member) => [member.id, member]));
  return {
    ...room,
    members: room.members.map((member) => {
      const was = before.get(member.id);
      return !was || was.status === member.status
        ? member
        : { ...member, statusAt: new Date().toISOString() };
    }),
  };
}

/**
 * Marks a Room that is working, and clears the mark the moment it settles.
 *
 * The stamp lands when the Room ENTERS a working state, not on every commit: a
 * refresh on each write would rewrite room.json and the index for a member
 * change that touched neither.
 */
export function withLiveRun(room: RoomRecord): RoomRecord {
  const working = WORKING_ROOM_STATUSES.includes(room.runtime.status);
  const existing = room.runtime.liveRun;
  if (!working) {
    if (!existing) return room;
    const { liveRun: _dropped, ...runtime } = room.runtime;
    return { ...room, runtime };
  }
  if (existing) return room;
  const now = new Date().toISOString();
  return {
    ...room,
    runtime: { ...room.runtime, liveRun: { runId: room.definition.id, startedAt: now, reportedAt: now } },
  };
}
