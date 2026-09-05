/**
 * The socket under the gateway client.
 *
 * Connection lifecycle, authentication, reconnection, request
 * correlation and message fan-out live here. The typed request methods
 * live in `GatewayClient`, which extends this.
 */

import {
  isInvalidAuthTokenMessage,
  shouldReconnectAfterConnectError,
} from '@/lib/connect-errors';
import type {
  ConnectionState,
  DisconnectEvent,
  GatewayErrorResponse,
  GatewayMessage,
  GatewayOkResponse,
  GatewayRequest,
  MessageHandler,
} from './gateway-protocol';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  requestType: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export class GatewayTransport {
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
    // A reconnect queued by an earlier failure would fire on its own
    // clock and close the connection this call is about to make.
    this.clearReconnectTimer();
    this.doConnect();
  }

  /** Disconnect from the gateway. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.dropSocket();
    this.setState('disconnected');
  }

  /** Trigger an immediate reconnect if the client has a saved token. */
  retryNow(): void {
    if (!this.shouldReconnect) return;
    if (this._state === 'connected' || this._state === 'connecting' || this._state === 'authenticating') {
      return;
    }
    this.clearReconnectTimer();
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

  /**
   * Let go of the current socket without hearing from it again.
   *
   * A close is asynchronous, so a socket we have replaced still fires
   * its handlers afterwards. Detaching them first is what stops a dead
   * socket from reporting a disconnect that has already been handled.
   */
  /** Drop a reconnect that has not fired yet. */
  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private dropSocket(): void {
    const socket = this.ws;
    if (!socket) return;
    this.ws = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
  }

  private doConnect(): void {
    this.dropSocket();
    this.setState('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    // Every handler below closes over `socket`, never `this.ws`. Reading
    // the field instead would let a late event from one socket act on
    // whichever socket happens to be current.
    socket.onopen = () => {
      this.setState('authenticating');
      socket.send(
        JSON.stringify({ type: 'connect', token: this.token, clientType: 'web' }),
      );
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      try {
        const msg = JSON.parse(event.data as string) as GatewayMessage;
        this.handleMessage(msg);
      } catch {
        console.warn('[gateway-client] Failed to parse message');
      }
    };

    socket.onclose = (event) => {
      // A socket we have already replaced has nothing left to say. Acting
      // on it here would clear the live connection and start a second
      // reconnect loop against it.
      if (this.ws !== socket) return;
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

    socket.onerror = () => {
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
