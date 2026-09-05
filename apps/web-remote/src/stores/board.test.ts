import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const savePref = vi.fn(async (key: string, value: unknown) => {
  store.set(key, value);
});
const loadPref = vi.fn(async (key: string) => store.get(key) ?? null);

vi.mock('@/lib/prefs-storage', () => ({
  savePref: (key: string, value: unknown) => savePref(key, value),
  loadPref: (key: string) => loadPref(key),
}));

import {
  activityAt,
  hydrateBoard,
  isUnread,
  sortBoardSessions,
  useBoardStore,
  type BoardSession,
} from '@/stores/board';
import type { Session } from '@/stores/workspace';

function session(id: string, updatedAt: string, messageCount = 3): Session {
  return { id, name: id, workspaceId: 'ws-1', updatedAt, messageCount };
}

function entry(
  id: string,
  options: Partial<Omit<BoardSession, 'session'>> = {},
): BoardSession {
  return {
    session: session(id, '2026-09-04T10:00:00.000Z'),
    unread: false,
    activity: 0,
    ...options,
  };
}

describe('activityAt', () => {
  it('uses the listing time when no turn has finished', () => {
    expect(activityAt('2026-09-04T10:00:00.000Z')).toBe(Date.parse('2026-09-04T10:00:00.000Z'));
  });

  it('prefers a finished turn, which is newer than the file', () => {
    const turnTs = Date.parse('2026-09-04T11:00:00.000Z');

    expect(activityAt('2026-09-04T10:00:00.000Z', turnTs)).toBe(turnTs);
  });

  it('keeps the listing time when the turn is older', () => {
    const listed = Date.parse('2026-09-04T12:00:00.000Z');

    expect(activityAt('2026-09-04T12:00:00.000Z', 1000)).toBe(listed);
  });

  it('survives an unparseable timestamp', () => {
    expect(activityAt('not a date', 500)).toBe(500);
  });
});

describe('isUnread', () => {
  it('marks a session you never opened, once it has messages', () => {
    expect(isUnread('s1', 1000, {}, 3)).toBe(true);
  });

  it('leaves an empty session you never opened alone', () => {
    expect(isUnread('s1', 1000, {}, 0)).toBe(false);
  });

  it('marks a session that moved after you last opened it', () => {
    expect(isUnread('s1', 2000, { s1: 1000 }, 3)).toBe(true);
  });

  it('leaves a session that has not moved since you opened it', () => {
    expect(isUnread('s1', 1000, { s1: 2000 }, 3)).toBe(false);
  });
});

describe('sortBoardSessions', () => {
  it('puts what needs you first, then what is running', () => {
    const sorted = sortBoardSessions([
      entry('idle', { activity: 3000 }),
      entry('running', { state: 'running', activity: 1000 }),
      entry('needs-you', { state: 'awaiting_input', activity: 500 }),
    ]);

    expect(sorted.map((item) => item.session.id)).toEqual(['needs-you', 'running', 'idle']);
  });

  it('orders the rest by most recent activity', () => {
    const sorted = sortBoardSessions([
      entry('older', { activity: 1000 }),
      entry('newer', { activity: 5000 }),
    ]);

    expect(sorted.map((item) => item.session.id)).toEqual(['newer', 'older']);
  });

  it('leaves the input array untouched', () => {
    const entries = [entry('a', { activity: 1 }), entry('b', { activity: 2 })];

    sortBoardSessions(entries);

    expect(entries.map((item) => item.session.id)).toEqual(['a', 'b']);
  });
});

describe('board store', () => {
  beforeEach(() => {
    store.clear();
    savePref.mockClear();
    useBoardStore.setState({ lastViewed: {} });
  });

  it('records when a session was opened', () => {
    useBoardStore.getState().markViewed('s1');

    expect(useBoardStore.getState().lastViewed.s1).toBeGreaterThan(0);
    expect(savePref).toHaveBeenCalledWith('board-last-viewed', expect.any(Object));
  });

  it('restores the marks after a reload', async () => {
    useBoardStore.getState().markViewed('s1');
    const saved = useBoardStore.getState().lastViewed.s1;

    useBoardStore.setState({ lastViewed: {} });
    await hydrateBoard();

    expect(useBoardStore.getState().lastViewed.s1).toBe(saved);
  });

  it('starts clean when nothing was stored', async () => {
    await hydrateBoard();

    expect(useBoardStore.getState().lastViewed).toEqual({});
  });

  it('drops a stored mark that is not a number', async () => {
    store.set('board-last-viewed', { good: 1000, bad: 'yesterday' });

    await hydrateBoard();

    expect(useBoardStore.getState().lastViewed).toEqual({ good: 1000 });
  });
});
