import http from 'http';

const STATIC_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:18800',
  'http://localhost:18800',
  'http://127.0.0.1:18801',
  'http://localhost:18801',
  // web-remote dev server port range (Vite auto-increments if port is taken)
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:5175',
  'http://localhost:5175',
  'http://127.0.0.1:5176',
  'http://localhost:5176',
]);

/**
 * Extract client IP from the HTTP upgrade request.
 * Always uses the socket address — never trusts X-Forwarded-For since
 * the gateway can be directly exposed and clients could spoof XFF.
 */
export function getClientIp(req: http.IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

/** Validate the Origin header for non-localhost connections. */
export function isOriginAllowed(req: http.IncomingMessage, selfPort: number): boolean {
  const origin = req.headers.origin;
  // No origin header (non-browser clients like wscat, Discord bot) — allow
  if (!origin) return true;
  if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
  if (origin === `http://127.0.0.1:${selfPort}` || origin === `http://localhost:${selfPort}`) {
    return true;
  }
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.ts.net')) return true;
  } catch {
    // Invalid origin URL
  }
  return false;
}
