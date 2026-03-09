/**
 * Gateway Server — WebSocket control plane for remote Sero access.
 *
 * Inspired by OpenClaw's hub-and-spoke architecture. A single WebSocket
 * server routes messages between external clients (Discord bot, web UI,
 * CLI) and the agent session pool running in the Electron main process.
 *
 * Binds to localhost by default; Tailscale integration can optionally
 * expose it to a private tailnet.
 *
 * Security hardening (2026-03-09):
 *   - Rate limiting on auth attempts (5 failures / 60s → 5min block)
 *   - Max WebSocket payload size (1 MB)
 *   - Max connections per IP (10) and total (50)
 *   - Origin header validation for non-Tailscale connections
 *   - 30-minute idle timeout for authenticated connections
 *   - Referrer-Policy: no-referrer on all HTTP responses
 *   - Failed auth logging with client IP
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

import { GatewayAuth } from './auth';
import { RateLimiter } from './rate-limiter';
import { redactSecrets } from '../lib/secret-redact';
import {
  validateRequest,
  type GatewayRequest,
  type GatewayResponse,
  type GatewayPushEvent,
} from './protocol';

// ── Constants ──────────────────────────────────────────────────

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
/** Allowed origins for WebSocket connections (non-Tailscale). */
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:18800',
  'http://localhost:18800',
  'http://127.0.0.1:18801',
  'http://localhost:18801',
]);

// ── Types ───────────────────────────────────────────────────

export interface GatewayConfig {
  /** Port for the WebSocket server. Default: 18800. */
  port: number;
  /** Bind host. Default: '127.0.0.1' (localhost only). */
  host: string;
  /** Path to the auth token file. */
  tokenPath: string;
}

/**
 * Optional callback that returns the web chat HTML.
 * When set, the gateway's HTTP server also serves the chat UI at "/",
 * so only a single port needs to be exposed via Tailscale.
 */
type WebChatHtmlProvider = () => string;

interface ConnectedClient {
  ws: WebSocket;
  clientType: string;
  clientId: string;
  authenticated: boolean;
  /** Session IDs this client is subscribed to for push events. */
  subscribedSessions: Set<string>;
  /** Source IP address of the client. */
  remoteIp: string;
  /** Timestamp of last activity (for idle timeout). */
  lastActivity: number;
}

/** Operations the gateway can delegate to the agent pool. */
export interface GatewayAgentOps {
  /** Open or get an existing agent session. Returns session path. */
  openSession(
    sessionId: string,
    workspaceId: string,
  ): Promise<void>;
  /** Send a prompt to an agent session. */
  prompt(
    sessionId: string,
    text: string,
  ): Promise<void>;
  /** Steer an active agent. */
  steer(sessionId: string, text: string): Promise<void>;
  /** Abort an active agent. */
  abort(sessionId: string): Promise<void>;
  /** List workspaces. */
  listWorkspaces(): Promise<Array<{ id: string; name: string; path: string }>>;
  /** List sessions for a workspace. */
  listSessions(
    workspaceId: string,
  ): Promise<Array<{ id: string; name: string }>>;
}

