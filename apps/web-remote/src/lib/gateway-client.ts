import {
  isInvalidAuthTokenMessage,
  shouldReconnectAfterConnectError,
} from '@/lib/connect-errors';

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
  /** Correlation id echoed by the host for request/response pairing. */
  requestId?: string;
  data?: unknown;
}

export interface GatewayErrorResponse {
  type: 'error';
  requestType: string;
  /** Correlation id echoed by the host for request/response pairing. */
  requestId?: string;
  message: string;
}

export interface VoiceTranscriptionStatus {
  enabled: boolean;
  reason?: string;
}

export interface VoiceTranscriptionResult {
  text: string;
  model: string;
}

export type GatewayResponse = GatewayOkResponse | GatewayErrorResponse;

/** What a session is doing. Mirrors `GatewaySessionState` on the host. */
export type SessionState = 'running' | 'idle' | 'awaiting_input';

export interface GatewayPushEvent {
  type:
    | 'agent_start'
    | 'agent_end'
    | 'session_state'
    | 'turn_complete'
    | 'text_delta'
    | 'thinking_delta'
    | 'tool_input_start'
    | 'tool_input_delta'
    | 'tool_input_end'
    | 'tool_start'
    | 'tool_end'
    | 'artifact_added'
    | 'choice_request'
    | 'choice_resolved'
    | 'notification'
    | 'notifications_read'
    | 'dev_server_changed';
  /** Present on session-bound events; absent on workspace-bound events like dev_server_changed. */
  sessionId?: string;
  /** Present on workspace-scoped events: session_state, turn_complete, agent_start, agent_end. */
  workspaceId?: string;
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
/**
 * Mirror of the gateway's protocol cap on `voice_transcribe.audioDataUrl`.
 * Kept slightly under the host's 36 MB WebSocket payload limit so the user
 * sees a helpful error rather than a WebSocket disconnect.
 */
const MAX_VOICE_AUDIO_DATA_URL_BYTES = 35 * 1024 * 1024;

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  requestType: string;
  timer: ReturnType<typeof setTimeout> | null;
}

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
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;

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

  /** Search every session this token can reach. */
  searchSessions(query: string, limit?: number): void {
    this.send({ type: 'search_sessions', query, limit });
  }

  /** Read the working tree of a workspace. */
  gitStatus(workspaceId: string): void {
    this.send({ type: 'git_status', workspaceId });
  }

  /** Read one file's diff. */
  gitDiff(workspaceId: string, filePath: string, staged: boolean): void {
    this.send({ type: 'git_diff', workspaceId, path: filePath, staged });
  }

  /** Stage exactly `paths` and commit them. Owner tokens only. */
  gitCommit(workspaceId: string, message: string, paths: string[]): void {
    this.send({ type: 'git_commit', workspaceId, message, paths });
  }

  /** Read the notification feed, newest first. */
  listNotifications(since?: number, limit?: number): void {
    this.send({ type: 'list_notifications', since, limit });
  }

  /** Mark notifications read for every client. */
  markNotificationsRead(ids: string[]): void {
    this.send({ type: 'mark_notifications_read', ids });
  }

  /** Answer a choice an agent is waiting on. */
  answerChoice(id: string, optionId: string): void {
    this.send({ type: 'answer_choice', id, optionId });
  }

  /** Request token and cost totals for the reachable sessions. */
  requestUsage(): void {
    this.send({ type: 'get_usage' });
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
  createWebToken(workspaceIds: string[] | null = null, label?: string, expiryDays?: number): void {
    this.send({ type: 'create_web_token', workspaceIds, label, expiryDays });
  }

  /** List web tokens. */
  listWebTokens(): void {
    this.send({ type: 'list_web_tokens' });
  }

  /** Revoke a web token. */
  revokeWebToken(tokenId: string): void {
    this.send({ type: 'revoke_web_token', tokenId });
  }

  /** List dev servers, optionally filtered to a single workspace. */
  listDevServers(workspaceId?: string): void {
    this.send(
      workspaceId
        ? { type: 'list_dev_servers', workspaceId }
        : { type: 'list_dev_servers' },
    );
  }

  /**
   * Mint a short-lived ticket authorising HTTP/WS access to a dev server
   * via the gateway's `/p/<workspace>/<port>/...` proxy.
   */
  createDevServerTicket(workspaceId: string, port: number): void {
    this.send({ type: 'create_devserver_ticket', workspaceId, port });
  }

  /** Check whether the host is configured to perform voice transcription. */
  voiceStatus(timeoutMs = 10_000): Promise<VoiceTranscriptionStatus> {
    return this.sendRequest<VoiceTranscriptionStatus>(
      { type: 'voice_status' },
      timeoutMs,
    );
  }

  /**
   * Transcribe a base64 audio data URL via the host's OpenAI integration.
   * The 90 s timeout allows for upload of larger recordings on slow networks
   * plus the host's own 60 s OpenAI request timeout.
   *
   * Pre-flighted client-side against the 35 MB protocol cap so users get a
   * useful "recording too large" error instead of an opaque WebSocket drop
   * when the gateway's 36 MB payload limit kicks in.
   */
  transcribeVoice(
    audioDataUrl: string,
    mimeType?: string,
    timeoutMs = 90_000,
  ): Promise<VoiceTranscriptionResult> {
    if (audioDataUrl.length > MAX_VOICE_AUDIO_DATA_URL_BYTES) {
      return Promise.reject(
        new Error(
          'Recorded audio is too large to send (limit ~25 MB after decoding). Please record a shorter clip.',
        ),
      );
    }
    return this.sendRequest<VoiceTranscriptionResult>(
      { type: 'voice_transcribe', audioDataUrl, mimeType },
      timeoutMs,
    );
  }

  /**
   * Send a request and wait for its correlated response. The response is
   * matched by `requestId`; the caller receives `data` on success or a
   * rejected promise carrying the host's error message.
   *
   * Requires the connection to be fully authenticated. Sending during the
   * `connecting`/`authenticating`/`reconnecting` window is rejected
   * synchronously because the server emits non-correlated `Not authenticated`
   * errors for early traffic, which would otherwise leave the promise
   * pending until timeout.
   */
  sendRequest<T>(request: GatewayRequest, timeoutMs = 30_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this._state !== 'connected') {
        reject(new Error('Gateway is not connected yet.'));
        return;
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to gateway.'));
        return;
      }

      const requestId = `req-${Date.now()}-${++this.requestCounter}`;
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              const pending = this.pendingRequests.get(requestId);
              if (!pending) return;
              this.pendingRequests.delete(requestId);
              pending.reject(
                new Error(`Gateway request '${pending.requestType}' timed out.`),
              );
            }, timeoutMs)
          : null;

      this.pendingRequests.set(requestId, {
        resolve: (data) => resolve(data as T),
        reject,
        requestType: request.type,
        timer,
      });

      try {
        this.ws.send(JSON.stringify({ ...request, requestId }));
      } catch (err) {
        this.pendingRequests.delete(requestId);
        if (timer) clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('Failed to send request.'));
      }
    });
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
      this.failPendingRequests('Gateway connection closed.');
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
      const { message } = msg;
      const shouldReconnect = shouldReconnectAfterConnectError(message);

      this.shouldReconnect = shouldReconnect;

      if (!shouldReconnect) {
        if (isInvalidAuthTokenMessage(message)) {
          this.token = '';
        }
        this.setState('disconnected');
      }
    }

    // Resolve any pending request waiting on a correlated response. When a
    // pending request consumes the message we skip the broadcast so callers
    // who awaited the promise don't also see a global request-error banner.
    const requestId = (msg as { requestId?: string }).requestId;
    if (requestId && (msg.type === 'ok' || msg.type === 'error')) {
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        this.pendingRequests.delete(requestId);
        if (pending.timer) clearTimeout(pending.timer);
        if (msg.type === 'ok') {
          pending.resolve((msg as GatewayOkResponse).data);
        } else {
          pending.reject(new Error((msg as GatewayErrorResponse).message));
        }
        return;
      }
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

  private failPendingRequests(reason: string): void {
    if (this.pendingRequests.size === 0) return;
    const pending = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();
    for (const entry of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
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
