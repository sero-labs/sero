/**
 * Signed tickets for plugin asset reads over the gateway.
 *
 * A federated widget pulls its own chunks, so the browser fetches
 * `/ext/...` without going through the WebSocket. A ticket in the URL is
 * what proves those fetches came from a client that authenticated.
 *
 * A ticket names one app, so a leaked one serves that plugin's assets
 * and nothing else. It carries no workspace and no session.
 */

import crypto from 'crypto';

/** How long an asset ticket stays valid. */
export const DEFAULT_ASSET_TICKET_TTL_MS = 30 * 60_000;

export interface AssetTicketPayload {
  /** The app whose assets this ticket unlocks. */
  appId: string;
  /** Unix milliseconds when this ticket stops being valid. */
  expiresAt: number;
}

export class AssetTicketManager {
  private readonly secret: Buffer;

  /**
   * @param secret raw HMAC key, at least 32 bytes. Tickets travel in URL
   * query strings, so this must never be the master gateway token.
   */
  constructor(secret: Buffer) {
    if (secret.length < 32) {
      throw new Error('AssetTicketManager requires a >=32 byte secret');
    }
    this.secret = secret;
  }

  /** Mint a ticket for one app's assets. */
  issue(appId: string, ttlMs: number = DEFAULT_ASSET_TICKET_TTL_MS): string {
    const payload: AssetTicketPayload = { appId, expiresAt: Date.now() + ttlMs };
    const body = encode(payload);
    return `${body}.${sign(this.secret, body)}`;
  }

  /** The payload when the ticket is genuine and unexpired, else null. */
  verify(ticket: string): AssetTicketPayload | null {
    if (typeof ticket !== 'string' || ticket.length === 0) return null;

    const dot = ticket.lastIndexOf('.');
    if (dot <= 0 || dot === ticket.length - 1) return null;

    const body = ticket.slice(0, dot);
    const presented = Buffer.from(ticket.slice(dot + 1), 'hex');
    const expected = Buffer.from(sign(this.secret, body), 'hex');

    // Constant-time comparison keeps the signature free of timing oracles.
    if (presented.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(presented, expected)) return null;

    const payload = decode(body);
    if (!payload) return null;
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  }
}

function encode(payload: AssetTicketPayload): string {
  const json = JSON.stringify({ a: payload.appId, e: payload.expiresAt });
  return Buffer.from(json, 'utf8').toString('base64url');
}

function decode(body: string): AssetTicketPayload | null {
  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const obj = JSON.parse(json) as { a?: unknown; e?: unknown };
    if (typeof obj.a !== 'string' || obj.a.length === 0) return null;
    if (typeof obj.e !== 'number' || !Number.isFinite(obj.e)) return null;
    return { appId: obj.a, expiresAt: obj.e };
  } catch {
    return null;
  }
}

function sign(secret: Buffer, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
