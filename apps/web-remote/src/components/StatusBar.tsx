/**
 * Status bar — `h-6 text-xs`, matching the desktop `StatusBar`.
 *
 * Left: connection state, workspace, token scope.
 * Right: theme cycle, product name.
 *
 * Hidden on mobile (see Layout.tsx); the title bar carries the theme
 * control there.
 */

import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { describeGatewayScope } from '@/lib/gateway-errors';
import { cn } from '@sero-ai/ui/lib/utils';
import { Circle, FolderOpen } from 'lucide-react';
import { ThemeModeButton } from './ThemeModeButton';

export function StatusBar() {
  const state = useConnectionStore((s) => s.state);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const scope = describeGatewayScope(workspaces, activeWorkspaceId);

  const statusColor = {
    disconnected: 'text-status-error',
    connecting: 'text-status-warning',
    authenticating: 'text-status-warning',
    reconnecting: 'text-status-warning',
    connected: 'text-status-success',
  }[state];

  const statusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    authenticating: 'Authenticating...',
    reconnecting: 'Reconnecting...',
    connected: 'Connected',
  }[state];

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-muted)]">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <Circle className={cn('size-2 fill-current', statusColor)} />
          {statusText}
        </span>
        {activeWorkspace && (
          <span className="flex items-center gap-1">
            <FolderOpen className="size-3" />
            {activeWorkspace.name}
          </span>
        )}
        {scope && <span>Scope: {scope.shortLabel}</span>}
      </div>

      <div className="flex items-center gap-2">
        <ThemeModeButton />
        <span>Sero Remote</span>
      </div>
    </footer>
  );
}
