/**
 * Dev server reverse proxy — exposes registered workspace dev servers
 * over the gateway's HTTP listener so remote clients (web-remote SPA,
 * Tailscale-connected browsers) can preview them.
 *
 * Routes are mounted under `/p/<workspaceId>/<port>/...`. Authentication
 * is via short-lived signed tickets (`DevProxyTicketManager`) presented
 * either as the `sero_devproxy` cookie or — only on the very first
 * navigation — a `?t=<ticket>` query param. The query form auto-promotes
 * itself to a cookie on the first response so subsequent fetches no longer
 * leak the ticket through Referer headers.
 *
 * Only ports listed in `DevServerRegistry` are reachable. The registry is
 * resolved through `GatewayAgentOps.resolveDevServerTarget`, which also
 * yields the bridge port for localhost-only servers.
 */

import http from 'http';
import { Socket } from 'net';
import type { Duplex } from 'stream';
import type { GatewayAgentOps, GatewayDevServerChange } from './types';
import type { GatewayDevServerChangedEvent } from './protocol';
import type { DevProxyTicketManager, DevProxyTicketPayload } from '../security/devserver-ticket';

/** Path prefix for proxied dev server traffic. */
export const DEV_PROXY_PREFIX = '/p/';

/**
 * Convert an internal `GatewayDevServerChange` to the wire-format push event
 * that gateway clients receive.
 */
export function toDevServerChangedEvent(
  change: GatewayDevServerChange,
): GatewayDevServerChangedEvent {
  return {
    type: 'dev_server_changed',
    workspaceId: change.workspaceId,
    change:
      change.type === 'registered'
        ? { type: 'registered', server: change.server as unknown as Record<string, unknown> }
        : change.type === 'unregistered'
          ? { type: 'unregistered', serverId: change.serverId }
          : { type: 'status_changed', serverId: change.serverId, status: change.status },
  };
}

/** Cookie name for persisted tickets. */
const COOKIE_NAME = 'sero_devproxy';

/**
 * Hop-by-hop headers stripped from both request and response sides per
 * RFC 7230 §6.1. Plus `Content-Security-Policy` / `X-Frame-Options` from
 * upstream, which would otherwise prevent embedding the dev server in
 * the SPA's iframe.
 */
const HOP_BY_HOP_REQUEST = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'cookie', // Cookies are not forwarded — they belong to the gateway.
]);

const STRIP_FROM_UPSTREAM = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Drop framing restrictions so the SPA can iframe the preview.
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
]);

interface ParsedProxyRequest {
  workspaceId: string;
  port: number;
  rest: string;
}

/**
 * Parse `/p/<workspaceId>/<port>/...` into its parts. Returns null when
 * the path doesn't match the prefix or the components are malformed.
 */
export function parseDevProxyPath(rawUrl: string): ParsedProxyRequest | null {
  if (!rawUrl.startsWith(DEV_PROXY_PREFIX)) return null;
  const queryIdx = rawUrl.indexOf('?');
  const pathname = queryIdx >= 0 ? rawUrl.slice(0, queryIdx) : rawUrl;
  const search = queryIdx >= 0 ? rawUrl.slice(queryIdx) : '';

  const after = pathname.slice(DEV_PROXY_PREFIX.length);
  const slash1 = after.indexOf('/');
  if (slash1 <= 0) return null;
  const workspaceId = decodeURIComponent(after.slice(0, slash1));

  const remainder = after.slice(slash1 + 1);
  const slash2 = remainder.indexOf('/');
  const portStr = slash2 >= 0 ? remainder.slice(0, slash2) : remainder;
  const trailing = slash2 >= 0 ? remainder.slice(slash2) : '/';

  if (!/^\d+$/.test(portStr)) return null;
  const port = Number.parseInt(portStr, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!workspaceId) return null;

  return { workspaceId, port, rest: `${trailing || '/'}${search}` };
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return null;
}

function readQueryTicket(rest: string): { ticket: string | null; restWithoutTicket: string } {
  const queryIdx = rest.indexOf('?');
  if (queryIdx < 0) return { ticket: null, restWithoutTicket: rest };

  const path = rest.slice(0, queryIdx);
  const params = new URLSearchParams(rest.slice(queryIdx + 1));
  const ticket = params.get('t');
  if (!ticket) return { ticket: null, restWithoutTicket: rest };

  params.delete('t');
  const remaining = params.toString();
  return {
    ticket,
    restWithoutTicket: remaining ? `${path}?${remaining}` : path,
  };
}

interface ResolvedTicket {
  payload: DevProxyTicketPayload;
  /** When true, the ticket arrived as a query param and must be set as a cookie. */
  promoteToCookie: boolean;
  ticketString: string;
  rest: string;
}

