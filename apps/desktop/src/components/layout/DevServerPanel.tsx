/**
 * DevServerPanel — StatusBar popover showing all registered dev servers.
 *
 * Displays server name, URL, framework badge, and controls
 * (open in browser, stop, restart, unregister).
 */

import { memo, useState } from 'react';
import {
  Globe,
  Square,
  RotateCcw,
  X,
  ExternalLink,
  Server,
  Loader2,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sero-ai/ui/components/ui/tooltip';
import { useDevServers, useRunningDevServerCount } from '@/stores/dev-server';
import { useAppStore } from '@/stores/app';
import { useBrowserStore } from '@/stores/browser';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';
import type { DevServer } from '@/types/ipc';

// ── Status indicator dot ────────────────────────────────────

function StatusDot({ status }: { status: DevServer['status'] }) {
  const colors: Record<DevServer['status'], string> = {
    running: 'bg-[var(--status-success)]',
    stopped: 'bg-[var(--status-error)]',
    starting: 'bg-[var(--status-warning)] animate-pulse',
    failed: 'bg-[var(--status-error)]',
  };
  return <span className={`inline-block size-2 rounded-full ${colors[status]}`} />;
}

// ── Framework badge ─────────────────────────────────────────

function FrameworkBadge({ framework }: { framework?: string }) {
  if (!framework) return null;
  return (
    <span className="rounded-sm bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
      {framework}
    </span>
  );
}

// ── Server row ──────────────────────────────────────────────

function ServerRow({ server }: { server: DevServer }) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (
    action: 'stop' | 'restart' | 'unregister' | 'open',
  ) => {
    setLoading(action);
    try {
      switch (action) {
        case 'stop':
          await window.sero.devServer.stop(server.id);
          break;
        case 'restart':
          await window.sero.devServer.restart(server.id);
          break;
        case 'unregister':
          await window.sero.devServer.unregister(server.id);
          break;
        case 'open': {
          useWorkspaceStore.getState().setActiveWorkspace(server.workspaceId);
          useAppStore.getState().setActiveApp('explorer');
          useExplorerStore.getState().set(server.workspaceId, {
            activePanel: 'browser',
            sidebarOpen: false,
          });
          useBrowserStore.getState().createTab(server.workspaceId, server.url);
          break;
        }
      }
    } catch (err) {
      console.error(`[dev-server] ${action} failed:`, err);
    } finally {
      setLoading(null);
    }
  };

  const isActionLoading = (action: string) => loading === action;

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bg-elevated)]">
      {/* Status + name */}
      <StatusDot status={server.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-[var(--text-primary)]">
            {server.name}
          </span>
          <FrameworkBadge framework={server.framework} />
          {server.scope === 'card-preview' && (
            <span className="rounded-sm bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
              Preview{server.cardId ? ` #${server.cardId}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <span>:{server.port}</span>
          <span className="text-[var(--text-muted)]/50">·</span>
          <button
            className="truncate hover:text-[var(--text-secondary)] hover:underline"
            onClick={() => handleAction('open')}
            title="Open in Sero browser"
          >
            {server.url}
          </button>
        </div>
      </div>

      {/* Action buttons (visible on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionButton
          icon={<ExternalLink className="size-3" />}
          tooltip="Open in Sero browser"
          onClick={() => handleAction('open')}
          loading={isActionLoading('open')}
        />
        {server.status === 'running' ? (
          <ActionButton
            icon={<Square className="size-3" />}
            tooltip="Stop"
            onClick={() => handleAction('stop')}
            loading={isActionLoading('stop')}
          />
        ) : (
          <ActionButton
            icon={<RotateCcw className="size-3" />}
            tooltip="Restart"
            onClick={() => handleAction('restart')}
            loading={isActionLoading('restart')}
          />
        )}
        <ActionButton
          icon={<X className="size-3" />}
          tooltip="Remove"
          onClick={() => handleAction('unregister')}
          loading={isActionLoading('unregister')}
          destructive
        />
      </div>
    </div>
  );
}

// ── Action button ───────────────────────────────────────────

function ActionButton({
  icon,
  tooltip,
  onClick,
  loading,
  destructive,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  loading: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`rounded p-1 transition-colors ${
            destructive
              ? 'hover:bg-[var(--status-error-muted)] hover:text-[var(--status-error)]'
              : 'hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
          } text-[var(--text-muted)]`}
          onClick={onClick}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Main popover ────────────────────────────────────────────

export const DevServerIndicator = memo(function DevServerIndicator() {
  const servers = useDevServers();
  const runningCount = useRunningDevServerCount();

  if (servers.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          title="Dev Servers"
        >
          <Globe className="size-3" />
          <span>
            {runningCount}/{servers.length}
          </span>
          {runningCount > 0 && (
            <span className="size-1.5 rounded-full bg-[var(--status-success)]" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="border-b border-[var(--border-default)] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Server className="size-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-medium text-[var(--text-primary)]">
              Dev Servers
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              ({runningCount} running)
            </span>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {servers.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">
              No dev servers registered
            </p>
          ) : (
            servers.map((server) => (
              <ServerRow key={server.id} server={server} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
