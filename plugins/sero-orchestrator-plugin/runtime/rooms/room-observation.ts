/**
 * Live member observation (architecture.md §12, D-30..D-35, NFR-016/NFR-017).
 *
 * Two different questions need different plumbing. *What has happened* is Room
 * state and the Pi session file. *What is happening right now* is this module:
 * a bounded, transient view of each member's CURRENT turn.
 *
 *   Pi AgentSession events
 *     → host persistent-session capability (subscribe)
 *       → this buffer (bounded, per member)
 *         → Room live event → renderer
 *
 * Three properties are structural, not conventions:
 *
 *  - **Nothing here is persisted.** The module is given no store, no artifact
 *    writer and no file access, so a live buffer cannot become a second
 *    transcript store (NFR-002, NFR-016). Its worst-case footprint is one
 *    capped turn buffer per live member.
 *  - **Retention follows demand.** The subscription stays up whenever a session
 *    is live, because the runtime needs turn-completion events to schedule. But
 *    streamed text is retained only while somebody is watching — the same idea
 *    as `attachDemandSync` for event-source adapters in runtime/index.ts.
 *  - **Observing changes nothing.** Watching is read-only, holds no execution
 *    slot, and a member nobody watches behaves identically (NFR-017, D-35).
 *
 * History is deliberately NOT here: it is the Pi session file, read through the
 * capability, and it outlives the live session (D-34).
 */

import type {
  PersistentSessionEvent,
  PersistentSessionHistoryPage,
  PersistentSessionsApi,
} from '@sero-ai/common';

import type { LiveToolCall, MemberLiveSnapshot } from '../../shared/room-live-types';

/**
 * Hard cap on retained live text per member. The buffer holds one turn, and a
 * long turn keeps its TAIL — "what is it doing right now" is the end of the
 * stream, and the beginning is already in the session file.
 */
export const MAX_LIVE_TEXT_CHARS = 8_000;

/** A capability event addressed to a Room member. Same shapes, plus identity. */
export type RoomLiveEvent = PersistentSessionEvent & { roomId: string; memberId: string };

/** The Watch view reads these, so they live in shared/ with the other UI-facing shapes. */
export type { LiveToolCall, MemberLiveSnapshot };

export type RoomLiveListener = (event: RoomLiveEvent) => void;

export interface RoomObservationDeps {
  sessions: Pick<PersistentSessionsApi, 'subscribe' | 'readHistory'>;
  /**
   * Turn lifecycle for the scheduler. Fires for turn start, turn end and
   * compaction whether or not anybody is watching — scheduling must not depend
   * on a UI being open.
   */
  onLifecycle?: RoomLiveListener;
  now(): string;
}

