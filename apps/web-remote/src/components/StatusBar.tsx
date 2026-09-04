/**
 * Status bar, connection status, workspace info, version.
 * Hidden on mobile (see Layout.tsx).
 */

import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { describeGatewayScope } from '@/lib/gateway-errors';
import { cn } from '@sero-ai/ui/lib/utils';
import { Separator } from '@sero-ai/ui/components/ui/separator';
import { Button } from '@sero-ai/ui/components/ui/button';
import { useThemeStore } from '@/stores/theme';
import { Circle, Monitor, Moon, Sun } from 'lucide-react';

export function StatusBar() {
  const state = useConnectionStore((s) => s.state);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);

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
    <div className="h-7 px-3 bg-card border-t border-border flex items-center justify-between text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <Circle className={cn('size-2 fill-current', statusColor)} />
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
        {scope && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span className="text-foreground/60">
              Scope: {scope.shortLabel}
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
        <ThemeModeButton />
        <span>Sero Remote</span>
      </div>
    </div>
  );
}

/** Cycle dark → light → system, matching the desktop theme control. */
export function ThemeModeButton() {
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);

  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;
  const label = mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'System';

  return (
    <Button
      onClick={cycleMode}
      variant="ghost"
      size="icon-xs"
      title={`Theme: ${label} (click to change)`}
      aria-label={`Theme: ${label}. Click to change.`}
    >
      <Icon className="size-3" />
    </Button>
  );
}
