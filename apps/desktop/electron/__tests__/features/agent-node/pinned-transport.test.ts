import { createHash, X509Certificate } from 'crypto';
import type { LookupAddress } from 'dns';
import * as dnsPromises from 'dns/promises';
import { EventEmitter } from 'events';
import { readFile } from 'fs/promises';
import path from 'path';
import tls from 'tls';
import { describe, expect, it, vi } from 'vitest';
import { PinnedTransport, verifyPinnedPeer } from '@electron/features/agent-node/pinned-transport';

vi.mock('dns/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('dns/promises')>();
  return { ...original, lookup: vi.fn(original.lookup) };
});

const fixtures = path.join(__dirname, 'fixtures');

async function certificate(name: string): Promise<X509Certificate> {
  return new X509Certificate(await readFile(path.join(fixtures, name)));
}

function fingerprint(identity: X509Certificate): string {
  return createHash('sha256')
    .update(identity.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
}

describe('Agent Node pinned TLS', () => {
  it('accepts leaf rotation under the pinned identity CA', async () => {
    const identity = await certificate('identity-one.crt');
    const leaf = await certificate('leaf-rotated.crt');
    expect(verifyPinnedPeer(
      { raw: leaf.raw, issuerCertificate: { raw: identity.raw } },
      fingerprint(identity),
    )).toContain('BEGIN CERTIFICATE');
  });

  it('refuses a leaf not issued by the served identity', async () => {
    const pinnedIdentity = await certificate('identity-one.crt');
    const unrelatedLeaf = await certificate('leaf-two.crt');
    expect(() => verifyPinnedPeer(
      { raw: unrelatedLeaf.raw, issuerCertificate: { raw: pinnedIdentity.raw } },
      fingerprint(pinnedIdentity),
    )).toThrow('not issued');
  });

  it('refuses a served identity whose SPKI does not match the pin', async () => {
    const identity = await certificate('identity-two.crt');
    const leaf = await certificate('leaf-two.crt');
    const expectedIdentity = await certificate('identity-one.crt');
    expect(() => verifyPinnedPeer(
      { raw: leaf.raw, issuerCertificate: { raw: identity.raw } },
      fingerprint(expectedIdentity),
    )).toThrow('fingerprint does not match');
  });

  it('uses the reachable address for a multi-homed node', async () => {
    const identity = await certificate('identity-one.crt');
    const leaf = await certificate('leaf-one.crt');
    const addresses = [
      { address: '192.0.2.1', family: 4 },
      { address: '192.0.2.2', family: 4 },
    ];
    vi.mocked(dnsPromises.lookup)
      .mockResolvedValueOnce(addresses as unknown as LookupAddress);
    const sockets: Array<EventEmitter & {
      destroy: ReturnType<typeof vi.fn>;
      getPeerCertificate: ReturnType<typeof vi.fn>;
      setTimeout: ReturnType<typeof vi.fn>;
    }> = [];
    const connect = vi.spyOn(tls, 'connect').mockImplementation(((options: tls.ConnectionOptions) => {
      const socket = Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
        getPeerCertificate: vi.fn(() => ({
          raw: leaf.raw,
          issuerCertificate: { raw: identity.raw },
        })),
        setTimeout: vi.fn(),
      });
      sockets.push(socket);
      if (options.host === '192.0.2.2') queueMicrotask(() => socket.emit('secureConnect'));
      return socket as unknown as tls.TLSSocket;
    }) as typeof tls.connect);
    const transport = new PinnedTransport('https://node.test:7443', fingerprint(identity));

    const endpoint = await (transport as unknown as {
      preflight(): Promise<{ address: string }>;
    }).preflight();

    expect(endpoint.address).toBe('192.0.2.2');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(sockets.every((socket) => socket.destroy.mock.calls.length === 1)).toBe(true);
    connect.mockRestore();
  });
});
