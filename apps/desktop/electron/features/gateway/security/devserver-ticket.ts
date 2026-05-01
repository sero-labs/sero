/**
 * Dev server proxy tickets — short-lived, signed bearers used to
 * authenticate HTTP and WebSocket requests against the path-prefix proxy.
 *
 * Tickets are issued over an authenticated WebSocket session and must be
 * presented either as a cookie (`sero_devproxy`) or, on first navigation,
 * a `?t=` query param. Tickets bind a single (workspaceId, port) pair and
 * expire after a short TTL — enough for an iframe to load without keeping
 * the proxy open indefinitely if the SPA tab is closed.
 */

import crypto from 'crypto';

/** Ticket lifetime — 30 minutes is enough for a long preview session. */
export const DEFAULT_TICKET_TTL_MS = 30 * 60_000;

export interface DevProxyTicketPayload {
  /** Workspace this ticket grants access to. */
  workspaceId: string;
  /** Single port number this ticket grants access to. */
  port: number;
  /** Unix milliseconds when this ticket stops being valid. */
  expiresAt: number;
}

export interface IssuedDevProxyTicket extends DevProxyTicketPayload {
  /** The opaque token string sent to the client. */
  ticket: string;
}

export class DevProxyTicketManager {
  private readonly secret: Buffer;

  /**
   * @param secret raw HMAC key. Use a process-bound random key — do NOT
   * reuse the master gateway token, since tickets are exposed in URL
   * query strings and may end up in proxy access logs.
   */
  constructor(secret: Buffer) {
    if (secret.length < 32) {
      throw new Error('DevProxyTicketManager requires a >=32 byte secret');
    }
    this.secret = secret;
  }

  /** Mint a ticket for the given (workspace, port) pair. */
  issue(
    workspaceId: string,
    port: number,
    ttlMs: number = DEFAULT_TICKET_TTL_MS,
  ): IssuedDevProxyTicket {
    const expiresAt = Date.now() + ttlMs;
    const payload: DevProxyTicketPayload = { workspaceId, port, expiresAt };
    const body = encodePayload(payload);
    const sig = sign(this.secret, body);
    const ticket = `${body}.${sig}`;
    return { ...payload, ticket };
  }

  /**
   * Verify a ticket. Returns the payload on success or null otherwise.
   * Constant-time HMAC comparison prevents timing oracles on the signature.
   */
  verify(ticket: string): DevProxyTicketPayload | null {
    if (typeof ticket !== 'string' || ticket.length === 0) return null;
    const dot = ticket.lastIndexOf('.');
    if (dot <= 0 || dot === ticket.length - 1) return null;

    const body = ticket.slice(0, dot);
    const presented = ticket.slice(dot + 1);
    const expected = sign(this.secret, body);

    const presentedBuf = Buffer.from(presented, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (presentedBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(presentedBuf, expectedBuf)) return null;

    const payload = decodePayload(body);
    if (!payload) return null;
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  }
}

function encodePayload(payload: DevProxyTicketPayload): string {
  const json = JSON.stringify({
    w: payload.workspaceId,
    p: payload.port,
    e: payload.expiresAt,
  });
  return Buffer.from(json, 'utf8').toString('base64url');
}

function decodePayload(body: string): DevProxyTicketPayload | null {
  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const obj = JSON.parse(json) as { w?: unknown; p?: unknown; e?: unknown };
    if (
      typeof obj.w !== 'string' ||
      obj.w.length === 0 ||
      typeof obj.p !== 'number' ||
      !Number.isInteger(obj.p) ||
      obj.p < 1 ||
      obj.p > 65535 ||
      typeof obj.e !== 'number' ||
      !Number.isFinite(obj.e)
    ) {
      return null;
    }
    return { workspaceId: obj.w, port: obj.p, expiresAt: obj.e };
  } catch {
    return null;
  }
}

function sign(secret: Buffer, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/** Generate a new HMAC secret. Persisted alongside the gateway token. */
export function generateTicketSecret(): Buffer {
  return crypto.randomBytes(32);
}
