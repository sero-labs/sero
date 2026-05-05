import { promises as fs } from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agentDir: `/tmp/sero-remote-gateway-registry-${process.pid}`,
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: mocks.agentDir,
}));

import {
  OpenShellRemoteGatewayRegistry,
  type OpenShellRemoteGatewayInput,
} from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';

const registryPath = path.join(mocks.agentDir, 'openshell-remote-gateways.json');

const baseInput: OpenShellRemoteGatewayInput = {
  id: 'remote-dev',
  name: 'sero-remote-dev',
  sshHost: 'dev@example-host',
  sshKeyPath: '/Users/me/.ssh/id_ed25519',
  port: 8080,
  gatewayHost: '127.0.0.1',
};

describe('OpenShellRemoteGatewayRegistry', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(mocks.agentDir, { recursive: true, force: true });
  });

  it('returns an empty list when the registry file does not exist', async () => {
    const registry = new OpenShellRemoteGatewayRegistry();

    await expect(registry.list()).resolves.toEqual([]);
  });

  it('creates the registry file under the Sero agent directory on first save', async () => {
    const registry = new OpenShellRemoteGatewayRegistry();

    const saved = await registry.upsert(baseInput);
    const file = JSON.parse(await fs.readFile(registryPath, 'utf8')) as { gateways: unknown[] };

    expect(saved).toMatchObject(baseInput);
    expect(saved.createdAt).toBeTruthy();
    expect(saved.updatedAt).toBeTruthy();
    expect(file.gateways).toHaveLength(1);
    expect(JSON.stringify(file)).not.toContain('password');
    expect(JSON.stringify(file)).not.toContain('passphrase');
    expect(JSON.stringify(file)).not.toContain('token');
  });

  it('updates an existing gateway while preserving createdAt', async () => {
    const registry = new OpenShellRemoteGatewayRegistry();

    const created = await registry.upsert(baseInput);
    const updated = await registry.upsert({
      ...baseInput,
      name: 'sero-remote-renamed',
      sshHost: 'ops@example-host',
      sshKeyPath: undefined,
      port: 9090,
      gatewayHost: undefined,
    });

    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
    await expect(registry.list()).resolves.toEqual([updated]);
  });

  it('removes only the selected gateway and ignores missing ids', async () => {
    const registry = new OpenShellRemoteGatewayRegistry();
    const first = await registry.upsert(baseInput);
    const second = await registry.upsert({
      ...baseInput,
      id: 'remote-prod',
      name: 'sero-remote-prod',
      sshHost: 'prod@example-host',
    });

    await registry.remove(first.id);
    await registry.remove(first.id);

    await expect(registry.list()).resolves.toEqual([second]);
  });

  it('validates required gateway fields', async () => {
    const registry = new OpenShellRemoteGatewayRegistry();

    await expect(registry.upsert({ ...baseInput, id: ' ' })).rejects.toThrow('gateway id is required');
    await expect(registry.upsert({ ...baseInput, name: ' ' })).rejects.toThrow('gateway name is required');
    await expect(registry.upsert({ ...baseInput, sshHost: ' ' })).rejects.toThrow('Phase 5');
    await expect(registry.upsert({ ...baseInput, port: 0 })).rejects.toThrow('port must be');
  });

  it('rejects endpoint-only and cloud-style gateway hosts', async () => {
    const registry = new OpenShellRemoteGatewayRegistry();

    await expect(registry.upsert({ ...baseInput, sshHost: 'https://gateway.example' })).rejects.toThrow(
      'Endpoint-only and cloud gateways are Phase 5',
    );
    await expect(registry.upsert({ ...baseInput, sshHost: 'gateway.example' })).rejects.toThrow(
      'user@host',
    );
  });
});
