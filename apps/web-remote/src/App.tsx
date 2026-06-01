/**
 * Root App component, orchestrates auth, connection, and layout.
 */

import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { useGatewayDispatcher, useConnectionState } from '@/hooks/useGateway';
import { AuthScreen } from '@/components/AuthScreen';
import { Layout } from '@/components/Layout';

export function App() {
  const connectionState = useConnectionState();
  const initialize = useConnectionStore((s) => s.initialize);
  const retryConnection = useConnectionStore((s) => s.retry);
  const token = useConnectionStore((s) => s.token);
  const isBootstrapping = useConnectionStore((s) => s.isBootstrapping);
  const isInitialized = useConnectionStore((s) => s.isInitialized);
  const authError = useConnectionStore((s) => s.authError);
  const disconnectReason = useConnectionStore((s) => s.disconnectReason);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);

  // Set up the central message dispatcher (external WS source, valid useEffect)
  useGatewayDispatcher();

  // Try auto-connect from stored token on mount and wake reconnects on resume.
  useEffect(() => {
    void initialize();

    const retry = () => {
      retryConnection();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        retry();
      }
    };

    window.addEventListener('online', retry);
    window.addEventListener('pageshow', retry);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('pageshow', retry);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initialize, retryConnection]);

  // Fetch workspaces when connected (external event, valid useEffect)
  useEffect(() => {
    if (connectionState === 'connected') {
      fetchWorkspaces();
    }
  }, [connectionState, fetchWorkspaces]);

  const hasToken = token !== null;
  const showAuth = connectionState !== 'connected';
  const showReconnectState = !isInitialized || isBootstrapping || hasToken;

  return (
    <>
      {showAuth && (
        <AuthScreen
          mode={showReconnectState ? 'reconnecting' : 'auth'}
          statusMessage={authError ?? disconnectReason}
        />
      )}
      <Layout />
    </>
  );
}
