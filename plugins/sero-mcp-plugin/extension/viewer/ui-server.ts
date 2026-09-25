import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAllowAttribute, type McpUiResourcePermissions } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { McpServerManager } from '../manager/server-manager';
import { VIEWER_SHELL_SCRIPT } from '../../shared/viewer-shell';
import { buildAppCsp, buildHostHtmlTemplate, buildViewerHostCspContent } from './host-template';
import { callViewerTool, listAppTools, readViewerResource, toRecord } from './ui-proxy';
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
  toolResult?: Record<string, unknown>;
  /** Tools from the server config that the app must not see or call. */
  excludeTools?: string[];
  /** Permissions for the frame `allow` attribute. The app gets none unless the user granted them. */
  grantedPermissions?: McpUiResourcePermissions;
  /** Asks the user before the app opens a link. Resolves true when the page was opened. */
  onOpenLink?: (url: string) => Promise<boolean>;
  onUnauthorized?: (serverName: string, message: string) => Promise<void>;
  /** Set only when the app is shown in a chat. It delivers `ui/message` and `ui/update-model-context` there. */
  onAppMessage?: (kind: 'message' | 'context', params: Record<string, unknown>) => void;
  onClose?: (reason: string) => void;
}

export interface UiSessionHandle {
  viewerId: string;
  /** The frame `allow` value for the granted permissions. A frame that embeds the viewer must pass it on. */
  allowAttribute: string;
  viewerUrl: string;
  /** The app frame URL. Its host is unique per app, so the frame keeps a real origin. */
  appFrameUrl: string;
  serverName: string;
  resourceUri: string;
}

/** A viewer session plus the per-app host that serves its frame. */
interface ViewerSession extends UiSessionOptions {
  /** The DNS label of the app frame host, for example `a1b2c3d4e5f60718.localhost`. */
  appLabel: string;
  appFrameUrl: string;
}

/**
 * One loopback server for all MCP app viewers. Each viewer is a session with
 * a random token; the token is in the page URL and in every proxy request.
 * The app frame loads from its own `<label>.localhost` host, so it keeps a
 * real origin without sharing one with the shell or with another app.
 */
export class McpUiServer {
  private readonly sessions = new Map<string, ViewerSession>();
  private listening: Promise<{ server: http.Server; port: number }> | null = null;
  private port = 0;

  constructor(private readonly manager: McpServerManager) {}

  async open(options: UiSessionOptions): Promise<UiSessionHandle> {
    const { port } = await this.start();
    while (this.sessions.size >= MAX_VIEWER_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.close(oldest, 'session-limit');
    }
    const viewerId = randomUUID();
    // A separate host label per app: the frame gets its own origin, and the shell
    // token is not in the app URL, so an app cannot load the shell origin.
    const appLabel = randomBytes(8).toString('hex');
    const appFrameUrl = `http://${appLabel}.localhost:${port}/ui-app`;
    this.sessions.set(viewerId, { ...options, appLabel, appFrameUrl });
    return {
      viewerId,
      allowAttribute: buildAllowAttribute(options.grantedPermissions),
      viewerUrl: `http://127.0.0.1:${port}/?session=${encodeURIComponent(viewerId)}`,
      appFrameUrl,
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

  private async start(): Promise<{ server: http.Server; port: number }> {
    this.listening ??= listen(http.createServer((request, response) => {
      void this.handle(request, response);
    }));
    const started = await this.listening;
    this.port = started.port;
    return started;
  }

  /** The session whose app frame host matches the request Host header. */
  private appSessionFor(host: string | undefined): ViewerSession | undefined {
    const name = (host ?? '').split(':')[0]?.toLowerCase() ?? '';
    if (!name.endsWith('.localhost')) return undefined;
    const label = name.slice(0, -'.localhost'.length);
    for (const session of this.sessions.values()) {
      if (session.appLabel === label) return session;
    }
    return undefined;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const method = request.method || 'GET';
      const url = new URL(request.url || '/', 'http://127.0.0.1');

      // An app frame host serves the app document and nothing else. The shell
      // host below serves the shell, its script and the proxy routes.
      const appSession = this.appSessionFor(request.headers.host);
      if (appSession) {
        if (method === 'GET' && url.pathname === '/ui-app') {
          sendHtml(response, appSession.resource.html, buildAppCsp(appSession.resource.meta.csp));
          return;
        }
        sendJson(response, 404, { ok: false, error: 'Not found' });
        return;
      }

      if (method === 'GET' && url.pathname === `/${VIEWER_SHELL_SCRIPT}`) {
        await sendShellScript(response);
        return;
      }

      if (method === 'GET') {
        const viewerId = url.searchParams.get('session') ?? '';
        const session = this.sessions.get(viewerId);
        if (!session) {
          sendJson(response, 403, { ok: false, error: 'Invalid viewer session token' });
          return;
        }
        if (url.pathname === '/') {
          sendHtml(response, buildHostHtmlTemplate({
            token: viewerId,
            appFrameUrl: session.appFrameUrl,
            title: session.title,
            allowAttribute: buildAllowAttribute(session.grantedPermissions),
            toolArgs: session.toolArgs ?? {},
            toolResult: session.toolResult,
            toolInfo: session.toolInfo,
            chat: session.onAppMessage !== undefined,
          }), buildViewerHostCspContent(`http://*.localhost:${this.port}`));
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
        return { tools: listAppTools(this.manager, session) };
      case '/proxy/resources/list':
        return { resources: connection?.resources ?? [] };
      case '/proxy/resources/read':
        return readViewerResource(this.manager, session, params);
      case '/proxy/resources/templates/list':
        return { resourceTemplates: [] };
      case '/proxy/prompts/list':
        return { prompts: [] };
      case '/proxy/ui/open-link': {
        const url = toRecord(params).url;
        const opened = typeof url === 'string' && session.onOpenLink ? await session.onOpenLink(url) : false;
        return { isError: !opened };
      }
      case '/proxy/ui/message':
      case '/proxy/ui/context':
        if (!session.onAppMessage) throw new Error('This app is not shown in a chat.');
        session.onAppMessage(pathname === '/proxy/ui/message' ? 'message' : 'context', toRecord(params));
        return {};
      default:
        return undefined;
    }
  }
}

/**
 * The plugin build writes the shell to dist/ui. From source the extension is in
 * extension/viewer/; in a packaged plugin it is one bundle in extension/.
 */
function findShellScript(): string | null {
  let dir = typeof __dirname === 'string' ? __dirname : process.cwd();
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(dir, 'dist', 'ui', VIEWER_SHELL_SCRIPT);
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

async function sendShellScript(response: ServerResponse): Promise<void> {
  const shellPath = findShellScript();
  if (!shellPath) {
    sendJson(response, 404, { ok: false, error: 'The MCP viewer shell is not built. Build the MCP plugin.' });
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(await readFile(shellPath));
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
  if (!bodyText.trim()) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error('The request body is not valid JSON.');
  }
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
