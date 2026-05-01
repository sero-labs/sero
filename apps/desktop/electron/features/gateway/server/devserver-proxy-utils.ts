/** Utilities for the gateway dev-server path-prefix proxy. */

import http from 'http';

/** Path prefix for proxied dev server traffic. */
export const DEV_PROXY_PREFIX = '/p/';
/** Cookie name for persisted dev-server proxy tickets. */
export const COOKIE_NAME = 'sero_devproxy';

/**
 * Hop-by-hop headers stripped from both request and response sides per
 * RFC 7230 §6.1. Gateway proxy cookies are stripped separately.
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
  // We may rewrite text responses, so never forward stale lengths/encodings.
  'content-length',
]);

const REWRITABLE_CONTENT_TYPES = [
  'text/html',
  'text/css',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'text/ecmascript',
];

export interface ParsedProxyRequest {
  workspaceId: string;
  port: number;
  rest: string;
}

/** Parse `/p/<workspaceId>/<port>/...` into its parts. */
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

export function readCookie(header: string | undefined, name: string): string | null {
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

export function readQueryTicket(
  rest: string,
): { ticket: string | null; restWithoutTicket: string } {
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

export function buildCookie(
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

export function isHttps(req: http.IncomingMessage): boolean {
  const xfp = req.headers['x-forwarded-proto'];
  if (typeof xfp === 'string' && xfp.toLowerCase().includes('https')) return true;
  return false;
}

export function rejectUnauthorized(res: http.ServerResponse, message: string): void {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

export function rejectNotFound(res: http.ServerResponse, message: string): void {
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

function filterCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const cookies = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && part.split('=')[0] !== COOKIE_NAME);
  return cookies.length > 0 ? cookies.join('; ') : undefined;
}

export function filterRequestHeaders(req: http.IncomingMessage): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!value) continue;
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_REQUEST.has(lower)) continue;
    // Force plain upstream bodies so we can safely rewrite path-prefix URLs.
    if (lower === 'accept-encoding') continue;
    if (lower === 'cookie') continue;
    out[name] = value;
  }
  const forwardedCookies = filterCookieHeader(req.headers.cookie);
  if (forwardedCookies) out.cookie = forwardedCookies;
  return out;
}

function prefixAbsolutePath(raw: string, proxyBase: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return raw;
  if (raw === proxyBase || raw.startsWith(`${proxyBase}/`)) return raw;
  return `${proxyBase}${raw}`;
}

function rewriteLocationHeader(value: unknown, proxyBase: string): string | string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const rewrite = (raw: string): string => prefixAbsolutePath(raw, proxyBase);
  if (Array.isArray(value)) return value.map((v) => rewrite(String(v)));
  return rewrite(String(value));
}

function rewriteSetCookie(raw: string, proxyBase: string): string {
  const parts = raw.split(';').map((part) => part.trim());
  const rewritten = parts.filter((part) => !/^domain=/i.test(part));
  const pathIndex = rewritten.findIndex((part) => /^path=/i.test(part));
  if (pathIndex >= 0) {
    rewritten[pathIndex] = `Path=${proxyBase}`;
  } else {
    rewritten.push(`Path=${proxyBase}`);
  }
  return rewritten.join('; ');
}

function rewriteSetCookieHeader(value: unknown, proxyBase: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const values = Array.isArray(value) ? value : [String(value)];
  return values.map((cookie) => rewriteSetCookie(String(cookie), proxyBase));
}

export function copyUpstreamHeaders(
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
    if (lower === 'set-cookie') {
      const rewritten = rewriteSetCookieHeader(value, proxyBase);
      if (rewritten) out['Set-Cookie'] = rewritten;
      continue;
    }
    out[name] = value;
  }
  if (extraSetCookie) {
    const existing = out['Set-Cookie'];
    if (existing === undefined) out['Set-Cookie'] = extraSetCookie;
    else if (Array.isArray(existing)) out['Set-Cookie'] = [...existing, extraSetCookie];
    else out['Set-Cookie'] = [String(existing), extraSetCookie];
  }
  return out;
}

export function shouldRewriteResponse(contentType: string | string[] | undefined): boolean {
  const raw = Array.isArray(contentType) ? contentType.join(';') : contentType ?? '';
  const lower = raw.toLowerCase();
  return REWRITABLE_CONTENT_TYPES.some((type) => lower.includes(type));
}

function rewriteSrcset(value: string, proxyBase: string): string {
  return value
    .split(',')
    .map((part) => {
      const trimmed = part.trimStart();
      const leading = part.slice(0, part.length - trimmed.length);
      const [url, ...rest] = trimmed.split(/\s+/);
      return `${leading}${prefixAbsolutePath(url, proxyBase)}${rest.length ? ` ${rest.join(' ')}` : ''}`;
    })
    .join(',');
}

export function rewriteProxyBody(content: string, proxyBase: string): string {
  return content
    .replace(/\b(src|href|action|poster)=(["'])\/(?!\/)([^"']*)\2/gi, (_m, attr, q, path) => {
      return `${attr}=${q}${prefixAbsolutePath(`/${path}`, proxyBase)}${q}`;
    })
    .replace(/\bsrcset=(["'])([^"']*)\1/gi, (_m, q, srcset) => {
      return `srcset=${q}${rewriteSrcset(srcset, proxyBase)}${q}`;
    })
    .replace(/url\(\s*(["']?)\/(?!\/)([^)'"]*)\1\s*\)/gi, (_m, q, path) => {
      return `url(${q}${prefixAbsolutePath(`/${path}`, proxyBase)}${q})`;
    })
    .replace(/(["'`])\/(?!\/)([^"'`\s<>)]*)\1/g, (_m, q, path) => {
      return `${q}${prefixAbsolutePath(`/${path}`, proxyBase)}${q}`;
    });
}

export function buildProxyLocation(parsed: ParsedProxyRequest, rest: string): string {
  const base = `${DEV_PROXY_PREFIX}${encodeURIComponent(parsed.workspaceId)}/${parsed.port}`;
  return `${base}${rest.startsWith('/') ? rest : `/${rest}`}`;
}
