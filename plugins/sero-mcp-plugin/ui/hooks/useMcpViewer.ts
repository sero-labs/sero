import { useCallback, useState } from 'react';
import type { McpResourcePreview } from '../../shared/types';
import { useMcpAuthFlow, type McpAuthSession } from './useMcpAuthFlow';
import { useMcpResourceReader } from './useMcpResourceReader';

export type McpViewerKind = 'resource' | 'tool-ui' | 'auth';

export interface McpViewerPaneState {
  kind: McpViewerKind;
  serverName: string;
  title: string | null;
}

export interface McpViewerOpenResourceOptions {
  kind?: 'resource' | 'tool-ui';
  title?: string;
}

export interface McpViewerState {
  pane: McpViewerPaneState | null;
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
  const {
    loading: resourceLoading,
    error: resourceError,
    activeResourceUri,
    preview,
    loadResource,
    clearPreview,
  } = useMcpResourceReader();
  const [pane, setPane] = useState<McpViewerPaneState | null>(null);

  const openResource = useCallback(async (
    serverName: string,
    resourceUri: string,
    options: McpViewerOpenResourceOptions = {},
  ) => {
    setPane({
      kind: options.kind ?? 'resource',
      serverName,
      title: options.title ?? resourceUri,
    });
    setAuthError(null);
    await loadResource(serverName, resourceUri);
  }, [loadResource, setAuthError]);

  const startAuth = useCallback(async (serverName: string) => {
    setPane({ kind: 'auth', serverName, title: `Authenticate ${serverName}` });
    clearPreview();
    return startAuthFlow(serverName);
  }, [clearPreview, startAuthFlow]);

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
    setPane({
      kind: 'auth',
      serverName: authSession.serverName,
      title: `Authenticate ${authSession.serverName}`,
    });
    clearPreview();
  }, [authSession, clearPreview]);

  const clearPane = useCallback(() => {
    setPane(null);
    clearPreview();
    setAuthError(null);
  }, [clearPreview, setAuthError]);

  return {
    pane,
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

export default useMcpViewer;