function resolveTicket(
  parsed: ParsedProxyRequest,
  cookieHeader: string | undefined,
  tickets: DevProxyTicketManager,
): ResolvedTicket | null {
  // 1. Cookie takes precedence — bound to a workspace+port path so it
  //    can't accidentally cross-authorize a different proxy target.
  const cookieTicket = readCookie(cookieHeader, COOKIE_NAME);
  if (cookieTicket) {
    const payload = tickets.verify(cookieTicket);
    if (
      payload &&
      payload.workspaceId === parsed.workspaceId &&
      payload.port === parsed.port
    ) {
      return {
        payload,
        promoteToCookie: false,
        ticketString: cookieTicket,
        rest: parsed.rest,
      };
    }
  }

  // 2. Fall back to ?t= for first navigation.
  const { ticket, restWithoutTicket } = readQueryTicket(parsed.rest);
  if (ticket) {
    const payload = tickets.verify(ticket);
    if (
      payload &&
      payload.workspaceId === parsed.workspaceId &&
      payload.port === parsed.port
    ) {
      return {
        payload,
        promoteToCookie: true,
        ticketString: ticket,
        rest: restWithoutTicket,
      };
    }
  }

  return null;
}

function buildCookie(
  ticket: string,
  workspaceId: string,
  port: number,
  expiresAt: number,
  isHttps: boolean,
): string {
  const path = `${DEV_PROXY_PREFIX}${encodeURIComponent(workspaceId)}/${port}`;
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(ticket)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

function isHttps(req: http.IncomingMessage): boolean {
  // Tailscale `serve` terminates TLS and forwards plain HTTP, but adds
  // X-Forwarded-Proto. The gateway is bound to localhost otherwise.
  const xfp = req.headers['x-forwarded-proto'];
  if (typeof xfp === 'string' && xfp.toLowerCase().includes('https')) return true;
  return false;
}

function rejectUnauthorized(res: http.ServerResponse, message: string): void {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

function rejectNotFound(res: http.ServerResponse, message: string): void {
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

function filterRequestHeaders(req: http.IncomingMessage): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (HOP_BY_HOP_REQUEST.has(name.toLowerCase())) continue;
    // Skip raw cookies — they're not for the upstream.
    out[name] = value;
  }
  return out;
}

function rewriteLocationHeader(
  value: unknown,
  proxyBase: string,
): string | string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const rewrite = (raw: string): string => {
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      return `${proxyBase}${raw}`;
    }
    return raw;
  };
  if (Array.isArray(value)) return value.map((v) => rewrite(String(v)));
  return rewrite(String(value));
}

function copyUpstreamHeaders(
  upstream: http.IncomingMessage,
  proxyBase: string,
  extraSetCookie: string | null,
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (!value) continue;
    const lower = name.toLowerCase();
    if (STRIP_FROM_UPSTREAM.has(lower)) continue;
    if (lower === 'location') {
      const rewritten = rewriteLocationHeader(value, proxyBase);
      if (rewritten !== undefined) out[name] = rewritten;
      continue;
    }
    out[name] = value;
  }
  if (extraSetCookie) {
    const existing = out['set-cookie'] ?? out['Set-Cookie'];
    if (existing === undefined) {
      out['Set-Cookie'] = extraSetCookie;
    } else if (Array.isArray(existing)) {
      out['Set-Cookie'] = [...existing, extraSetCookie];
    } else {
      out['Set-Cookie'] = [String(existing), extraSetCookie];
    }
  }
  return out;
}

export interface DevProxyDeps {
  agentOps: () => GatewayAgentOps | null;
  tickets: DevProxyTicketManager;
}

/**
 * Handle an HTTP request that targets `/p/<ws>/<port>/...`. Returns true
 * when the request was intercepted, false to fall through to the next
 * handler in the gateway pipeline.
 */
