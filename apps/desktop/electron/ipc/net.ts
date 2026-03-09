/**
 * Net proxy IPC handler.
 *
 * Proxies HTTP requests from the renderer through the main process,
 * bypassing browser CORS restrictions. Sero apps that call external
 * APIs (e.g. Starling Bank) use this instead of direct fetch().
 *
 * Security hardening (2026-03-09):
 *   - SSRF protection: blocks requests to private/reserved IP ranges
 *   - Protocol allowlist: only http: and https: are permitted
 *   - Sensitive header sanitization
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type { ProxyFetchRequest, ProxyFetchResponse } from '../../src/types/ipc';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

// ── SSRF protection ──────────────────────────────────────────

/** Headers that should not be forwarded from renderer requests. */
const BLOCKED_HEADERS = new Set([
  'host',
  'cookie',
  'authorization',
  'proxy-authorization',
]);

/**
 * Check if an IP address belongs to a private/reserved range.
 * Blocks: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8,
 *         169.254.0.0/16 (link-local), 0.0.0.0, ::1, fc00::/7
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^127\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (ip === '0.0.0.0') return true;
  // IPv6 loopback and private
  if (ip === '::1' || ip === '::') return true;
  if (/^f[cd]/i.test(ip)) return true;
  if (/^fe80:/i.test(ip)) return true;
  return false;
}

/**
 * Validate a URL for SSRF safety:
 *  - Must be http: or https:
 *  - Hostname must not resolve to a private IP
 */
async function validateUrlForSsrf(urlStr: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('Invalid URL');
  }

  // Protocol allowlist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol: ${parsed.protocol}`);
  }

  // Resolve hostname to check for private IPs
  const hostname = parsed.hostname;

  // Direct IP check (no DNS needed)
  if (isPrivateIp(hostname)) {
    throw new Error(`Blocked request to private IP: ${hostname}`);
  }

  // DNS resolution check — hostname may resolve to a private IP
  try {
    const { address } = await dnsLookup(hostname);
    if (isPrivateIp(address)) {
      throw new Error(`Blocked request: hostname "${hostname}" resolves to private IP ${address}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Blocked')) throw err;
    // DNS lookup failed — allow the request to proceed and let fetch handle the error
  }
}

/** Sanitize request headers — remove sensitive headers. */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── Registration ─────────────────────────────────────────────

export function registerNetHandlers(): void {
  ipcMain.handle(
    IpcChannels.net.fetch,
    async (_event, request: ProxyFetchRequest): Promise<ProxyFetchResponse> => {
      const { url, method = 'GET', headers = {}, body } = request;

      // SSRF protection: validate URL before making request
      await validateUrlForSsrf(url);

      const sanitizedHeaders = sanitizeHeaders(headers);

      const res = await fetch(url, {
        method,
        headers: sanitizedHeaders,
        body: body ?? undefined,
      });

      // Collect response headers into a plain object
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = await res.text();

      return {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    },
  );
}
