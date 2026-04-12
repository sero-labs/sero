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
import { tryServeStaticFile } from './server/static-files';
import { redactSecrets } from '@electron/shared/lib/secret-redact';
import {
  validateRequest,
  type GatewayRequest,
  type GatewayResponse,
  type GatewayPushEvent,
} from './server/protocol';
import type { GatewayConfig, GatewayAgentOps } from './server/types';
import type { GatewayAccessScope } from './server/access-control';

export type { GatewayConfig, GatewayAgentOps, GatewayFileEntry, GatewayFileContent } from './server/types';

/** Maximum WebSocket message payload (1 MB). */
const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024;
/** Maximum total concurrent WebSocket connections. */
const MAX_TOTAL_CONNECTIONS = 50;
/** Maximum concurrent WebSocket connections per source IP. */
const MAX_CONNECTIONS_PER_IP = 10;
/** Idle timeout for authenticated connections (30 minutes). */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Auth timeout for unauthenticated connections (10 seconds). */
const AUTH_TIMEOUT_MS = 10_000;
/**
 * Allowed origins for WebSocket connections (non-Tailscale).
 * Populated at construction time from the gateway config port.
 */
const STATIC_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:18800',
  'http://localhost:18800',
  'http://127.0.0.1:18801',
  'http://localhost:18801',
  // web-remote dev server port range (Vite auto-increments if port is taken)
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:5175',
  'http://localhost:5175',
  'http://127.0.0.1:5176',
  'http://localhost:5176',
]);

type WebChatHtmlProvider = () => string;

