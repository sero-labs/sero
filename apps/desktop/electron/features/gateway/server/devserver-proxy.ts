/**
 * Dev server reverse proxy — exposes registered workspace dev servers
 * over the gateway's HTTP listener so remote clients (web-remote SPA,
 * Tailscale-connected browsers) can preview them.
 */

import http from 'http';
import { Socket } from 'net';
import type { Duplex } from 'stream';
import type { GatewayAgentOps, GatewayDevServerChange } from './types';
import type { GatewayDevServerChangedEvent } from './protocol';
import type { DevProxyTicketManager, DevProxyTicketPayload } from '../security/devserver-ticket';
import {
  COOKIE_NAME,
  DEV_PROXY_PREFIX,
  buildCookie,
  buildProxyLocation,
  copyUpstreamHeaders,
  filterRequestHeaders,
  isHttps,
  parseDevProxyPath,
  readCookie,
  readQueryTicket,
  rejectNotFound,
  rejectUnauthorized,
  rewriteProxyBody,
  shouldRewriteResponse,
  type ParsedProxyRequest,
} from './devserver-proxy-utils';

export { DEV_PROXY_PREFIX, parseDevProxyPath } from './devserver-proxy-utils';

const MAX_REWRITE_BODY_BYTES = 5 * 1024 * 1024;

/** Convert an internal dev-server registry change to the wire event. */
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

interface ResolvedTicket {
  payload: DevProxyTicketPayload;
  /** True when the ticket arrived as `?t=` and should become a scoped cookie. */
  promoteToCookie: boolean;
  ticketString: string;
  /** Upstream path with the `t` query parameter removed. */
  rest: string;
}

function resolveTicket(
  parsed: ParsedProxyRequest,
  cookieHeader: string | undefined,
  tickets: DevProxyTicketManager,
): ResolvedTicket | null {
  const cookieTicket = readCookie(cookieHeader, COOKIE_NAME);
  if (cookieTicket) {
    const payload = tickets.verify(cookieTicket);
    if (payload?.workspaceId === parsed.workspaceId && payload.port === parsed.port) {
      return { payload, promoteToCookie: false, ticketString: cookieTicket, rest: parsed.rest };
    }
  }

  const { ticket, restWithoutTicket } = readQueryTicket(parsed.rest);
  if (!ticket) return null;
  const payload = tickets.verify(ticket);
  if (payload?.workspaceId !== parsed.workspaceId || payload.port !== parsed.port) return null;
  return { payload, promoteToCookie: true, ticketString: ticket, rest: restWithoutTicket };
}

export interface DevProxyDeps {
  agentOps: () => GatewayAgentOps | null;
  tickets: DevProxyTicketManager;
}

async function resolveTarget(
  parsed: ParsedProxyRequest,
  ops: GatewayAgentOps,
  res?: http.ServerResponse,
) {
  try {
    const target = await ops.resolveDevServerTarget(parsed.workspaceId, parsed.port);
    if (!target && res) {
      rejectNotFound(res, 'No registered dev server is listening on that port for this workspace');
    }
    return target;
  } catch (err) {
    if (res) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err instanceof Error ? err.message : 'Failed to resolve dev server');
    }
    return null;
  }
}

function redirectQueryTicketToCookie(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsed: ParsedProxyRequest,
  ticket: ResolvedTicket,
): void {
  res.writeHead(302, {
    Location: buildProxyLocation(parsed, ticket.rest),
    'Set-Cookie': buildCookie(
      ticket.ticketString,
      ticket.payload.workspaceId,
      ticket.payload.port,
      ticket.payload.expiresAt,
      isHttps(req),
    ),
    'Cache-Control': 'no-store',
  });
  res.end();
}

function addForwardedHeaders(
  headers: http.OutgoingHttpHeaders,
  req: http.IncomingMessage,
  proxyBase: string,
  target: { host: string; upstreamPort: number },
): void {
  headers['x-forwarded-host'] = req.headers.host ?? '';
  headers['x-forwarded-proto'] = isHttps(req) ? 'https' : 'http';
  headers['x-forwarded-prefix'] = proxyBase;
  headers.host = `${target.host}:${target.upstreamPort}`;
}

