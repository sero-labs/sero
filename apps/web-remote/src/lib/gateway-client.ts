/**
 * WebSocket client wrapper for the Sero gateway.
 *
 * Handles connection lifecycle, authentication, reconnection,
 * and message dispatching. All gateway protocol messages flow through here.
 */

// ── Protocol types (mirror of electron/gateway/protocol.ts) ─────

export interface GatewayOkResponse {
  type: 'ok';
  requestType: string;
  data?: unknown;
}

export interface GatewayErrorResponse {
  type: 'error';
  requestType: string;
  message: string;
}

export type GatewayResponse = GatewayOkResponse | GatewayErrorResponse;

export interface GatewayPushEvent {
  type:
    | 'agent_start'
    | 'agent_end'
    | 'text_delta'
    | 'thinking_delta'
    | 'tool_start'
    | 'tool_end'
    | 'artifact_added';
  sessionId: string;
  [key: string]: unknown;
}

export type GatewayMessage = GatewayResponse | GatewayPushEvent;

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'reconnecting'
  | 'connected';

export interface DisconnectEvent {
  code: number;
  reason: string;
  willReconnect: boolean;
}

export type MessageHandler = (msg: GatewayMessage) => void;

// ── Request types ───────────────────────────────────────────────

interface GatewayRequest {
  type: string;
  [key: string]: unknown;
}

// ── Client ──────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_DELAY_MS;
  private shouldReconnect = false;
  private messageHandlers = new Set<MessageHandler>();
  private stateHandlers = new Set<(state: ConnectionState) => void>();
  private disconnectHandlers = new Set<(event: DisconnectEvent) => void>();
  private _state: ConnectionState = 'disconnected';

  constructor(url?: string) {
    this.url = url ?? this.detectGatewayUrl();
  }

  /**
   * Auto-detect the gateway WS URL.
   *
   * In production the SPA is served by the gateway itself, so
   * window.location is the correct host:port. In Vite dev mode
   * the dev server runs on a different port — use VITE_GATEWAY_URL
   * env var or fall back to the default gateway port.
   */
  private detectGatewayUrl(): string {
    // Allow explicit override via env var (e.g. VITE_GATEWAY_URL=ws://192.168.1.5:18800)
    const envUrl = import.meta.env.VITE_GATEWAY_URL as string | undefined;
    if (envUrl) return envUrl;

    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';

    // In dev mode (Vite), the page origin is the dev server, not the gateway
    if (import.meta.env.DEV) {
      return `${wsProto}//${loc.hostname}:18800`;
    }

    return `${wsProto}//${loc.host}`;
  }

  get state(): ConnectionState {
    return this._state;
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  /** Subscribe to connection state changes. Returns unsubscribe function. */
  onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /** Subscribe to incoming messages. Returns unsubscribe function. */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /** Subscribe to socket close events. Returns unsubscribe function. */
  onDisconnect(handler: (event: DisconnectEvent) => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  /** Connect to the gateway with the given token. */
  connect(token: string): void {
    this.token = token;
    this.shouldReconnect = true;
    this.reconnectDelay = RECONNECT_DELAY_MS;
    this.doConnect();
  }

  /** Disconnect from the gateway. */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /** Trigger an immediate reconnect if the client has a saved token. */
  retryNow(): void {
    if (!this.shouldReconnect) return;
    if (this._state === 'connected' || this._state === 'connecting' || this._state === 'authenticating') {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectDelay = RECONNECT_DELAY_MS;
    this.doConnect();
  }

  /** Send a request to the gateway. */
  send(request: GatewayRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[gateway-client] Cannot send: not connected');
      return;
    }
    this.ws.send(JSON.stringify(request));
  }

  /** Send a prompt to the agent, optionally with images. */
  sendPrompt(
    workspaceId: string,
    sessionId: string,
    text: string,
    images?: Array<{ data: string; mimeType: string }>,
  ): void {
    this.send({
      type: 'prompt',
      workspaceId,
      sessionId,
      text,
      images: images?.length ? images : undefined,
      idempotencyKey: `web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  }

  /** Request workspace list. */
  requestWorkspaces(): void {
    this.send({ type: 'list_workspaces' });
  }

  /** Request sessions for a workspace. */
  requestSessions(workspaceId: string): void {
    this.send({ type: 'list_sessions', workspaceId });
  }

  /** Create a new session. */
  createSession(workspaceId: string, name?: string): void {
    this.send({ type: 'create_session', workspaceId, name });
  }

  /** Abort the active agent. */
  abortSession(sessionId: string): void {
    this.send({ type: 'abort', sessionId });
  }

  /** Request session message history. */
  requestSessionHistory(workspaceId: string, sessionId: string): void {
    this.send({ type: 'get_session_history', workspaceId, sessionId });
  }

  /** List files in a workspace directory. */
  listFiles(workspaceId: string, filePath: string): void {
    this.send({ type: 'list_files', workspaceId, path: filePath });
  }

  /** Read a file from a workspace. */
  readFile(workspaceId: string, filePath: string): void {
    this.send({ type: 'read_file', workspaceId, path: filePath });
  }

  /** List artifacts for a session. */
  listArtifacts(sessionId: string): void {
    this.send({ type: 'list_artifacts', sessionId });
  }

  /** Get artifact data. */
  getArtifact(artifactId: string): void {
    this.send({ type: 'get_artifact', artifactId });
  }

  /** Create a web token (requires master token auth). */
  createWebToken(label?: string, expiryDays?: number): void {
    this.send({ type: 'create_web_token', label, expiryDays });
  }

  /** List web tokens. */
  listWebTokens(): void {
    this.send({ type: 'list_web_tokens' });
  }

  /** Revoke a web token. */
  revokeWebToken(tokenId: string): void {
    this.send({ type: 'revoke_web_token', tokenId });
  }

  // ── Internal ──────────────────────────────────────────────────

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState('authenticating');
      this.ws!.send(
        JSON.stringify({ type: 'connect', token: this.token, clientType: 'web' }),
      );
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as GatewayMessage;
        this.handleMessage(msg);
      } catch {
        console.warn('[gateway-client] Failed to parse message');
      }
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      const willReconnect = this.shouldReconnect;
      if (willReconnect) {
        this.setState('reconnecting');
      } else if (this._state !== 'disconnected') {
        this.setState('disconnected');
      }
      this.emitDisconnect({
        code: event.code,
        reason: event.reason,
        willReconnect,
      });
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private handleMessage(msg: GatewayMessage): void {
    // Handle auth response specially
    if (msg.type === 'ok' && 'requestType' in msg && msg.requestType === 'connect') {
      this.setState('connected');
      this.reconnectDelay = RECONNECT_DELAY_MS;
    } else if (msg.type === 'error' && 'requestType' in msg && msg.requestType === 'connect') {
      // Auth failed — don't reconnect with the same bad token
      this.shouldReconnect = false;
      this.setState('disconnected');
    }

    // Dispatch to all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error('[gateway-client] Handler error:', err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.reconnectDelay);

    // Exponential backoff with cap
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
  }

  private emitDisconnect(event: DisconnectEvent): void {
    for (const handler of this.disconnectHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[gateway-client] Disconnect handler error:', err);
      }
    }
  }
}
