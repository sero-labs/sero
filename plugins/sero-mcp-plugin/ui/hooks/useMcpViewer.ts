import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useRef, useState } from 'react';
import type { McpResourcePreview } from '../../shared/types';
import { useMcpAuthFlow, type McpAuthSession } from './useMcpAuthFlow';

export type McpViewerKind = 'resource' | 'tool-ui' | 'auth';

export interface McpViewerPaneState {
  kind: McpViewerKind;
  serverName: string;
  title: string | null;
}

export interface McpViewerSession {
  sessionId: string;
  viewerUrl: string;
  resourceUri: string;
  kind: Exclude<McpViewerKind, 'auth'>;
}

export interface McpViewerOpenResourceOptions {
  kind?: 'resource' | 'tool-ui';
  title?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
}

export interface McpViewerState {
  pane: McpViewerPaneState | null;
  session: McpViewerSession | null;
  preview: McpResourcePreview | null;
  activeResourceUri: string | null;
  resourceLoading: boolean;
  resourceError: string | null;
  authSession: McpAuthSession | null;
  authLoading: boolean;
  authError: string | null;
  setAuthError: (message: string | null) => void;
  openResource: (serverName: string, resourceUri: string, options?: McpViewerOpenResourceOptions) => Promise<void>;
  startAuth: (serverName: string) => Promise<boolean>;
  completeAuth: (serverName: string, callbackUrl: string) => Promise<boolean>;
  cancelAuth: (serverName: string) => Promise<boolean>;
  clearAuth: (serverName: string) => Promise<boolean>;
  focusAuthSession: () => void;
  clearPane: () => void;
}

export function useMcpViewer(): McpViewerState {
  const { run } = useAppTools();
  const requestIdRef = useRef(0);
  const {
    loading: authLoading,
    error: authError,
    session: authSession,
    setError: setAuthError,
    startAuth: startAuthFlow,
    completeAuth: completeAuthFlow,
    cancelAuth: cancelAuthFlow,
    clearAuth: clearAuthFlow,
  } = useMcpAuthFlow();
  const [pane, setPane] = useState<McpViewerPaneState | null>(null);
  const [session, setSession] = useState<McpViewerSession | null>(null);
  const [preview, setPreview] = useState<McpResourcePreview | null>(null);
  const [activeResourceUri, setActiveResourceUri] = useState<string | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const closeViewerSession = useCallback(async () => {
    await run('mcp_manager', { action: 'close_viewer' });
  }, [run]);

  const openResource = useCallback(async (
    serverName: string,
    resourceUri: string,
    options: McpViewerOpenResourceOptions = {},
  ) => {
    const requestId = ++requestIdRef.current;
    const nextKind = options.kind ?? 'resource';
    const action = nextKind === 'tool-ui' ? 'open_tool_ui' : 'open_resource';

    setPane({
      kind: nextKind,
      serverName,
      title: options.title ?? resourceUri,
    });
    setSession(null);
    setPreview(null);
    setActiveResourceUri(resourceUri);
    setResourceLoading(true);
    setResourceError(null);
    setAuthError(null);
    void closeViewerSession().catch(() => undefined);

    try {
      const result = await run('mcp_manager', {
        action,
        serverName,
        resourceUri,
        toolName: options.toolName,
        toolArguments: options.toolArguments,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }

      const viewerUrl = typeof result.details?.viewerUrl === 'string' ? result.details.viewerUrl : null;
      const sessionId = typeof result.details?.sessionId === 'string' ? result.details.sessionId : null;
      const nextPreview = isMcpResourcePreview(result.details?.resourcePreview) ? result.details.resourcePreview : null;

      if (viewerUrl && sessionId) {
        setSession({
          sessionId,
          viewerUrl,
          resourceUri,
          kind: nextKind,
        });
        setPreview(null);
      } else {
        setSession(null);
        setPreview(nextPreview);
      }

      if (result.isError) {
        setResourceError(result.text);
      } else if (!viewerUrl && !nextPreview) {
        setResourceError('The MCP viewer opened, but no preview or interactive session payload was returned.');
      }
    } catch (cause) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSession(null);
      setPreview(null);
      setResourceError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === requestIdRef.current) {
        setResourceLoading(false);
      }
    }
  }, [closeViewerSession, run, setAuthError]);

  const startAuth = useCallback(async (serverName: string) => {
    requestIdRef.current += 1;
    setSession(null);
    setPreview(null);
    setActiveResourceUri(null);
    setResourceError(null);
    void closeViewerSession().catch(() => undefined);
    setPane({ kind: 'auth', serverName, title: `Authenticate ${serverName}` });
    return startAuthFlow(serverName);
  }, [closeViewerSession, startAuthFlow]);

  const completeAuth = useCallback(async (serverName: string, callbackUrl: string) => {
    const ok = await completeAuthFlow(serverName, callbackUrl);
    if (ok) {
      setPane((current) => current?.kind === 'auth' && current.serverName === serverName ? null : current);
    }
    return ok;
  }, [completeAuthFlow]);

  const cancelAuth = useCallback(async (serverName: string) => {
    const ok = await cancelAuthFlow(serverName);
    if (ok) {
      setPane((current) => current?.kind === 'auth' && current.serverName === serverName ? null : current);
    }
    return ok;
  }, [cancelAuthFlow]);

  const clearAuth = useCallback(async (serverName: string) => {
    const ok = await clearAuthFlow(serverName);
    if (ok) {
      setPane((current) => current?.kind === 'auth' && current.serverName === serverName ? null : current);
    }
    return ok;
  }, [clearAuthFlow]);

  const focusAuthSession = useCallback(() => {
    if (!authSession) {
      return;
    }
    requestIdRef.current += 1;
    setSession(null);
    setPreview(null);
    setActiveResourceUri(null);
    setResourceError(null);
    void closeViewerSession().catch(() => undefined);
    setPane({
      kind: 'auth',
      serverName: authSession.serverName,
      title: `Authenticate ${authSession.serverName}`,
    });
  }, [authSession, closeViewerSession]);

  const clearPane = useCallback(() => {
    requestIdRef.current += 1;
    setPane(null);
    setSession(null);
    setPreview(null);
    setActiveResourceUri(null);
    setResourceError(null);
    setAuthError(null);
    void closeViewerSession().catch(() => undefined);
  }, [closeViewerSession, setAuthError]);

  return {
    pane,
    session,
    preview,
    activeResourceUri,
    resourceLoading,
    resourceError,
    authSession,
    authLoading,
    authError,
    setAuthError,
    openResource,
    startAuth,
    completeAuth,
    cancelAuth,
    clearAuth,
    focusAuthSession,
    clearPane,
  };
}

function isMcpResourcePreview(value: unknown): value is McpResourcePreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const preview = value as Record<string, unknown>;
  return typeof preview.serverName === 'string'
    && typeof preview.requestedUri === 'string'
    && typeof preview.resolvedUri === 'string'
    && typeof preview.previewKind === 'string'
    && typeof preview.truncated === 'boolean';
}

export default useMcpViewer;