function pipeUpstreamResponse(
  upstreamRes: http.IncomingMessage,
  res: http.ServerResponse,
  proxyBase: string,
): void {
  const contentLength = Number.parseInt(String(upstreamRes.headers['content-length'] ?? ''), 10);
  const canRewrite = shouldRewriteResponse(upstreamRes.headers['content-type']) &&
    !upstreamRes.headers['content-encoding'] &&
    (!Number.isFinite(contentLength) || contentLength <= MAX_REWRITE_BODY_BYTES);
  const responseHeaders = copyUpstreamHeaders(upstreamRes, proxyBase, null);

  if (!canRewrite) {
    res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
    upstreamRes.pipe(res);
    return;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let streaming = false;

  upstreamRes.on('data', (chunk: Buffer) => {
    if (streaming) return;
    totalBytes += chunk.length;
    chunks.push(chunk);
    if (totalBytes > MAX_REWRITE_BODY_BYTES) {
      streaming = true;
      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
      for (const buffered of chunks) res.write(buffered);
      upstreamRes.pipe(res);
    }
  });
  upstreamRes.on('end', () => {
    if (streaming) return;
    res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
    const body = Buffer.concat(chunks).toString('utf8');
    res.end(rewriteProxyBody(body, proxyBase));
  });
  upstreamRes.on('error', () => res.end());
}

/** Handle an HTTP request that targets `/p/<ws>/<port>/...`. */
export async function handleDevProxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: DevProxyDeps,
): Promise<boolean> {
  const parsed = parseDevProxyPath(req.url ?? '/');
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

  const target = await resolveTarget(parsed, ops, res);
  if (!target) return true;

  if (ticket.promoteToCookie) {
    redirectQueryTicketToCookie(req, res, parsed, ticket);
    return true;
  }

  const proxyBase = `${DEV_PROXY_PREFIX}${encodeURIComponent(parsed.workspaceId)}/${parsed.port}`;
  const headers = filterRequestHeaders(req);
  addForwardedHeaders(headers, req, proxyBase, target);

  const upstreamReq = http.request(
    {
      host: target.host,
      port: target.upstreamPort,
      method: req.method,
      path: ticket.rest,
      headers,
    },
    (upstreamRes) => pipeUpstreamResponse(upstreamRes, res, proxyBase),
  );

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Dev proxy upstream error: ${err.message}`);
  });

  req.on('aborted', () => upstreamReq.destroy());
  req.pipe(upstreamReq);
  return true;
}

/** Handle a WebSocket upgrade for `/p/<ws>/<port>/...` (HMR sockets, etc.). */
export async function handleDevProxyUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  deps: DevProxyDeps,
): Promise<boolean> {
  const parsed = parseDevProxyPath(req.url ?? '/');
  if (!parsed) return false;

  const closeSocket = (status: number, message: string): void => {
    if (socket instanceof Socket && !socket.destroyed) {
      socket.write(`HTTP/1.1 ${status} ${message}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
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

  const proxyBase = `${DEV_PROXY_PREFIX}${encodeURIComponent(parsed.workspaceId)}/${parsed.port}`;
  const headers = filterRequestHeaders(req);
  addForwardedHeaders(headers, req, proxyBase, target);
  if (req.headers.upgrade) headers.upgrade = req.headers.upgrade;
  if (req.headers.connection) headers.connection = req.headers.connection;
  for (const name of [
    'sec-websocket-key',
    'sec-websocket-version',
    'sec-websocket-protocol',
    'sec-websocket-extensions',
  ] as const) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }

  const upstream = http.request({
    host: target.host,
    port: target.upstreamPort,
    method: req.method ?? 'GET',
    path: ticket.rest,
    headers,
  });

  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${upstreamRes.statusCode ?? 101} Switching Protocols`];
    for (const [name, value] of Object.entries(upstreamRes.headers)) {
      if (!value) continue;
      if (Array.isArray(value)) value.forEach((v) => lines.push(`${name}: ${v}`));
      else lines.push(`${name}: ${String(value)}`);
    }
    lines.push('', '');
    socket.write(lines.join('\r\n'));
    if (upstreamHead.length > 0) socket.write(upstreamHead);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
    upstreamSocket.on('error', () => socket.destroy());
    socket.on('error', () => upstreamSocket.destroy());
  });

  upstream.on('response', (upstreamRes) => {
    closeSocket(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage ?? 'Bad Gateway');
  });
  upstream.on('error', () => closeSocket(502, 'Bad Gateway'));

  if (head.length > 0) upstream.write(head);
  upstream.end();
  return true;
}
