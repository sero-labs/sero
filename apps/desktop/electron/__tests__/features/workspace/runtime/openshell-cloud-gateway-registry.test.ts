import { promises as fs } from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agentDir: `/tmp/sero-cloud-gateway-registry-${process.pid}`,
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: mocks.agentDir,
}));

import {
  OpenShellCloudGatewayRegistry,
  parseCloudGateways,
  type OpenShellCloudGatewayInput,
} from '@electron/features/workspace/runtime/openshell/cloud-gateway-registry';

const registryPath = path.join(mocks.agentDir, 'openshell-cloud-gateways.json');

const baseInput: OpenShellCloudGatewayInput = {
  id: 'openshell-cloud-prod',
  name: 'sero-cloud-prod',
  endpoint: 'https://gateway.example.com/',
  authMode: 'browser',
  resourceLabel: 'Production pool',
  cpuLabel: '8 vCPU',
  memoryLabel: '16 GB',
  gpuLabel: 'none',
  costLabel: '$1/hour advisory',
};

describe('OpenShellCloudGatewayRegistry', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(mocks.agentDir, { recursive: true, force: true });
  });

  it('returns an empty list when the registry file does not exist', async () => {
    const registry = new OpenShellCloudGatewayRegistry();

    await expect(registry.list()).resolves.toEqual([]);
  });

  it('creates the registry file under the Sero agent directory on first save', async () => {
    const registry = new OpenShellCloudGatewayRegistry();

    const saved = await registry.upsert(baseInput);
    const file = JSON.parse(await fs.readFile(registryPath, 'utf8')) as { gateways: unknown[] };

    expect(saved).toMatchObject({
      ...baseInput,
      endpoint: 'https://gateway.example.com',
      idleTimeoutMinutes: 60,
    });
    expect(saved.createdAt).toBeTruthy();
    expect(saved.updatedAt).toBeTruthy();
    expect(file.gateways).toHaveLength(1);
    expect(JSON.stringify(file)).not.toContain('token');
    expect(JSON.stringify(file)).not.toContain('cookie');
    expect(JSON.stringify(file)).not.toContain('password');
    expect(JSON.stringify(file)).not.toContain('apiKey');
  });

  it('accepts endpoint-only HTTPS and localhost HTTP entries without SSH fields', async () => {
    const registry = new OpenShellCloudGatewayRegistry();

    const https = await registry.upsert({
      id: 'openshell-cloud-https',
      name: 'sero-cloud-https',
      endpoint: 'https://gateway.example.test/api',
      authMode: 'external',
      idleTimeoutMinutes: 15,
    });
    const localhost = await registry.upsert({
      id: 'openshell-cloud-local',
      name: 'sero-cloud-local',
      endpoint: 'http://localhost:8787/',
      authMode: 'none',
    });

    expect(https).toMatchObject({ endpoint: 'https://gateway.example.test/api', idleTimeoutMinutes: 15 });
    expect(localhost).toMatchObject({ endpoint: 'http://localhost:8787', idleTimeoutMinutes: 60 });
    expect(await registry.list()).toHaveLength(2);
  });

  it('rejects non-local HTTP endpoints and invalid fields', async () => {
    const registry = new OpenShellCloudGatewayRegistry();

    await expect(registry.upsert({ ...baseInput, id: 'prod' })).rejects.toThrow('openshell-cloud-');
    await expect(registry.upsert({ ...baseInput, name: ' ' })).rejects.toThrow('gateway name is required');
    await expect(registry.upsert({ ...baseInput, endpoint: 'http://gateway.example.com' })).rejects.toThrow(
      'must use HTTPS',
    );
    await expect(registry.upsert({ ...baseInput, endpoint: 'not a url' })).rejects.toThrow('valid URL');
    await expect(registry.upsert({ ...baseInput, authMode: 'oauth' as 'browser' })).rejects.toThrow(
      'auth mode is invalid',
    );
    await expect(registry.upsert({ ...baseInput, idleTimeoutMinutes: 0 })).rejects.toThrow('positive integer');
  });

  it('rejects auth secret fields instead of persisting them', async () => {
    const registry = new OpenShellCloudGatewayRegistry();
    const inputWithSecret = {
      ...baseInput,
      bearerToken: 'secret-token',
    };

    await expect(registry.upsert(inputWithSecret)).rejects.toThrow('metadata only');
  });

  it('rejects endpoint URLs with username or password userinfo', async () => {
    const registry = new OpenShellCloudGatewayRegistry();

    await expect(registry.upsert({
      ...baseInput,
      endpoint: 'https://user:pass@gateway.example.com',
    })).rejects.toThrow('must not include credentials');
    await expect(registry.upsert({
      ...baseInput,
      endpoint: 'https://user@gateway.example.com',
    })).rejects.toThrow('must not include credentials');
  });

  it('rejects endpoint URLs with query or fragment metadata', async () => {
    const registry = new OpenShellCloudGatewayRegistry();
    const rawJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';

    await expect(registry.upsert({
      ...baseInput,
      endpoint: 'https://gateway.example.com/?token=abc123',
    })).rejects.toThrow('must not include credentials');
    await expect(registry.upsert({
      ...baseInput,
      endpoint: 'https://gateway.example.com/?next=Bearer%20abc123',
    })).rejects.toThrow('must not include credentials');
    await expect(registry.upsert({
      ...baseInput,
      endpoint: `https://gateway.example.com/?state=${rawJwt}`,
    })).rejects.toThrow('must not include credentials');
    await expect(registry.upsert({
      ...baseInput,
      endpoint: 'https://gateway.example.com/#api_key=abc123',
    })).rejects.toThrow('must not include credentials');
    await expect(registry.upsert({
      ...baseInput,
      endpoint: `https://gateway.example.com/#${rawJwt}`,
    })).rejects.toThrow('must not include credentials');
  });

  it('ignores invalid registry rows while keeping valid rows', async () => {
    await fs.mkdir(mocks.agentDir, { recursive: true });
    await fs.writeFile(
      registryPath,
      JSON.stringify({
        gateways: [
          {
            id: 'openshell-cloud-good',
            name: 'sero-cloud-good',
            endpoint: 'https://good.example.com/',
            authMode: 'browser',
            idleTimeoutMinutes: 30,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'openshell-cloud-bad-http',
            name: 'sero-cloud-bad-http',
            endpoint: 'http://bad.example.com',
            authMode: 'none',
            idleTimeoutMinutes: 30,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'openshell-cloud-secret',
            name: 'sero-cloud-secret',
            endpoint: 'https://secret.example.com',
            authMode: 'browser',
            idleTimeoutMinutes: 30,
            apiKey: 'secret',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
      'utf8',
    );

    await expect(new OpenShellCloudGatewayRegistry().list()).resolves.toEqual([
      expect.objectContaining({
        id: 'openshell-cloud-good',
        endpoint: 'https://good.example.com',
        idleTimeoutMinutes: 30,
      }),
    ]);
  });

  it('updates an existing gateway while preserving createdAt', async () => {
    const registry = new OpenShellCloudGatewayRegistry();

    const created = await registry.upsert(baseInput);
    const updated = await registry.upsert({
      ...baseInput,
      name: 'sero-cloud-renamed',
      endpoint: 'https://gateway-renamed.example.com',
      authMode: 'external',
      idleTimeoutMinutes: 120,
      resourceLabel: undefined,
    });

    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
    await expect(registry.list()).resolves.toEqual([updated]);
  });

  it('removes only the selected gateway and ignores missing ids', async () => {
    const registry = new OpenShellCloudGatewayRegistry();
    const first = await registry.upsert(baseInput);
    const second = await registry.upsert({
      ...baseInput,
      id: 'openshell-cloud-dev',
      name: 'sero-cloud-dev',
      endpoint: 'https://dev.example.com',
    });

    await registry.remove(first.id);
    await registry.remove(first.id);

    await expect(registry.list()).resolves.toEqual([second]);
  });

  it('exposes parser helpers for migration-safe registry parsing', () => {
    expect(parseCloudGateways({ gateways: 'invalid' })).toEqual([]);
    expect(
      parseCloudGateways({
        gateways: [
          {
            ...baseInput,
            endpoint: 'http://127.0.0.1:8787/',
            idleTimeoutMinutes: 5,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ endpoint: 'http://127.0.0.1:8787', idleTimeoutMinutes: 5 }),
    ]);
  });
});
