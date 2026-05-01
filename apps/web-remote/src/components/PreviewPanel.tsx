/**
 * PreviewPanel — lists registered dev servers for the active workspace
 * and lets the user open one in an embedded iframe (or new tab) via the
 * gateway's `/p/<workspace>/<port>/...` reverse proxy.
 */

import { useEffect, useState } from 'react';
import { useDevServerStore, type DevServer } from '@/stores/dev-servers';
import { useWorkspaceStore } from '@/stores/workspace';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Globe,
  ExternalLink,
  RefreshCw,
  X,
  ArrowLeftRight,
} from 'lucide-react';

interface ActivePreview {
  serverId: string;
  url: string;
  workspaceId: string;
  port: number;
}

function StatusDot({ status }: { status: DevServer['status'] }) {
  const color =
    status === 'running'
      ? 'bg-emerald-500'
      : status === 'starting'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40';
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${color}`}
      aria-label={status}
    />
  );
}

export function PreviewPanel() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const servers = useDevServerStore((s) => s.servers);
  const fetchServers = useDevServerStore((s) => s.fetchServers);
  const openServer = useDevServerStore((s) => s.openServer);
  const isLoading = useDevServerStore((s) => s.isLoading);
  const [active, setActive] = useState<ActivePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh when the workspace changes — registered servers are scoped to it.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    fetchServers();
    setActive(null);
  }, [activeWorkspaceId, fetchServers]);

  const visible = activeWorkspaceId
    ? servers.filter((s) => s.workspaceId === activeWorkspaceId)
    : servers;

  const handleOpen = async (server: DevServer) => {
    setError(null);
    try {
      const url = await openServer(server.workspaceId, server.port);
      setActive({
        serverId: server.id,
        url,
        workspaceId: server.workspaceId,
        port: server.port,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open preview');
    }
  };

  const handleOpenInTab = async (server: DevServer) => {
    setError(null);
    try {
      const url = await openServer(server.workspaceId, server.port);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open preview');
    }
  };

  const handleReload = () => {
    if (!active) return;
    // Re-mint the ticket so a long-running preview stays authenticated
    // even after the original ticket expires.
    void (async () => {
      try {
        const url = await openServer(active.workspaceId, active.port);
        setActive({ ...active, url });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reload preview');
      }
    })();
  };

  if (active) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card shrink-0">
          <Button
            onClick={() => setActive(null)}
            variant="ghost"
            size="icon-xs"
            title="Back to list"
          >
            <ArrowLeftRight className="size-4" />
          </Button>
          <div className="flex-1 min-w-0 text-xs font-medium truncate">
            Port {active.port}
          </div>
          <Button
            onClick={handleReload}
            variant="ghost"
            size="icon-xs"
            title="Refresh ticket and reload"
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            onClick={() => window.open(active.url, '_blank', 'noopener,noreferrer')}
            variant="ghost"
            size="icon-xs"
            title="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </Button>
          <Button
            onClick={() => setActive(null)}
            variant="ghost"
            size="icon-xs"
            title="Close preview"
          >
            <X className="size-4" />
          </Button>
        </div>
        <iframe
          // The key forces a full reload when the URL changes, including
          // when a stale ticket gets refreshed via handleReload.
          key={active.url}
          src={active.url}
          className="flex-1 w-full bg-background border-0"
          title={`Dev server preview: port ${active.port}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h2 className="text-xs font-medium text-muted-foreground">Dev Servers</h2>
        <Button
          onClick={fetchServers}
          variant="ghost"
          size="icon-xs"
          title="Refresh"
          disabled={isLoading}
        >
          <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 border-b border-border">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
            <Globe className="size-8 mb-2 opacity-50" />
            <p className="text-xs">No dev servers registered yet</p>
            <p className="text-xs mt-1 opacity-70">
              Ask the agent to start one — they show up here automatically.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((server) => (
              <li key={server.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={server.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{server.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      port {server.port}
                      {server.framework ? ` · ${server.framework}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 mt-1.5">
                  <Button
                    onClick={() => handleOpen(server)}
                    variant="secondary"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    disabled={server.status !== 'running'}
                  >
                    Open
                  </Button>
                  <Button
                    onClick={() => handleOpenInTab(server)}
                    variant="ghost"
                    size="icon-xs"
                    title="Open in new tab"
                    disabled={server.status !== 'running'}
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
