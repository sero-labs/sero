import { createHash, X509Certificate } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { verifyPinnedPeer } from '@electron/features/agent-node/pinned-transport';

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
});
