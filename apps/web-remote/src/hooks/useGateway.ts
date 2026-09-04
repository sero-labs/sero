/**
 * Convenience hook for gateway state — combines connection, workspace,
 * chat, and file stores into a unified message dispatch.
 */

import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionSearchStore } from '@/stores/session-search';
import { useUsageStore } from '@/stores/usage';
import { useChoicesStore } from '@/stores/choices';
import { useNotificationsStore } from '@/stores/notifications';
import { useChatStore } from '@/stores/chat';
import { useFileStore } from '@/stores/files';
import { useArtifactStore } from '@/stores/artifacts';
import { useDevServerStore } from '@/stores/dev-servers';
import type { GatewayMessage } from '@/lib/gateway-client';

/**
 * Sets up the central message dispatcher that routes incoming gateway
 * messages to the appropriate stores. Must be called once at the app root.
 */
export function useGatewayDispatcher(): void {
  const client = useConnectionStore((s) => s.client);

  // Subscribe to gateway messages and dispatch to all stores.
  // This is a legitimate useEffect — subscribing to an external WebSocket source.
  useEffect(() => {
    const handler = (msg: GatewayMessage) => {
      useWorkspaceStore.getState().handleMessage(msg);
      useChatStore.getState().handleMessage(msg);
      useFileStore.getState().handleMessage(msg);
      useArtifactStore.getState().handleMessage(msg);
      useDevServerStore.getState().handleMessage(msg);
      useSessionSearchStore.getState().handleMessage(msg);
      useUsageStore.getState().handleMessage(msg);
      useChoicesStore.getState().handleMessage(msg);
      useNotificationsStore.getState().handleMessage(msg);
    };

    const unsub = client.onMessage(handler);
    return unsub;
  }, [client]);
}

/** Hook to get the current connection state. */
export function useConnectionState() {
  return useConnectionStore((s) => s.state);
}

