/**
 * Root App component — orchestrates auth, connection, and layout.
 */

import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { useGatewayDispatcher, useConnectionState } from '@/hooks/useGateway';
import { AuthScreen } from '@/components/AuthScreen';
import { Layout } from '@/components/Layout';

export function App() {
  const connectionState = useConnectionState();
  const autoConnect = useConnectionStore((s) => s.autoConnect);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);

  // Set up the central message dispatcher (external WS source — valid useEffect)
  useGatewayDispatcher();

  // Try auto-connect from stored token on mount (one-shot init — valid useEffect)
  useEffect(() => {
    autoConnect();
  }, [autoConnect]);

  // Fetch workspaces when connected (external event — valid useEffect)
  useEffect(() => {
    if (connectionState === 'connected') {
      fetchWorkspaces();
    }
  }, [connectionState, fetchWorkspaces]);

  const showAuth =
    connectionState === 'disconnected' || connectionState === 'connecting';

  return (
    <>
      {showAuth && <AuthScreen />}
      <Layout />
    </>
  );
}
