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
  FeedbackSnapshotReply,
  PersistentSessionContextUsage,
  PersistentSessionHistoryPage,
  PersistentSessionsApi,
} from '@sero-ai/common';

import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { LiveCallNotice } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import type { RoomObservation } from './room-observation';
import type { RoomStore } from './room-store';
import { createMemberLiveBroadcast } from './room-live-broadcast';

/**
 * How long one observer's demand outlives its last read.
 *
 * A renderer that reloads or crashes cannot release its own lease, so an
 * observer is dropped once it goes quiet. An open view renews well inside this
 * window. Expiry is checked on every read and on every member event, so an
 * abandoned observer goes the next time its Room has something to send, and
 * the runtime keeps no timer for it.
 */
export const WATCH_LEASE_MS = 5 * 60_000;

/** The observer a caller is when it names none. One per Room, as before. */
const SOLE_OBSERVER = 'default';

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
  watch(roomId: string, observerId?: string): Promise<MemberLiveSnapshot[]>;
  /**
   * Ends one observer's demand. Another view on the same Room keeps its own,
   * and the Room stops retaining text only when the last one goes. The Room
   * itself keeps running either way.
   */
  unwatch(roomId: string, observerId?: string): Promise<void>;
  /**
   * What this workspace's work is doing now, as bounded metadata: no text and
   * no tool payload. A list reads it without opening a watch, then follows the
   * pushed updates.
   */
  feedback(): Promise<FeedbackSnapshotReply>;
  /** The one-answer calls running now, for a view that opened after one started. */
  liveCalls(): Promise<LiveCallNotice[]>;
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
  /** Open Watch views, by Room, each with the observers that hold it open. */
  const leases = new Map<string, { release: () => void; observers: Map<string, number> }>();
  // One timer per member, so a busy member's text cannot starve a quiet one's.
  const broadcast = createMemberLiveBroadcast((notice) => host.notifyRoomLive?.(notice));

  function releaseLease(roomId: string): void {
    leases.get(roomId)?.release();
    leases.delete(roomId);
    // Nothing is watching: drop every held frame rather than leaving one to
    // arrive after the view closed.
    if (leases.size === 0) broadcast.clear();
  }

  /** Drops the observers that stopped renewing. True when the Room still has one. */
  function expire(roomId: string, now: number): boolean {
    const lease = leases.get(roomId);
    if (!lease) return false;
    for (const [observerId, readAt] of lease.observers) {
      if (now - readAt > WATCH_LEASE_MS) lease.observers.delete(observerId);
    }
    if (lease.observers.size > 0) return true;
    releaseLease(roomId);
    return false;
  }

  function holdLease(roomId: string, observerId: string): void {
    if (!observation) return;
    const now = Date.parse(host.now());
    for (const held of [...leases.keys()]) expire(held, now);
    const existing = leases.get(roomId);
    if (existing) {
      existing.observers.set(observerId, now);
      return;
    }
    // While this lease is held, each member's current turn is pushed to the
    // app's own views, so a tile streams without waiting for a Room write.
    const listener = (event: { memberId: string }) => {
      if (!expire(roomId, Date.parse(host.now()))) return;
      const snapshot = observation.snapshotMember(event.memberId);
      if (snapshot) broadcast.push(snapshot);
    };
    leases.set(roomId, { release: observation.watchRoom(roomId, listener), observers: new Map([[observerId, now]]) });
  }

  return {
    async watch(roomId, observerId = SOLE_OBSERVER) {
      if (!observation) return [];
      holdLease(roomId, observerId);
      return observation.snapshotRoom(roomId);
    },

    async unwatch(roomId, observerId = SOLE_OBSERVER) {
      const lease = leases.get(roomId);
      if (!lease) return;
      lease.observers.delete(observerId);
      if (lease.observers.size === 0) releaseLease(roomId);
    },

    async feedback() {
      return host.feedback?.reply() ?? { epoch: '', snapshots: [] };
    },

    async liveCalls() {
      return host.liveCalls?.() ?? [];
    },

    async history(roomId, memberId, options) {
      const empty: PersistentSessionHistoryPage = { entries: [], olderCursor: null };
      if (!observation) return empty;
      const record = await store.readRoom(roomId);
      const grantId = record?.definition.grantId ?? record?.definition.historyGrantId;
      // No grant means no session was ever issued for this Room, so there is no
      // file to read — an empty page, not an error the panel has to explain.
      // The roster check matters more: the grant is the ROOM's, so reading a
      // subject that is not in it would reach another Room's session with this
      // Room's authority.
      if (!record || !grantId || !record.members.some((member) => member.id === memberId)) return empty;
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