interface ConnectedClient extends GatewayAccessScope {
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
  private auth: GatewayAuth;
  private clients = new Map<WebSocket, ConnectedClient>();
  private agentOps: GatewayAgentOps | null = null;
  private config: GatewayConfig;
  private webChatHtml: WebChatHtmlProvider | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

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
  }

  /** Register agent operations handler (call before start). */
  setAgentOps(ops: GatewayAgentOps): void {
    this.agentOps = ops;
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

    this.httpServer = http.createServer((req, res) => {
      // Security headers on all responses
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:",
      );

      const pathname = (req.url ?? '/').split('?')[0];

      // Server-side routes must come before the SPA static fallback.
      if (pathname === '/basic' && this.webChatHtml) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.webChatHtml());
        return;
      }
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (tryServeStaticFile(pathname, res, __dirname)) return;

      res.writeHead(404);
      res.end('Not Found');
    });

    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: MAX_PAYLOAD_BYTES,
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (err) => {
      console.error('[gateway] WebSocket server error:', err);
    });

    this.idleCheckTimer = setInterval(() => this.checkIdleConnections(), 5 * 60_000);

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.config.port, this.config.host, () => {
        console.log(
          `[gateway] Server listening on ws://${this.config.host}:${this.config.port}`,
        );
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }

  /** Stop the gateway server and disconnect all clients. */
  async stop(): Promise<void> {
    if (!this.wss) return;

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    this.authLimiter.dispose();
    disposeIdempotencyStore();

    for (const [ws] of this.clients) {
      ws.close(1001, 'Gateway shutting down');
    }
    this.clients.clear();

    return new Promise<void>((resolve) => {
      this.wss?.close(() => {
        this.httpServer?.close(() => {
          this.wss = null;
          this.httpServer = null;
          console.log('[gateway] Server stopped');
          resolve();
        });
      });
    });
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
    const payload = JSON.stringify(event);
    for (const [ws, client] of this.clients) {
      if (!client.authenticated || !client.subscribedSessions.has(sessionId)) {
        continue;
      }
      if (this.canReceiveSessionEvent(client, sessionId) && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  /** Push an event to authenticated clients that are authorized for its session. */
  broadcastEvent(event: GatewayPushEvent): void {
    const payload = JSON.stringify(event);
    const sessionId = 'sessionId' in event ? event.sessionId : null;
    for (const [ws, client] of this.clients) {
      if (!client.authenticated) continue;
      if (sessionId && !this.canReceiveSessionEvent(client, sessionId)) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  /** Get the auth manager (for web token operations from the request handler). */
  getAuth(): GatewayAuth {
    return this.auth;
  }

  private canReceiveSessionEvent(client: ConnectedClient, sessionId: string): boolean {
    return client.isMasterAuth || client.authorizedSessionIds.has(sessionId);
  }

  private applyAuthResult(client: ConnectedClient, result: GatewayAuthResult): void {
    client.authenticated = true;
    client.isMasterAuth = result.type === 'master';
    client.authorizedWorkspaceIds = result.authorizedWorkspaceIds
      ? new Set(result.authorizedWorkspaceIds)
      : null;
    client.authorizedSessionIds.clear();
    client.authorizedArtifactIds.clear();
    client.subscribedSessions.clear();
  }

  // ── Internal ──────────────────────────────────────────────

  /**
   * Extract client IP from the HTTP upgrade request.
   * Always uses the socket address — never trusts X-Forwarded-For since
   * the gateway can be directly exposed (e.g. via Tailscale) and clients
   * could spoof XFF to bypass rate limiting and per-IP connection limits.
   */
  private getClientIp(req: http.IncomingMessage): string {
    return req.socket.remoteAddress ?? 'unknown';
  }

  /** Count connections from a specific IP. */
  private countConnectionsFromIp(ip: string): number {
    let count = 0;
    for (const [, client] of this.clients) {
      if (client.remoteIp === ip) count++;
    }
    return count;
  }

  /** Validate the Origin header for non-localhost connections. */
  private isOriginAllowed(req: http.IncomingMessage): boolean {
    const origin = req.headers.origin;
    // No origin header (non-browser clients like wscat, Discord bot) — allow
    if (!origin) return true;
    // Static allow-list (known dev/prod ports)
    if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
    // Allow connections from the gateway's own serving origin (SPA served by this server)
    const selfPort = this.config.port;
    if (
      origin === `http://127.0.0.1:${selfPort}` ||
      origin === `http://localhost:${selfPort}`
    ) {
      return true;
    }
    // Tailscale origins (*.ts.net) are allowed
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith('.ts.net')) return true;
    } catch {
      // Invalid origin URL
    }
    return false;
  }

  /** Close idle authenticated connections. */
  private checkIdleConnections(): void {
    const now = Date.now();
    for (const [ws, client] of this.clients) {
      if (!client.authenticated) continue;
      if (now - client.lastActivity > IDLE_TIMEOUT_MS) {
        console.log(`[gateway] Closing idle connection: ${client.clientType} (${client.clientId})`);
        ws.close(4008, 'Idle timeout');
        this.clients.delete(ws);
      }
    }
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const remoteIp = this.getClientIp(req);

    // Enforce total connection limit
    if (this.clients.size >= MAX_TOTAL_CONNECTIONS) {
      console.warn(`[gateway] Connection rejected: max total connections (${MAX_TOTAL_CONNECTIONS}) reached`);
      ws.close(4029, 'Too many connections');
      return;
    }

    // Enforce per-IP connection limit
    if (this.countConnectionsFromIp(remoteIp) >= MAX_CONNECTIONS_PER_IP) {
      console.warn(`[gateway] Connection rejected: max connections per IP (${MAX_CONNECTIONS_PER_IP}) reached for ${remoteIp}`);
      ws.close(4029, 'Too many connections from this IP');
      return;
    }

    // Validate Origin header
    if (!this.isOriginAllowed(req)) {
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
      authorizedSessionIds: new Set(),
      authorizedArtifactIds: new Set(),
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
          sendResponse(ws, {
            type: 'error',
            requestType: 'unknown',
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

      this.applyAuthResult(client, authResult);
      client.clientType = request.clientType;
      if (request.clientId) client.clientId = request.clientId;
      console.log(
        `[gateway] Client authenticated: ${client.clientType} (${client.clientId}) from ${client.remoteIp}`,
      );
      sendResponse(ws, { type: 'ok', requestType: 'connect' });
      return;
    }

    // All other requests require authentication
    if (!client.authenticated) {
      sendResponse(ws, {
        type: 'error',
        requestType: request.type,
        message: 'Not authenticated. Send a connect request first.',
      });
      return;
    }

    if (!this.agentOps) {
      sendResponse(ws, {
        type: 'error',
        requestType: request.type,
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
    );
  }
}
