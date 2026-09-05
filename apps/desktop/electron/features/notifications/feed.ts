/**
 * Notification feed — the one place a notification is raised.
 *
 * Every origin calls `notify()`. It shows the desktop toast, appends the
 * entry to a capped log on disk, and hands it to every subscriber, which
 * is how it reaches the gateway and the phone.
 *
 * The log survives a restart. It is rewritten whole when it outgrows its
 * cap, which is cheap at 500 entries and needs no compaction pass.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { SERO_HOME } from '@electron/platform/env';
import { showNotification } from '@electron/platform/desktop/notifications';
import type {
  ListNotificationsOptions,
  NotificationEntry,
  NotifyOptions,
} from './types';

/** Entries kept. The oldest are dropped first. */
export const MAX_ENTRIES = 500;

/** Entries returned when a caller asks for no limit. */
export const DEFAULT_LIST_LIMIT = 100;

type Subscriber = (entry: NotificationEntry) => void;
type ReadSubscriber = (ids: string[]) => void;
type DismissSubscriber = (ids: string[]) => void;

/**
 * Whether a caller may act on an entry.
 *
 * Marking an entry read needs no such test: it changes nothing a caller
 * could not already read. Removing one does, so every remove takes this.
 */
export type EntryVisibility = (entry: NotificationEntry) => boolean;

export class NotificationFeed {
  private entries: NotificationEntry[] = [];
  private subscribers = new Set<Subscriber>();
  private readSubscribers = new Set<ReadSubscriber>();
  private dismissSubscribers = new Set<DismissSubscriber>();
  private readonly logPath: string;
  private loaded = false;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  /** Read the log from disk. Safe to call more than once. */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    let raw: string;
    try {
      raw = fs.readFileSync(this.logPath, 'utf8');
    } catch {
      // No log yet, or it cannot be read. Start empty.
      return;
    }

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const entry = parseEntry(line);
      if (entry) this.entries.push(entry);
    }
    this.trim();
  }

  /**
   * Raise a notification: toast, record, fan out.
   * Returns the entry so a caller can reference it later.
   */
  notify(options: NotifyOptions): NotificationEntry {
    this.load();

    const entry: NotificationEntry = {
      id: randomUUID(),
      ts: Date.now(),
      source: options.source ?? 'Sero',
      type: options.type ?? 'info',
      message: options.message,
      workspaceId: options.workspaceId,
      read: false,
    };

    if (!options.silentOnDesktop) {
      showNotification({
        message: options.message,
        type: entry.type,
        source: options.source,
        sound: options.sound,
        subtitle: options.subtitle,
        onClick: options.onClick,
      });
    }

    this.entries.push(entry);
    this.trim();
    this.persist();

    for (const subscriber of this.subscribers) subscriber(entry);
    return entry;
  }

  /** Entries newest first, optionally only those after `since`. */
  list(options: ListNotificationsOptions = {}): NotificationEntry[] {
    this.load();
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_ENTRIES);

    return this.entries
      .filter((entry) => (options.since === undefined ? true : entry.ts > options.since))
      .slice(-limit)
      .reverse();
  }

  /** Mark entries read. Returns the ids that changed. */
  markRead(ids: string[]): string[] {
    this.load();
    const wanted = new Set(ids);
    const changed: string[] = [];

    for (const entry of this.entries) {
      if (!wanted.has(entry.id) || entry.read) continue;
      entry.read = true;
      changed.push(entry.id);
    }

    if (changed.length > 0) {
      this.persist();
      for (const subscriber of this.readSubscribers) subscriber(changed);
    }
    return changed;
  }

  /**
   * Remove entries by id. Returns the ids actually removed.
   *
   * `canSee` decides what this caller is allowed to remove. The test and
   * the removal run in one pass, so nothing can be removed on the
   * strength of a listing that has since changed.
   */
  dismiss(ids: string[], canSee: EntryVisibility = () => true): string[] {
    this.load();
    const wanted = new Set(ids);
    const removed: string[] = [];

    this.entries = this.entries.filter((entry) => {
      if (!wanted.has(entry.id) || !canSee(entry)) return true;
      removed.push(entry.id);
      return false;
    });

    if (removed.length > 0) this.commitRemoval(removed);
    return removed;
  }

  /**
   * Remove every read entry this caller can see. Returns the ids removed.
   *
   * Unread entries stay, so an entry that arrived seconds ago is never
   * swept away before anyone has seen it.
   */
  clearRead(canSee: EntryVisibility = () => true): string[] {
    this.load();
    const removed: string[] = [];

    this.entries = this.entries.filter((entry) => {
      if (!entry.read || !canSee(entry)) return true;
      removed.push(entry.id);
      return false;
    });

    if (removed.length > 0) this.commitRemoval(removed);
    return removed;
  }

  /** Write the shortened log, then tell everyone what went. */
  private commitRemoval(removed: string[]): void {
    this.persist();
    for (const subscriber of this.dismissSubscribers) subscriber(removed);
  }

  /** Unread entries, for a badge count. */
  unreadCount(): number {
    this.load();
    return this.entries.filter((entry) => !entry.read).length;
  }

  /** Called for every new entry. Returns an unsubscribe function. */
  subscribe(handler: Subscriber): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  /** Called with the ids whenever entries are marked read. */
  subscribeRead(handler: ReadSubscriber): () => void {
    this.readSubscribers.add(handler);
    return () => this.readSubscribers.delete(handler);
  }

  /** Called with the ids whenever entries are removed. */
  subscribeDismissed(handler: DismissSubscriber): () => void {
    this.dismissSubscribers.add(handler);
    return () => this.dismissSubscribers.delete(handler);
  }

  private trim(): void {
    if (this.entries.length <= MAX_ENTRIES) return;
    this.entries = this.entries.slice(-MAX_ENTRIES);
  }

  private persist(): void {
    const body = this.entries.map((entry) => JSON.stringify(entry)).join('\n');
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      fs.writeFileSync(this.logPath, body ? `${body}\n` : '', 'utf8');
    } catch (err) {
      // A feed that cannot be written is still a feed for this session.
      console.warn('[notifications] Could not write the feed log:', err);
    }
  }
}

function parseEntry(line: string): NotificationEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.message !== 'string') return null;
  if (typeof record.ts !== 'number') return null;

  return {
    id: record.id,
    ts: record.ts,
    source: typeof record.source === 'string' ? record.source : 'Sero',
    type: record.type === 'warning' || record.type === 'error' ? record.type : 'info',
    message: record.message,
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : undefined,
    read: record.read === true,
  };
}

let feed: NotificationFeed | null = null;

/** The one feed for this process. */
export function getNotificationFeed(): NotificationFeed {
  feed ??= new NotificationFeed(path.join(SERO_HOME, 'notifications.jsonl'));
  return feed;
}

/**
 * Raise a notification. Every origin calls this, never `showNotification`.
 */
export function notify(options: NotifyOptions): NotificationEntry {
  return getNotificationFeed().notify(options);
}
