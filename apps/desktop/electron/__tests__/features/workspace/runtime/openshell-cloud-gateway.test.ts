import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runOpenShell: vi.fn(),
  formatOpenShellFailure: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', () => ({
  runOpenShell: mocks.runOpenShell,
  formatOpenShellFailure: mocks.formatOpenShellFailure,
}));

import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import {
  checkCloudSandboxExists,
  getCloudGatewayDiagnostics,
  getCloudGatewayInfo,
  getCloudGatewayStatus,
  isCloudSandboxStale,
  loginCloudGateway,
  registerCloudGateway,
  sanitizeDiagnosticOutput,
} from '@electron/features/workspace/runtime/openshell/cloud-gateway';
import type { OpenShellCommandResult } from '@electron/features/workspace/runtime/openshell/cli';
import type { OpenShellCloudGatewayEntry } from '@electron/features/workspace/runtime/openshell/cloud-gateway-registry';

const gateway: OpenShellCloudGatewayEntry = {
  id: 'openshell-cloud-prod',
  name: 'sero-cloud-prod',
  endpoint: 'https://gateway.example.com',
  authMode: 'browser',
  resourceLabel: 'GPU pool',
  costLabel: '$1/hour advisory',
  idleTimeoutMinutes: 30,
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

const runtimeConfig: WorkspaceRuntimeConfig = {
  providerId: 'openshell-cloud',
  cloudGatewayId: gateway.id,
  gatewayName: gateway.name,
  sandboxName: 'sero-workspace',
  idleTimeoutMinutes: 30,
  lastActivityAt: '2026-05-05T00:00:00.000Z',
};

describe('OpenShell Cloud gateway helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formatOpenShellFailure.mockImplementation((label: string, commandResult: OpenShellCommandResult) => (
      `${label}: ${commandResult.stderr || commandResult.stdout}`
    ));
  });

  it('registers cloud gateways with exact CLI args and no SSH or Docker commands', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ stdout: 'registered\n' }));

    const registered = await registerCloudGateway(gateway);

    expect(registered).toMatchObject({ ok: true, status: 'ready' });
    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      'gateway', 'add', 'https://gateway.example.com',
      '--name', 'sero-cloud-prod',
    ], { timeoutMs: 30_000 });
    expect(flattenArgs()).not.toMatch(/ssh|docker|--remote/);
  });

  it('returns a sanitized unavailable result when registration fails', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ exitCode: 1, stderr: 'token=super-secret failed' }));

    const registered = await registerCloudGateway(gateway);

    expect(registered.ok).toBe(false);
    expect(registered.status).toBe('unavailable');
    expect(registered.message).toContain('[redacted]');
    expect(registered.message).not.toContain('super-secret');
  });

  it('triggers CLI-managed auth without parsing or returning token values', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ stdout: 'token=secret-value\nlogin ok\n' }));

    const login = await loginCloudGateway(gateway);

    expect(login).toMatchObject({ ok: true, status: 'ready' });
    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      'gateway', 'login', 'sero-cloud-prod',
    ], { timeoutMs: 120_000 });
    expect(login.result?.stdout).not.toContain('secret-value');
    expect(JSON.stringify(login)).not.toContain('secret-value');
  });

  it('maps auth failures to auth-required diagnostics without throwing', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ exitCode: 1, stderr: '401 unauthorized login required token=abc' }));

    const status = await getCloudGatewayStatus(gateway);

    expect(status.ok).toBe(false);
    expect(status.status).toBe('auth-required');
    expect(status.message).toContain('[redacted]');
    expect(status.message).not.toContain('abc');
  });

  it('checks status through --gateway and measures latency only on success', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_042);
    mocks.runOpenShell.mockResolvedValueOnce(result({ stdout: 'ok\n' }));

    const status = await getCloudGatewayStatus(gateway);

    expect(status).toMatchObject({ ok: true, status: 'ready', latencyMs: 42 });
    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-cloud-prod', 'status',
    ], { timeoutMs: 10_000 });
  });

  it('omits latency when status is unavailable', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_042);
    mocks.runOpenShell.mockResolvedValueOnce(result({ exitCode: 1, stderr: 'offline' }));

    const status = await getCloudGatewayStatus(gateway);

    expect(status.ok).toBe(false);
    expect(status.latencyMs).toBeUndefined();
  });

  it('inspects gateway info with sanitized output', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ stdout: 'endpoint ok\napiKey=secret' }));

    const info = await getCloudGatewayInfo(gateway);

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      'gateway', 'info', '--name', 'sero-cloud-prod',
    ], { timeoutMs: 10_000 });
    expect(info.message).not.toContain('secret');
    expect(info.message).toContain('[redacted]');
  });

  it('checks sandbox existence through --gateway sandbox get', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ stdout: 'sandbox exists\n' }));

    const sandbox = await checkCloudSandboxExists(gateway.name, 'sero-workspace');

    expect(sandbox.exists).toBe(true);
    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-cloud-prod',
      'sandbox', 'get',
      '-n', 'sero-workspace',
    ], { timeoutMs: 10_000 });
    expect(flattenArgs()).not.toMatch(/ssh|docker|--remote/);
  });

  it('treats not found sandbox output as deleted rather than stale-active', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ exitCode: 1, stderr: 'sandbox not found' }));

    const sandbox = await checkCloudSandboxExists(gateway.name, 'sero-workspace');

    expect(sandbox.exists).toBe(false);
  });

  it('computes stale state from lastActivityAt and idleTimeoutMinutes', () => {
    const now = Date.parse('2026-05-05T02:00:00.000Z');

    expect(isCloudSandboxStale({ providerId: 'openshell-cloud' }, now)).toBe(false);
    expect(isCloudSandboxStale({ providerId: 'openshell-cloud', lastActivityAt: 'invalid' }, now)).toBe(false);
    expect(isCloudSandboxStale({ ...runtimeConfig, idleTimeoutMinutes: undefined }, now)).toBe(true);
    expect(isCloudSandboxStale({ ...runtimeConfig, idleTimeoutMinutes: 180 }, now)).toBe(false);
    expect(isCloudSandboxStale(runtimeConfig, now, false)).toBe(false);
  });

  it('builds ready diagnostics with advisory resource labels', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.parse('2026-05-05T00:10:00.000Z')).mockReturnValueOnce(12);
    mocks.runOpenShell
      .mockResolvedValueOnce(result({ stdout: 'ready\n' }))
      .mockResolvedValueOnce(result({ stdout: 'sandbox exists\n' }));

    const diagnostics = await getCloudGatewayDiagnostics(gateway, runtimeConfig);

    expect(diagnostics).toMatchObject({
      status: 'ready',
      gatewayId: 'openshell-cloud-prod',
      gatewayName: 'sero-cloud-prod',
      endpoint: 'https://gateway.example.com',
      sandboxName: 'sero-workspace',
      resourceLabel: 'GPU pool',
      costLabel: '$1/hour advisory',
      stale: false,
    });
  });

  it('builds stale diagnostics from runtime timestamps and best-effort sandbox existence', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_010)
      .mockReturnValueOnce(Date.parse('2026-05-05T02:00:00.000Z'));
    mocks.runOpenShell
      .mockResolvedValueOnce(result({ stdout: 'ready\n' }))
      .mockResolvedValueOnce(result({ stdout: 'sandbox exists\n' }));

    const diagnostics = await getCloudGatewayDiagnostics(gateway, runtimeConfig);

    expect(diagnostics.status).toBe('stale');
    expect(diagnostics.stale).toBe(true);
    expect(diagnostics.message).toContain('may be stale');
    expect(diagnostics.message).not.toMatch(/billing truth|provider truth/i);
  });

  it('redacts token-like output and truncates diagnostics snippets', () => {
    const longSecret = `bearer token: secret-value\n${'x'.repeat(2_000)}`;

    const sanitized = sanitizeDiagnosticOutput(longSecret);

    expect(sanitized).not.toContain('secret-value');
    expect(sanitized.length).toBeLessThanOrEqual(1_000);
  });

  it('redacts authorization bearer and cookie header diagnostic output', () => {
    const sanitized = sanitizeDiagnosticOutput([
      'Authorization: Bearer abc123',
      'Bearer abc123',
      'Set-Cookie: session=super-secret; Path=/',
      'Proxy-Authorization: Bearer proxy-secret',
    ].join('\n'));

    expect(sanitized).toContain('Authorization: [redacted]');
    expect(sanitized).toContain('Bearer [redacted]');
    expect(sanitized).toContain('Set-Cookie: [redacted]');
    expect(sanitized).toContain('Proxy-Authorization: [redacted]');
    expect(sanitized).not.toContain('abc123');
    expect(sanitized).not.toContain('super-secret');
    expect(sanitized).not.toContain('proxy-secret');
  });
});

function result(overrides: Partial<OpenShellCommandResult> = {}): OpenShellCommandResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    ...overrides,
  };
}

function flattenArgs(): string {
  return mocks.runOpenShell.mock.calls
    .map((call) => (call[0] as string[]).join(' '))
    .join('\n');
}
