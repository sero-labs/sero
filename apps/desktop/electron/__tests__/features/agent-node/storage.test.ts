import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentNodeCredentials, type CredentialCipher } from '@electron/features/agent-node/credentials';
import { AgentNodeRegistry } from '@electron/features/agent-node/registry';

const temporaryRoots: string[] = [];
const cipher: CredentialCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`protected:${value}`, 'utf8'),
  decryptString: (value) => value.toString('utf8').replace(/^protected:/, ''),
};

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-agent-node-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Node profile storage', () => {
  it('stores only non-secret metadata in the profile registry', async () => {
    const root = await temporaryRoot();
    const registry = new AgentNodeRegistry(root);
    await registry.add({
      name: 'Spark',
      address: 'https://spark.test/',
      code: 'single-use-secret',
      fingerprint: 'ab'.repeat(32),
    }, 'https://spark.test/sero/v1', ['read', 'write']);

    const raw = await readFile(registry.filePath, 'utf8');
    expect(raw).not.toContain('single-use-secret');
    expect(raw).not.toContain('token');
    expect((await registry.list())[0]?.address).toBe('https://spark.test');
  });

  it('encrypts tokens and keeps them scoped to one profile', async () => {
    const firstRoot = await temporaryRoot();
    const secondRoot = await temporaryRoot();
    const first = new AgentNodeCredentials(firstRoot, cipher);
    const second = new AgentNodeCredentials(secondRoot, cipher);
    await first.set('node-1', 'bearer-secret');

    expect(await first.get('node-1')).toBe('bearer-secret');
    expect(await second.get('node-1')).toBeNull();
    expect(await readFile(first.filePath, 'utf8')).not.toContain('bearer-secret');
  });

  it('refuses token persistence when safeStorage is unavailable', async () => {
    const root = await temporaryRoot();
    const unavailable = { ...cipher, isEncryptionAvailable: () => false };
    await expect(new AgentNodeCredentials(root, unavailable).set('node-1', 'secret'))
      .rejects.toThrow('OS credential encryption is unavailable');
  });
});
