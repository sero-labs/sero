/**
 * The decisions behind the Room panel, kept out of the components.
 *
 * Everything here is a pure function of records the runtime wrote: which view a
 * Room opens on, what a live pane says when there is no live text, how session
 * history groups into turns, and how two reads of that history combine. They
 * live here so they can be tested without a DOM — the components are then only
 * layout.
 */

import type { PersistentSessionHistoryEntry } from '@sero-ai/common';
import { patternsOverlap } from '../../shared/room-claim-overlap';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { PathClaim } from '../../shared/room-message-types';
import { TERMINAL_ROOM_STATUSES, type MemberStatus, type PersistedRoom, type RoomStatus } from '../../shared/room-types';

export type RoomView = 'timeline' | 'watch' | 'result';

/**
 * What "the Room moved" means, as one comparable value. Status, spend, who
 * holds a turn, and the two append counters cover every change a timeline or a
 * live pane must follow — a claim or a revision moves the timeline counter
 * without moving anything else, which is why that counter exists.
 */
export function roomSignal(room: PersistedRoom | null): string {
  if (!room) return '';
  const { status, messageSequence, timelineSequence, usage, activeMemberIds } = room.runtime;
  return [status, messageSequence, timelineSequence, usage.turns, usage.costUsd, activeMemberIds.join('+')].join(':');
}

/** A finished Room opens on its result; a live one opens on what is happening. */
export function defaultRoomView(status: RoomStatus): RoomView {
  return TERMINAL_ROOM_STATUSES.includes(status) ? 'result' : 'timeline';
}

/**
 * What a Watch pane says when there is no live text — which is most of the time
 * for most members, and each reason is a different thing for the user to know.
 * A stale last line shown as though it were live is the one thing it must never
 * do.
 */
export function memberPaneText(status: MemberStatus, snapshot: MemberLiveSnapshot | null): string {
  // Only WHILE a turn is in flight. The text is retained after the turn ends,
  // and showing it then would be a finished turn dressed as a live one — the
  // session file already carries it, and the transcript reads it from there.
  if (snapshot?.turnId && snapshot.text) return snapshot.text;
  if (status === 'waiting') {
    return 'Its turn ended when it asked its question, so nothing is streaming and no turn is held. It picks up in the same session the moment a reply lands.';
  }
  if (status === 'retired' || status === 'completed') {
    return 'Its session is closed but kept. Open it to read everything it did.';
  }
  if (snapshot?.turnId) return 'Working. The turn has produced no text yet.';
  if (snapshot?.lastTurnStatus) return `Its last turn ${snapshot.lastTurnStatus}. Open its session to read it.`;
  return 'Nothing is streaming from this member right now.';
}

export interface SessionTurn {
  index: number;
  at: string;
  entries: PersistentSessionHistoryEntry[];
  compacted: boolean;
}

/** History arrives newest first; a transcript reads the other way. */
export function toSessionTurns(entries: PersistentSessionHistoryEntry[]): SessionTurn[] {
  const byIndex = new Map<number, SessionTurn>();
  for (const entry of [...entries].reverse()) {
    const turn = byIndex.get(entry.turnIndex)
      ?? { index: entry.turnIndex, at: entry.timestamp, entries: [], compacted: false };
    turn.entries.push(entry);
    if (entry.compactionBoundary) turn.compacted = true;
    byIndex.set(entry.turnIndex, turn);
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/** An entry's identity across re-reads: one turn writes one entry per role and text. */
const entryKey = (entry: PersistentSessionHistoryEntry): string =>
  `${entry.turnIndex}:${entry.timestamp}:${entry.role}:${entry.text}`;

/**
 * Combines two reads of one session's history, newest first.
 *
 * The newest page is re-read every time the member takes a turn, and it
 * overlaps whatever the user already opened further back. Without the dedupe
 * the same turn would appear twice in the transcript after every re-read.
 */
export function mergeHistory(
  newer: PersistentSessionHistoryEntry[],
  existing: PersistentSessionHistoryEntry[],
): PersistentSessionHistoryEntry[] {
  const seen = new Set<string>();
  return [...newer, ...existing].filter((entry) => {
    const key = entryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface ClaimOverlap {
  members: [string, string];
  patterns: [string, string];
}

/**
 * Pairs of active claims, held by different members, that can name one file.
 *
 * It uses the runtime's own overlap rule rather than a second one written for
 * the panel, so the warning the user reads is the warning the members were
 * given.
 */
export function claimOverlaps(claims: PathClaim[]): ClaimOverlap[] {
  const overlaps: ClaimOverlap[] = [];
  for (let left = 0; left < claims.length; left += 1) {
    for (let right = left + 1; right < claims.length; right += 1) {
      const [one, other] = [claims[left], claims[right]];
      if (one.memberId !== other.memberId && patternsOverlap(one.pattern, other.pattern)) {
        overlaps.push({ members: [one.memberId, other.memberId], patterns: [one.pattern, other.pattern] });
      }
    }
  }
  return overlaps;
}
