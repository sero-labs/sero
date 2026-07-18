/**
 * PreviewPanel, lists registered dev servers for the active workspace
 * and lets the user open one in an embedded iframe (or new tab) via the
 * gateway's `/p/<workspace>/<port>/...` reverse proxy.
 */

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chat';
import { useDevServerStore, type DevServer } from '@/stores/dev-servers';
import { useWorkspaceStore } from '@/stores/workspace';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Globe,
  ExternalLink,
  RefreshCw,
  SquareDashedMousePointer,
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
      className={`inline-block size-1.5 rounded-full ${color}`}
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
  // React-grab element pick in the previewed page. The proxy injects the
  // grab script into preview documents; we talk to it over postMessage
  // because the sandboxed iframe (no allow-same-origin) is an opaque origin.
  const [picking, setPicking] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const setComposerPrefill = useChatStore((s) => s.setComposerPrefill);

  // Refresh when the workspace changes, registered servers are scoped to it.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    fetchServers();
    setActive(null);
    setPicking(false);
  }, [activeWorkspaceId, fetchServers]);

  // Grab results posted by the injected script inside the preview iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as { type?: string; status?: string; content?: string } | null;
      if (!data || data.type !== 'sero:grab-result') return;
      const wasPicking = picking;
      setPicking(false);
      if (wasPicking && data.status === 'grabbed' && typeof data.content === 'string' && active) {
        const cleanUrl = active.url.split('?')[0];
        setComposerPrefill(`${data.content}\n\n— ${cleanUrl}\n\n`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [picking, active, setComposerPrefill]);

  const handlePickElement = () => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    if (picking) {
      // Clear locally too so a preview without the bridge (injection
      // failed) can't leave the button stuck in the active state.
      setPicking(false);
      frame.postMessage({ type: 'sero:grab-cancel' }, '*');
      return;
    }
    setPicking(true);
    frame.postMessage({ type: 'sero:grab-start' }, '*');
  };

  const closePreview = () => {
    setActive(null);
    setPicking(false);
  };

  const visible = (activeWorkspaceId
    ? servers.filter((s) => s.workspaceId === activeWorkspaceId)
    : servers
  ).filter((s) => s.status !== 'stopped');

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
    // allow-same-origin is only safe when the preview loads from the
    // gateway's dedicated preview origin (see buildPreviewUrl): previewed
    // workspace code must never be same-origin with this SPA, or it could
    // reach our DOM and origin-scoped credentials. If an older gateway
    // didn't advertise a preview origin, fail closed: keep the opaque
    // sandbox (module-based dev servers won't render, but nothing leaks).
    const isolated = new URL(active.url).origin !== window.location.origin;
    const sandbox = isolated
      ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals'
      : 'allow-scripts allow-forms allow-popups allow-modals';
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card shrink-0">
          <Button
            onClick={closePreview}
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
            onClick={handlePickElement}
            variant="ghost"
            size="icon-xs"
            title={picking ? 'Cancel element pick' : 'Pick element for chat'}
            className={picking ? 'text-primary hover:text-primary' : ''}
          >
            <SquareDashedMousePointer className="size-4" />
          </Button>
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
            onClick={closePreview}
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
          ref={iframeRef}
          src={active.url}
          // A (re)load resets the injected grab bridge, so drop any pick
          // that was running against the previous document.
          onLoad={() => setPicking(false)}
          className="flex-1 w-full bg-background border-0"
          title={`Dev server preview: port ${active.port}`}
          sandbox={sandbox}
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
            <p className="text-xs">No running dev servers</p>
            <p className="text-xs mt-1 opacity-70">
              Ask the agent to start one, running servers show up here automatically.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((server) => (
              <li
                key={server.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
              >
                <StatusDot status={server.status} />
                <button
                  type="button"
                  onClick={() => handleOpen(server)}
                  disabled={server.status !== 'running'}
                  className="flex-1 min-w-0 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Open ${server.name} on port ${server.port}`}
                >
                  <div className="text-xs font-medium truncate">{server.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    :{server.port}
                    {server.framework ? ` · ${server.framework}` : ''}
                  </div>
                </button>
                <Button
                  onClick={() => handleOpen(server)}
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-xs shrink-0"
                  disabled={server.status !== 'running'}
                >
                  Open
                </Button>
                <Button
                  onClick={() => handleOpenInTab(server)}
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  title="Open in new tab"
                  disabled={server.status !== 'running'}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
