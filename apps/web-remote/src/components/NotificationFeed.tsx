/**
 * Notification feed — the list behind the bell.
 *
 * Rows use the dashboard `ActivityList` from `@sero-ai/ui`, so a feed row
 * looks the same here as it does in a dashboard widget. The dashboard
 * tones carry the same names as the severities, so one passes to the other.
 */

import { BellOff } from 'lucide-react';
import { ActivityList, ActivityListItem, EmptyState } from '@sero-ai/ui';
import { formatRelativeDate } from '@/lib/format-relative-date';
import { useNotificationsStore, type Notification } from '@/stores/notifications';
import { useWorkspaceStore } from '@/stores/workspace';

export function NotificationFeed() {
  const notifications = useNotificationsStore((s) => s.notifications);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="Nothing yet"
        message="Reminders and finished turns show up here."
      />
    );
  }

  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  return (
    <ActivityList className="px-1 py-1">
      {notifications.map((entry) => (
        <ActivityListItem
          key={entry.id}
          data-testid="notification-row"
          className={entry.read ? 'opacity-60' : undefined}
          tone={entry.severity}
          label={entry.message}
          timestamp={formatRelativeDate(new Date(entry.ts).toISOString())}
          detail={detailFor(entry, workspaceNames)}
        />
      ))}
    </ActivityList>
  );
}

/** The source, and the workspace when there is one. */
function detailFor(entry: Notification, workspaceNames: Map<string, string>): string {
  const workspaceName = entry.workspaceId ? workspaceNames.get(entry.workspaceId) : undefined;
  return workspaceName ? `${entry.source} · ${workspaceName}` : entry.source;
}
