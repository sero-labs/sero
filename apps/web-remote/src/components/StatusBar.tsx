/**
 * Status bar — connection status, workspace info, version.
 * Hidden on mobile (see Layout.tsx).
 */

import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@sero/ui/lib/utils';
import { Separator } from '@sero/ui/components/ui/separator';
import { Circle } from 'lucide-react';

export function StatusBar() {
  const state = useConnectionStore((s) => s.state);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const statusColor = {
    disconnected: 'text-destructive',
    connecting: 'text-yellow-500',
    authenticating: 'text-yellow-500',
    reconnecting: 'text-yellow-500',
    connected: 'text-green-500',
  }[state];

  const statusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    authenticating: 'Authenticating...',
    reconnecting: 'Reconnecting...',
    connected: 'Connected',
  }[state];

  return (
    <div className="h-7 px-3 bg-card border-t border-border flex items-center justify-between text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <Circle className={cn('w-2 h-2 fill-current', statusColor)} />
          {statusText}
        </span>
        {activeWorkspace && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span className="text-foreground/60">
              {activeWorkspace.name}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {activeSessionId && (
          <span className="text-foreground/60 truncate max-w-[200px]">
            Session: {activeSessionId}
          </span>
        )}
        <span>Sero Remote</span>
      </div>
    </div>
  );
}
