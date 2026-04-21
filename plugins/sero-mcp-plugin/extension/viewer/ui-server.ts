import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildAllowAttribute } from '@modelcontextprotocol/ext-apps/app-bridge';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServerManager } from '../manager/server-manager';
import { applyCspMeta, buildCspMetaContent, buildHostHtmlTemplate } from './host-template';
import type { UiResourceContent, UiToolInfo } from './types';

const MAX_BODY_SIZE = 2 * 1024 * 1024;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface PostBody {
  token?: string;
  params?: unknown;
}

export interface UiServerOptions {
  serverName: string;
  resourceUri: string;
  title: string;
  resource: UiResourceContent;
  toolInfo?: UiToolInfo;
  toolArgs?: Record<string, unknown>;
  manager: McpServerManager;
  onUnauthorized?: (serverName: string, message: string) => Promise<void>;
  onUiMessage?: (params: Record<string, unknown>) => Promise<void> | void;
  onClose?: (reason: string) => void;
}

export interface UiServerHandle {
  sessionId: string;
  viewerUrl: string;
  serverName: string;
  resourceUri: string;
  close: (reason?: string) => void;
}

export async function startUiServer(options: UiServerOptions): Promise<UiServerHandle> {
  const sessionId = randomUUID();
  let closed = false;
  let closeReason = 'closed';

  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method || 'GET';
      const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);

      if (method === 'GET' && url.pathname === '/') {
        if (!validateSessionQuery(url, sessionId, response)) return;
        sendHtml(response, buildHostHtmlTemplate({
          sessionId,
          serverName: options.serverName,
          resourceUri: options.resourceUri,
          title: options.title,
          allowAttribute: buildAllowAttribute(options.resource.meta.permissions),
          toolArgs: options.toolArgs ?? {},
          toolInfo: options.toolInfo,
        }));
        return;
      }

      if (method === 'GET' && url.pathname === '/ui-app') {
        if (!validateSessionQuery(url, sessionId, response)) return;
        sendHtml(response, applyCspMeta(options.resource.html, buildCspMetaContent(options.resource.meta.csp)));
        return;
      }

      if (method !== 'POST') {
        sendJson(response, 404, { ok: false, error: 'Not found' });
        return;
      }

      const body = await readBody(request);
      if (!validateSessionBody(body, sessionId, response)) {
        return;
      }

      if (url.pathname === '/proxy/tools/call') {
        sendJson(response, 200, {
          ok: true,
          result: await callViewerTool(options, body.params),
        });
        return;
      }

      if (url.pathname === '/proxy/tools/list') {
        sendJson(response, 200, {
          ok: true,
          result: { tools: options.manager.getConnection(options.serverName)?.tools ?? [] },
        });
        return;
      }

      if (url.pathname === '/proxy/resources/list') {
        sendJson(response, 200, {
          ok: true,
          result: { resources: options.manager.getConnection(options.serverName)?.resources ?? [] },
        });
        return;
      }

      if (url.pathname === '/proxy/resources/read') {
        sendJson(response, 200, {
          ok: true,
          result: await readViewerResource(options, body.params),
        });
        return;
      }

      if (url.pathname === '/proxy/resources/templates/list') {
        sendJson(response, 200, {
          ok: true,
          result: { resourceTemplates: [] },
        });
        return;
      }

      if (url.pathname === '/proxy/prompts/list') {
        sendJson(response, 200, {
          ok: true,
          result: { prompts: [] },
        });
        return;
      }

      if (url.pathname === '/proxy/ui/message' || url.pathname === '/proxy/ui/context') {
        await options.onUiMessage?.(toRecord(body.params));
        sendJson(response, 200, { ok: true, result: {} });
        return;
      }

      sendJson(response, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { ok: false, error: message });
    }
  });

  const port = await listen(server);
  const viewerUrl = `http://127.0.0.1:${port}/?session=${encodeURIComponent(sessionId)}`;

  const close = (reason = 'closed') => {
    if (closed) {
      return;
    }
    closed = true;
    closeReason = reason;
    server.close();
  };

  server.on('close', () => {
    options.onClose?.(closeReason);
  });

  return {
    sessionId,
    viewerUrl,
    serverName: options.serverName,
    resourceUri: options.resourceUri,
    close,
  };
}

async function callViewerTool(options: UiServerOptions, params: unknown): Promise<CallToolResult> {
  const toolCall = toRecord(params);
  const toolName = typeof toolCall.name === 'string' ? toolCall.name.trim() : '';
  const toolArguments = isRecord(toolCall.arguments) ? toolCall.arguments : undefined;
  if (!toolName) {
    return createToolErrorResult('Tool name is required.');
  }

  try {
    return await options.manager.callTool(options.serverName, toolName, toolArguments);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const message = error.message || 'Authentication is required.';
      await options.onUnauthorized?.(options.serverName, message);
      return createToolErrorResult('This MCP UI session lost authentication. Re-authenticate the server in Sero and reopen the UI.');
    }

    const message = error instanceof Error ? error.message : String(error);
    return createToolErrorResult(message);
  }
}

async function readViewerResource(options: UiServerOptions, params: unknown): Promise<ReadResourceResult> {
  const readRequest = toRecord(params);
  const resourceUri = typeof readRequest.uri === 'string' ? readRequest.uri.trim() : '';
  if (!resourceUri) {
    throw new Error('Resource URI is required.');
  }

  try {
    return await options.manager.readResource(options.serverName, resourceUri);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const message = error.message || 'Authentication is required.';
      await options.onUnauthorized?.(options.serverName, message);
      throw new Error('This MCP UI session lost authentication. Re-authenticate the server in Sero and reopen the UI.');
    }
    throw error;
  }
}

function validateSessionQuery(url: URL, sessionId: string, response: ServerResponse): boolean {
  if (url.searchParams.get('session') === sessionId) {
    return true;
  }
  sendJson(response, 403, { ok: false, error: 'Invalid viewer session token' });
  return false;
}

function validateSessionBody(body: unknown, sessionId: string, response: ServerResponse): body is PostBody {
  if (isRecord(body) && body.token === sessionId) {
    return true;
  }
  sendJson(response, 403, { ok: false, error: 'Invalid viewer session token' });
  return false;
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
  if (!bodyText.trim()) {
    return {};
  }
  return JSON.parse(bodyText);
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
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

function createToolErrorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to determine MCP viewer port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
