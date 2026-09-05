import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { selectUnread, useNotificationsStore } from '@/stores/notifications';
import type { GatewayMessage } from '@/lib/gateway-client';

const listNotifications = vi.fn((_since?: number, _limit?: number) => {});
const markNotificationsRead = vi.fn((_ids: string[]) => {});
const dismissNotifications = vi.fn((_ids: string[]) => {});
const clearReadNotifications = vi.fn(() => {});

function pushed(id: string, ts: number, extra: Record<string, unknown> = {}): GatewayMessage {
  return {
    type: 'notification',
    id,
    ts,
    source: 'Reminder',
    notificationType: 'info',
    message: `entry ${id}`,
    read: false,
    ...extra,
  } as unknown as GatewayMessage;
}

describe('notifications store', () => {
  beforeEach(() => {
    listNotifications.mockClear();
    markNotificationsRead.mockClear();
    dismissNotifications.mockClear();
    clearReadNotifications.mockClear();
    useConnectionStore.setState({
      client: {
        listNotifications,
        markNotificationsRead,
        dismissNotifications,
        clearReadNotifications,
      } as unknown as never,
    });
    useNotificationsStore.setState({ notifications: [] });
  });

  it('shows an entry that arrives', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000));

    expect(useNotificationsStore.getState().notifications).toHaveLength(1);
    expect(selectUnread(useNotificationsStore.getState())).toHaveLength(1);
  });

  it('keeps entries newest first', () => {
    useNotificationsStore.getState().handleMessage(pushed('older', 1000));
    useNotificationsStore.getState().handleMessage(pushed('newer', 2000));

    expect(useNotificationsStore.getState().notifications.map((entry) => entry.id))
      .toEqual(['newer', 'older']);
  });

  it('counts only unread entries', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000));
    useNotificationsStore.getState().handleMessage(pushed('n2', 2000, { read: true }));

    expect(selectUnread(useNotificationsStore.getState())).toHaveLength(1);
  });

  it('does not show the same entry twice', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000));
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000));

    expect(useNotificationsStore.getState().notifications).toHaveLength(1);
  });

  it('ignores a malformed entry', () => {
    useNotificationsStore.getState().handleMessage({
      type: 'notification',
      id: 'n1',
    } as unknown as GatewayMessage);

    expect(useNotificationsStore.getState().notifications).toEqual([]);
  });

  it('asks for the recent feed when it holds nothing', () => {
    useNotificationsStore.getState().backfill();

    expect(listNotifications).toHaveBeenCalledWith(undefined, 100);
  });

  it('asks only for what came after its newest entry on a reconnect', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 5000));

    useNotificationsStore.getState().backfill();

    expect(listNotifications).toHaveBeenCalledWith(5000, 100);
  });

  it('backfills once the workspaces arrive after a reconnect', () => {
    useNotificationsStore.getState().handleMessage({
      type: 'ok',
      requestType: 'list_workspaces',
      data: [],
    } as GatewayMessage);

    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it('adds the entries a backfill returns', () => {
    useNotificationsStore.getState().handleMessage({
      type: 'ok',
      requestType: 'list_notifications',
      data: [
        { id: 'n1', ts: 1000, source: 'Reminder', notificationType: 'warning', message: 'one', read: false },
        { id: 'n2', ts: 2000, source: 'Session', notificationType: 'info', message: 'two', read: true },
      ],
    } as GatewayMessage);

    const { notifications } = useNotificationsStore.getState();
    expect(notifications.map((entry) => entry.id)).toEqual(['n2', 'n1']);
    expect(notifications[1]?.severity).toBe('warning');
    expect(selectUnread(useNotificationsStore.getState())).toHaveLength(1);
  });

  it('marks every unread entry read when the feed is opened', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000));
    useNotificationsStore.getState().handleMessage(pushed('n2', 2000, { read: true }));

    useNotificationsStore.getState().markAllRead();

    expect(markNotificationsRead).toHaveBeenCalledWith(['n1']);
  });

  it('sends nothing when there is nothing unread', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000, { read: true }));

    useNotificationsStore.getState().markAllRead();

    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it('clears the badge when another client reads the entries', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000));

    useNotificationsStore.getState().handleMessage({
      type: 'notifications_read',
      ids: ['n1'],
      ts: Date.now(),
    } as unknown as GatewayMessage);

    expect(selectUnread(useNotificationsStore.getState())).toEqual([]);
  });

  it('ignores read ids it never held', () => {
    useNotificationsStore.getState().handleMessage(pushed('n1', 1000));

    useNotificationsStore.getState().handleMessage({
      type: 'notifications_read',
      ids: ['other'],
      ts: Date.now(),
    } as unknown as GatewayMessage);

    expect(selectUnread(useNotificationsStore.getState())).toHaveLength(1);
  });

  it('sends nothing while disconnected', () => {
    useConnectionStore.setState({ client: null as unknown as never });

    useNotificationsStore.getState().backfill();

    expect(listNotifications).not.toHaveBeenCalled();
  });

  it('asks the host to dismiss, and keeps the row until it confirms', () => {
    const store = useNotificationsStore.getState();
    store.handleMessage(pushed('n1', 1000));
    store.handleMessage(pushed('n2', 2000));

    store.dismiss(['n1']);

    expect(dismissNotifications).toHaveBeenCalledWith(['n1']);
    // Nothing is removed optimistically: a refused delete must leave it.
    expect(useNotificationsStore.getState().notifications).toHaveLength(2);
  });

  it('drops the entries the host says went', () => {
    const store = useNotificationsStore.getState();
    store.handleMessage(pushed('n1', 1000));
    store.handleMessage(pushed('n2', 2000));

    store.handleMessage({
      type: 'notifications_dismissed',
      ids: ['n1'],
      ts: 3000,
    } as unknown as GatewayMessage);

    expect(
      useNotificationsStore.getState().notifications.map((entry) => entry.id),
    ).toEqual(['n2']);
  });

  it('ignores ids it never held', () => {
    const store = useNotificationsStore.getState();
    store.handleMessage(pushed('n1', 1000));

    store.handleMessage({
      type: 'notifications_dismissed',
      ids: ['someone-elses'],
      ts: 3000,
    } as unknown as GatewayMessage);

    expect(useNotificationsStore.getState().notifications).toHaveLength(1);
  });

  it('sends a clear-read request without touching the feed itself', () => {
    const store = useNotificationsStore.getState();
    store.handleMessage(pushed('n1', 1000, { read: true }));

    store.clearRead();

    expect(clearReadNotifications).toHaveBeenCalledTimes(1);
    expect(useNotificationsStore.getState().notifications).toHaveLength(1);
  });

  it('sends nothing when there is nothing to dismiss', () => {
    useNotificationsStore.getState().dismiss([]);

    expect(dismissNotifications).not.toHaveBeenCalled();
  });
});