export interface RoomObservation {
  /** Starts observing a live session. Called when a member's session opens. */
  attach(roomId: string, memberId: string, handleId: string): () => void;
  /** Stops observing and drops the transient state. The session file is untouched. */
  detach(memberId: string): void;
  watchMember(memberId: string, listener: RoomLiveListener): () => void;
  watchRoom(roomId: string, listener: RoomLiveListener): () => void;
  snapshotMember(memberId: string): MemberLiveSnapshot | null;
  snapshotRoom(roomId: string): MemberLiveSnapshot[];
  /**
   * A page of a member's history, newest first, read from the Pi session file.
   * Takes the grant and subject rather than a live handle, so it works for a
   * DISPOSED, retired, replaced or failed member (D-34).
   */
  readMemberHistory(
    grantId: string,
    memberId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<PersistentSessionHistoryPage>;
  dispose(): void;
}

interface MemberChannel {
  roomId: string;
  handleId: string;
  unsubscribe: () => void;
  snapshot: MemberLiveSnapshot;
}

function emptySnapshot(roomId: string, memberId: string, at: string): MemberLiveSnapshot {
  return {
    roomId,
    memberId,
    turnId: null,
    text: '',
    truncated: false,
    toolInFlight: null,
    lastTurnStatus: null,
    watching: false,
    updatedAt: at,
  };
}

export function createRoomObservation(deps: RoomObservationDeps): RoomObservation {
  const channels = new Map<string, MemberChannel>();
  const memberWatchers = new Map<string, Set<RoomLiveListener>>();
  const roomWatchers = new Map<string, Set<RoomLiveListener>>();

  const watchersOf = (map: Map<string, Set<RoomLiveListener>>, key: string): Set<RoomLiveListener> => {
    const existing = map.get(key);
    if (existing) return existing;
    const created = new Set<RoomLiveListener>();
    map.set(key, created);
    return created;
  };

  const isWatched = (roomId: string, memberId: string): boolean =>
    (memberWatchers.get(memberId)?.size ?? 0) > 0 || (roomWatchers.get(roomId)?.size ?? 0) > 0;

  /** Drops retained text and tool state, keeping only the lifecycle fields. */
  function clearRetained(channel: MemberChannel): void {
    channel.snapshot.text = '';
    channel.snapshot.truncated = false;
    channel.snapshot.toolInFlight = null;
  }

  function appendText(snapshot: MemberLiveSnapshot, delta: string): void {
    const combined = snapshot.text + delta;
    if (combined.length <= MAX_LIVE_TEXT_CHARS) {
      snapshot.text = combined;
      return;
    }
    snapshot.text = combined.slice(combined.length - MAX_LIVE_TEXT_CHARS);
    snapshot.truncated = true;
  }

  function emit(event: RoomLiveEvent): void {
    for (const listener of memberWatchers.get(event.memberId) ?? []) listener(event);
    for (const listener of roomWatchers.get(event.roomId) ?? []) listener(event);
  }

  function apply(channel: MemberChannel, event: RoomLiveEvent): void {
    const { snapshot } = channel;
    const watched = isWatched(channel.roomId, snapshot.memberId);
    snapshot.watching = watched;
    snapshot.updatedAt = deps.now();

    switch (event.type) {
      case 'turn_start':
        // Bounded means the current turn only: the previous turn's text goes
        // now, whether or not anything consumed it.
        clearRetained(channel);
        snapshot.turnId = event.turnId;
        snapshot.lastTurnStatus = null;
        break;
      case 'text':
        if (watched) appendText(snapshot, event.text);
        break;
      case 'tool_start':
        if (watched) {
          snapshot.toolInFlight = { toolName: event.toolName, summary: event.summary, startedAt: snapshot.updatedAt };
        }
        break;
      case 'tool_end':
        snapshot.toolInFlight = null;
        break;
      case 'turn_end':
        snapshot.turnId = null;
        snapshot.lastTurnStatus = event.status;
        snapshot.toolInFlight = null;
        break;
      case 'compacted':
        // The retained text belongs to a context that no longer exists, so
        // keeping it would show the member remembering something it does not.
        clearRetained(channel);
        break;
    }
  }

  function detach(memberId: string): void {
    const channel = channels.get(memberId);
    if (!channel) return;
    channel.unsubscribe();
    // The snapshot goes with the session. A disposed member's last live line is
    // not its state — the UI falls back to history, which is the file.
    channels.delete(memberId);
  }

  return {
    attach(roomId, memberId, handleId) {
      const open = channels.get(memberId);
      if (open?.handleId === handleId) return () => detach(memberId);
      // A reopened session gets a new handle; the old subscription would keep
      // reporting a session the member no longer runs on.
      open?.unsubscribe();

      const channel: MemberChannel = {
        roomId,
        handleId,
        unsubscribe: () => undefined,
        snapshot: emptySnapshot(roomId, memberId, deps.now()),
      };
      channel.snapshot.watching = isWatched(roomId, memberId);
      channels.set(memberId, channel);

      channel.unsubscribe = deps.sessions.subscribe(handleId, (event: PersistentSessionEvent) => {
        const live: RoomLiveEvent = { ...event, roomId, memberId };
        apply(channel, live);
        if (live.type !== 'text' && live.type !== 'tool_start' && live.type !== 'tool_end') {
          deps.onLifecycle?.(live);
        }
        emit(live);
      });

      return () => detach(memberId);
    },

    detach,

    watchMember(memberId, listener) {
      const watchers = watchersOf(memberWatchers, memberId);
      watchers.add(listener);
      const channel = channels.get(memberId);
      if (channel) channel.snapshot.watching = true;
      return () => {
        watchers.delete(listener);
        if (watchers.size === 0) memberWatchers.delete(memberId);
        const open = channels.get(memberId);
        if (open && !isWatched(open.roomId, memberId)) {
          // Demand ended: stop retaining streamed text. The subscription stays
          // up because the scheduler still needs turn-completion events.
          clearRetained(open);
          open.snapshot.watching = false;
        }
      };
    },

    watchRoom(roomId, listener) {
      const watchers = watchersOf(roomWatchers, roomId);
      watchers.add(listener);
      for (const channel of channels.values()) {
        if (channel.roomId === roomId) channel.snapshot.watching = true;
      }
      return () => {
        watchers.delete(listener);
        if (watchers.size === 0) roomWatchers.delete(roomId);
        for (const channel of channels.values()) {
          if (channel.roomId !== roomId) continue;
          if (isWatched(roomId, channel.snapshot.memberId)) continue;
          clearRetained(channel);
          channel.snapshot.watching = false;
        }
      };
    },

    snapshotMember(memberId) {
      const channel = channels.get(memberId);
      return channel ? { ...channel.snapshot } : null;
    },

    snapshotRoom(roomId) {
      return [...channels.values()]
        .filter((channel) => channel.roomId === roomId)
        .map((channel) => ({ ...channel.snapshot }));
    },

    // The subject is the member id (MemberSessionRef.subject), and the read is
    // paged from the tail so opening a long session never loads the whole file.
    readMemberHistory: (grantId, memberId, options) => deps.sessions.readHistory(grantId, memberId, options),

    dispose() {
      for (const channel of channels.values()) channel.unsubscribe();
      channels.clear();
      memberWatchers.clear();
      roomWatchers.clear();
    },
  };
}
