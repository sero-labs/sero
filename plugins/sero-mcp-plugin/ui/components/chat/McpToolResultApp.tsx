import { useAppTools } from '@sero-ai/app-runtime';
import type { ChatToolResultViewProps } from '@sero-ai/common';
import { Loader2, Monitor } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readMcpAppDetails } from '../../../shared/mcp-app';
import type { ViewerSizeMessage } from '../../../shared/viewer-shell';
import '../../styles.css';

type ViewerState =
  | { kind: 'loading' }
  | { kind: 'ready'; viewerUrl: string }
  | { kind: 'failed'; reason: string };

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 900;

/**
 * Shows the MCP app of a tool call in the chat. It asks the MCP runtime for a
 * new viewer each time it mounts, so no viewer URL is kept in the session.
 */
export default function McpToolResultApp({ sessionId, toolCallId, details }: ChatToolResultViewProps) {
  const { run } = useAppTools();
  // Keyed on the content: the chat can give a new details object with the same values on each update.
  const detailsKey = JSON.stringify(details.mcpApp ?? null);
  const app = useMemo(() => readMcpAppDetails({ mcpApp: JSON.parse(detailsKey) }), [detailsKey]);
  const [viewer, setViewer] = useState<ViewerState>({ kind: 'loading' });
  const [height, setHeight] = useState(320);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Opening a viewer starts a session on the loopback viewer server; close it when the view goes away.
  useEffect(() => {
    if (!app) return;
    let active = true;
    let viewerId: string | null = null;
    run('mcp_manager', {
      action: 'open_tool_ui',
      serverName: app.serverName,
      toolName: app.toolName,
      resourceUri: app.uiResourceUri,
      toolArguments: app.arguments,
      toolResult: app.result,
      sessionId,
      toolCallId,
    }).then((result) => {
      const id = typeof result.details?.viewerId === 'string' ? result.details.viewerId : null;
      const viewerUrl = typeof result.details?.viewerUrl === 'string' ? result.details.viewerUrl : null;
      if (!active) {
        if (id) void run('mcp_manager', { action: 'close_viewer', viewerId: id }).catch(() => undefined);
        return;
      }
      viewerId = id;
      if (viewerUrl && !result.isError) {
        setViewer({ kind: 'ready', viewerUrl });
      } else {
        const reason = typeof result.details?.reason === 'string' ? result.details.reason : result.text;
        setViewer({ kind: 'failed', reason });
      }
    }, (error: unknown) => {
      if (active) setViewer({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      active = false;
      if (viewerId) void run('mcp_manager', { action: 'close_viewer', viewerId }).catch(() => undefined);
    };
  }, [app, run, sessionId, toolCallId]);

  // The viewer page reports its height, so the frame fits the app without a scroll bar.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const data = event.data as Partial<ViewerSizeMessage> | null;
      if (data?.type === 'sero-mcp-viewer-size' && typeof data.height === 'number') {
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(data.height))));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!app) return null;

  if (viewer.kind === 'failed') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Monitor className="size-3.5 shrink-0" />
        App not shown: {viewer.reason}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {viewer.kind === 'loading' ? (
        <div role="status" className="flex min-h-[120px] items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading app…
        </div>
      ) : (
        <iframe
          ref={frameRef}
          title={`${app.serverName} ${app.toolName} app`}
          src={viewer.viewerUrl}
          // The loopback viewer page needs its own origin to reach its /proxy routes.
          // The app frame inside it stays sandboxed without allow-same-origin.
          sandbox="allow-same-origin allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          style={{ height }}
          className="block w-full border-0"
        />
      )}
    </div>
  );
}
