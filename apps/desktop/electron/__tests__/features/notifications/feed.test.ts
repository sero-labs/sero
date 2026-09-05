import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The feed shows a desktop toast, which needs Electron. The toast itself
// is not under test here, so it is replaced with a spy.
const showNotification = vi.fn();
vi.mock('@electron/platform/desktop/notifications', () => ({
  showNotification: (options: unknown) => showNotification(options),
}));

import { MAX_ENTRIES, NotificationFeed } from '@electron/features/notifications/feed';

const dirs: string[] = [];

function makeFeed(): { feed: NotificationFeed; logPath: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'sero-notifications-'));
  dirs.push(dir);
  const logPath = path.join(dir, 'notifications.jsonl');
  return { feed: new NotificationFeed(logPath), logPath };
}

afterEach(() => {
  showNotification.mockClear();
  for (const dir of dirs.splice(0, dirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('raising a notification', () => {
  it('shows the desktop toast and records the entry', () => {
    const { feed } = makeFeed();

    const entry = feed.notify({ message: 'Build finished', source: 'Reminder' });

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(entry.read).toBe(false);
    expect(feed.list()[0]).toMatchObject({ message: 'Build finished', source: 'Reminder' });
  });

  it('records without a toast when the caller asks for silence', () => {
    const { feed } = makeFeed();

    feed.notify({ message: 'Turn finished', silentOnDesktop: true });

    expect(showNotification).not.toHaveBeenCalled();
    expect(feed.list()).toHaveLength(1);
  });

  it('keeps the workspace an entry belongs to', () => {
    const { feed } = makeFeed();

    feed.notify({ message: 'Container recreated', workspaceId: 'ws-1' });

    expect(feed.list()[0]?.workspaceId).toBe('ws-1');
  });

  it('hands each entry to its subscribers', () => {
    const { feed } = makeFeed();
    const seen: string[] = [];
    feed.subscribe((entry) => seen.push(entry.message));

    feed.notify({ message: 'one' });
    feed.notify({ message: 'two' });

    expect(seen).toEqual(['one', 'two']);
  });

  it('stops calling a subscriber that unsubscribed', () => {
    const { feed } = makeFeed();
    const seen: string[] = [];
    const stop = feed.subscribe((entry) => seen.push(entry.message));

    feed.notify({ message: 'one' });
    stop();
    feed.notify({ message: 'two' });

    expect(seen).toEqual(['one']);
  });
});

describe('reading the feed', () => {
  it('returns entries newest first', () => {
    const { feed } = makeFeed();
    feed.notify({ message: 'older' });
    feed.notify({ message: 'newer' });

    expect(feed.list().map((entry) => entry.message)).toEqual(['newer', 'older']);
  });

  it('returns only entries after a given time', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-04T10:00:00Z'));
      const { feed } = makeFeed();
      const first = feed.notify({ message: 'older' });

      vi.setSystemTime(new Date('2026-09-04T10:00:01Z'));
      feed.notify({ message: 'newer' });

      expect(feed.list({ since: first.ts }).map((entry) => entry.message)).toEqual(['newer']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours a limit', () => {
    const { feed } = makeFeed();
    for (let i = 0; i < 5; i += 1) feed.notify({ message: `entry ${i}` });

    expect(feed.list({ limit: 2 })).toHaveLength(2);
  });
});

describe('marking read', () => {
  it('marks the named entries and reports what changed', () => {
    const { feed } = makeFeed();
    const first = feed.notify({ message: 'one' });
    feed.notify({ message: 'two' });

    expect(feed.markRead([first.id])).toEqual([first.id]);
    expect(feed.unreadCount()).toBe(1);
  });

  it('reports nothing when an entry is already read', () => {
    const { feed } = makeFeed();
    const entry = feed.notify({ message: 'one' });
    feed.markRead([entry.id]);

    expect(feed.markRead([entry.id])).toEqual([]);
  });

  it('ignores an id the feed does not hold', () => {
    const { feed } = makeFeed();
    feed.notify({ message: 'one' });

    expect(feed.markRead(['not-here'])).toEqual([]);
    expect(feed.unreadCount()).toBe(1);
  });

  it('tells its read subscribers which ids changed', () => {
    const { feed } = makeFeed();
    const seen: string[][] = [];
    feed.subscribeRead((ids) => seen.push(ids));
    const entry = feed.notify({ message: 'one' });

    feed.markRead([entry.id]);

    expect(seen).toEqual([[entry.id]]);
  });
});

describe('dismissing entries', () => {
  it('removes the named entries and reports what went', () => {
    const { feed } = makeFeed();
    const keep = feed.notify({ message: 'Keep me' });
    const drop = feed.notify({ message: 'Drop me' });

    expect(feed.dismiss([drop.id])).toEqual([drop.id]);
    expect(feed.list().map((entry) => entry.id)).toEqual([keep.id]);
  });

  it('ignores an id the feed does not hold', () => {
    const { feed } = makeFeed();
    feed.notify({ message: 'Only entry' });

    expect(feed.dismiss(['not-a-real-id'])).toEqual([]);
    expect(feed.list()).toHaveLength(1);
  });

  it('removes only what the caller is allowed to see', () => {
    const { feed } = makeFeed();
    const mine = feed.notify({ message: 'Mine', workspaceId: 'workspace-a' });
    const theirs = feed.notify({ message: 'Theirs', workspaceId: 'workspace-b' });

    // A scoped token must not be able to delete another workspace's entry.
    const removed = feed.dismiss(
      [mine.id, theirs.id],
      (entry) => entry.workspaceId === 'workspace-a',
    );

    expect(removed).toEqual([mine.id]);
    expect(feed.list().map((entry) => entry.id)).toEqual([theirs.id]);
  });

  it('tells its dismiss subscribers which ids went', () => {
    const { feed } = makeFeed();
    const seen: string[][] = [];
    feed.subscribeDismissed((ids) => seen.push(ids));

    const entry = feed.notify({ message: 'Going' });
    feed.dismiss([entry.id]);

    expect(seen).toEqual([[entry.id]]);
  });

  it('tells nobody when nothing was removed', () => {
    const { feed } = makeFeed();
    const seen: string[][] = [];
    feed.subscribeDismissed((ids) => seen.push(ids));

    feed.dismiss(['not-a-real-id']);

    expect(seen).toEqual([]);
  });

  it('keeps a dismissed entry gone across a restart', () => {
    const { feed, logPath } = makeFeed();
    const keep = feed.notify({ message: 'Keep me' });
    const drop = feed.notify({ message: 'Drop me' });
    feed.dismiss([drop.id]);

    const reopened = new NotificationFeed(logPath);
    expect(reopened.list().map((entry) => entry.id)).toEqual([keep.id]);
  });
});

describe('clearing read entries', () => {
  it('removes read entries and keeps unread ones', () => {
    const { feed } = makeFeed();
    const read = feed.notify({ message: 'Already seen' });
    const unread = feed.notify({ message: 'Just arrived' });
    feed.markRead([read.id]);

    expect(feed.clearRead()).toEqual([read.id]);
    expect(feed.list().map((entry) => entry.id)).toEqual([unread.id]);
  });

  it('clears only what the caller is allowed to see', () => {
    const { feed } = makeFeed();
    const mine = feed.notify({ message: 'Mine', workspaceId: 'workspace-a' });
    const theirs = feed.notify({ message: 'Theirs', workspaceId: 'workspace-b' });
    feed.markRead([mine.id, theirs.id]);

    const removed = feed.clearRead((entry) => entry.workspaceId === 'workspace-a');

    expect(removed).toEqual([mine.id]);
    expect(feed.list().map((entry) => entry.id)).toEqual([theirs.id]);
  });

  it('removes nothing when every entry is unread', () => {
    const { feed } = makeFeed();
    feed.notify({ message: 'Just arrived' });

    expect(feed.clearRead()).toEqual([]);
    expect(feed.list()).toHaveLength(1);
  });
});

describe('the log on disk', () => {
  it('survives a restart', () => {
    const { feed, logPath } = makeFeed();
    feed.notify({ message: 'before the restart', workspaceId: 'ws-1' });

    const reopened = new NotificationFeed(logPath);

    expect(reopened.list().map((entry) => entry.message)).toEqual(['before the restart']);
    expect(reopened.unreadCount()).toBe(1);
  });

  it('keeps a read entry read across a restart', () => {
    const { feed, logPath } = makeFeed();
    const entry = feed.notify({ message: 'one' });
    feed.markRead([entry.id]);

    expect(new NotificationFeed(logPath).unreadCount()).toBe(0);
  });

  it('caps the log, dropping the oldest first', () => {
    const { feed, logPath } = makeFeed();
    for (let i = 0; i < MAX_ENTRIES + 10; i += 1) feed.notify({ message: `entry ${i}` });

    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(MAX_ENTRIES);
    expect(feed.list({ limit: MAX_ENTRIES })).toHaveLength(MAX_ENTRIES);
    // Entry 0 is gone; the newest is still there.
    expect(feed.list()[0]?.message).toBe(`entry ${MAX_ENTRIES + 9}`);
  });

  it('starts empty when there is no log yet', () => {
    const { feed } = makeFeed();

    expect(feed.list()).toEqual([]);
  });

  it('skips a corrupt line rather than losing the whole log', () => {
    const { logPath } = makeFeed();
    writeFileSync(
      logPath,
      [
        JSON.stringify({ id: 'a', ts: 1, source: 'S', type: 'info', message: 'kept', read: false }),
        'not json at all',
        JSON.stringify({ id: 'b', ts: 2, message: 42 }),
        JSON.stringify({ id: 'c', ts: 3, source: 'S', type: 'error', message: 'also kept', read: true }),
      ].join('\n'),
      'utf8',
    );

    const feed = new NotificationFeed(logPath);

    expect(feed.list().map((entry) => entry.message)).toEqual(['also kept', 'kept']);
    expect(feed.unreadCount()).toBe(1);
  });
});
