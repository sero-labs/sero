/**
 * Pushing a member's live turn to the Watch view.
 *
 * The Watch view used to re-read a snapshot only when the Room record changed,
 * so a tile that looked live showed nothing until the next write. While a lease
 * is held the runtime now pushes each member's current turn directly.
 *
 * Each member keeps its own timer and holds only its newest snapshot, so a busy
 * member cannot starve a quiet one and a dropped frame loses nothing — the
 * snapshot is the whole current turn, not a delta.
 */

import type { MemberLiveSnapshot, RoomMemberLiveNotice } from '../../shared/room-live-types';

/** How often one member's tile may be updated. */
const MEMBER_UPDATE_MS = 200;

/**
 * One timer per key, holding the newest payload for it.
 * `flush` is called with the latest payload at most once per interval.
 */
export function createMemberLiveBroadcast(flush: (notice: RoomMemberLiveNotice) => void) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const held = new Map<string, RoomMemberLiveNotice>();

  function send(notice: RoomMemberLiveNotice): void {
    flush(notice);
  }

  function onTimer(key: string): void {
    timers.delete(key);
    const next = held.get(key);
    if (!next) return;
    held.delete(key);
    send(next);
    timers.set(key, setTimeout(() => onTimer(key), MEMBER_UPDATE_MS));
  }

  return {
    /** Show this member's current turn, at most once per interval. */
    push(snapshot: MemberLiveSnapshot): void {
      const key = `${snapshot.roomId}\u0000${snapshot.memberId}`;
      const notice: RoomMemberLiveNotice = { roomId: snapshot.roomId, snapshot };
      if (timers.has(key)) {
        held.set(key, notice);
        return;
      }
      send(notice);
      timers.set(key, setTimeout(() => onTimer(key), MEMBER_UPDATE_MS));
    },

    /** Forget every held frame. Called when the last lease for a Room ends. */
    clear(): void {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      held.clear();
    },
  };
}
