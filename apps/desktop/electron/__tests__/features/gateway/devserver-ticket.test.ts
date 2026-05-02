import { describe, expect, it } from 'vitest';
import {
  DevProxyTicketManager,
  generateTicketSecret,
} from '@electron/features/gateway/security/devserver-ticket';

describe('DevProxyTicketManager', () => {
  it('verifies a freshly issued ticket', () => {
    const mgr = new DevProxyTicketManager(generateTicketSecret());
    const issued = mgr.issue('ws-1', 3000);
    const verified = mgr.verify(issued.ticket);
    expect(verified).not.toBeNull();
    expect(verified?.workspaceId).toBe('ws-1');
    expect(verified?.port).toBe(3000);
    expect(verified?.expiresAt).toBe(issued.expiresAt);
  });

  it('rejects tickets with a tampered payload', () => {
    const mgr = new DevProxyTicketManager(generateTicketSecret());
    const issued = mgr.issue('ws-1', 3000);
    const [body, sig] = issued.ticket.split('.');
    // Re-encode payload with a different port — the signature won't match.
    const swapped = Buffer.from(
      JSON.stringify({ w: 'ws-1', p: 9999, e: issued.expiresAt }),
      'utf8',
    ).toString('base64url');
    const tampered = `${swapped}.${sig}`;
    expect(mgr.verify(tampered)).toBeNull();
    // And the original is still good.
    expect(body.length).toBeGreaterThan(0);
  });

  it('rejects tickets signed by a different secret', () => {
    const a = new DevProxyTicketManager(generateTicketSecret());
    const b = new DevProxyTicketManager(generateTicketSecret());
    const issued = a.issue('ws-1', 3000);
    expect(b.verify(issued.ticket)).toBeNull();
  });

  it('rejects expired tickets', () => {
    const mgr = new DevProxyTicketManager(generateTicketSecret());
    const issued = mgr.issue('ws-1', 3000, -1_000); // already expired
    expect(mgr.verify(issued.ticket)).toBeNull();
  });

  it('rejects malformed tickets', () => {
    const mgr = new DevProxyTicketManager(generateTicketSecret());
    expect(mgr.verify('')).toBeNull();
    expect(mgr.verify('not-a-ticket')).toBeNull();
    expect(mgr.verify('a.')).toBeNull();
    expect(mgr.verify('.b')).toBeNull();
  });

  it('requires a sufficiently long secret', () => {
    expect(() => new DevProxyTicketManager(Buffer.alloc(8))).toThrow();
  });
});