// ── Server ──────────────────────────────────────────────────

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private auth: GatewayAuth;
  private clients = new Map<WebSocket, ConnectedClient>();
  private agentOps: GatewayAgentOps | null = null;
  private config: GatewayConfig;
  private webChatHtml: WebChatHtmlProvider | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** Rate limiter for auth attempts (5 failures / 60s → 5 min block). */
  private authLimiter = new RateLimiter({
    maxAttempts: 5,
    windowMs: 60_000,
    blockMs: 5 * 60_000,
  });

  constructor(config: GatewayConfig) {
    this.config = config;
    this.auth = new GatewayAuth(config.tokenPath);
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
      // Security: add Referrer-Policy to all responses
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const pathname = (req.url ?? '/').split('?')[0];
      if (this.webChatHtml && (pathname === '/' || pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.webChatHtml());
      } else if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: MAX_PAYLOAD_BYTES,
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (err) => {
      console.error('[gateway] WebSocket server error:', err);
    });

    // Start idle connection checker (every 5 minutes)
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
      if (!client.authenticated) continue;
      if (client.subscribedSessions.has(sessionId)) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }

  /** Push an event to ALL authenticated clients (e.g. artifact_added). */
  broadcastEvent(event: GatewayPushEvent): void {
    const payload = JSON.stringify(event);
    for (const [ws, client] of this.clients) {
      if (!client.authenticated) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────

  /** Extract client IP from the HTTP upgrade request. */
  private getClientIp(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
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
    // Localhost connections are always allowed
    if (ALLOWED_ORIGINS.has(origin)) return true;
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
          this.send(ws, {
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
        this.send(ws, {
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
        this.send(ws, {
          type: 'error',
          requestType: 'connect',
          message: 'Too many authentication attempts. Try again later.',
        });
        ws.close(4029, 'Rate limited');
        return;
      }

      if (!this.auth.validate(request.token)) {
        console.warn(
          `[gateway] Auth failed: ${client.remoteIp} (client type: ${request.clientType})`,
        );
        this.send(ws, {
          type: 'error',
          requestType: 'connect',
          message: 'Invalid authentication token',
        });
        ws.close(4003, 'Authentication failed');
        return;
      }

      // Successful auth — reset rate limiter for this IP
      this.authLimiter.reset(client.remoteIp);

      client.authenticated = true;
      client.clientType = request.clientType;
      if (request.clientId) client.clientId = request.clientId;
      console.log(
        `[gateway] Client authenticated: ${client.clientType} (${client.clientId}) from ${client.remoteIp}`,
      );
      this.send(ws, { type: 'ok', requestType: 'connect' });
      return;
    }

    // All other requests require authentication
    if (!client.authenticated) {
      this.send(ws, {
        type: 'error',
        requestType: request.type,
        message: 'Not authenticated. Send a connect request first.',
      });
      return;
    }

    if (!this.agentOps) {
      this.send(ws, {
        type: 'error',
        requestType: request.type,
        message: 'Agent operations not available',
      });
      return;
    }

    switch (request.type) {
      case 'prompt': {
        try {
          // Subscribe client to this session for push events
          client.subscribedSessions.add(request.sessionId);
          // Ensure session is open
          await this.agentOps.openSession(
            request.sessionId,
            request.workspaceId,
          );
          // Send prompt
          await this.agentOps.prompt(request.sessionId, request.text);
          this.send(ws, { type: 'ok', requestType: 'prompt' });
        } catch (err) {
          this.send(ws, {
            type: 'error',
            requestType: 'prompt',
            message: err instanceof Error ? err.message : 'Prompt failed',
          });
        }
        break;
      }

      case 'steer': {
        try {
          await this.agentOps.steer(request.sessionId, request.text);
          this.send(ws, { type: 'ok', requestType: 'steer' });
        } catch (err) {
          this.send(ws, {
            type: 'error',
            requestType: 'steer',
            message: err instanceof Error ? err.message : 'Steer failed',
          });
        }
        break;
      }

      case 'abort': {
        try {
          await this.agentOps.abort(request.sessionId);
          this.send(ws, { type: 'ok', requestType: 'abort' });
        } catch (err) {
          this.send(ws, {
            type: 'error',
            requestType: 'abort',
            message: err instanceof Error ? err.message : 'Abort failed',
          });
        }
        break;
      }

      case 'status': {
        this.send(ws, {
          type: 'ok',
          requestType: 'status',
          data: this.getStatus(),
        });
        break;
      }

      case 'list_workspaces': {
        try {
          const workspaces = await this.agentOps.listWorkspaces();
          this.send(ws, {
            type: 'ok',
            requestType: 'list_workspaces',
            data: workspaces,
          });
        } catch (err) {
          this.send(ws, {
            type: 'error',
            requestType: 'list_workspaces',
            message:
              err instanceof Error ? err.message : 'List workspaces failed',
          });
        }
        break;
      }

      case 'list_sessions': {
        try {
          const sessions = await this.agentOps.listSessions(
            request.workspaceId,
          );
          this.send(ws, {
            type: 'ok',
            requestType: 'list_sessions',
            data: sessions,
          });
        } catch (err) {
          this.send(ws, {
            type: 'error',
            requestType: 'list_sessions',
            message:
              err instanceof Error ? err.message : 'List sessions failed',
          });
        }
        break;
      }
    }
  }

  private send(ws: WebSocket, msg: GatewayResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
