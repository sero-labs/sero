/**
 * Notifications store — the feed behind the bell.
 *
 * Live entries arrive as `notification` push events. A fresh page asks
 * for the recent feed, so a reminder fired overnight is still there in
 * the morning. A reconnect asks only for what came after the newest entry
 * it holds, because it already has the rest.
 *
 * Read state is not tracked here. The host owns it, and it reaches every
 * client through `notifications_read`.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage } from '@/lib/gateway-client';

/** Entries fetched in one backfill. */
const BACKFILL_LIMIT = 100;

/** Entries kept in the client. The host keeps more. */
const MAX_ENTRIES = 200;

export type NotificationSeverity = 'info' | 'warning' | 'error';

export interface Notification {
  id: string;
  /** Milliseconds since the epoch. */
  ts: number;
  source: string;
  severity: NotificationSeverity;
  message: string;
  workspaceId?: string;
  read: boolean;
}

interface NotificationsStore {
  /** Newest first. */
  notifications: Notification[];
  /** Fetch anything missed. Called on connect and on reconnect. */
  backfill: () => void;
  /** Mark entries read on the host, which tells every other client. */
  markRead: (ids: string[]) => void;
  /** Mark every unread entry read. Used when the feed is opened. */
  markAllRead: () => void;
  handleMessage: (msg: GatewayMessage) => void;
}

function readSeverity(value: unknown): NotificationSeverity {
  return value === 'warning' || value === 'error' ? value : 'info';
}

/** One entry from the wire, or null when the shape is wrong. */
function readNotification(value: unknown): Notification | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.message !== 'string') return null;
  if (typeof record.ts !== 'number') return null;

  return {
    id: record.id,
    ts: record.ts,
    source: typeof record.source === 'string' ? record.source : 'Sero',
    severity: readSeverity(record.notificationType),
    message: record.message,
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : undefined,
    read: record.read === true,
  };
}

/** Merge new entries in, newest first, without duplicates. */
function merge(existing: Notification[], incoming: Notification[]): Notification[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);

  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
}

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  notifications: [],

  backfill: () => {
    const client = useConnectionStore.getState().client;
    if (!client) return;
    // A fresh page holds nothing, so it asks for the recent feed. A
    // reconnect asks only for what came after the newest entry it has.
    const newest = get().notifications[0]?.ts;
    client.listNotifications(newest, BACKFILL_LIMIT);
  },

  markRead: (ids: string[]) => {
    if (ids.length === 0) return;
    const client = useConnectionStore.getState().client;
    if (!client) return;
    client.markNotificationsRead(ids);
  },

  markAllRead: () => {
    const unread = get().notifications.filter((entry) => !entry.read);
    get().markRead(unread.map((entry) => entry.id));
  },

  handleMessage: (msg: GatewayMessage) => {
    if (msg.type === 'notification') {
      const entry = readNotification(msg);
      if (!entry) return;
      set((s) => ({ notifications: merge(s.notifications, [entry]) }));
      return;
    }

    if (msg.type === 'notifications_read') {
      const ids = (msg as unknown as { ids?: unknown }).ids;
      if (!Array.isArray(ids)) return;
      const marked = new Set(ids.filter((id): id is string => typeof id === 'string'));
      set((s) => ({
        notifications: s.notifications.map((entry) =>
          marked.has(entry.id) ? { ...entry, read: true } : entry,
        ),
      }));
      return;
    }

    if (!('requestType' in msg) || msg.type !== 'ok') return;

    if (msg.requestType === 'list_notifications') {
      const data = (msg as { data?: unknown }).data;
      const entries = Array.isArray(data)
        ? data.map(readNotification).filter((entry): entry is Notification => entry !== null)
        : [];
      if (entries.length === 0) return;

      set((s) => ({ notifications: merge(s.notifications, entries) }));
      return;
    }

    // The workspace listing is the first response after a connect, so it
    // is the earliest point the backfill can run.
    if (msg.requestType === 'list_workspaces') get().backfill();
  },
}));

/** Entries not yet read. */
export function selectUnread(state: NotificationsStore): Notification[] {
  return state.notifications.filter((entry) => !entry.read);
}
