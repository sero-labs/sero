/**
 * Gateway Server — WebSocket control plane for remote Sero access.
 *
 * Inspired by OpenClaw's hub-and-spoke architecture. A single WebSocket
 * server routes messages between external clients (Discord bot, web UI,
 * CLI) and the agent session pool running in the Electron main process.
 *
 * Binds to localhost by default; Tailscale integration can optionally
 * expose it to a private tailnet.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

import { GatewayAuth } from './auth';
import {
  validateRequest,
  type GatewayRequest,
  type GatewayResponse,
  type GatewayPushEvent,
} from './protocol';

// ── Types ───────────────────────────────────────────────────

export interface GatewayConfig {
  /** Port for the WebSocket server. Default: 18800. */
  port: number;
  /** Bind host. Default: '127.0.0.1' (localhost only). */
  host: string;
  /** Path to the auth token file. */
  tokenPath: string;
}

interface ConnectedClient {
  ws: WebSocket;
  clientType: string;
  clientId: string;
  authenticated: boolean;
  /** Session IDs this client is subscribed to for push events. */
  subscribedSessions: Set<string>;
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

  constructor(config: GatewayConfig) {
    this.config = config;
    this.auth = new GatewayAuth(config.tokenPath);
  }

  /** Register agent operations handler (call before start). */
  setAgentOps(ops: GatewayAgentOps): void {
    this.agentOps = ops;
  }

  /** Start the gateway server. */
  async start(): Promise<void> {
    if (this.wss) return;

    this.httpServer = http.createServer();
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.wss.on('error', (err) => {
      console.error('[gateway] WebSocket server error:', err);
    });

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

  private handleConnection(ws: WebSocket): void {
    const client: ConnectedClient = {
      ws,
      clientType: 'unknown',
      clientId: `client-${Date.now()}`,
      authenticated: false,
      subscribedSessions: new Set(),
    };
    this.clients.set(ws, client);

    // Auto-disconnect unauthenticated clients after 10s
    const authTimeout = setTimeout(() => {
      if (!client.authenticated) {
        ws.close(4001, 'Authentication timeout');
        this.clients.delete(ws);
      }
    }, 10_000);

    ws.on('message', async (data) => {
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
          message: err instanceof Error ? err.message : 'Internal error',
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
      if (!this.auth.validate(request.token)) {
        this.send(ws, {
          type: 'error',
          requestType: 'connect',
          message: 'Invalid authentication token',
        });
        ws.close(4003, 'Authentication failed');
        return;
      }
      client.authenticated = true;
      client.clientType = request.clientType;
      if (request.clientId) client.clientId = request.clientId;
      console.log(
        `[gateway] Client authenticated: ${client.clientType} (${client.clientId})`,
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
