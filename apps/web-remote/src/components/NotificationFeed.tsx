/**
 * Notification feed — the list behind the bell.
 *
 * Rows use the dashboard `ActivityList` from `@sero-ai/ui`, so a feed row
 * looks the same here as it does in a dashboard widget. The dashboard
 * tones carry the same names as the severities, so one passes to the other.
 *
 * Dismissing removes the entry on the host, so it goes from every client.
 * The row disappears only when the host confirms, the same rule the
 * session list follows.
 */

import { BellOff, X } from 'lucide-react';
import { ActivityList, ActivityListItem, EmptyState } from '@sero-ai/ui';
import { formatRelativeDate } from '@/lib/format-relative-date';
import { useNotificationsStore, type Notification } from '@/stores/notifications';
import { useWorkspaceStore } from '@/stores/workspace';

export function NotificationFeed() {
  const notifications = useNotificationsStore((s) => s.notifications);
  const dismiss = useNotificationsStore((s) => s.dismiss);
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
          className={entry.read ? 'group opacity-60' : 'group'}
          tone={entry.severity}
          label={entry.message}
          timestamp={
            <span className="flex items-center gap-1">
              {formatRelativeDate(new Date(entry.ts).toISOString())}
              {/* A phone has no hover, so the control stays visible, and
                  the target is finger-sized like the session row's. */}
              <button
                type="button"
                aria-label="Dismiss notification"
                title="Dismiss"
                data-testid="notification-dismiss"
                onClick={() => dismiss([entry.id])}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-status-error"
              >
                <X className="size-3.5" />
              </button>
            </span>
          }
          detail={detailFor(entry, workspaceNames)}
        />
      ))}
    </ActivityList>
  );
}

/**
 * Clear the read entries. Shown beside the feed's title.
 *
 * Only read entries go, so an entry that arrived while the panel was open
 * is never swept away before it has been seen.
 */
export function ClearReadButton() {
  const readCount = useNotificationsStore(
    (s) => s.notifications.filter((entry) => entry.read).length,
  );
  const clearRead = useNotificationsStore((s) => s.clearRead);

  if (readCount === 0) return null;

  return (
    <button
      type="button"
      data-testid="notification-clear-read"
      onClick={() => clearRead()}
      className="rounded px-1.5 py-0.5 text-sm font-normal text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
    >
      Clear read
    </button>
  );
}

/** The source, and the workspace when there is one. */
function detailFor(entry: Notification, workspaceNames: Map<string, string>): string {
  const workspaceName = entry.workspaceId ? workspaceNames.get(entry.workspaceId) : undefined;
  return workspaceName ? `${entry.source} · ${workspaceName}` : entry.source;
}
