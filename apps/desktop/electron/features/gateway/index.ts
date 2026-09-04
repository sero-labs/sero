/**
 * Gateway Server — WebSocket control plane for remote Sero access.
 * Routes messages between external clients and the agent session pool.
 * Security: rate limiting, max connections, origin validation, idle timeout.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

import { GatewayAuth, type GatewayAuthResult } from './security/auth';
import { CostTracker } from './server/cost-tracker';
import { RateLimiter } from './security/rate-limiter';
import { sendResponse, routeAgentRequest, disposeIdempotencyStore } from './server/request-handler';
import { primeStaticFileCache } from './server/static-files';
import { redactSecrets } from '@electron/shared/lib/secret-redact';
import { validateRequest, type GatewayRequest, type GatewayResponse, type GatewayPushEvent } from './server/protocol';
import type { GatewayConfig, GatewayAgentOps, GatewayDevServerChange } from './server/types';
import type { GatewayAccessScope } from './server/access-control';
import {
  AUTH_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  MAX_CONNECTIONS_PER_IP,
  MAX_PAYLOAD_BYTES,
  MAX_TOTAL_CONNECTIONS,
  readBestEffortRequestId,
} from './server/connection-limits';
import {
  broadcastDevServerChange as fanoutDevServerChange,
  broadcastGatewayEvent,
  broadcastWorkspaceEvent as fanoutWorkspaceEvent,
  broadcastOwnerEvent as fanoutOwnerEvent,
  pushSessionEvent,
} from './server/event-broadcast';
import {
  applyAuthResult,
  closeIdleConnections,
  countConnectionsFromIp,
  sendPendingChoices,
} from './server/client-registry';
import {
  DevProxyTicketManager,
  generateTicketSecret,
} from './security/devserver-ticket';
import { createGatewayHttpServer, createPreviewHttpServer } from './server/http-app';
import { getClientIp, isOriginAllowed } from './server/connection-security';

export type {
  GatewayConfig,
  GatewayAgentOps,
  GatewayFileEntry,
  GatewayFileContent,
  GatewayDevServerInfo,
  GatewayDevServerTarget,
  GatewayDevServerChange,
} from './server/types';

type WebChatHtmlProvider = () => string;

export interface ConnectedClient extends GatewayAccessScope {
  ws: WebSocket;
  clientType: string;
  clientId: string;
  authenticated: boolean;
  /** Whether this client authenticated with the master token (vs a web token). */
  isMasterAuth: boolean;
  /** Session IDs this client is subscribed to for push events. */
  subscribedSessions: Set<string>;
  /** Source IP address of the client. */
  remoteIp: string;
  /** Timestamp of last activity (for idle timeout). */
  lastActivity: number;
}

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private previewServer: http.Server | null = null;
  private auth: GatewayAuth;
  private clients = new Map<WebSocket, ConnectedClient>();
  private agentOps: GatewayAgentOps | null = null;
  private config: GatewayConfig;
  private webChatHtml: WebChatHtmlProvider | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private devProxyTickets: DevProxyTicketManager;
  private devServerUnsubscribe: (() => void) | null = null;

  private authLimiter = new RateLimiter({
    maxAttempts: 5,
    windowMs: 60_000,
    blockMs: 5 * 60_000,
  });

  /** Cost tracker for gateway-initiated sessions. */
  readonly costTracker: CostTracker;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.auth = new GatewayAuth(config.tokenPath);
    this.costTracker = new CostTracker(config.configDir);
    // Tickets are signed with a process-bound secret. We don't persist
    // it: a gateway restart invalidates outstanding tickets, which is
    // the desired behaviour for short-lived preview credentials.
    this.devProxyTickets = new DevProxyTicketManager(generateTicketSecret());
  }

  /** Register agent operations handler (call before start). */
  setAgentOps(ops: GatewayAgentOps): void {
    this.agentOps = ops;
    if (this.devServerUnsubscribe) {
      this.devServerUnsubscribe();
      this.devServerUnsubscribe = null;
    }
    this.devServerUnsubscribe = ops.onDevServerChange((change) => {
      this.broadcastDevServerChange(change);
    });
  }

  /**
   * Provide a web chat HTML generator so the gateway also serves the
   * chat UI on HTTP requests to "/". This lets a single port (18800)
   * serve both WS and the web UI — critical for Tailscale where only
   * one port is exposed.
   */
  setWebChatHtml(provider: WebChatHtmlProvider): void {
    this.webChatHtml = provider;
  }

  /** Start the gateway server. */
  async start(): Promise<void> {
    if (this.wss) return;

    primeStaticFileCache(__dirname);

    this.httpServer = createGatewayHttpServer({
      staticRoot: __dirname,
      previewPort: this.config.previewPort,
      previewTlsPort: this.config.previewTlsPort,
      getWebChatHtml: () => this.webChatHtml,
      getProxyDeps: () => this.proxyDeps(),
      upgradeWebSocket: (req, socket, head) => {
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.wss!.emit('connection', ws, req);
        });
      },
    });

    this.previewServer = createPreviewHttpServer({
      getProxyDeps: () => this.proxyDeps(),
    });

    // The 'ws' library handles upgrades for paths it owns, but we need to
    // intercept upgrades to /p/... before the WebSocketServer does. Setting
    // `noServer: true` and binding 'upgrade' manually keeps both endpoints
    // on the same listener.
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PAYLOAD_BYTES,
    });


    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (err) => {
      console.error('[gateway] WebSocket server error:', err);
    });

    this.idleCheckTimer = setInterval(() => closeIdleConnections(this.clients, IDLE_TIMEOUT_MS), 5 * 60_000);

    try {
      await this.listenOn(this.httpServer, this.config.port);
      console.log(
        `[gateway] Server listening on ws://${this.config.host}:${this.config.port}`,
      );
      await this.listenOn(this.previewServer, this.config.previewPort);
      console.log(
        `[gateway] Preview listener on http://${this.config.host}:${this.config.previewPort}`,
      );
    } catch (err) {
      // Roll back everything: a half-started gateway must not report
      // itself running, and a later start() has to retry from scratch.
      if (this.idleCheckTimer) {
        clearInterval(this.idleCheckTimer);
        this.idleCheckTimer = null;
      }
      this.wss?.close();
      this.wss = null;
      this.previewServer?.close();
      this.previewServer = null;
      this.httpServer?.close();
      this.httpServer = null;
      throw err;
    }
  }

  private listenOn(server: http.Server, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      server.listen(port, this.config.host, () => resolve());
      server.on('error', reject);
    });
  }

  /** Stop the gateway server and disconnect all clients. */
  async stop(): Promise<void> {
    if (!this.wss) return;

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    if (this.devServerUnsubscribe) {
      this.devServerUnsubscribe();
      this.devServerUnsubscribe = null;
    }
    this.authLimiter.dispose();
    disposeIdempotencyStore();

    for (const [ws] of this.clients) {
      ws.close(1001, 'Gateway shutting down');
    }
    this.clients.clear();

    return new Promise<void>((resolve) => {
      this.wss?.close(() => {
        this.previewServer?.close();
        this.previewServer = null;
        this.httpServer?.close(() => {
          this.wss = null;
          this.httpServer = null;
          console.log('[gateway] Server stopped');
          resolve();
        });
      });
    });
  }

  /** Preview listener ports (direct + tailnet TLS mapping). */
  getPreviewPorts(): { previewPort: number; previewTlsPort: number } {
    return {
      previewPort: this.config.previewPort,
      previewTlsPort: this.config.previewTlsPort,
    };
  }

  /** Get the auth token for display. */
  getToken(): string {
    return this.auth.getToken();
  }

  /** Get server status. */
  getStatus(): {
    running: boolean;
    port: number;
    host: string;
    clients: number;
  } {
    return {
      running: this.wss !== null,
      port: this.config.port,
      host: this.config.host,
      clients: this.clients.size,
    };
  }

  /**
   * Push an event to all clients subscribed to a session.
   * Called by the agent event bridge.
   */
  pushEvent(sessionId: string, event: GatewayPushEvent): void {
    pushSessionEvent(this.clients, sessionId, event);
  }

  /** Push an event to authenticated clients that are authorized for its session. */
  broadcastEvent(event: GatewayPushEvent): void {
    broadcastGatewayEvent(this.clients, event);
  }

  /**
   * Push an event to every client whose token can reach the workspace.
   * Session-scoped filtering would drop events for sessions a client has
   * not listed yet, which is exactly the case a phone needs to see.
   */
  broadcastWorkspaceEvent(workspaceId: string, event: GatewayPushEvent): void {
    fanoutWorkspaceEvent(this.clients, workspaceId, event);
  }

  /**
   * Push an event to owner tokens only. Used for anything that names no
   * workspace, which no scoped token can be shown to have a right to.
   */
  broadcastOwnerEvent(event: GatewayPushEvent): void {
    fanoutOwnerEvent(this.clients, event);
  }

  /** Get the auth manager (for web token operations from the request handler). */
  getAuth(): GatewayAuth {
    return this.auth;
  }

  /** Push a dev server change to clients authorized for the affected workspace. */
  broadcastDevServerChange(change: GatewayDevServerChange): void {
    fanoutDevServerChange(this.clients, change);
  }

  private proxyDeps() {
    return {
      agentOps: () => this.agentOps,
      tickets: this.devProxyTickets,
    };
  }

  // ── Internal ──────────────────────────────────────────────

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const remoteIp = getClientIp(req);

    // Enforce total connection limit
    if (this.clients.size >= MAX_TOTAL_CONNECTIONS) {
      console.warn(`[gateway] Connection rejected: max total connections (${MAX_TOTAL_CONNECTIONS}) reached`);
      ws.close(4029, 'Too many connections');
      return;
    }

    // Enforce per-IP connection limit
    if (countConnectionsFromIp(this.clients, remoteIp) >= MAX_CONNECTIONS_PER_IP) {
      console.warn(`[gateway] Connection rejected: max connections per IP (${MAX_CONNECTIONS_PER_IP}) reached for ${remoteIp}`);
      ws.close(4029, 'Too many connections from this IP');
      return;
    }

    // Validate Origin header
    if (!isOriginAllowed(req, this.config.port)) {
      const origin = req.headers.origin ?? 'unknown';
      console.warn(`[gateway] Connection rejected: unauthorized origin "${origin}" from ${remoteIp}`);
      ws.close(4003, 'Origin not allowed');
      return;
    }

    const client: ConnectedClient = {
      ws,
      clientType: 'unknown',
      clientId: `client-${Date.now()}`,
      authenticated: false,
      isMasterAuth: false,
      authorizedWorkspaceIds: null,
      authorizedSessions: new Map(),
      authorizedArtifacts: new Map(),
      subscribedSessions: new Set(),
      remoteIp,
      lastActivity: Date.now(),
    };
    this.clients.set(ws, client);

    // Auto-disconnect unauthenticated clients after 10s
    const authTimeout = setTimeout(() => {
      if (!client.authenticated) {
        ws.close(4001, 'Authentication timeout');
        this.clients.delete(ws);
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', async (data) => {
      client.lastActivity = Date.now();

      try {
        const raw = JSON.parse(data.toString());
        const request = validateRequest(raw);
        if (!request) {
          // Best-effort: echo requestId from the raw payload so a client's
          // pending promise still settles even when validation rejected the
          // body shape.
          const requestId = readBestEffortRequestId(raw);
          sendResponse(ws, {
            type: 'error',
            requestType: 'unknown',
            ...(requestId ? { requestId } : {}),
            message: 'Invalid request format',
          });
          return;
        }

        if (request.type === 'connect') {
          clearTimeout(authTimeout);
        }

        await this.handleRequest(ws, client, request);
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'unknown',
          message: err instanceof Error ? redactSecrets(err.message) : 'Internal error',
        });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[gateway] Client error:', err);
      this.clients.delete(ws);
    });
  }

  private async handleRequest(
    ws: WebSocket,
    client: ConnectedClient,
    request: GatewayRequest,
  ): Promise<void> {
    // Connect / auth is always allowed
    if (request.type === 'connect') {
      // Check rate limiter before validating token
      if (!this.authLimiter.check(client.remoteIp)) {
        console.warn(`[gateway] Auth rate-limited: ${client.remoteIp}`);
        sendResponse(ws, {
          type: 'error',
          requestType: 'connect',
          message: 'Too many authentication attempts. Try again later.',
        });
        ws.close(4029, 'Rate limited');
        return;
      }

      const authResult = this.auth.validate(request.token);
      if (!authResult) {
        console.warn(
          `[gateway] Auth failed: ${client.remoteIp} (client type: ${request.clientType})`,
        );
        sendResponse(ws, {
          type: 'error',
          requestType: 'connect',
          message: 'Invalid authentication token',
        });
        ws.close(4003, 'Authentication failed');
        return;
      }

      // Successful auth — reset rate limiter for this IP
      this.authLimiter.reset(client.remoteIp);

      applyAuthResult(client, authResult);
      client.clientType = request.clientType;
      if (request.clientId) client.clientId = request.clientId;
      console.log(
        `[gateway] Client authenticated: ${client.clientType} (${client.clientId}) from ${client.remoteIp}`,
      );
      sendResponse(ws, { type: 'ok', requestType: 'connect' });
      sendPendingChoices(ws, client);
      return;
    }

    // All other requests require authentication
    if (!client.authenticated) {
      sendResponse(ws, {
        type: 'error',
        requestType: request.type,
        ...(request.requestId ? { requestId: request.requestId } : {}),
        message: 'Not authenticated. Send a connect request first.',
      });
      return;
    }

    if (!this.agentOps) {
      sendResponse(ws, {
        type: 'error',
        requestType: request.type,
        ...(request.requestId ? { requestId: request.requestId } : {}),
        message: 'Agent operations not available',
      });
      return;
    }

    await routeAgentRequest(
      ws,
      this.agentOps,
      request,
      client,
      (sessionId) => client.subscribedSessions.add(sessionId),
      () => this.getStatus(),
      this.costTracker,
      this.auth,
      client.isMasterAuth,
      this.devProxyTickets,
      this.getPreviewPorts(),
    );
  }
}
