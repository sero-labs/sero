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
import { IpcChannels } from '../../../../src/types/ipc';
import type { ProxyFetchRequest, ProxyFetchResponse } from '../../../../src/types/ipc';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

// ── SSRF protection ──────────────────────────────────────────

/**
 * Headers that affect routing and should not be forwarded.
 * Note: `authorization` and `cookie` are intentionally NOT blocked —
 * renderer apps (e.g. Starling Bank) legitimately send auth headers
 * to external APIs. SSRF is mitigated by private IP blocking, not
 * header stripping.
 */
const BLOCKED_HEADERS = new Set([
  'host',
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
 * Resolve hostname and validate for SSRF safety.
 * Returns the resolved IP address so the caller can pin it (preventing
 * DNS rebinding / TOCTOU attacks where a second resolution returns a
 * different IP).
 *
 * Checks:
 *  - Protocol must be http: or https:
 *  - Hostname must not resolve to a private/reserved IP
 */
async function validateAndResolve(urlStr: string): Promise<{ parsed: URL; resolvedIp: string | null }> {
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

  const hostname = parsed.hostname;

  // Direct IP literal check (no DNS needed)
  if (isPrivateIp(hostname)) {
    throw new Error(`Blocked request to private IP: ${hostname}`);
  }

  // DNS resolution check — hostname may resolve to a private IP.
  // We return the resolved IP so the caller can pin it in the fetch
  // request, preventing DNS rebinding attacks.
  try {
    const { address } = await dnsLookup(hostname);
    if (isPrivateIp(address)) {
      throw new Error(`Blocked request: hostname "${hostname}" resolves to private IP ${address}`);
    }
    return { parsed, resolvedIp: address };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Blocked')) throw err;
    // DNS lookup failed — allow the request to proceed and let fetch handle the error
    return { parsed, resolvedIp: null };
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

      // SSRF protection: validate URL and resolve hostname.
      // We get back the resolved IP to pin it, preventing DNS rebinding
      // attacks where a second resolution returns a private IP.
      const { parsed, resolvedIp } = await validateAndResolve(url);

      const sanitizedHeaders = sanitizeHeaders(headers);

      // Pin the resolved IP to prevent DNS rebinding: replace the
      // hostname with the validated IP so fetch() doesn't re-resolve.
      // For HTTPS, we can't replace the hostname (TLS cert validation
      // requires the original domain), but DNS rebinding to private IPs
      // over HTTPS is impractical since the attacker would also need a
      // valid TLS cert for the private IP — a much higher bar.
      let fetchUrl = url;
      if (resolvedIp && parsed.protocol === 'http:') {
        const originalHost = parsed.host;
        parsed.hostname = resolvedIp;
        fetchUrl = parsed.toString();
        // Set Host header so the target server sees the original hostname
        sanitizedHeaders['host'] = originalHost;
      }

      const res = await fetch(fetchUrl, {
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
