/**
 * Connection store — WebSocket state, authentication, token management,
 * and reconnect UX state for the remote gateway.
 */

import { create } from 'zustand';
import {
  GatewayClient,
  type ConnectionState,
  type DisconnectEvent,
  type GatewayMessage,
} from '@/lib/gateway-client';
import { isInvalidAuthTokenMessage } from '@/lib/connect-errors';
import { saveToken, loadToken, clearToken } from '@/lib/token-storage';

interface TokenStorageAdapter {
  save: (token: string) => Promise<void>;
  load: () => Promise<string | null>;
  clear: () => Promise<void>;
}

export interface GatewayClientLike {
  onStateChange: (handler: (state: ConnectionState) => void) => () => void;
  onMessage: (handler: (msg: GatewayMessage) => void) => () => void;
  onDisconnect: (handler: (event: DisconnectEvent) => void) => () => void;
  connect: (token: string) => void;
  disconnect: () => void;
  retryNow: () => void;
  sendPrompt: (
    workspaceId: string,
    sessionId: string,
    text: string,
    images?: Array<{ data: string; mimeType: string }>,
  ) => void;
  requestWorkspaces: () => void;
  requestSessions: (workspaceId: string) => void;
  createSession: (workspaceId: string, name?: string) => void;
  abortSession: (sessionId: string) => void;
  requestSessionHistory: (workspaceId: string, sessionId: string) => void;
  listFiles: (workspaceId: string, filePath: string) => void;
  readFile: (workspaceId: string, filePath: string) => void;
  listArtifacts: (sessionId: string) => void;
  getArtifact: (artifactId: string) => void;
}

interface ConnectionStore {
  state: ConnectionState;
  client: GatewayClientLike;
  token: string | null;
  authError: string | null;
  disconnectReason: string | null;
  isBootstrapping: boolean;
  isInitialized: boolean;

  /** Connect with a token (manual entry or QR pairing). */
  connect: (token: string) => void;
  /** Load an existing token from URL or IndexedDB and connect once. */
  initialize: () => Promise<void>;
  /** Retry immediately without asking for the token again. */
  retry: () => void;
  /** Disconnect and forget the saved pairing token. */
  disconnect: () => void;
  /** Called internally when a message arrives. */
  handleMessage: (msg: GatewayMessage) => void;
}

const defaultTokenStorage: TokenStorageAdapter = {
  save: saveToken,
  load: loadToken,
  clear: clearToken,
};

function consumeTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token')?.trim();
  if (!token) return null;

  url.searchParams.delete('token');
  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', nextPath || '/');

  return token;
}

export function getDisconnectMessage(event: DisconnectEvent): string {
  switch (event.code) {
    case 4008:
      return 'Connection went idle. Reconnecting automatically...';
    case 1012:
      return 'Sero is restarting. Reconnecting automatically...';
    case 1013:
      return 'Sero is temporarily unavailable. Retrying shortly...';
    default:
      break;
  }

  if (event.reason) {
    return `${event.reason}. Reconnecting automatically...`;
  }

  return 'Connection lost. Reconnecting automatically...';
}

export function createConnectionStore(
  client: GatewayClientLike,
  tokenStorage: TokenStorageAdapter = defaultTokenStorage,
) {
  return create<ConnectionStore>((set, get) => {
    client.onStateChange((state) => {
      if (state === 'connecting' || state === 'authenticating' || state === 'connected') {
        set({ state, disconnectReason: null });
        return;
      }
      set({ state });
    });

    client.onDisconnect((event) => {
      if (!event.willReconnect) return;
      if (get().authError) return;
      set({ disconnectReason: getDisconnectMessage(event) });
    });

    client.onMessage((msg) => {
      get().handleMessage(msg);
    });

    return {
      state: 'disconnected',
      client,
      token: null,
      authError: null,
      disconnectReason: null,
      isBootstrapping: false,
      isInitialized: false,

      connect: (token: string) => {
        const trimmed = token.trim();
        if (!trimmed) return;
        set({
          token: trimmed,
          authError: null,
          disconnectReason: null,
          isBootstrapping: false,
          isInitialized: true,
        });
        client.connect(trimmed);
      },

      initialize: async () => {
        if (get().isBootstrapping || get().isInitialized) return;

        set({
          isBootstrapping: true,
          authError: null,
          disconnectReason: null,
        });

        const finalize = (token: string | null) => {
          const state = get();
          if (!state.isBootstrapping || state.isInitialized) return;

          set({
            token,
            authError: null,
            disconnectReason: null,
            isBootstrapping: false,
            isInitialized: true,
          });
          if (token) {
            client.connect(token);
          }
        };

        try {
          const urlToken = consumeTokenFromUrl();
          if (urlToken) {
            finalize(urlToken);
            return;
          }

          const storedToken = await tokenStorage.load();
          finalize(storedToken);
        } catch {
          finalize(null);
        }
      },

      retry: () => {
        set({ authError: null, disconnectReason: null });
        client.retryNow();
      },

      disconnect: () => {
        client.disconnect();
        void tokenStorage.clear();
        set({
          token: null,
          authError: null,
          disconnectReason: null,
          isBootstrapping: false,
          isInitialized: true,
        });
      },

      handleMessage: (msg: GatewayMessage) => {
        if (msg.type === 'ok' && 'requestType' in msg && msg.requestType === 'connect') {
          const { token } = get();
          set({ authError: null, disconnectReason: null });
          if (token) {
            void tokenStorage.save(token);
          }
          return;
        }

        if (msg.type === 'error' && 'requestType' in msg && msg.requestType === 'connect') {
          const message = (msg as { message: string }).message;
          const forgetToken = isInvalidAuthTokenMessage(message);
          if (forgetToken) {
            void tokenStorage.clear();
          }
          set({
            token: forgetToken ? null : get().token,
            authError: forgetToken ? message : null,
            disconnectReason: forgetToken ? null : message,
            isBootstrapping: false,
            isInitialized: true,
          });
        }
      },
    };
  });
}

const client = new GatewayClient();

export const useConnectionStore = createConnectionStore(client);
