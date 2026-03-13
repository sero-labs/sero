/**
 * Connection store — WebSocket state, authentication, and token management.
 */

import { create } from 'zustand';
import { GatewayClient, type ConnectionState, type GatewayMessage } from '@/lib/gateway-client';
import { saveToken, loadToken, clearToken } from '@/lib/token-storage';

interface ConnectionStore {
  state: ConnectionState;
  client: GatewayClient;
  token: string | null;
  authError: string | null;

  /** Connect with a token (manual entry). */
  connect: (token: string) => void;
  /** Try auto-connect from stored token. */
  autoConnect: () => Promise<void>;
  /** Disconnect and clear stored token. */
  disconnect: () => void;
  /** Called internally when a message arrives. */
  handleMessage: (msg: GatewayMessage) => void;
}

const client = new GatewayClient();

export const useConnectionStore = create<ConnectionStore>((set, get) => {
  // Wire up state change listener
  client.onStateChange((state) => {
    set({ state });
  });

  // Wire up message handler
  client.onMessage((msg) => {
    get().handleMessage(msg);
  });

  return {
    state: 'disconnected',
    client,
    token: null,
    authError: null,

    connect: (token: string) => {
      set({ authError: null, token });
      client.connect(token);
      // Save token on successful auth (handled in handleMessage)
    },

    autoConnect: async () => {
      // Check URL params first (e.g. from QR code: ?token=...)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      if (urlToken) {
        // Clean up the URL so the token isn't visible in the address bar
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
        set({ token: urlToken, authError: null });
        client.connect(urlToken);
        return;
      }
      // Fall back to stored token
      const stored = await loadToken();
      if (stored) {
        set({ token: stored, authError: null });
        client.connect(stored);
      }
    },

    disconnect: () => {
      client.disconnect();
      clearToken();
      set({ token: null, authError: null });
    },

    handleMessage: (msg: GatewayMessage) => {
      if (msg.type === 'ok' && 'requestType' in msg && msg.requestType === 'connect') {
        // Auth succeeded — persist token
        const { token } = get();
        if (token) {
          saveToken(token);
        }
      } else if (msg.type === 'error' && 'requestType' in msg && msg.requestType === 'connect') {
        set({ authError: (msg as { message: string }).message });
      }
    },
  };
});
