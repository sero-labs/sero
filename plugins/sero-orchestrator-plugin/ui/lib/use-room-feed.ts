/**
 * The two Room views that are NOT plain watched JSON.
 *
 * The Room record and each member record are files the renderer follows
 * directly. These two are not:
 *
 *  - the timeline is append-only `.jsonl`, which the JSON file bridge cannot
 *    follow;
 *  - live turns are deliberately never written to disk (NFR-016).
 *
 * Both are therefore fetched through the `rooms` tool — but they are still
 * PUSH-driven, because the fetch is triggered by the watched Room record
 * changing, not by a timer. `roomSignal` is what makes that precise: it is the
 * set of record fields that move when something happens in the Room.
 */

import { useEffect, useState } from 'react';
import type { PersistentSessionContextUsage, PersistentSessionHistoryEntry } from '@sero-ai/common';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomTimelineEvent } from '../../shared/room-message-types';
import { mergeHistory } from './room-view';

interface FeedDetails {
  ok?: boolean;
  events?: RoomTimelineEvent[];
  snapshots?: MemberLiveSnapshot[];
  entries?: PersistentSessionHistoryEntry[];
  olderCursor?: string | null;
  usage?: PersistentSessionContextUsage | null;
}

export type RoomFeedDispatch = (params: Record<string, unknown>) => Promise<FeedDetails | null>;

/** Recent timeline events, newest first, re-read whenever the Room moves. */
export function useRoomTimeline(
  roomId: string | null,
  dispatch: RoomFeedDispatch,
  signal: string,
): RoomTimelineEvent[] {
  const [events, setEvents] = useState<RoomTimelineEvent[]>([]);

  useEffect(() => {
    if (!roomId) {
      setEvents([]);
      return;
    }
    let current = true;
    void dispatch({ action: 'timeline', roomId }).then((details) => {
      if (current && details?.events) setEvents(details.events);
    });
    return () => {
      current = false;
    };
  }, [roomId, signal, dispatch]);

  return events;
}

/**
 * What every member is doing right now, by member id.
 *
 * Asking is also what makes the runtime retain streamed text — a member nobody
 * watches keeps none. The demand is dropped when the view closes, so a Room
 * left running with no Watch view open costs nothing.
 */
export function useRoomLive(
  roomId: string | null,
  dispatch: RoomFeedDispatch,
  active: boolean,
  signal: string,
): Map<string, MemberLiveSnapshot> {
  const [live, setLive] = useState<Map<string, MemberLiveSnapshot>>(new Map());

  useEffect(() => {
    if (!roomId || !active) {
      setLive(new Map());
      return;
    }
    let current = true;
    void dispatch({ action: 'watch', roomId }).then((details) => {
      if (current && details?.snapshots) {
        setLive(new Map(details.snapshots.map((snapshot) => [snapshot.memberId, snapshot])));
      }
    });
    return () => {
      current = false;
    };
  }, [roomId, active, signal, dispatch]);

  // Releasing is its own effect on purpose: it must run when the view closes,
  // not on every re-read.
  useEffect(() => {
    if (!roomId || !active) return;
    return () => {
      void dispatch({ action: 'unwatch', roomId });
    };
  }, [roomId, active, dispatch]);

  return live;
}

export interface MemberHistory {
  /** Newest first, as the session file is read. */
  entries: PersistentSessionHistoryEntry[];
  /** Present while there is more history further back. */
  olderCursor: string | null;
  loadOlder: () => void;
  loadingOlder: boolean;
}

/**
 * One member's own session history.
 *
 * This is the session FILE, so it survives disposal, retirement and
 * replacement, and it reads straight through a compaction boundary rather than
 * stopping at it. The newest page is re-read when the member takes a turn;
 * pages the user opened further back stay open.
 */
export function useMemberHistory(
  roomId: string | null,
  memberId: string | null,
  dispatch: RoomFeedDispatch,
  signal: string,
): MemberHistory {
  const [entries, setEntries] = useState<PersistentSessionHistoryEntry[]>([]);
  // `exhausted` is not the same as "no cursor yet": once the user has read back
  // to the start of the session, a later re-read of the NEWEST page must not
  // offer "load earlier turns" again.
  const [tail, setTail] = useState<{ cursor: string | null; exhausted: boolean }>({ cursor: null, exhausted: false });
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    setEntries([]);
    setTail({ cursor: null, exhausted: false });
  }, [roomId, memberId]);

  useEffect(() => {
    if (!roomId || !memberId) return;
    let current = true;
    void dispatch({ action: 'history', roomId, memberId }).then((details) => {
      if (!current || !details?.entries) return;
      setEntries((previous) => mergeHistory(details.entries ?? [], previous));
      // The first read sets the cursor; later reads must not rewind past what
      // the user has already opened.
      setTail((previous) =>
        previous.exhausted || previous.cursor ? previous : { cursor: details.olderCursor ?? null, exhausted: false },
      );
    });
    return () => {
      current = false;
    };
  }, [roomId, memberId, signal, dispatch]);

  const loadOlder = () => {
    if (!roomId || !memberId || !tail.cursor || loadingOlder) return;
    setLoadingOlder(true);
    void dispatch({ action: 'history', roomId, memberId, cursor: tail.cursor })
      .then((details) => {
        if (!details?.entries) return;
        setEntries((previous) => mergeHistory(previous, details.entries ?? []));
        setTail(
          details.olderCursor
            ? { cursor: details.olderCursor, exhausted: false }
            : { cursor: null, exhausted: true },
        );
      })
      .finally(() => setLoadingOlder(false));
  };

  return { entries, olderCursor: tail.cursor, loadOlder, loadingOlder };
}

/** How full a member's context window is. Null while its session is not live. */
export function useMemberContext(
  roomId: string | null,
  memberId: string | null,
  dispatch: RoomFeedDispatch,
  signal: string,
): PersistentSessionContextUsage | null {
  const [usage, setUsage] = useState<PersistentSessionContextUsage | null>(null);

  useEffect(() => {
    if (!roomId || !memberId) {
      setUsage(null);
      return;
    }
    let current = true;
    void dispatch({ action: 'context', roomId, memberId }).then((details) => {
      if (current) setUsage(details?.usage ?? null);
    });
    return () => {
      current = false;
    };
  }, [roomId, memberId, signal, dispatch]);

  return usage;
}
