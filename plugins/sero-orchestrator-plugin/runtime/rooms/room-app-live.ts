/**
 * The read-only half of the user's Room surface: what is happening right now,
 * and what already happened inside one member's own session.
 *
 * Split from `room-app-actions.ts` because it is a different kind of thing.
 * Nothing here changes a Room — it reads live turns and session files — and it
 * is the only part of the surface that works when the host cannot observe
 * sessions at all, by answering with nothing rather than failing.
 */

import type {
  PersistentSessionContextUsage,
  PersistentSessionHistoryPage,
  PersistentSessionsApi,
} from '@sero-ai/common';

import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { OrchestratorHost } from '../host';
import type { RoomObservation } from './room-observation';
import type { RoomStore } from './room-store';

/**
 * How long a Watch view's retention demand outlives its last read.
 *
 * A renderer that reloads or crashes cannot release its own lease, so a lease
 * is dropped once it goes quiet. Expiry is evaluated on the next read by ANY
 * panel rather than on a timer: an abandoned lease costs one capped turn buffer
 * per live member until then, which is the same bound the module already keeps.
 */
const WATCH_LEASE_MS = 5 * 60_000;

export interface RoomLiveContext {
  host: OrchestratorHost;
  store: RoomStore;
  /** Live turns and session history. Absent in tests that never watch. */
  observation?: RoomObservation;
  /** Context pressure for the member panel. Absent when the host cannot report it. */
  sessions?: Pick<PersistentSessionsApi, 'getContextUsage'>;
}

export interface RoomLiveActions {
  /**
   * What every member is doing RIGHT NOW: the current turn's text and the tool
   * in flight.
   *
   * The call also registers the demand that makes the runtime retain streamed
   * text at all — a member nobody watches keeps no text (NFR-016). The panel
   * asks again whenever the Room record changes, so the view is driven by the
   * Room's own writes rather than by a timer.
   */
  watch(roomId: string): Promise<MemberLiveSnapshot[]>;
  /** Drops the retention demand. Called when the Watch view closes. */
  unwatch(roomId: string): Promise<void>;
  /**
   * A page of one member's own history, newest first.
   *
   * This is the Pi session file, not a Room record, so it works for a member
   * that is disposed, retired, replaced or failed, and it reads through a
   * compaction boundary rather than stopping at it (D-34).
   */
  history(
    roomId: string,
    memberId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<PersistentSessionHistoryPage>;
  /**
   * How full one member's context window is. Null when its session is not live
   * — a disposed member holds no window, and a made-up figure would read as a
   * real one.
   */
  context(roomId: string, memberId: string): Promise<PersistentSessionContextUsage | null>;
}

export function createRoomLiveActions({ host, store, observation, sessions }: RoomLiveContext): RoomLiveActions {
  /** Open Watch views, by Room. The listener is empty on purpose — demand is the point. */
  const leases = new Map<string, { release: () => void; readAt: number }>();

  function releaseLease(roomId: string): void {
    leases.get(roomId)?.release();
    leases.delete(roomId);
  }

  function holdLease(roomId: string): void {
    if (!observation) return;
    const now = Date.parse(host.now());
    for (const [held, lease] of leases) {
      if (held !== roomId && now - lease.readAt > WATCH_LEASE_MS) releaseLease(held);
    }
    const existing = leases.get(roomId);
    if (existing) {
      existing.readAt = now;
      return;
    }
    leases.set(roomId, { release: observation.watchRoom(roomId, () => undefined), readAt: now });
  }

  return {
    async watch(roomId) {
      if (!observation) return [];
      holdLease(roomId);
      return observation.snapshotRoom(roomId);
    },

    async unwatch(roomId) {
      releaseLease(roomId);
    },

    async history(roomId, memberId, options) {
      const empty: PersistentSessionHistoryPage = { entries: [], olderCursor: null };
      if (!observation) return empty;
      const record = await store.readRoom(roomId);
      const grantId = record?.definition.grantId;
      // No grant means no session was ever issued for this Room, so there is no
      // file to read — an empty page, not an error the panel has to explain.
      // The roster check matters more: the grant is the ROOM's, so reading a
      // subject that is not in it would reach another Room's session with this
      // Room's authority.
      if (!grantId || !record.members.some((member) => member.id === memberId)) return empty;
      return observation.readMemberHistory(grantId, memberId, options);
    },

    async context(roomId, memberId) {
      if (!sessions) return null;
      const member = await store.readMember(roomId, memberId);
      const handleId = member?.session.liveHandleId;
      return handleId ? sessions.getContextUsage(handleId) : null;
    },
  };
}
