/**
 * Board store — which sessions have news you have not seen.
 *
 * A session is unread when something happened after the last time you
 * opened it. The last-viewed stamp per session lives in IndexedDB, so
 * the marks survive a reload.
 *
 * The board itself reads sessions and live state from the workspace
 * store; this one only holds the marks.
 */

import { create } from 'zustand';
import { loadPref, savePref } from '@/lib/prefs-storage';
import type { Session, SessionTurn } from './workspace';
import type { SessionState } from '@/lib/gateway-client';

const PREF_KEY = 'board-last-viewed';

/** Sessions tracked. Beyond this the oldest marks are dropped. */
const MAX_TRACKED = 500;

interface BoardStore {
  /** Epoch milliseconds per session id, when you last opened it. */
  lastViewed: Record<string, number>;
  /** Record that a session was opened now. */
  markViewed: (sessionId: string) => void;
}

/** Keep the newest marks when the record grows too large. */
function capMarks(marks: Record<string, number>): Record<string, number> {
  const entries = Object.entries(marks);
  if (entries.length <= MAX_TRACKED) return marks;

  return Object.fromEntries(
    entries.sort(([, a], [, b]) => b - a).slice(0, MAX_TRACKED),
  );
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  lastViewed: {},

  markViewed: (sessionId: string) => {
    const lastViewed = capMarks({ ...get().lastViewed, [sessionId]: Date.now() });
    set({ lastViewed });
    void savePref(PREF_KEY, lastViewed);
  },
}));

/** Read the stored marks once at startup. */
export async function hydrateBoard(): Promise<void> {
  const stored = await loadPref(PREF_KEY);
  if (!stored || typeof stored !== 'object') return;

  const lastViewed: Record<string, number> = {};
  for (const [sessionId, ts] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof ts === 'number' && Number.isFinite(ts)) lastViewed[sessionId] = ts;
  }
  useBoardStore.setState({ lastViewed: capMarks(lastViewed) });
}

/**
 * When a session last did something, in epoch milliseconds.
 *
 * The listing timestamp is the file's, which lags a live turn. A finished
 * turn is newer, so whichever is later wins.
 */
export function activityAt(updatedAt: string, lastTurnTs?: number): number {
  const listed = new Date(updatedAt).getTime();
  const listedTs = Number.isFinite(listed) ? listed : 0;
  return Math.max(listedTs, lastTurnTs ?? 0);
}

/**
 * True when a session did something after you last opened it.
 *
 * A session you have never opened counts as unread only once it has
 * activity, so an empty new session does not shout for attention.
 */
export function isUnread(
  sessionId: string,
  activity: number,
  lastViewed: Record<string, number>,
  messageCount: number,
): boolean {
  const viewed = lastViewed[sessionId];
  if (viewed === undefined) return messageCount > 0;
  return activity > viewed;
}

/** One session as the board shows it. */
export interface BoardSession {
  session: Session;
  state?: SessionState;
  lastTurn?: SessionTurn;
  unread: boolean;
  /** Milliseconds since the epoch of the last activity. */
  activity: number;
}

/** Sessions that need you come first, then running ones. */
const STATE_ORDER: Record<string, number> = { awaiting_input: 0, running: 1 };

/** Rank a session for the board. Lower sorts first. */
function rank(entry: BoardSession): number {
  return STATE_ORDER[entry.state ?? ''] ?? 2;
}

/**
 * Board order: what needs you, then what is running, then the rest by
 * most recent activity.
 */
export function sortBoardSessions(entries: BoardSession[]): BoardSession[] {
  return [...entries].sort((a, b) => {
    const byState = rank(a) - rank(b);
    if (byState !== 0) return byState;
    return b.activity - a.activity;
  });
}
