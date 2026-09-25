import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildAllowAttribute } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { McpServerManager } from '../manager/server-manager';
import { applyCspMeta, buildCspMetaContent, buildHostHtmlTemplate, buildViewerHostCspContent } from './host-template';
import { callViewerTool, readViewerResource, toRecord } from './ui-proxy';
import type { UiResourceContent, UiToolInfo } from './types';

const MAX_BODY_SIZE = 2 * 1024 * 1024;
/** Chat can show many app results. Above this limit, the oldest viewer session closes. */
export const MAX_VIEWER_SESSIONS = 8;

export interface UiSessionOptions {
  serverName: string;
  resourceUri: string;
  title: string;
  resource: UiResourceContent;
  toolInfo?: UiToolInfo;
  toolArgs?: Record<string, unknown>;
  onUnauthorized?: (serverName: string, message: string) => Promise<void>;
  onUiMessage?: (params: Record<string, unknown>) => Promise<void> | void;
  onClose?: (reason: string) => void;
}

export interface UiSessionHandle {
  viewerId: string;
  viewerUrl: string;
  serverName: string;
  resourceUri: string;
}

/**
 * One loopback server for all MCP app viewers. Each viewer is a session with
 * a random token; the token is in the page URL and in every proxy request.
 */
export class McpUiServer {
  private readonly sessions = new Map<string, UiSessionOptions>();
  private listening: Promise<{ server: http.Server; port: number }> | null = null;

  constructor(private readonly manager: McpServerManager) {}

  async open(options: UiSessionOptions): Promise<UiSessionHandle> {
    const { port } = await this.start();
    while (this.sessions.size >= MAX_VIEWER_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.close(oldest, 'session-limit');
    }
    const viewerId = randomUUID();
    this.sessions.set(viewerId, options);
    return {
      viewerId,
      viewerUrl: `http://127.0.0.1:${port}/?session=${encodeURIComponent(viewerId)}`,
      serverName: options.serverName,
      resourceUri: options.resourceUri,
    };
  }

  has(viewerId: string): boolean {
    return this.sessions.has(viewerId);
  }

  close(viewerId: string, reason = 'closed'): boolean {
    const session = this.sessions.get(viewerId);
    if (!session) return false;
    this.sessions.delete(viewerId);
    session.onClose?.(reason);
    return true;
  }

  closeForServer(serverName: string, reason = 'server-config-changed'): void {
    for (const [viewerId, session] of this.sessions) {
      if (session.serverName === serverName) this.close(viewerId, reason);
    }
  }

  async closeAll(reason = 'closed'): Promise<void> {
    for (const viewerId of [...this.sessions.keys()]) this.close(viewerId, reason);
    const listening = this.listening;
    this.listening = null;
    if (!listening) return;
    const { server } = await listening;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private start(): Promise<{ server: http.Server; port: number }> {
    this.listening ??= listen(http.createServer((request, response) => {
      void this.handle(request, response);
    }));
    return this.listening;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const method = request.method || 'GET';
      const url = new URL(request.url || '/', 'http://127.0.0.1');

      if (method === 'GET') {
        const viewerId = url.searchParams.get('session') ?? '';
        const session = this.sessions.get(viewerId);
        if (!session) {
          sendJson(response, 403, { ok: false, error: 'Invalid viewer session token' });
          return;
        }
        if (url.pathname === '/') {
          sendHtml(response, buildHostHtmlTemplate({
            sessionId: viewerId,
            serverName: session.serverName,
            resourceUri: session.resourceUri,
            title: session.title,
            allowAttribute: buildAllowAttribute(session.resource.meta.permissions),
            toolArgs: session.toolArgs ?? {},
            toolInfo: session.toolInfo,
          }), buildViewerHostCspContent());
          return;
        }
        if (url.pathname === '/ui-app') {
          const csp = buildCspMetaContent(session.resource.meta.csp);
          sendHtml(response, applyCspMeta(session.resource.html, csp), csp);
          return;
        }
        sendJson(response, 404, { ok: false, error: 'Not found' });
        return;
      }

      if (method !== 'POST') {
        sendJson(response, 404, { ok: false, error: 'Not found' });
        return;
      }

      const body = toRecord(await readBody(request));
      const session = typeof body.token === 'string' ? this.sessions.get(body.token) : undefined;
      if (!session) {
        sendJson(response, 403, { ok: false, error: 'Invalid viewer session token' });
        return;
      }
      const result = await this.proxy(url.pathname, session, body.params);
      if (result === undefined) {
        sendJson(response, 404, { ok: false, error: 'Not found' });
        return;
      }
      sendJson(response, 200, { ok: true, result });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async proxy(pathname: string, session: UiSessionOptions, params: unknown): Promise<unknown> {
    const connection = this.manager.getConnection(session.serverName);
    switch (pathname) {
      case '/proxy/tools/call':
        return callViewerTool(this.manager, session, params);
      case '/proxy/tools/list':
        return { tools: connection?.tools ?? [] };
      case '/proxy/resources/list':
        return { resources: connection?.resources ?? [] };
      case '/proxy/resources/read':
        return readViewerResource(this.manager, session, params);
      case '/proxy/resources/templates/list':
        return { resourceTemplates: [] };
      case '/proxy/prompts/list':
        return { prompts: [] };
      case '/proxy/ui/message':
      case '/proxy/ui/context':
        await session.onUiMessage?.(toRecord(params));
        return {};
      default:
        return undefined;
    }
  }
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_SIZE) {
      throw new Error('Request body too large.');
    }
    chunks.push(buffer);
  }
  const bodyText = Buffer.concat(chunks).toString('utf8');
  return bodyText.trim() ? JSON.parse(bodyText) : {};
}

function sendHtml(response: ServerResponse, html: string, csp?: string): void {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(csp ? { 'Content-Security-Policy': csp } : {}),
  });
  response.end(html);
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function listen(server: http.Server): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to determine MCP viewer port.'));
        return;
      }
      // An idle viewer server must not keep a Pi CLI process alive.
      server.unref();
      resolve({ server, port: address.port });
    });
  });
}