export async function handleDevProxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: DevProxyDeps,
): Promise<boolean> {
  const url = req.url ?? '/';
  const parsed = parseDevProxyPath(url);
  if (!parsed) return false;

  const ops = deps.agentOps();
  if (!ops) {
    rejectNotFound(res, 'Gateway is not ready');
    return true;
  }

  const ticket = resolveTicket(parsed, req.headers.cookie, deps.tickets);
  if (!ticket) {
    rejectUnauthorized(res, 'Dev proxy ticket missing or expired');
    return true;
  }

  let target;
  try {
    target = await ops.resolveDevServerTarget(parsed.workspaceId, parsed.port);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err instanceof Error ? err.message : 'Failed to resolve dev server');
    return true;
  }
  if (!target) {
    rejectNotFound(
      res,
      'No registered dev server is listening on that port for this workspace',
    );
    return true;
  }

  const proxyBase = `${DEV_PROXY_PREFIX}${encodeURIComponent(parsed.workspaceId)}/${parsed.port}`;
  const headers = filterRequestHeaders(req);
  // Help the upstream produce correct redirects / asset paths.
  headers['x-forwarded-host'] = req.headers.host ?? '';
  headers['x-forwarded-proto'] = isHttps(req) ? 'https' : 'http';
  headers['x-forwarded-prefix'] = proxyBase;
  // Upstream is plain HTTP on the container network.
  headers.host = `${target.host}:${target.upstreamPort}`;

  const upstreamReq = http.request(
    {
      host: target.host,
      port: target.upstreamPort,
      method: req.method,
      path: ticket.rest,
      headers,
    },
    (upstreamRes) => {
      const setCookie = ticket.promoteToCookie
        ? buildCookie(
            ticket.ticketString,
            ticket.payload.workspaceId,
            ticket.payload.port,
            ticket.payload.expiresAt,
            isHttps(req),
          )
        : null;
      const responseHeaders = copyUpstreamHeaders(upstreamRes, proxyBase, setCookie);
      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(`Dev proxy upstream error: ${err.message}`);
  });

  req.on('aborted', () => upstreamReq.destroy());
  req.pipe(upstreamReq);
  return true;
}

/**
 * Handle a WebSocket upgrade for `/p/<ws>/<port>/...` (HMR sockets, etc.).
 * Returns true when intercepted, false to let the next upgrade handler
 * (the gateway WS endpoint) run.
 */
export async function handleDevProxyUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  deps: DevProxyDeps,
): Promise<boolean> {
  const url = req.url ?? '/';
  const parsed = parseDevProxyPath(url);
  if (!parsed) return false;

  const closeSocket = (status: number, message: string): void => {
    if (socket instanceof Socket && !socket.destroyed) {
      socket.write(
        `HTTP/1.1 ${status} ${message}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
      );
      socket.destroy();
    } else {
      socket.end();
    }
  };

  const ops = deps.agentOps();
  if (!ops) {
    closeSocket(503, 'Gateway not ready');
    return true;
  }

  const ticket = resolveTicket(parsed, req.headers.cookie, deps.tickets);
  if (!ticket) {
    closeSocket(401, 'Unauthorized');
    return true;
  }

  let target;
  try {
    target = await ops.resolveDevServerTarget(parsed.workspaceId, parsed.port);
  } catch {
    closeSocket(502, 'Bad Gateway');
    return true;
  }
  if (!target) {
    closeSocket(404, 'Not Found');
    return true;
  }

  const headers = filterRequestHeaders(req);
  headers.host = `${target.host}:${target.upstreamPort}`;
  // Re-add the upgrade headers stripped above. We rebuild a clean upgrade
  // request: connection/upgrade are required so the upstream takes over.
  const upgradeHeader = req.headers.upgrade;
  const connectionHeader = req.headers.connection;
  if (upgradeHeader) headers.upgrade = upgradeHeader;
  if (connectionHeader) headers.connection = connectionHeader;
  // Forward the WebSocket protocol-related headers the upstream expects.
  for (const name of [
    'sec-websocket-key',
    'sec-websocket-version',
    'sec-websocket-protocol',
    'sec-websocket-extensions',
  ] as const) {
    const v = req.headers[name];
    if (v) headers[name] = v;
  }

  const upstream = http.request({
    host: target.host,
    port: target.upstreamPort,
    method: req.method ?? 'GET',
    path: ticket.rest,
    headers,
  });

  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = [
      `HTTP/1.1 ${upstreamRes.statusCode ?? 101} Switching Protocols`,
    ];
    for (const [name, value] of Object.entries(upstreamRes.headers)) {
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const v of value) lines.push(`${name}: ${v}`);
      } else {
        lines.push(`${name}: ${String(value)}`);
      }
    }
    lines.push('', '');
    socket.write(lines.join('\r\n'));
    if (upstreamHead && upstreamHead.length > 0) socket.write(upstreamHead);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
    upstreamSocket.on('error', () => socket.destroy());
    socket.on('error', () => upstreamSocket.destroy());
  });

  upstream.on('response', (upstreamRes) => {
    // Upstream refused the upgrade — forward the response and close.
    closeSocket(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage ?? 'Bad Gateway');
  });

  upstream.on('error', () => {
    closeSocket(502, 'Bad Gateway');
  });

  if (head && head.length > 0) upstream.write(head);
  upstream.end();
  return true;
}
